use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use prometheus::IntGaugeVec;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

use crate::models::DeviceStatus;
use crate::services::DeviceService;

/// Event broadcast when any device sends telemetry (from any protocol).
#[derive(Debug, Clone)]
pub struct TelemetryEvent {
    pub device_id: String,
    pub payload: serde_json::Value,
}

/// Typed telemetry struct matching the ESP32 JSON output.
/// Fields use camelCase serde rename to match the ESP32 firmware.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryPayload {
    pub bean_temp: f64,
    pub env_temp: f64,
    #[serde(default)]
    pub rate_of_rise: Option<f64>,
    #[serde(rename = "heaterPWM")]
    pub heater_pwm: i32,
    #[serde(rename = "fanPWM")]
    pub fan_pwm: i32,
    pub setpoint: f64,
    pub control_mode: i32,
    pub heater_enable: i32,
    #[serde(default)]
    pub uptime: Option<u64>,
    #[serde(default, rename = "Kp")]
    pub kp: Option<f64>,
    #[serde(default, rename = "Ki")]
    pub ki: Option<f64>,
    #[serde(default, rename = "Kd")]
    pub kd: Option<f64>,
    #[serde(default)]
    pub free_heap: Option<u64>,
    #[serde(default)]
    pub rssi: Option<i64>,
    #[serde(default)]
    pub system_status: Option<i32>,
    #[serde(default)]
    pub timestamp: Option<u64>,
}

/// Attempt to deserialize a telemetry payload, logging warnings for unknown fields.
#[allow(dead_code)] // Utility for future typed telemetry processing
pub fn parse_telemetry(payload: &[u8]) -> Option<TelemetryPayload> {
    // First try strict deserialization
    match serde_json::from_slice::<TelemetryPayload>(payload) {
        Ok(t) => Some(t),
        Err(e) => {
            // Try as generic JSON to detect unknown fields
            if let Ok(raw) = serde_json::from_slice::<serde_json::Value>(payload) {
                tracing::warn!(
                    error = %e,
                    "Telemetry deserialization failed, payload has unexpected structure"
                );
                // Try a more lenient parse with deny_unknown_fields disabled (default)
                serde_json::from_value(raw).ok()
            } else {
                tracing::warn!(error = %e, "Telemetry payload is not valid JSON");
                None
            }
        }
    }
}

fn epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Shared telemetry processing service used by MQTT consumer, device WebSocket handler,
/// and (future) Modbus TCP polling. Handles cache updates, DB persistence, session
/// recording, metrics, and debounced last-seen updates.
#[derive(Clone)]
pub struct TelemetryService {
    pub(crate) telemetry_cache: Arc<RwLock<HashMap<String, (serde_json::Value, u64)>>>,
    db: SqlitePool,
    device_service: DeviceService,
    telemetry_last_seen: IntGaugeVec,
    last_seen_debounce: Arc<std::sync::Mutex<HashMap<String, Instant>>>,
    /// Broadcast channel for all processed telemetry events (any protocol).
    telemetry_tx: broadcast::Sender<TelemetryEvent>,
}

impl TelemetryService {
    pub fn new(
        telemetry_cache: Arc<RwLock<HashMap<String, (serde_json::Value, u64)>>>,
        db: SqlitePool,
        device_service: DeviceService,
        telemetry_last_seen: IntGaugeVec,
    ) -> Self {
        let (telemetry_tx, _) = broadcast::channel(256);
        Self {
            telemetry_cache,
            db,
            device_service,
            telemetry_last_seen,
            last_seen_debounce: Arc::new(std::sync::Mutex::new(HashMap::new())),
            telemetry_tx,
        }
    }

    /// Subscribe to all processed telemetry events.
    pub fn subscribe(&self) -> broadcast::Receiver<TelemetryEvent> {
        self.telemetry_tx.subscribe()
    }

