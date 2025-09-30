use std::net::SocketAddr;

use axum::{routing::{get, post, put, delete}, Json, Router};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use rumqttc::QoS;
use serde::{Deserialize, Serialize};
use dotenvy::dotenv;
use rustroast_mqtt::{MqttConfig, MqttService};
use rustroast_core::{telemetry_wildcard_all, status_wildcard_all, autotune_wildcard_all};
use tokio::signal;
use tracing::info;
use tracing_subscriber::EnvFilter;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use prometheus::{Encoder, IntCounter, IntGauge, IntGaugeVec, TextEncoder};
// (Static docs in /docs for now; utoipa can be reintroduced later)
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use axum::extract::Query;
use std::time::Duration;
use axum::http::header::CONTENT_TYPE;
use tower_http::services::{ServeDir, ServeFile};
use std::path::PathBuf;

mod models;
mod services;

use models::*;
use services::RoastSessionService;

#[derive(Clone)]
struct AppState {
    mqtt: MqttService,
    telemetry_cache: Arc<RwLock<HashMap<String, (serde_json::Value, u64)>>>,
    autotune_status_cache: Arc<RwLock<HashMap<String, (serde_json::Value, u64)>>>,
    autotune_results_cache: Arc<RwLock<HashMap<String, (serde_json::Value, u64)>>>,
    device_registry: Arc<RwLock<HashMap<String, DeviceInfo>>>,
    metrics: Arc<Metrics>,
    db: SqlitePool,
    session_service: RoastSessionService,
}

#[derive(Debug, Clone, Serialize)]
struct DeviceInfo {
    device_id: String,
    last_seen: u64,
    #[serde(skip_serializing_if = "Option::is_none")] id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] rssi: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status_raw: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct DevicesResponse { devices: Vec<DeviceInfo> }

struct Metrics {
    mqtt_connected: IntGauge,
    mqtt_rx_total: IntCounter,
    mqtt_tx_total: IntCounter,
    ws_clients: IntGauge,
    telemetry_last_seen: IntGaugeVec, // label: device_id
    status_last_seen: IntGaugeVec,    // label: device_id
}

impl Metrics {
    fn new() -> Arc<Self> {
        let mqtt_connected = IntGauge::new("rustroast_mqtt_connected", "MQTT connection status (1 connected, 0 otherwise)").unwrap();
        let mqtt_rx_total = IntCounter::new("rustroast_mqtt_messages_received_total", "Total MQTT messages received").unwrap();
        let mqtt_tx_total = IntCounter::new("rustroast_mqtt_messages_published_total", "Total MQTT messages published").unwrap();
        let ws_clients = IntGauge::new("rustroast_ws_clients", "Number of connected WebSocket clients").unwrap();
        let telemetry_last_seen = IntGaugeVec::new(
            prometheus::Opts::new("rustroast_device_telemetry_last_seen", "Last seen telemetry epoch seconds"),
            &["device_id"],
        ).unwrap();
        let status_last_seen = IntGaugeVec::new(
            prometheus::Opts::new("rustroast_device_status_last_seen", "Last seen status epoch seconds"),
            &["device_id"],
        ).unwrap();

        let registry = prometheus::default_registry();
        let _ = registry.register(Box::new(mqtt_connected.clone()));
        let _ = registry.register(Box::new(mqtt_rx_total.clone()));
        let _ = registry.register(Box::new(mqtt_tx_total.clone()));
        let _ = registry.register(Box::new(ws_clients.clone()));
        let _ = registry.register(Box::new(telemetry_last_seen.clone()));
        let _ = registry.register(Box::new(status_last_seen.clone()));

        Arc::new(Self { mqtt_connected, mqtt_rx_total, mqtt_tx_total, ws_clients, telemetry_last_seen, status_last_seen })
    }
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    init_tracing();

    // MQTT setup
    let mqtt_cfg = MqttConfig::from_env();
    tracing::info!(host = %mqtt_cfg.host, port = mqtt_cfg.port, "Configuring MQTT client");
    let mqtt = MqttService::connect(mqtt_cfg)
        .await
        .expect("Failed to initialize MQTT");

    // Subscribe to telemetry/status/autotune wildcards to receive updates early
    if let Err(e) = mqtt.subscribe(telemetry_wildcard_all(), rumqttc::QoS::AtMostOnce).await {
        tracing::warn!(?e, "Failed to subscribe to telemetry wildcard");
    }
    if let Err(e) = mqtt.subscribe(status_wildcard_all(), rumqttc::QoS::AtMostOnce).await {
        tracing::warn!(?e, "Failed to subscribe to status wildcard");
    }
    if let Err(e) = mqtt.subscribe(autotune_wildcard_all(), rumqttc::QoS::AtMostOnce).await {
        tracing::warn!(?e, "Failed to subscribe to autotune wildcard");
    }
    // Subscribe to all roaster topics for debug WebSocket
    if let Err(e) = mqtt.subscribe("roaster/#", rumqttc::QoS::AtMostOnce).await {
        tracing::warn!(?e, "Failed to subscribe to debug wildcard");
    }

    let telemetry_cache = Arc::new(RwLock::new(HashMap::new()));
    let autotune_status_cache = Arc::new(RwLock::new(HashMap::new()));
    let autotune_results_cache = Arc::new(RwLock::new(HashMap::new()));
    let device_registry = Arc::new(RwLock::new(HashMap::new()));
    let metrics = Metrics::new();
    let db = init_db().await.expect("failed to init db");
    let session_service = RoastSessionService::new(db.clone());
    let state = AppState {
        mqtt: mqtt.clone(),
        telemetry_cache: telemetry_cache.clone(),
        device_registry: device_registry.clone(),
        metrics: metrics.clone(),
        db: db.clone(),
        autotune_status_cache: autotune_status_cache.clone(),
        autotune_results_cache: autotune_results_cache.clone(),
        session_service,
    };

    // Static Swagger UI served at /docs; not generating OpenAPI from code for now
    // Static frontend at /app (optional)
    let server_crate_dir = env!("CARGO_MANIFEST_DIR");
    let default_app_dir = PathBuf::from(server_crate_dir).join("../../apps/dashboard/dist");
    let app_dir = std::env::var("RUSTROAST_APP_DIR").unwrap_or_else(|_| default_app_dir.to_string_lossy().to_string());
    let static_service = ServeDir::new(app_dir.clone())
        .not_found_service(ServeFile::new(format!("{}/index.html", app_dir)));

