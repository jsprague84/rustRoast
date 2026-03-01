use std::net::SocketAddr;
use std::time::Instant;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

use crate::models::*;
use crate::AppState;

// ============================================================================
// AppError — consistent JSON error responses
// ============================================================================

#[derive(Debug)]
pub struct AppError {
    status: StatusCode,
    message: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    status: u16,
}

impl AppError {
    fn not_found(entity: &str) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: format!("{} not found", entity),
        }
    }

    fn internal(msg: impl std::fmt::Display) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: msg.to_string(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let body = ErrorResponse {
            error: self.message,
            status: self.status.as_u16(),
        };
        (self.status, Json(body)).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        error!(?err, "Internal error");
        Self::internal(err)
    }
}

// ============================================================================
// Query parameters
// ============================================================================

#[derive(Deserialize)]
pub struct DeviceListQuery {
    pub status: Option<String>,
}

// ============================================================================
// Route builder
// ============================================================================

/// Returns a Router with all device management routes.
/// Read endpoints are public; mutation endpoints should be placed behind auth.
pub fn device_routes() -> Router<AppState> {
    Router::new()
        // Discovered devices (auto-created with status 'pending') — must be before :id
        .route("/api/devices/discovered", get(list_discovered_devices))
        // Device CRUD
        .route("/api/devices", get(list_devices))
        .route("/api/devices/:id", get(get_device))
        .route("/api/devices", post(create_device))
        .route("/api/devices/:id", put(update_device))
        .route("/api/devices/:id", delete(delete_device))
        // Device Profile CRUD
        .route("/api/device-profiles", get(list_device_profiles))
        .route("/api/device-profiles/:id", get(get_device_profile))
        .route("/api/device-profiles", post(create_device_profile))
        .route("/api/device-profiles/:id", delete(delete_device_profile))
        // Device Connection management
        .route("/api/devices/:id/connections", post(add_connection))
        .route(
            "/api/devices/:id/connections/:conn_id",
            put(update_connection),
        )
        .route(
            "/api/devices/:id/connections/:conn_id",
            delete(remove_connection),
        )
        // Modbus Register Map
        .route("/api/devices/:id/register-map", get(get_register_map))
        .route("/api/devices/:id/register-map", put(set_register_map))
        // Connection testing
        .route("/api/devices/test-connection", post(test_connection))
}

// ============================================================================
// Device CRUD handlers
// ============================================================================

async fn list_devices(
    State(state): State<AppState>,
    Query(q): Query<DeviceListQuery>,
) -> Result<Json<Vec<Device>>, AppError> {
    let status_filter = q.status.and_then(|s| s.parse::<DeviceStatus>().ok());
    let devices = state.device_service.list_devices(status_filter).await?;
    Ok(Json(devices))
}

async fn list_discovered_devices(
    State(state): State<AppState>,
) -> Result<Json<Vec<Device>>, AppError> {
    let devices = state
        .device_service
        .list_devices(Some(DeviceStatus::Pending))
        .await?;
    Ok(Json(devices))
}

async fn get_device(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<DeviceWithConnections>, AppError> {
    let device = state
        .device_service
        .get_device(&id)
        .await?
        .ok_or_else(|| AppError::not_found("Device"))?;
    Ok(Json(device))
}

async fn create_device(
    State(state): State<AppState>,
    Json(req): Json<CreateDeviceRequest>,
) -> Result<(StatusCode, Json<Device>), AppError> {
    let device = state.device_service.create_device(req).await?;
    Ok((StatusCode::CREATED, Json(device)))
}

async fn update_device(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateDeviceRequest>,
) -> Result<Json<Device>, AppError> {
    let device = state
        .device_service
        .update_device(&id, req)
        .await?
        .ok_or_else(|| AppError::not_found("Device"))?;
    Ok(Json(device))
}

async fn delete_device(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let deleted = state.device_service.delete_device(&id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::not_found("Device"))
    }
}

// ============================================================================
// Device Profile CRUD handlers
// ============================================================================

async fn list_device_profiles(
    State(state): State<AppState>,
) -> Result<Json<Vec<DeviceProfile>>, AppError> {
    let profiles = state.device_service.list_profiles().await?;
    Ok(Json(profiles))
}

async fn get_device_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<DeviceProfile>, AppError> {
    let profile = state
        .device_service
        .get_profile(&id)
        .await?
        .ok_or_else(|| AppError::not_found("Device profile"))?;
    Ok(Json(profile))
}

