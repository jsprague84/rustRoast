use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
#[allow(unused_imports)] // Used by future stories
use uuid::Uuid;
use sqlx::{FromRow, Type, Decode, Encode};
use sqlx::sqlite::{SqliteTypeInfo, SqliteValueRef};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RoastSession {
    pub id: String, // UUID as string
    pub name: String,
    pub device_id: String,
    pub profile_id: Option<String>, // Optional linked profile
    pub status: SessionStatus,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    
    // Metadata fields
    pub bean_origin: Option<String>,
    pub bean_variety: Option<String>,
    pub green_weight: Option<f32>,
    pub roasted_weight: Option<f32>,
    pub target_roast_level: Option<String>,
    pub notes: Option<String>,
    pub ambient_temp: Option<f32>,
    pub humidity: Option<f32>,
    
    // Session summary data
    pub max_temp: Option<f32>,
    pub total_time_seconds: Option<i32>,
    pub first_crack_time: Option<i32>,
    pub development_time_ratio: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RoastProfile {
    pub id: String, // UUID as string
    pub name: String,
    pub description: Option<String>,
    pub created_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub is_public: bool,
    
    // Profile settings
    pub target_total_time: Option<i32>, // seconds
    pub target_first_crack: Option<i32>, // seconds from start
    pub target_end_temp: Option<f32>,
    pub preheat_temp: Option<f32>,
    pub charge_temp: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ProfilePoint {
    pub id: String,
    pub profile_id: String,
    pub time_seconds: i32,
    pub target_temp: f32,
    pub fan_speed: Option<i32>, // 0-100
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SessionTelemetry {
    pub id: String,
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub elapsed_seconds: f32,
    pub bean_temp: Option<f32>,
    pub env_temp: Option<f32>,
    pub rate_of_rise: Option<f32>,
    pub heater_pwm: Option<i32>,
    pub fan_pwm: Option<i32>,
    pub setpoint: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Planning,   // Created but not started
    Active,     // Currently roasting
    Paused,     // Temporarily paused
    Completed,  // Successfully finished
    Failed,     // Ended due to error
    Cancelled,  // Manually cancelled
}

// SQLx implementations for SessionStatus
impl Type<sqlx::Sqlite> for SessionStatus {
    fn type_info() -> SqliteTypeInfo {
        <String as Type<sqlx::Sqlite>>::type_info()
    }
}

impl<'r> Decode<'r, sqlx::Sqlite> for SessionStatus {
    fn decode(value: SqliteValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let s = <String as Decode<sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(Into::into)
    }
}

impl<'q> Encode<'q, sqlx::Sqlite> for SessionStatus {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'q>>) -> sqlx::encode::IsNull {
        <String as Encode<sqlx::Sqlite>>::encode_by_ref(&self.to_string(), buf)
    }
}

impl std::fmt::Display for SessionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            SessionStatus::Planning => "planning",
            SessionStatus::Active => "active", 
            SessionStatus::Paused => "paused",
            SessionStatus::Completed => "completed",
            SessionStatus::Failed => "failed",
            SessionStatus::Cancelled => "cancelled",
        };
        write!(f, "{}", s)
    }
}

impl std::str::FromStr for SessionStatus {
    type Err = String;
    
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "planning" => Ok(SessionStatus::Planning),
            "active" => Ok(SessionStatus::Active),
            "paused" => Ok(SessionStatus::Paused),
            "completed" => Ok(SessionStatus::Completed),
            "failed" => Ok(SessionStatus::Failed),
            "cancelled" => Ok(SessionStatus::Cancelled),
            _ => Err(format!("Invalid session status: {}", s)),
        }
    }
}