    let app = Router::new()
        .route("/", get(|| async { axum::response::Redirect::permanent("/app/") }))
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/version", get(version))
        .route("/metrics", get(metrics_handler))
        // Static OpenAPI (Option A)
        .route("/api-docs/openapi.json", get(serve_openapi_json))
        .route("/docs", get(serve_swagger_ui_html))
        // Frontend
        .nest_service("/app", static_service)
        
        // Swagger UI can be added here when OpenAPI spec is generated
        // Control API
        .route("/api/roaster/:device_id/control/setpoint", post(api_set_setpoint))
        .route("/api/roaster/:device_id/control/fan_pwm", post(api_set_fan_pwm))
        .route("/api/roaster/:device_id/control/heater_pwm", post(api_set_heater_pwm))
        .route("/api/roaster/:device_id/control/mode", post(api_set_mode))
        .route("/api/roaster/:device_id/control/heater_enable", post(api_set_heater_enable))
        .route("/api/roaster/:device_id/control/pid", post(api_set_pid))
        .route("/api/roaster/:device_id/control/emergency_stop", post(api_emergency_stop))
        // MQTT admin endpoint
        .route("/api/admin/mqtt/reset", post(api_mqtt_reset))
        // WebSocket endpoints
        .route("/ws/telemetry", get(ws_telemetry))
        .route("/ws/debug", get(ws_debug))
        // Test utility: emit a fake telemetry payload via MQTT to exercise WS
        .route("/api/test/emit-telemetry/:device_id", post(api_test_emit_telemetry))
        .route("/api/test/emit-status/:device_id", post(api_test_emit_status))
        // Read APIs
        .route("/api/roaster/:device_id/telemetry/latest", get(api_get_latest_telemetry))
        .route("/api/roaster/:device_id/telemetry", get(api_get_telemetry_history))
        .route("/api/devices", get(api_get_devices))
        // Auto-tune APIs
        .route("/api/roaster/:device_id/autotune/start", post(api_autotune_start))
        .route("/api/roaster/:device_id/autotune/stop", post(api_autotune_stop))
        .route("/api/roaster/:device_id/autotune/apply", post(api_autotune_apply))
        .route("/api/roaster/:device_id/autotune/status/latest", get(api_get_autotune_status_latest))
        .route("/api/roaster/:device_id/autotune/results/latest", get(api_get_autotune_results_latest))
        .route("/api/roaster/:device_id/autotune/status", get(api_get_autotune_status_history))
        .route("/api/roaster/:device_id/autotune/results", get(api_get_autotune_results_history))
        // Roast Session Management API
        .route("/api/sessions", post(api_create_session))
        .route("/api/sessions", get(api_list_sessions))
        .route("/api/sessions/:id", get(api_get_session))
        .route("/api/sessions/:id", put(api_update_session))
        .route("/api/sessions/:id", delete(api_delete_session))
        .route("/api/sessions/:id/start", post(api_start_session))
        .route("/api/sessions/:id/pause", post(api_pause_session))
        .route("/api/sessions/:id/resume", post(api_resume_session))
        .route("/api/sessions/:id/complete", post(api_complete_session))
        .route("/api/sessions/:id/telemetry", get(api_get_session_telemetry))
        .route("/api/sessions/:id/telemetry", post(api_add_telemetry_point))
        // Roast Events API
        .route("/api/sessions/:session_id/events", get(api_get_roast_events))
        .route("/api/sessions/:session_id/events", post(api_create_roast_event))
        .route("/api/sessions/:session_id/events/:event_id", put(api_update_roast_event))
        .route("/api/sessions/:session_id/events/:event_id", delete(api_delete_roast_event))
        // Roast Profile Management API
        .route("/api/profiles", post(api_create_profile))
        .route("/api/profiles", get(api_list_profiles))
        .route("/api/profiles/:id", get(api_get_profile))
        .route("/api/profiles/:id", delete(api_delete_profile))
        .route("/api/profiles/import/artisan", post(api_import_artisan_profile))
        .with_state(state.clone());

    let addr: SocketAddr = std::env::var("RUSTROAST_HTTP_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".to_string())
        .parse()
        .expect("Invalid RUSTROAST_HTTP_ADDR");

    info!(%addr, "Starting HTTP server");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    // Background consumer for MQTT events -> caches + metrics + persistence
    tokio::spawn(mqtt_consumer_loop(
        mqtt.clone(),
        telemetry_cache,
        device_registry,
        metrics.clone(),
        db.clone(),
        autotune_status_cache,
        autotune_results_cache,
    ));
    // Retention cleanup task
    tokio::spawn(retention_cleanup_loop(db.clone()));
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new("info,axum=info,hyper=info,rumqttc=warn"))
        .unwrap();
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .compact()
        .init();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{signal, SignalKind};
        let mut term = signal(SignalKind::terminate()).expect("failed to install signal handler");
        term.recv().await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

async fn healthz() -> &'static str { "ok" }

async fn readyz(State(state): State<AppState>) -> axum::http::StatusCode {
    // MQTT must be ready and DB reachable
    let mqtt_ok = state.mqtt.is_ready();
    let db_ok = sqlx::query_scalar::<_, i64>("SELECT 1").fetch_one(&state.db).await.is_ok();
    if mqtt_ok && db_ok { axum::http::StatusCode::OK } else { axum::http::StatusCode::SERVICE_UNAVAILABLE }
}

async fn version() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "name": env!("CARGO_PKG_NAME"),
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn metrics_handler() -> Response {
    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();
    let mut buf = Vec::new();
    encoder.encode(&metric_families, &mut buf).unwrap();
    Response::builder()
        .status(StatusCode::OK)
        .header(axum::http::header::CONTENT_TYPE, encoder.format_type())
        .body(axum::body::Body::from(buf))
        .unwrap()
}

async fn serve_openapi_json() -> Response {
    let body = include_str!("static/openapi.json");
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "application/json")
        .body(axum::body::Body::from(body))
        .unwrap()
}

async fn serve_swagger_ui_html() -> Response {
    let body = include_str!("static/docs.html");
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "text/html; charset=utf-8")
        .body(axum::body::Body::from(body))
        .unwrap()
}

// ----- Control API payloads -----

#[derive(Deserialize, Serialize)]
struct SetpointPayload { value: f64 }
#[derive(Deserialize, Serialize)]
struct FanPwmPayload { value: u16 }
#[derive(Deserialize, Serialize)]
struct HeaterPwmPayload { value: u8 }

#[derive(Deserialize, Serialize)]
struct ModePayload { mode: String }

