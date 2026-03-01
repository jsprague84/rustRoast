use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tracing::error;

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