async fn create_device_profile(
    State(state): State<AppState>,
    Json(req): Json<CreateDeviceProfileRequest>,
) -> Result<(StatusCode, Json<DeviceProfile>), AppError> {
    let profile = state.device_service.create_profile(req).await?;
    Ok((StatusCode::CREATED, Json(profile)))
}

async fn delete_device_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let deleted = state.device_service.delete_profile(&id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::not_found("Device profile"))
    }
}

// ============================================================================
// Device Connection handlers
// ============================================================================

async fn add_connection(
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    Json(req): Json<CreateConnectionRequest>,
) -> Result<(StatusCode, Json<DeviceConnection>), AppError> {
    // Verify device exists
    state
        .device_service
        .get_device(&device_id)
        .await?
        .ok_or_else(|| AppError::not_found("Device"))?;

    let connection = state
        .device_service
        .add_connection(&device_id, req)
        .await?;
    Ok((StatusCode::CREATED, Json(connection)))
}

async fn update_connection(
    State(state): State<AppState>,
    Path((_device_id, conn_id)): Path<(String, String)>,
    Json(req): Json<UpdateConnectionRequest>,
) -> Result<Json<DeviceConnection>, AppError> {
    let connection = state
        .device_service
        .update_connection(&conn_id, req)
        .await?
        .ok_or_else(|| AppError::not_found("Connection"))?;
    Ok(Json(connection))
}

async fn remove_connection(
    State(state): State<AppState>,
    Path((_device_id, conn_id)): Path<(String, String)>,
) -> Result<StatusCode, AppError> {
    let deleted = state.device_service.remove_connection(&conn_id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::not_found("Connection"))
    }
}

// ============================================================================
// Register Map handlers
// ============================================================================

async fn get_register_map(
    State(state): State<AppState>,
    Path(device_id): Path<String>,
) -> Result<Json<Vec<ModbusRegisterMap>>, AppError> {
    // Verify device exists
    state
        .device_service
        .get_device(&device_id)
        .await?
        .ok_or_else(|| AppError::not_found("Device"))?;

    let registers = state
        .device_service
        .get_register_map(&device_id)
        .await?;
    Ok(Json(registers))
}

async fn set_register_map(
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    Json(registers): Json<Vec<CreateRegisterMapEntry>>,
) -> Result<Json<Vec<ModbusRegisterMap>>, AppError> {
    // Verify device exists
    state
        .device_service
        .get_device(&device_id)
        .await?
        .ok_or_else(|| AppError::not_found("Device"))?;

    state
        .device_service
        .set_register_map(&device_id, registers)
        .await?;

    let updated = state
        .device_service
        .get_register_map(&device_id)
        .await?;
    Ok(Json(updated))
}

// ============================================================================
// Connection test handler
// ============================================================================

async fn test_connection(
    State(state): State<AppState>,
    Json(req): Json<TestConnectionRequest>,
) -> Json<TestConnectionResponse> {
    match req.protocol {
        Protocol::Mqtt => test_mqtt_connection(&state, &req).await,
        Protocol::ModbusTcp => test_modbus_connection(&req).await,
        Protocol::WebSocket => test_websocket_connection(&req).await,
    }
}

/// MQTT test: check the in-memory telemetry cache for recent data from the device.
async fn test_mqtt_connection(
    state: &AppState,
    req: &TestConnectionRequest,
) -> Json<TestConnectionResponse> {
    let device_id = match &req.device_id {
        Some(id) => id.clone(),
        None => {
            // Try to extract device_id from the topic_prefix config
            if let Some(prefix) = req.config.get("topic_prefix").and_then(|v| v.as_str()) {
                // topic_prefix is typically "roaster/{device_id}"
                prefix.strip_prefix("roaster/").unwrap_or(prefix).to_string()
            } else {
                return Json(TestConnectionResponse {
                    success: false,
                    message: "No device_id provided and could not extract from topic_prefix".into(),
                    latency_ms: None,
                });
            }
        }
    };

    let cache = state.telemetry_cache.read().await;
    if let Some((_val, ts)) = cache.get(&device_id) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let age_secs = now.saturating_sub(*ts);
        if age_secs <= 30 {
            Json(TestConnectionResponse {
                success: true,
                message: format!(
                    "Receiving telemetry from device '{}' (last seen {}s ago)",
                    device_id, age_secs
                ),
                latency_ms: Some(age_secs * 1000),
            })
        } else {
            Json(TestConnectionResponse {
                success: false,
                message: format!(
                    "Device '{}' last seen {}s ago (stale, threshold is 30s)",
                    device_id, age_secs
                ),
                latency_ms: None,
            })
        }
    } else {
        Json(TestConnectionResponse {
            success: false,
            message: format!(
                "No telemetry found for device '{}'. Ensure the device is powered on and publishing MQTT telemetry.",
                device_id
            ),
            latency_ms: None,
        })
    }
}