#[derive(Deserialize, Serialize)]
struct EnablePayload { enabled: bool }

#[derive(Deserialize, Serialize)]
struct PidPayload { kp: f64, ki: f64, kd: f64 }

#[derive(Deserialize)]
struct PublishOpts { wait_ack: Option<bool>, timeout_ms: Option<u64> }

#[derive(Serialize)]
struct LatestTelemetryResponse {
    device_id: String,
    timestamp: u64,
    telemetry: serde_json::Value,
}

#[derive(Serialize)]
struct TelemetryItem {
    ts: i64,
    telemetry: serde_json::Value,
}

#[derive(Serialize)]
struct TelemetryHistoryResponse {
    device_id: String,
    count: usize,
    items: Vec<TelemetryItem>,
}

// ----- Control API handlers -----

// OpenAPI annotations omitted in static docs mode
async fn api_set_setpoint(Path(device_id): Path<String>, State(state): State<AppState>, Query(opts): Query<PublishOpts>, Json(body): Json<SetpointPayload>) -> impl IntoResponse {
    // Basic validation range 0..300 C
    if !(0.0..=300.0).contains(&body.value) { return (StatusCode::BAD_REQUEST, "setpoint must be between 0 and 300 C").into_response(); }
    let topic = rustroast_core::control_setpoint(&device_id);
    let payload = format!("{}", body.value);
    publish_qos1_and_maybe_wait_ack(&state, &topic, payload, opts.wait_ack.unwrap_or(false), opts.timeout_ms.unwrap_or(1000)).await
}

// OpenAPI annotations omitted in static docs mode
async fn api_set_fan_pwm(Path(device_id): Path<String>, State(state): State<AppState>, Query(opts): Query<PublishOpts>, Json(body): Json<FanPwmPayload>) -> impl IntoResponse {
    if body.value > 255 { return (StatusCode::BAD_REQUEST, "fan_pwm must be 0..255").into_response(); }
    let topic = rustroast_core::control_fan_pwm(&device_id);
    let payload = body.value.to_string();
    publish_qos1_and_maybe_wait_ack(&state, &topic, payload, opts.wait_ack.unwrap_or(false), opts.timeout_ms.unwrap_or(1000)).await
}

// OpenAPI annotations omitted in static docs mode
async fn api_set_heater_pwm(Path(device_id): Path<String>, State(state): State<AppState>, Query(opts): Query<PublishOpts>, Json(body): Json<HeaterPwmPayload>) -> impl IntoResponse {
    if body.value > 100 { return (StatusCode::BAD_REQUEST, "heater_pwm must be 0..100").into_response(); }
    let topic = rustroast_core::control_heater_pwm(&device_id);
    let payload = body.value.to_string();
    publish_qos1_and_maybe_wait_ack(&state, &topic, payload, opts.wait_ack.unwrap_or(false), opts.timeout_ms.unwrap_or(1000)).await
}

// OpenAPI annotations omitted
async fn api_set_mode(Path(device_id): Path<String>, State(state): State<AppState>, Query(opts): Query<PublishOpts>, Json(body): Json<ModePayload>) -> impl IntoResponse {
    let mode = body.mode.to_lowercase();
    if mode != "auto" && mode != "manual" { return (StatusCode::BAD_REQUEST, "mode must be 'auto' or 'manual'").into_response(); }
    let topic = rustroast_core::control_mode(&device_id);
    publish_qos1_and_maybe_wait_ack(&state, &topic, mode, opts.wait_ack.unwrap_or(false), opts.timeout_ms.unwrap_or(1000)).await
}

// OpenAPI annotations omitted
async fn api_set_heater_enable(Path(device_id): Path<String>, State(state): State<AppState>, Query(opts): Query<PublishOpts>, Json(body): Json<EnablePayload>) -> impl IntoResponse {
    let topic = rustroast_core::control_heater_enable(&device_id);
    let payload = if body.enabled { "1" } else { "0" };
    publish_qos1_and_maybe_wait_ack(&state, &topic, payload, opts.wait_ack.unwrap_or(false), opts.timeout_ms.unwrap_or(1000)).await
}

// OpenAPI annotations omitted in static docs mode
async fn api_set_pid(Path(device_id): Path<String>, State(state): State<AppState>, Query(opts): Query<PublishOpts>, Json(body): Json<PidPayload>) -> impl IntoResponse {
    let topic = rustroast_core::control_pid(&device_id);
    let payload = serde_json::json!({"kp": body.kp, "ki": body.ki, "kd": body.kd}).to_string();
    publish_qos1_and_maybe_wait_ack(&state, &topic, payload, opts.wait_ack.unwrap_or(false), opts.timeout_ms.unwrap_or(1000)).await
}

async fn api_emergency_stop(Path(device_id): Path<String>, State(state): State<AppState>, Query(opts): Query<PublishOpts>) -> impl IntoResponse {
    let topic = rustroast_core::control_emergency_stop(&device_id);
    publish_qos1_and_maybe_wait_ack(&state, &topic, "1", opts.wait_ack.unwrap_or(false), opts.timeout_ms.unwrap_or(1000)).await
}

async fn api_mqtt_reset(State(state): State<AppState>) -> impl IntoResponse {
    tracing::info!("MQTT reset requested via API");

    // Instead of forcing a disconnect which can fail, try to reestablish subscriptions
    // This is more robust and addresses the actual issue users experience
    match state.mqtt.resubscribe_tracked().await {
        Ok(_) => {
            tracing::info!("MQTT subscriptions reestablished successfully");
            (StatusCode::OK, "MQTT reset completed - subscriptions restored").into_response()
        }
        Err(e) => {
            tracing::warn!(?e, "Failed to reestablish MQTT subscriptions, attempting disconnect/reconnect");

            // If resubscribe fails, then try the disconnect approach as fallback
            match state.mqtt.disconnect().await {
                Ok(_) => {
                    tracing::info!("MQTT disconnect successful - automatic reconnection will begin");
                    // Give the MQTT client a moment to reconnect, then restore subscriptions
                    let state_clone = state.clone();
                    tokio::spawn(async move {
                        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                        if let Err(e) = state_clone.mqtt.resubscribe_tracked().await {
                            tracing::warn!(?e, "Failed to resubscribe after MQTT reset");
                        } else {
                            tracing::info!("MQTT subscriptions restored after reconnection");
                        }
                    });
                    (StatusCode::OK, "MQTT reset initiated - reconnection will happen automatically").into_response()
                }
                Err(disconnect_err) => {
                    tracing::error!(?e, ?disconnect_err, "Both resubscribe and disconnect failed");
                    (StatusCode::INTERNAL_SERVER_ERROR, "Failed to reset MQTT connection").into_response()
                }
            }
        }
    }
}