// Request/Response DTOs
#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub name: String,
    pub device_id: String,
    pub profile_id: Option<String>,
    pub bean_origin: Option<String>,
    pub bean_variety: Option<String>,
    pub green_weight: Option<f32>,
    pub target_roast_level: Option<String>,
    pub notes: Option<String>,
    pub ambient_temp: Option<f32>,
    pub humidity: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSessionRequest {
    pub name: Option<String>,
    pub roasted_weight: Option<f32>,
    pub notes: Option<String>,
    pub first_crack_time: Option<i32>,
    pub development_time_ratio: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProfileRequest {
    pub name: String,
    pub description: Option<String>,
    pub target_total_time: Option<i32>,
    pub target_first_crack: Option<i32>,
    pub target_end_temp: Option<f32>,
    pub preheat_temp: Option<f32>,
    pub charge_temp: Option<f32>,
    pub points: Vec<CreateProfilePointRequest>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProfilePointRequest {
    pub time_seconds: i32,
    pub target_temp: f32,
    pub fan_speed: Option<i32>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImportArtisanProfileRequest {
    pub alog_content: String,
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SessionWithTelemetry {
    #[serde(flatten)]
    pub session: RoastSession,
    pub telemetry: Vec<SessionTelemetry>,
    pub profile: Option<ProfileWithPoints>,
}

#[derive(Debug, Serialize)]
pub struct ProfileWithPoints {
    #[serde(flatten)]
    pub profile: RoastProfile,
    pub points: Vec<ProfilePoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RoastEvent {
    pub id: String, // UUID as string
    pub session_id: String,
    pub event_type: RoastEventType,
    pub elapsed_seconds: f32,
    pub temperature: Option<f32>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RoastEventType {
    Drop,
    DryingEnd,
    FirstCrackStart,
    FirstCrackEnd,
    SecondCrackStart,
    SecondCrackEnd,
    DevelopmentStart,
    DropOut,
    Custom,
}

// SQLx implementations for RoastEventType
impl Type<sqlx::Sqlite> for RoastEventType {
    fn type_info() -> SqliteTypeInfo {
        <String as Type<sqlx::Sqlite>>::type_info()
    }
}

impl<'r> Decode<'r, sqlx::Sqlite> for RoastEventType {
    fn decode(value: SqliteValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let s = <String as Decode<sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(Into::into)
    }
}

impl<'q> Encode<'q, sqlx::Sqlite> for RoastEventType {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'q>>) -> sqlx::encode::IsNull {
        <String as Encode<sqlx::Sqlite>>::encode_by_ref(&self.to_string(), buf)
    }
}

impl std::fmt::Display for RoastEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            RoastEventType::Drop => "drop",
            RoastEventType::DryingEnd => "drying_end",
            RoastEventType::FirstCrackStart => "first_crack_start",
            RoastEventType::FirstCrackEnd => "first_crack_end",
            RoastEventType::SecondCrackStart => "second_crack_start",
            RoastEventType::SecondCrackEnd => "second_crack_end",
            RoastEventType::DevelopmentStart => "development_start",
            RoastEventType::DropOut => "drop_out",
            RoastEventType::Custom => "custom",
        };
        write!(f, "{}", s)
    }
}

impl std::str::FromStr for RoastEventType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "drop" => Ok(RoastEventType::Drop),
            "drying_end" => Ok(RoastEventType::DryingEnd),
            "first_crack_start" => Ok(RoastEventType::FirstCrackStart),
            "first_crack_end" => Ok(RoastEventType::FirstCrackEnd),
            "second_crack_start" => Ok(RoastEventType::SecondCrackStart),
            "second_crack_end" => Ok(RoastEventType::SecondCrackEnd),
            "development_start" => Ok(RoastEventType::DevelopmentStart),
            "drop_out" => Ok(RoastEventType::DropOut),
            "custom" => Ok(RoastEventType::Custom),
            _ => Err(format!("Invalid roast event type: {}", s)),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateRoastEventRequest {
    pub event_type: RoastEventType,
    pub elapsed_seconds: f32,
    pub temperature: Option<f32>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRoastEventRequest {
    pub elapsed_seconds: Option<f32>,
    pub temperature: Option<f32>,
    pub notes: Option<String>,
}

// ============================================================================
// Device Configuration Models
// ============================================================================

/// Device status enum matching the `devices.status` column constraint.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceStatus {
    Pending,
    Active,
    Disabled,
    Error,
}

impl Type<sqlx::Sqlite> for DeviceStatus {
    fn type_info() -> SqliteTypeInfo {
        <String as Type<sqlx::Sqlite>>::type_info()
    }
}

impl<'r> Decode<'r, sqlx::Sqlite> for DeviceStatus {
    fn decode(value: SqliteValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let s = <String as Decode<sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(Into::into)
    }
}

impl<'q> Encode<'q, sqlx::Sqlite> for DeviceStatus {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'q>>) -> sqlx::encode::IsNull {
        <String as Encode<sqlx::Sqlite>>::encode_by_ref(&self.to_string(), buf)
    }
}

impl std::fmt::Display for DeviceStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            DeviceStatus::Pending => "pending",
            DeviceStatus::Active => "active",
            DeviceStatus::Disabled => "disabled",
            DeviceStatus::Error => "error",
        };
        write!(f, "{}", s)
    }
}