/// Modbus TCP test: attempt a TCP connection and read input registers 0x0000-0x0001 (bean_temp).
async fn test_modbus_connection(req: &TestConnectionRequest) -> Json<TestConnectionResponse> {
    let config: ModbusTcpConnectionConfig = match serde_json::from_value(req.config.clone()) {
        Ok(c) => c,
        Err(e) => {
            return Json(TestConnectionResponse {
                success: false,
                message: format!("Invalid Modbus TCP config: {}", e),
                latency_ms: None,
            });
        }
    };

    let addr: SocketAddr = match format!("{}:{}", config.host, config.port).parse() {
        Ok(a) => a,
        Err(e) => {
            return Json(TestConnectionResponse {
                success: false,
                message: format!("Invalid address '{}:{}': {}", config.host, config.port, e),
                latency_ms: None,
            });
        }
    };

    let start = Instant::now();

    let result = tokio::time::timeout(std::time::Duration::from_secs(5), async {
        use tokio_modbus::prelude::*;
        let mut ctx = tcp::connect_slave(addr, Slave(config.unit_id)).await?;
        let registers = ctx.read_input_registers(0x0000, 2).await??;
        Ok::<Vec<u16>, Box<dyn std::error::Error + Send + Sync>>(registers)
    })
    .await;

    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(Ok(registers)) => {
            info!(
                host = %config.host,
                port = config.port,
                unit_id = config.unit_id,
                ?registers,
                "Modbus TCP connection test succeeded"
            );
            Json(TestConnectionResponse {
                success: true,
                message: format!(
                    "Connected to {}:{} (unit {}). Read registers 0x0000-0x0001: {:?}",
                    config.host, config.port, config.unit_id, registers
                ),
                latency_ms: Some(latency_ms),
            })
        }
        Ok(Err(e)) => {
            warn!(
                host = %config.host,
                port = config.port,
                error = %e,
                "Modbus TCP connection test failed"
            );
            Json(TestConnectionResponse {
                success: false,
                message: format!(
                    "Failed to connect to {}:{}: {}",
                    config.host, config.port, e
                ),
                latency_ms: Some(latency_ms),
            })
        }
        Err(_) => Json(TestConnectionResponse {
            success: false,
            message: format!(
                "Connection to {}:{} timed out after 5 seconds",
                config.host, config.port
            ),
            latency_ms: Some(5000),
        }),
    }
}

/// WebSocket test: attempt a handshake and wait for a message.
async fn test_websocket_connection(req: &TestConnectionRequest) -> Json<TestConnectionResponse> {
    let config: WebSocketConnectionConfig = match serde_json::from_value(req.config.clone()) {
        Ok(c) => c,
        Err(e) => {
            return Json(TestConnectionResponse {
                success: false,
                message: format!("Invalid WebSocket config: {}", e),
                latency_ms: None,
            });
        }
    };

    let start = Instant::now();

    let result = tokio::time::timeout(std::time::Duration::from_secs(5), async {
        use futures_util::StreamExt;
        let (ws_stream, _) = tokio_tungstenite::connect_async(&config.url).await?;
        let (_write, mut read) = ws_stream.split();
        // Wait for one message to confirm the connection is alive
        if let Some(msg) = read.next().await {
            msg?;
        }
        Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
    })
    .await;

    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(Ok(())) => {
            info!(url = %config.url, "WebSocket connection test succeeded");
            Json(TestConnectionResponse {
                success: true,
                message: format!("Connected to {} and received a message", config.url),
                latency_ms: Some(latency_ms),
            })
        }
        Ok(Err(e)) => {
            warn!(url = %config.url, error = %e, "WebSocket connection test failed");
            Json(TestConnectionResponse {
                success: false,
                message: format!("Failed to connect to {}: {}", config.url, e),
                latency_ms: Some(latency_ms),
            })
        }
        Err(_) => Json(TestConnectionResponse {
            success: false,
            message: format!(
                "Connection to {} timed out after 5 seconds",
                config.url
            ),
            latency_ms: Some(5000),
        }),
    }
}