async fn publish_ok(state: &AppState, topic: &str, payload: impl Into<Vec<u8>>) -> Response {
    match state.mqtt.publish(topic, QoS::AtMostOnce, false, payload).await {
        Ok(_) => { state.metrics.mqtt_tx_total.inc(); StatusCode::NO_CONTENT.into_response() },
        Err(e) => {
            tracing::warn!(?e, topic, "MQTT publish failed");
            (StatusCode::BAD_GATEWAY, "MQTT publish failed").into_response()
        }
    }
}

async fn publish_qos1_and_maybe_wait_ack(state: &AppState, topic: &str, payload: impl Into<Vec<u8>>, wait_ack: bool, timeout_ms: u64) -> Response {
    // Subscribe to events before publish to reduce race window
    let mut rx = state.mqtt.events();
    match state.mqtt.publish(topic, QoS::AtLeastOnce, false, payload).await {
        Ok(_) => {
            state.metrics.mqtt_tx_total.inc();
            if wait_ack {
                if let Ok(Ok(evt)) = tokio::time::timeout(Duration::from_millis(timeout_ms), rx.recv()).await {
                    match evt {
                        rustroast_mqtt::MqttEvent::PubAck(_) => StatusCode::NO_CONTENT.into_response(),
                        _ => StatusCode::NO_CONTENT.into_response(),
                    }
                } else {
                    (StatusCode::GATEWAY_TIMEOUT, "MQTT ack timeout").into_response()
                }
            } else {
                StatusCode::NO_CONTENT.into_response()
            }
        }
        Err(e) => {
            tracing::warn!(?e, topic, "MQTT publish failed");
            (StatusCode::BAD_GATEWAY, "MQTT publish failed").into_response()
        }
    }
}

// ----- WebSocket telemetry -----

async fn ws_telemetry(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| telemetry_ws_loop(state, socket))
}

async fn ws_debug(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| debug_ws_loop(state, socket))
}

async fn telemetry_ws_loop(state: AppState, mut socket: WebSocket) {
    // Count WS client
    state.metrics.ws_clients.inc();
    println!("DEBUG: WebSocket telemetry client connected, total clients: {}", state.metrics.ws_clients.get());
    
    let mut rx = state.mqtt.events();
    println!("DEBUG: WebSocket client subscribed to MQTT events");
    
    while let Ok(evt) = rx.recv().await {
        println!("DEBUG: Received MQTT event in WebSocket loop");
        if let rustroast_mqtt::MqttEvent::Publish { topic, payload } = evt {
            println!("DEBUG: MQTT Publish event - topic: {}", topic);
            if let Some((device_id, kind)) = parse_roaster_topic(&topic) {
                println!("DEBUG: Parsed topic - device_id: {}, kind: {}", device_id, kind);
                if kind == "telemetry" {
                    // Try to forward as a single JSON object containing device_id and telemetry
                    let msg_text = match serde_json::from_slice::<serde_json::Value>(&payload) {
                        Ok(val) => serde_json::json!({"device_id": device_id, "telemetry": val}).to_string(),
                        Err(_) => serde_json::json!({"device_id": device_id, "telemetry_raw": String::from_utf8_lossy(&payload)}).to_string(),
                    };
                    println!("DEBUG: Sending telemetry message to WebSocket: {}", &msg_text[..100]);
                    if socket.send(Message::Text(msg_text)).await.is_err() {
                        println!("DEBUG: WebSocket send failed, client disconnected");
                        break;
                    } else {
                        println!("DEBUG: Successfully sent telemetry to WebSocket client");
                    }
                } else if kind == "autotune" {
                    // roaster/{device_id}/autotune/{status|results}
                    let mut parts = topic.split('/');
                    let _ = parts.next(); // roaster
                    let _ = parts.next(); // device_id
                    let _ = parts.next(); // autotune
                    if let Some(sub) = parts.next() {
                        let msg_text = match serde_json::from_slice::<serde_json::Value>(&payload) {
                            Ok(val) => serde_json::json!({
                                "device_id": device_id,
                                "autotune": {"type": sub, "data": val}
                            }).to_string(),
                            Err(_) => serde_json::json!({
                                "device_id": device_id,
                                "autotune_raw": {"type": sub, "data": String::from_utf8_lossy(&payload)}
                            }).to_string(),
                        };
                        if socket.send(Message::Text(msg_text)).await.is_err() {
                            break;
                        }
                    }
                }
            }
        }
    }
    let _ = socket.close().await;
    state.metrics.ws_clients.dec();
}