impl std::str::FromStr for DeviceStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "pending" => Ok(DeviceStatus::Pending),
            "active" => Ok(DeviceStatus::Active),
            "disabled" => Ok(DeviceStatus::Disabled),
            "error" => Ok(DeviceStatus::Error),
            _ => Err(format!("Invalid device status: {}", s)),
        }
    }
}

/// Connection protocol enum matching the `device_connections.protocol` column.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Protocol {
    Mqtt,
    #[serde(rename = "websocket")]
    WebSocket,
    ModbusTcp,
}

impl Type<sqlx::Sqlite> for Protocol {
    fn type_info() -> SqliteTypeInfo {
        <String as Type<sqlx::Sqlite>>::type_info()
    }
}

impl<'r> Decode<'r, sqlx::Sqlite> for Protocol {
    fn decode(value: SqliteValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let s = <String as Decode<sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(Into::into)
    }
}

impl<'q> Encode<'q, sqlx::Sqlite> for Protocol {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'q>>) -> sqlx::encode::IsNull {
        <String as Encode<sqlx::Sqlite>>::encode_by_ref(&self.to_string(), buf)
    }
}

impl std::fmt::Display for Protocol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Protocol::Mqtt => "mqtt",
            Protocol::WebSocket => "websocket",
            Protocol::ModbusTcp => "modbus_tcp",
        };
        write!(f, "{}", s)
    }
}

impl std::str::FromStr for Protocol {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "mqtt" => Ok(Protocol::Mqtt),
            "websocket" => Ok(Protocol::WebSocket),
            "modbus_tcp" => Ok(Protocol::ModbusTcp),
            _ => Err(format!("Invalid protocol: {}", s)),
        }
    }
}

/// Modbus register type enum.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModbusRegisterType {
    Input,
    Holding,
    Coil,
    Discrete,
}

impl Type<sqlx::Sqlite> for ModbusRegisterType {
    fn type_info() -> SqliteTypeInfo {
        <String as Type<sqlx::Sqlite>>::type_info()
    }
}

impl<'r> Decode<'r, sqlx::Sqlite> for ModbusRegisterType {
    fn decode(value: SqliteValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let s = <String as Decode<sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(Into::into)
    }
}

impl<'q> Encode<'q, sqlx::Sqlite> for ModbusRegisterType {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'q>>) -> sqlx::encode::IsNull {
        <String as Encode<sqlx::Sqlite>>::encode_by_ref(&self.to_string(), buf)
    }
}

impl std::fmt::Display for ModbusRegisterType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            ModbusRegisterType::Input => "input",
            ModbusRegisterType::Holding => "holding",
            ModbusRegisterType::Coil => "coil",
            ModbusRegisterType::Discrete => "discrete",
        };
        write!(f, "{}", s)
    }
}

impl std::str::FromStr for ModbusRegisterType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "input" => Ok(ModbusRegisterType::Input),
            "holding" => Ok(ModbusRegisterType::Holding),
            "coil" => Ok(ModbusRegisterType::Coil),
            "discrete" => Ok(ModbusRegisterType::Discrete),
            _ => Err(format!("Invalid modbus register type: {}", s)),
        }
    }
}

/// Modbus data type enum.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModbusDataType {
    Uint16,
    Int16,
    Float32,
    Uint32,
    Int32,
    Bool,
}

impl Type<sqlx::Sqlite> for ModbusDataType {
    fn type_info() -> SqliteTypeInfo {
        <String as Type<sqlx::Sqlite>>::type_info()
    }
}

impl<'r> Decode<'r, sqlx::Sqlite> for ModbusDataType {
    fn decode(value: SqliteValueRef<'r>) -> Result<Self, sqlx::error::BoxDynError> {
        let s = <String as Decode<sqlx::Sqlite>>::decode(value)?;
        s.parse().map_err(Into::into)
    }
}

impl<'q> Encode<'q, sqlx::Sqlite> for ModbusDataType {
    fn encode_by_ref(&self, buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'q>>) -> sqlx::encode::IsNull {
        <String as Encode<sqlx::Sqlite>>::encode_by_ref(&self.to_string(), buf)
    }
}

impl std::fmt::Display for ModbusDataType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            ModbusDataType::Uint16 => "uint16",
            ModbusDataType::Int16 => "int16",
            ModbusDataType::Float32 => "float32",
            ModbusDataType::Uint32 => "uint32",
            ModbusDataType::Int32 => "int32",
            ModbusDataType::Bool => "bool",
        };
        write!(f, "{}", s)
    }
}

