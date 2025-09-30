use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::time::Duration;
use std::collections::HashMap;

use rumqttc::{AsyncClient, ClientError, Event, EventLoop, Incoming, MqttOptions, Outgoing, QoS};
use tokio::sync::{broadcast, RwLock, Mutex};
use tokio::task::JoinHandle;
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

use crate::config::MqttConfig;

#[derive(Debug, Clone)]
pub enum MqttEvent {
    Connected,
    Disconnected,
    Publish { topic: String, payload: Vec<u8> },
    PubAck(u16),
    // Other events can be added as needed
}

#[derive(Clone)]
pub struct MqttService {
    client: Arc<Mutex<AsyncClient>>,
    ready: Arc<AtomicBool>,
    events_tx: broadcast::Sender<MqttEvent>,
    subscriptions: Arc<RwLock<HashMap<String, QoS>>>,
    // We keep the join handle alive by storing it to ensure the loop isn't dropped
    _loop_handle: Arc<JoinHandle<()>>,
}

impl MqttService {
    pub async fn connect(config: MqttConfig) -> Result<Self, ClientError> {
        let (client, eventloop) = build_client(&config)?;
        let ready = Arc::new(AtomicBool::new(false));
        let (tx, _) = broadcast::channel(256);
        let subscriptions = Arc::new(RwLock::new(HashMap::new()));
        let ready_clone = ready.clone();
        let tx_clone = tx.clone();
        let subscriptions_clone = subscriptions.clone();

        let client_shared = Arc::new(Mutex::new(client));
        let client_clone = client_shared.clone();
        let loop_handle = tokio::spawn(async move {
            run_eventloop(eventloop, client_clone, ready_clone, tx_clone, subscriptions_clone, config).await;
        });

        Ok(Self {
            client: client_shared,
            ready,
            events_tx: tx,
            subscriptions,
            _loop_handle: Arc::new(loop_handle),
        })
    }

    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Relaxed)
    }

    pub fn events(&self) -> broadcast::Receiver<MqttEvent> {
        self.events_tx.subscribe()
    }

    pub async fn publish<T: Into<Vec<u8>>>(&self, topic: &str, qos: QoS, retain: bool, payload: T) -> Result<(), ClientError> {
        let client = self.client.lock().await;
        client.publish(topic, qos, retain, payload).await
    }

    pub async fn subscribe(&self, topic: &str, qos: QoS) -> Result<(), ClientError> {
        let client = self.client.lock().await;
        let result = client.subscribe(topic, qos).await;
        if result.is_ok() {
            // Track successful subscriptions
            let mut subs = self.subscriptions.write().await;
            subs.insert(topic.to_string(), qos);
        }
        result
    }

    pub async fn disconnect(&self) -> Result<(), ClientError> {
        self.ready.store(false, Ordering::Relaxed);
        let client = self.client.lock().await;
        client.disconnect().await
    }

    pub async fn resubscribe_tracked(&self) -> Result<(), ClientError> {
        let subs = self.subscriptions.read().await;
        let client = self.client.lock().await;
        for (topic, qos) in subs.iter() {
            debug!("Re-subscribing to {} with QoS {:?}", topic, qos);
            if let Err(err) = client.subscribe(topic, *qos).await {
                warn!(?err, "Failed to re-subscribe to {}", topic);
                return Err(err);
            }
            // Small delay between subscriptions to avoid overwhelming the broker
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        }
        info!("Successfully re-subscribed to {} topics", subs.len());
        Ok(())
    }
}

fn build_client(config: &MqttConfig) -> Result<(AsyncClient, EventLoop), ClientError> {
    let mut opts = MqttOptions::new(&config.client_id, &config.host, config.port);
    opts.set_keep_alive(Duration::from_secs(config.keep_alive_secs as u64));
    opts.set_clean_session(config.clean_session);
    // Connection timeout not available in this rumqttc version; rely on defaults
    if let (Some(u), Some(p)) = (&config.username, &config.password) {
        opts.set_credentials(u.clone(), p.clone());
    }
    // Reasonable channel capacity for requests
    opts.set_request_channel_capacity(64);
    Ok(AsyncClient::new(opts, 64))
}

async fn run_eventloop(
    mut eventloop: EventLoop,
    client_shared: Arc<Mutex<AsyncClient>>,
    ready: Arc<AtomicBool>,
    events_tx: broadcast::Sender<MqttEvent>,
    subscriptions: Arc<RwLock<HashMap<String, QoS>>>,
    config: MqttConfig,
) {
    let mut backoff_secs = 1u64;
    loop {
        match eventloop.poll().await {
            Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                info!("MQTT connected");
                ready.store(true, Ordering::Relaxed);
                let _ = events_tx.send(MqttEvent::Connected);

                // Restore all tracked subscriptions after reconnection
                let subs = subscriptions.read().await;
                let client = client_shared.lock().await;
                for (topic, qos) in subs.iter() {
                    debug!("Restoring subscription to {}", topic);
                    if let Err(err) = client.subscribe(topic, *qos).await {
                        warn!(?err, "Failed to restore subscription to {}", topic);
                    }
                }
                drop(client); // Release the client lock
                drop(subs); // Release the read lock

                // Reset backoff on successful connect
                backoff_secs = 1;
            }
            Ok(Event::Incoming(Incoming::Publish(p))) => {
                let topic = p.topic.to_string();
                let payload = p.payload.to_vec();
                let _ = events_tx.send(MqttEvent::Publish { topic, payload });
            }
            Ok(Event::Incoming(Incoming::PubAck(ack))) => {
                let _ = events_tx.send(MqttEvent::PubAck(ack.pkid));
            }
            Ok(Event::Outgoing(Outgoing::Disconnect)) => {
                warn!("MQTT disconnect requested");
                ready.store(false, Ordering::Relaxed);
                let _ = events_tx.send(MqttEvent::Disconnected);
            }
            Ok(other) => {
                debug!(?other, "MQTT event");
            }
            Err(e) => {
                error!(error = ?e, "MQTT error; will attempt reconnect");
                ready.store(false, Ordering::Relaxed);
                let _ = events_tx.send(MqttEvent::Disconnected);

                // Exponential backoff with cap
                let wait = backoff_secs.min(30);
                sleep(Duration::from_secs(wait)).await;
                backoff_secs = (backoff_secs * 2).min(60);

                // Attempt to rebuild client and eventloop
                match build_client(&config) {
                    Ok((new_client, new_eventloop)) => {
                        // Replace both eventloop and client with fresh instances
                        eventloop = new_eventloop;
                        {
                            let mut client_guard = client_shared.lock().await;
                            *client_guard = new_client;
                        }
                        info!("MQTT client and eventloop rebuilt, attempting reconnection");
                        // Continue loop; next poll should connect
                        continue;
                    }
                    Err(err) => {
                        error!(?err, "Failed to rebuild MQTT client; retrying");
                    }
                }
            }
        }
    }
}