async fn debug_ws_loop(state: AppState, mut socket: WebSocket) {
    use tokio::select;
    use axum::extract::ws::Message;

    // Count WS client
    state.metrics.ws_clients.inc();
    tracing::info!("Debug WebSocket client connected");

    let mut rx = state.mqtt.events();

    loop {
        select! {
            // Handle incoming WebSocket messages from client
            ws_msg = socket.recv() => {
                match ws_msg {
                    Some(Ok(Message::Text(text))) => {
                        // Handle ping messages from client
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                            if parsed.get("type").and_then(|v| v.as_str()) == Some("ping") {
                                let pong = serde_json::json!({"type": "pong"});
                                if socket.send(Message::Text(pong.to_string())).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        tracing::info!("Debug WebSocket client disconnected gracefully");
                        break;
                    }
                    Some(Err(e)) => {
                        tracing::warn!(?e, "Debug WebSocket error reading message");
                        break;
                    }
                    _ => {
                        // Ignore other message types like binary, ping, pong
                    }
                }
            }
            // Handle MQTT events and forward to client
            mqtt_evt = rx.recv() => {
                let evt = match mqtt_evt {
                    Ok(evt) => evt,
                    Err(_) => {
                        tracing::warn!("Debug WebSocket: MQTT event channel closed");
                        break;
                    }
                };

                let msg = match evt {
                    rustroast_mqtt::MqttEvent::Publish { topic, payload } => {
                        // Parse device ID from topic if it's a roaster topic
                        let device_id = if topic.starts_with("roaster/") {
                            topic.split('/').nth(1).map(|s| s.to_string())
                        } else {
                            None
                        };

                        // Try to parse payload as JSON, otherwise use raw string
                        let payload_value = match serde_json::from_slice::<serde_json::Value>(&payload) {
                            Ok(json) => json,
                            Err(_) => serde_json::Value::String(String::from_utf8_lossy(&payload).to_string())
                        };

                        serde_json::json!({
                            "mqtt": {
                                "topic": topic,
                                "payload": payload_value,
                                "direction": "incoming",
                                "device_id": device_id
                            }
                        })
                    }
                    rustroast_mqtt::MqttEvent::Connected => {
                        serde_json::json!({
                            "mqtt": {
                                "topic": "system/connected",
                                "payload": "MQTT connected",
                                "direction": "incoming"
                            }
                        })
                    }
                    rustroast_mqtt::MqttEvent::Disconnected => {
                        serde_json::json!({
                            "mqtt": {
                                "topic": "system/disconnected",
                                "payload": "MQTT disconnected",
                                "direction": "incoming"
                            }
                        })
                    }
                    rustroast_mqtt::MqttEvent::PubAck(packet_id) => {
                        serde_json::json!({
                            "mqtt": {
                                "topic": "system/puback",
                                "payload": format!("PubAck received for packet {}", packet_id),
                                "direction": "incoming"
                            }
                        })
                    }
                };

                if socket.send(Message::Text(msg.to_string())).await.is_err() {
                    tracing::info!("Debug WebSocket client disconnected during send");
                    break;
                }
            }
        }
    }

    let _ = socket.close().await;
    state.metrics.ws_clients.dec();
    tracing::info!("Debug WebSocket connection closed");
}

fn parse_roaster_topic(topic: &str) -> Option<(String, String)> {
    // Expect: roaster/{device_id}/<kind>
    let mut parts = topic.split('/');
    let root = parts.next()?;
    if root != rustroast_core::ROOT { return None; }
    let device = parts.next()?.to_string();
    let kind = parts.next()?.to_string();
    Some((device, kind))
}

// OpenAPI generation deferred

// OpenAPI generator removed for now to keep build stable; can be re-added

// ----- Background MQTT consumer to fill caches + metrics -----
async fn mqtt_consumer_loop(
    mqtt: MqttService,
    telemetry_cache: Arc<RwLock<HashMap<String, (serde_json::Value, u64)>>>,
    device_registry: Arc<RwLock<HashMap<String, DeviceInfo>>>,
    metrics: Arc<Metrics>,
    db: SqlitePool,
    autotune_status_cache: Arc<RwLock<HashMap<String, (serde_json::Value, u64)>>>,
    autotune_results_cache: Arc<RwLock<HashMap<String, (serde_json::Value, u64)>>>,
) {
    let mut rx = mqtt.events();
    loop {
        match rx.recv().await {
            Ok(rustroast_mqtt::MqttEvent::Connected) => metrics.mqtt_connected.set(1),
            Ok(rustroast_mqtt::MqttEvent::Disconnected) => metrics.mqtt_connected.set(0),
            Ok(rustroast_mqtt::MqttEvent::Publish { topic, payload }) => {
                metrics.mqtt_rx_total.inc();
                if let Some((device_id, kind)) = parse_roaster_topic(&topic) {
                    let now = epoch_secs();
                    if kind == "telemetry" {
                        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&payload) {
                            metrics.telemetry_last_seen.with_label_values(&[&device_id]).set(now as i64);
                            telemetry_cache.write().await.insert(device_id.clone(), (val, now));
                            let payload_str = String::from_utf8_lossy(&payload).to_string();
                            
                            // Store in general telemetry table
                            let _ = sqlx::query("INSERT INTO telemetry (device_id, ts, payload) VALUES (?, ?, ?)")
                                .bind(&device_id)
                                .bind(now as i64)
                                .bind(&payload_str)
                                .execute(&db)
                                .await;
                            
                            // Also store in session telemetry table for active sessions
                            let _ = sqlx::query(r#"
                                INSERT INTO session_telemetry (session_id, timestamp, bean_temp, env_temp, rate_of_rise, heater_pwm, fan_pwm, setpoint)
                                SELECT s.id, ?, 
                                       json_extract(?, '$.beanTemp'),
                                       json_extract(?, '$.envTemp'), 
                                       json_extract(?, '$.rateOfRise'),
                                       json_extract(?, '$.heaterPWM'),
                                       json_extract(?, '$.fanPWM'),
                                       json_extract(?, '$.setpoint')
                                FROM roast_sessions s 
                                WHERE s.device_id = ? AND s.status = 'active'
                            "#)
                                .bind(now as i64)
                                .bind(&payload_str)
                                .bind(&payload_str)
                                .bind(&payload_str)
                                .bind(&payload_str)
                                .bind(&payload_str)
                                .bind(&payload_str)
                                .bind(&device_id)
                                .execute(&db)
                                .await;
                        }
                    } else if kind == "status" {
                        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&payload) {
                            metrics.status_last_seen.with_label_values(&[&device_id]).set(now as i64);
                            let mut reg = device_registry.write().await;
                            let entry = reg.entry(device_id.clone()).or_insert(DeviceInfo {
                                device_id: device_id.clone(),
                                last_seen: now,
                                id: None,
                                ip: None,
                                version: None,
                                rssi: None,
                                status_raw: None,
                            });
                            entry.last_seen = now;
                            entry.status_raw = Some(val.clone());
                            entry.id = val.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                            entry.ip = val.get("ip").and_then(|v| v.as_str()).map(|s| s.to_string());
                            entry.version = val.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
                            entry.rssi = val.get("rssi").and_then(|v| v.as_i64());
                        }
                    } else if kind == "autotune" {
                        // roaster/{device_id}/autotune/{status|results}
                        let mut parts = topic.split('/');
                        let _ = parts.next(); // roaster
                        let _ = parts.next(); // device_id
                        let _ = parts.next(); // autotune
                        if let Some(sub) = parts.next() {
                            if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&payload) {
                                match sub {
                                    "status" => {
                                        autotune_status_cache.write().await.insert(device_id.clone(), (val.clone(), now));
                                        let payload_str = String::from_utf8_lossy(&payload).to_string();
                                        let _ = sqlx::query("INSERT INTO autotune_status (device_id, ts, payload) VALUES (?, ?, ?)")
                                            .bind(&device_id)
                                            .bind(now as i64)
                                            .bind(payload_str)
                                            .execute(&db)
                                            .await;
                                    }
                                    "results" => {
                                        autotune_results_cache.write().await.insert(device_id.clone(), (val.clone(), now));
                                        let payload_str = String::from_utf8_lossy(&payload).to_string();
                                        let _ = sqlx::query("INSERT INTO autotune_results (device_id, ts, payload) VALUES (?, ?, ?)")
                                            .bind(&device_id)
                                            .bind(now as i64)
                                            .bind(payload_str)
                                            .execute(&db)
                                            .await;
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
            Ok(rustroast_mqtt::MqttEvent::PubAck(_)) => { /* ack observed */ }
            Err(_) => {}
        }
    }
}

fn epoch_secs() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

// ----- Read endpoints -----
//#[utoipa::path(get, path = "/api/roaster/{device_id}/telemetry/latest", params(("device_id" = Path<String>)), responses((status = 200, body = LatestTelemetryResponse), (status = 404)))]
async fn api_get_latest_telemetry(Path(device_id): Path<String>, State(state): State<AppState>) -> Response {
    let map = state.telemetry_cache.read().await;
    if let Some((val, ts)) = map.get(&device_id) {
        Json(LatestTelemetryResponse { device_id, timestamp: *ts, telemetry: val.clone() }).into_response()
    } else {
        (StatusCode::NOT_FOUND, "No telemetry").into_response()
    }
}

//#[utoipa::path(get, path = "/api/devices", responses((status = 200, body = DevicesResponse)))]
async fn api_get_devices(State(state): State<AppState>) -> Response {
    let reg = state.device_registry.read().await;
    let list: Vec<_> = reg.values().cloned().collect();
    Json(DevicesResponse { devices: list }).into_response()
}

// ----- Auto-tune control & read endpoints -----

#[derive(Deserialize)]
struct AutoTuneStartPayload { target_temperature: f64 }

//#[utoipa::path(post, path = "/api/roaster/{device_id}/autotune/start", request_body = AutoTuneStartPayload,
//    params(("device_id" = Path<String>), ("wait_ack" = Option<bool>, Query), ("timeout_ms" = Option<u64>, Query)),
//    responses((status = 204), (status = 400), (status = 504))
//)]
async fn api_autotune_start(Path(device_id): Path<String>, State(state): State<AppState>, Query(opts): Query<PublishOpts>, Json(body): Json<AutoTuneStartPayload>) -> Response {
    // ESP32 expects 150..=250 C according to firmware docs
    if !(150.0..=250.0).contains(&body.target_temperature) {
        return (StatusCode::BAD_REQUEST, "target_temperature must be between 150 and 250 C").into_response();
    }
    let topic = rustroast_core::autotune_start(&device_id);
    let payload = serde_json::json!({"target_temperature": body.target_temperature}).to_string();
    publish_qos1_and_maybe_wait_ack(&state, &topic, payload, opts.wait_ack.unwrap_or(false), opts.timeout_ms.unwrap_or(1000)).await
}

//#[utoipa::path(post, path = "/api/roaster/{device_id}/autotune/stop",
//    params(("device_id" = Path<String>), ("wait_ack" = Option<bool>, Query), ("timeout_ms" = Option<u64>, Query)),
//    responses((status = 204), (status = 504))
//)]
async fn api_autotune_stop(Path(device_id): Path<String>, State(state): State<AppState>, Query(opts): Query<PublishOpts>) -> Response {
    let topic = rustroast_core::autotune_stop(&device_id);
    publish_qos1_and_maybe_wait_ack(&state, &topic, "1", opts.wait_ack.unwrap_or(false), opts.timeout_ms.unwrap_or(1000)).await
}

//#[utoipa::path(post, path = "/api/roaster/{device_id}/autotune/apply",
//    params(("device_id" = Path<String>), ("wait_ack" = Option<bool>, Query), ("timeout_ms" = Option<u64>, Query)),
//    responses((status = 204), (status = 504))
//)]
async fn api_autotune_apply(Path(device_id): Path<String>, State(state): State<AppState>, Query(opts): Query<PublishOpts>) -> Response {
    let topic = rustroast_core::autotune_apply(&device_id);
    publish_qos1_and_maybe_wait_ack(&state, &topic, "1", opts.wait_ack.unwrap_or(false), opts.timeout_ms.unwrap_or(1000)).await
}

//#[utoipa::path(get, path = "/api/roaster/{device_id}/autotune/status/latest", params(("device_id" = Path<String>)), responses((status = 200), (status = 404)))]
async fn api_get_autotune_status_latest(Path(device_id): Path<String>, State(state): State<AppState>) -> Response {
    let map = state.autotune_status_cache.read().await;
    if let Some((val, ts)) = map.get(&device_id) {
        Json(serde_json::json!({"device_id": device_id, "timestamp": ts, "status": val})).into_response()
    } else {
        (StatusCode::NOT_FOUND, "No autotune status").into_response()
    }
}

//#[utoipa::path(get, path = "/api/roaster/{device_id}/autotune/results/latest", params(("device_id" = Path<String>)), responses((status = 200), (status = 404)))]
async fn api_get_autotune_results_latest(Path(device_id): Path<String>, State(state): State<AppState>) -> Response {
    let map = state.autotune_results_cache.read().await;
    if let Some((val, ts)) = map.get(&device_id) {
        Json(serde_json::json!({"device_id": device_id, "timestamp": ts, "results": val})).into_response()
    } else {
        (StatusCode::NOT_FOUND, "No autotune results").into_response()
    }
}

// Auto-tune history
//#[utoipa::path(get, path = "/api/roaster/{device_id}/autotune/status", params(("device_id" = Path<String>), HistoryQuery), responses((status = 200)))]
async fn api_get_autotune_status_history(Path(device_id): Path<String>, State(state): State<AppState>, Query(q): Query<HistoryQuery>) -> Response {
    let now = epoch_secs();
    let since = q.since_secs.unwrap_or(3600);
    let limit = q.limit.unwrap_or(200).min(1000) as i64;
    let since_ts = (now.saturating_sub(since)) as i64;
    let rows = sqlx::query_as::<_, (i64, String)>("SELECT ts, payload FROM autotune_status WHERE device_id = ? AND ts >= ? ORDER BY ts DESC LIMIT ?")
        .bind(&device_id)
        .bind(since_ts)
        .bind(limit)
        .fetch_all(&state.db)
        .await;
    match rows {
        Ok(items) => {
            let mut out: Vec<TelemetryItem> = Vec::with_capacity(items.len());
            for (ts, payload) in items {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&payload) {
                    out.push(TelemetryItem { ts, telemetry: val });
                }
            }
            Json(serde_json::json!({"device_id": device_id, "count": out.len(), "items": out})).into_response()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "query failed").into_response(),
    }
}

//#[utoipa::path(get, path = "/api/roaster/{device_id}/autotune/results", params(("device_id" = Path<String>), HistoryQuery), responses((status = 200)))]
async fn api_get_autotune_results_history(Path(device_id): Path<String>, State(state): State<AppState>, Query(q): Query<HistoryQuery>) -> Response {
    let now = epoch_secs();
    let since = q.since_secs.unwrap_or(3600);
    let limit = q.limit.unwrap_or(200).min(1000) as i64;
    let since_ts = (now.saturating_sub(since)) as i64;
    let rows = sqlx::query_as::<_, (i64, String)>("SELECT ts, payload FROM autotune_results WHERE device_id = ? AND ts >= ? ORDER BY ts DESC LIMIT ?")
        .bind(&device_id)
        .bind(since_ts)
        .bind(limit)
        .fetch_all(&state.db)
        .await;
    match rows {
        Ok(items) => {
            let mut out: Vec<TelemetryItem> = Vec::with_capacity(items.len());
            for (ts, payload) in items {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&payload) {
                    out.push(TelemetryItem { ts, telemetry: val });
                }
            }
            Json(serde_json::json!({"device_id": device_id, "count": out.len(), "items": out})).into_response()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "query failed").into_response(),
    }
}

// Query telemetry history
#[derive(Deserialize)]
struct HistoryQuery { since_secs: Option<u64>, limit: Option<u32> }

//#[utoipa::path(get, path = "/api/roaster/{device_id}/telemetry", params(("device_id" = Path<String>), HistoryQuery), responses((status = 200, body = TelemetryHistoryResponse)))]
async fn api_get_telemetry_history(Path(device_id): Path<String>, State(state): State<AppState>, Query(q): Query<HistoryQuery>) -> Response {
    let now = epoch_secs();
    let since = q.since_secs.unwrap_or(3600); // default last hour
    let limit = q.limit.unwrap_or(200).min(1000) as i64; // cap limit
    let since_ts = (now.saturating_sub(since)) as i64;
    let rows = sqlx::query_as::<_, (i64, String)>("SELECT ts, payload FROM telemetry WHERE device_id = ? AND ts >= ? ORDER BY ts DESC LIMIT ?")
        .bind(&device_id)
        .bind(since_ts)
        .bind(limit)
        .fetch_all(&state.db)
        .await;
    match rows {
        Ok(items) => {
            let mut out: Vec<TelemetryItem> = Vec::with_capacity(items.len());
            for (ts, payload) in items {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&payload) {
                    out.push(TelemetryItem { ts, telemetry: val });
                }
            }
            Json(TelemetryHistoryResponse { device_id, count: out.len(), items: out }).into_response()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "query failed").into_response(),
    }
}

// ----- DB init and retention -----
async fn init_db() -> Result<SqlitePool, sqlx::Error> {
    let path = std::env::var("RUSTROAST_DB_PATH").unwrap_or_else(|_| "./data/rustroast.db".to_string());
    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&path).parent() { let _ = std::fs::create_dir_all(parent); }
    let url = format!("sqlite://{}", path);
    let pool = match SqlitePoolOptions::new().max_connections(5).connect(&url).await {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!(error = ?e, "Failed to open SQLite at path; falling back to in-memory DB");
            SqlitePoolOptions::new().max_connections(5).connect("sqlite::memory:").await?
        }
    };
    // WAL for better concurrency
    let _ = sqlx::query("PRAGMA journal_mode=WAL;").execute(&pool).await;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            ts INTEGER NOT NULL,
            payload TEXT NOT NULL
        );"
    ).execute(&pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON telemetry(device_id, ts DESC);")
        .execute(&pool).await?;
    // Auto-tune tables for status and results
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS autotune_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            ts INTEGER NOT NULL,
            payload TEXT NOT NULL
        );"
    ).execute(&pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_autotune_status_device_ts ON autotune_status(device_id, ts DESC);")
        .execute(&pool).await?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS autotune_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            ts INTEGER NOT NULL,
            payload TEXT NOT NULL
        );"
    ).execute(&pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_autotune_results_device_ts ON autotune_results(device_id, ts DESC);")
        .execute(&pool).await?;
    
    // Run roast session migrations
    let migration_sql = include_str!("../migrations/001_roast_sessions.sql");
    for statement in migration_sql.split(';') {
        let statement = statement.trim();
        if !statement.is_empty() {
            if let Err(e) = sqlx::query(statement).execute(&pool).await {
                // Log but don't fail on errors (tables might already exist)
                tracing::debug!("Migration statement result: {:?}", e);
            }
        }
    }
    
    Ok(pool)
}