impl std::str::FromStr for ModbusDataType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "uint16" => Ok(ModbusDataType::Uint16),
            "int16" => Ok(ModbusDataType::Int16),
            "float32" => Ok(ModbusDataType::Float32),
            "uint32" => Ok(ModbusDataType::Uint32),
            "int32" => Ok(ModbusDataType::Int32),
            "bool" => Ok(ModbusDataType::Bool),
            _ => Err(format!("Invalid modbus data type: {}", s)),
        }
    }
}

// ---- Database row structs ----

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub device_id: String,
    pub profile_id: Option<String>,
    pub status: DeviceStatus,
    pub description: Option<String>,
    pub location: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_seen_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DeviceProfile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub default_control_mode: Option<String>,
    pub default_setpoint: Option<f64>,
    pub default_fan_pwm: Option<i32>,
    pub default_kp: Option<f64>,
    pub default_ki: Option<f64>,
    pub default_kd: Option<f64>,
    pub max_temp: Option<f64>,
    pub min_fan_pwm: Option<i32>,
    pub telemetry_interval_ms: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DeviceConnection {
    pub id: String,
    pub device_id: String,
    pub protocol: Protocol,
    pub enabled: bool,
    pub priority: i32,
    #[sqlx(json)]
    pub config: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ModbusRegisterMap {
    pub id: String,
    pub device_id: String,
    pub register_type: ModbusRegisterType,
    pub address: i32,
    pub name: String,
    pub data_type: ModbusDataType,
    pub byte_order: Option<String>,
    pub scale_factor: Option<f64>,
    pub offset: Option<f64>,
    pub unit: Option<String>,
    pub description: Option<String>,
    pub writable: bool,
}

// ---- API response structs ----

#[derive(Debug, Clone, Serialize)]
pub struct DeviceWithConnections {
    #[serde(flatten)]
    pub device: Device,
    pub connections: Vec<DeviceConnection>,
}

// ---- API request structs ----

#[derive(Debug, Deserialize)]
pub struct CreateDeviceRequest {
    pub name: String,
    pub device_id: String,
    pub profile_id: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDeviceRequest {
    pub name: Option<String>,
    pub profile_id: Option<String>,
    pub status: Option<DeviceStatus>,
    pub description: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDeviceProfileRequest {
    pub name: String,
    pub description: Option<String>,
    pub default_control_mode: Option<String>,
    pub default_setpoint: Option<f64>,
    pub default_fan_pwm: Option<i32>,
    pub default_kp: Option<f64>,
    pub default_ki: Option<f64>,
    pub default_kd: Option<f64>,
    pub max_temp: Option<f64>,
    pub min_fan_pwm: Option<i32>,
    pub telemetry_interval_ms: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // Used by device profile edit UI (DEV-013)
pub struct UpdateDeviceProfileRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub default_control_mode: Option<String>,
    pub default_setpoint: Option<f64>,
    pub default_fan_pwm: Option<i32>,
    pub default_kp: Option<f64>,
    pub default_ki: Option<f64>,
    pub default_kd: Option<f64>,
    pub max_temp: Option<f64>,
    pub min_fan_pwm: Option<i32>,
    pub telemetry_interval_ms: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateConnectionRequest {
    pub protocol: Protocol,
    pub enabled: Option<bool>,
    pub priority: Option<i32>,
    pub config: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateConnectionRequest {
    pub enabled: Option<bool>,
    pub priority: Option<i32>,
    pub config: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRegisterMapEntry {
    pub register_type: ModbusRegisterType,
    pub address: i32,
    pub name: String,
    pub data_type: ModbusDataType,
    pub byte_order: Option<String>,
    pub scale_factor: Option<f64>,
    pub offset: Option<f64>,
    pub unit: Option<String>,
    pub description: Option<String>,
    pub writable: Option<bool>,
}

// ---- Connection test request/response ----

#[derive(Debug, Deserialize)]
pub struct TestConnectionRequest {
    pub protocol: Protocol,
    pub config: serde_json::Value,
    pub device_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TestConnectionResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
}

// ---- Typed protocol config structs ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MqttConnectionConfig {
    pub topic_prefix: String,
    pub qos: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSocketConnectionConfig {
    pub url: String,
    pub reconnect_interval_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModbusTcpConnectionConfig {
    pub host: String,
    pub port: u16,
    pub unit_id: u8,
    #[serde(default = "default_poll_interval")]
    pub poll_interval_ms: u64,
}

fn default_poll_interval() -> u64 {
    1000
}