    /// Process incoming telemetry from any protocol (MQTT, WebSocket, Modbus).
    /// Updates telemetry cache, persists to DB, records to active sessions,
    /// updates metrics, and performs debounced last-seen updates.
    pub async fn process_telemetry(
        &self,
        device_id: &str,
        payload: &serde_json::Value,
        device_status: Option<&DeviceStatus>,
    ) {
        let now = epoch_secs();

        // Update metric
        self.telemetry_last_seen
            .with_label_values(&[device_id])
            .set(now as i64);

        // Always update telemetry cache
        self.telemetry_cache
            .write()
            .await
            .insert(device_id.to_string(), (payload.clone(), now));

        // Broadcast to dashboard WebSocket clients
        let _ = self.telemetry_tx.send(TelemetryEvent {
            device_id: device_id.to_string(),
            payload: payload.clone(),
        });

        let payload_str = serde_json::to_string(payload).unwrap_or_default();

        // Persist to general telemetry table
        let _ = sqlx::query("INSERT INTO telemetry (device_id, ts, payload) VALUES (?, ?, ?)")
            .bind(device_id)
            .bind(now as i64)
            .bind(&payload_str)
            .execute(&self.db)
            .await;

        // Record to active session telemetry (skip for disabled devices)
        let is_disabled = device_status == Some(&DeviceStatus::Disabled);
        if !is_disabled {
            let point_id = Uuid::new_v4().to_string();
            let result = sqlx::query(r#"
                INSERT INTO session_telemetry (id, session_id, timestamp, elapsed_seconds, bean_temp, env_temp, rate_of_rise, heater_pwm, fan_pwm, setpoint)
                SELECT ?, s.id, ?,
                       CASE WHEN s.start_time IS NOT NULL
                            THEN CAST(? AS REAL) - CAST(strftime('%s', s.start_time) AS REAL)
                            ELSE 0.0
                       END,
                       json_extract(?, '$.beanTemp'),
                       json_extract(?, '$.envTemp'),
                       json_extract(?, '$.rateOfRise'),
                       json_extract(?, '$.heaterPWM'),
                       json_extract(?, '$.fanPWM'),
                       json_extract(?, '$.setpoint')
                FROM roast_sessions s
                WHERE s.device_id = ? AND s.status = 'active'
            "#)
                .bind(&point_id)
                .bind(now as i64)
                .bind(now as f64)
                .bind(&payload_str)
                .bind(&payload_str)
                .bind(&payload_str)
                .bind(&payload_str)
                .bind(&payload_str)
                .bind(&payload_str)
                .bind(device_id)
                .execute(&self.db)
                .await;
            if let Err(e) = result {
                tracing::warn!(%device_id, error = %e, "Failed to insert session telemetry");
            }
        }

        // Debounced last-seen update (at most once per 10 seconds per device)
        let debounce_interval = std::time::Duration::from_secs(10);
        let should_update = {
            let debounce = self.last_seen_debounce.lock().unwrap();
            debounce
                .get(device_id)
                .map(|last| last.elapsed() >= debounce_interval)
                .unwrap_or(true)
        };
        if should_update {
            if let Err(e) = self.device_service.update_last_seen(device_id).await {
                tracing::warn!(%device_id, error = %e, "Failed to update last_seen");
            }
            self.last_seen_debounce
                .lock()
                .unwrap()
                .insert(device_id.to_string(), Instant::now());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_esp32_payload() {
        let payload = r#"{
            "timestamp": 1234567890,
            "beanTemp": 185.5,
            "envTemp": 200.3,
            "rateOfRise": 12.5,
            "heaterPWM": 75,
            "fanPWM": 180,
            "setpoint": 200.0,
            "controlMode": 1,
            "heaterEnable": 1,
            "uptime": 300,
            "Kp": 15.0,
            "Ki": 1.0,
            "Kd": 25.0,
            "freeHeap": 180000,
            "rssi": -45,
            "systemStatus": 0
        }"#;

        let t = parse_telemetry(payload.as_bytes()).expect("Should parse");
        assert!((t.bean_temp - 185.5).abs() < 0.01);
        assert!((t.env_temp - 200.3).abs() < 0.01);
        assert_eq!(t.heater_pwm, 75);
        assert_eq!(t.fan_pwm, 180);
        assert_eq!(t.control_mode, 1);
        assert_eq!(t.heater_enable, 1);
        assert!((t.kp.unwrap() - 15.0).abs() < 0.01);
    }

    #[test]
    fn test_parse_with_unknown_fields() {
        let payload = r#"{
            "beanTemp": 100.0,
            "envTemp": 90.0,
            "heaterPWM": 50,
            "fanPWM": 128,
            "setpoint": 200.0,
            "controlMode": 0,
            "heaterEnable": 1,
            "unknownField": "should not break"
        }"#;

        let t = parse_telemetry(payload.as_bytes()).expect("Should parse despite unknown fields");
        assert!((t.bean_temp - 100.0).abs() < 0.01);
    }

    #[test]
    fn test_parse_invalid_json() {
        let payload = b"not json at all";
        assert!(parse_telemetry(payload).is_none());
    }
}