async fn retention_cleanup_loop(db: SqlitePool) {
    let ttl = std::env::var("RUSTROAST_DB_RETENTION_SECS").ok().and_then(|s| s.parse::<u64>().ok()).unwrap_or(7*24*3600);
    let interval = std::env::var("RUSTROAST_DB_CLEAN_INTERVAL_SECS").ok().and_then(|s| s.parse::<u64>().ok()).unwrap_or(300);
    let mut ticker = tokio::time::interval(Duration::from_secs(interval));
    loop {
        ticker.tick().await;
        let cutoff = (epoch_secs().saturating_sub(ttl)) as i64;
        let _ = sqlx::query("DELETE FROM telemetry WHERE ts < ?").bind(cutoff).execute(&db).await;
    }
}

// ----- Roast Session Management API Handlers -----

// Session Management
async fn api_create_session(State(state): State<AppState>, Json(req): Json<CreateSessionRequest>) -> Response {
    match state.session_service.create_session(req).await {
        Ok(session) => Json(session).into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to create session");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to create session").into_response()
        }
    }
}

#[derive(Deserialize)]
struct SessionListQuery { device_id: Option<String>, limit: Option<i32> }

async fn api_list_sessions(State(state): State<AppState>, Query(q): Query<SessionListQuery>) -> Response {
    match state.session_service.list_sessions(q.device_id.as_deref(), q.limit).await {
        Ok(sessions) => Json(sessions).into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to list sessions");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to list sessions").into_response()
        }
    }
}

async fn api_get_session(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.session_service.get_session_with_telemetry(&id).await {
        Ok(Some(session)) => Json(session).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Session not found").into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to get session");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get session").into_response()
        }
    }
}

async fn api_update_session(State(state): State<AppState>, Path(id): Path<String>, Json(req): Json<UpdateSessionRequest>) -> Response {
    match state.session_service.update_session(&id, req).await {
        Ok(Some(session)) => Json(session).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Session not found").into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to update session");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to update session").into_response()
        }
    }
}

async fn api_delete_session(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.session_service.delete_session(&id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => (StatusCode::NOT_FOUND, "Session not found").into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to delete session");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete session").into_response()
        }
    }
}

async fn api_start_session(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.session_service.start_session(&id).await {
        Ok(Some(session)) => Json(session).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Session not found or not in planning state").into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to start session");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to start session").into_response()
        }
    }
}

async fn api_pause_session(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.session_service.pause_session(&id).await {
        Ok(Some(session)) => Json(session).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Session not found or not active").into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to pause session");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to pause session").into_response()
        }
    }
}

async fn api_resume_session(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.session_service.resume_session(&id).await {
        Ok(Some(session)) => Json(session).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Session not found or not paused").into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to resume session");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to resume session").into_response()
        }
    }
}

async fn api_complete_session(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.session_service.complete_session(&id).await {
        Ok(Some(session)) => Json(session).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Session not found or not active/paused").into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to complete session");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to complete session").into_response()
        }
    }
}

async fn api_get_session_telemetry(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.session_service.get_session_with_telemetry(&id).await {
        Ok(Some(session_with_telemetry)) => Json(session_with_telemetry).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Session not found").into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to get session with telemetry");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get session with telemetry").into_response()
        }
    }
}

#[derive(Deserialize)]
struct TelemetryPointRequest {
    elapsed_seconds: f32,
    bean_temp: Option<f32>,
    env_temp: Option<f32>,
    rate_of_rise: Option<f32>,
    heater_pwm: Option<i32>,
    fan_pwm: Option<i32>,
    setpoint: Option<f32>,
}

async fn api_add_telemetry_point(State(state): State<AppState>, Path(id): Path<String>, Json(req): Json<TelemetryPointRequest>) -> Response {
    match state.session_service.add_telemetry_point(
        &id, req.elapsed_seconds, req.bean_temp, req.env_temp, 
        req.rate_of_rise, req.heater_pwm, req.fan_pwm, req.setpoint
    ).await {
        Ok(_) => StatusCode::CREATED.into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to add telemetry point");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to add telemetry point").into_response()
        }
    }
}

// Profile Management
async fn api_create_profile(State(state): State<AppState>, Json(req): Json<CreateProfileRequest>) -> Response {
    match state.session_service.create_profile(req).await {
        Ok(profile) => Json(profile).into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to create profile");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to create profile").into_response()
        }
    }
}

#[derive(Deserialize)]
struct ProfileListQuery { include_private: Option<bool> }

async fn api_list_profiles(State(state): State<AppState>, Query(q): Query<ProfileListQuery>) -> Response {
    match state.session_service.list_profiles(q.include_private.unwrap_or(false)).await {
        Ok(profiles) => Json(profiles).into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to list profiles");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to list profiles").into_response()
        }
    }
}

async fn api_get_profile(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.session_service.get_profile_with_points(&id).await {
        Ok(Some(profile)) => Json(profile).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Profile not found").into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to get profile");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get profile").into_response()
        }
    }
}

async fn api_delete_profile(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.session_service.delete_profile(&id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => (StatusCode::NOT_FOUND, "Profile not found").into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to delete profile");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete profile").into_response()
        }
    }
}

async fn api_import_artisan_profile(State(state): State<AppState>, Json(req): Json<ImportArtisanProfileRequest>) -> Response {
    match state.session_service.import_artisan_profile(req).await {
        Ok(profile) => Json(profile).into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to import Artisan profile");
            (StatusCode::BAD_REQUEST, format!("Failed to import Artisan profile: {}", e)).into_response()
        }
    }
}

// ----- Test-only helper endpoint -----

async fn api_test_emit_telemetry(
    Path(device_id): Path<String>,
    State(state): State<AppState>,
    maybe_body: Option<Json<serde_json::Value>>,
) -> Response {
    let topic = rustroast_core::telemetry_topic(&device_id);
    let payload = if let Some(Json(v)) = maybe_body {
        v.to_string()
    } else {
        serde_json::json!({
            "timestamp": 0,
            "beanTemp": 100.0,
            "envTemp": 90.0,
            "rateOfRise": 10.0,
            "heaterPWM": 50,
            "fanPWM": 180,
            "setpoint": 200.0,
            "controlMode": 1,
            "heaterEnable": 1,
            "uptime": 1,
            "Kp": 15.0,
            "Ki": 1.0,
            "Kd": 25.0,
            "freeHeap": 0,
            "rssi": -40,
            "systemStatus": 0
        }).to_string()
    };
    publish_ok(&state, &topic, payload).await
}

async fn api_test_emit_status(
    Path(device_id): Path<String>,
    State(state): State<AppState>,
    maybe_body: Option<Json<serde_json::Value>>,
) -> Response {
    let topic = rustroast_core::status_topic(&device_id);
    let payload = if let Some(Json(v)) = maybe_body {
        v.to_string()
    } else {
        serde_json::json!({
            "status": "online",
            "id": format!("{}-TEST", device_id),
            "ip": "127.0.0.1",
            "rssi": -40,
            "freeHeap": 123456,
            "version": "test"
        }).to_string()
    };
    publish_ok(&state, &topic, payload).await
}

// Roast Events API Handlers
async fn api_get_roast_events(State(state): State<AppState>, Path(session_id): Path<String>) -> Response {
    match state.session_service.get_roast_events(&session_id).await {
        Ok(events) => Json(events).into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to get roast events");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get roast events").into_response()
        }
    }
}

async fn api_create_roast_event(State(state): State<AppState>, Path(session_id): Path<String>, Json(req): Json<CreateRoastEventRequest>) -> Response {
    match state.session_service.create_roast_event(&session_id, req).await {
        Ok(event) => (StatusCode::CREATED, Json(event)).into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to create roast event");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to create roast event").into_response()
        }
    }
}

async fn api_update_roast_event(State(state): State<AppState>, Path((session_id, event_id)): Path<(String, String)>, Json(req): Json<UpdateRoastEventRequest>) -> Response {
    match state.session_service.update_roast_event(&event_id, req).await {
        Ok(event) => Json(event).into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to update roast event");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to update roast event").into_response()
        }
    }
}

async fn api_delete_roast_event(State(state): State<AppState>, Path((session_id, event_id)): Path<(String, String)>) -> Response {
    match state.session_service.delete_roast_event(&event_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to delete roast event");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete roast event").into_response()
        }
    }
}
