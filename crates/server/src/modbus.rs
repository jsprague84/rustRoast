//! Modbus TCP server for industrial protocol integration.
//!
//! Exposes coffee roaster telemetry and control via Modbus TCP registers,
//! enabling SCADA/HMI software to read sensor data and write control values.
//!
//! Disabled by default. Set `RUSTROAST_MODBUS_ADDR` (e.g. `0.0.0.0:502`) to enable.

use std::collections::HashMap;
use std::future::Future;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;

use rumqttc::QoS;
use rustroast_mqtt::MqttService;
use tokio::net::TcpListener;
use tokio::sync::RwLock;
use tokio_modbus::prelude::*;
use tokio_modbus::server::tcp::{accept_tcp_connection, Server};

// ---------------------------------------------------------------------------
// Register map constants
// ---------------------------------------------------------------------------

/// Input register addresses (read-only, telemetry data).
/// Individual constants document the register layout; the image is built as a flat array.
#[allow(dead_code)]
mod input_reg {
    /// bean_temp float32 high word
    pub const BEAN_TEMP_HI: u16 = 0x0000;
    /// bean_temp float32 low word
    pub const BEAN_TEMP_LO: u16 = 0x0001;
    /// env_temp float32 high word
    pub const ENV_TEMP_HI: u16 = 0x0002;
    /// env_temp float32 low word
    pub const ENV_TEMP_LO: u16 = 0x0003;
    /// rate_of_rise float32 high word
    pub const ROR_HI: u16 = 0x0004;
    /// rate_of_rise float32 low word
    pub const ROR_LO: u16 = 0x0005;
    /// heater_pwm uint16
    pub const HEATER_PWM: u16 = 0x0006;
    /// fan_pwm uint16
    pub const FAN_PWM: u16 = 0x0007;
    /// Total number of input registers
    pub const COUNT: u16 = 8;
}

/// Holding register addresses (read-write, control values)
mod holding_reg {
    /// setpoint float32 high word
    pub const SETPOINT_HI: u16 = 0x0000;
    /// setpoint float32 low word
    pub const SETPOINT_LO: u16 = 0x0001;
    /// fan_pwm_setpoint uint16
    pub const FAN_PWM: u16 = 0x0002;
    /// heater_pwm_setpoint uint16
    pub const HEATER_PWM: u16 = 0x0003;
    /// control_mode uint16 (0 = manual, 1 = auto)
    pub const CONTROL_MODE: u16 = 0x0004;
    /// heater_enable uint16 (0 = off, 1 = on)
    pub const HEATER_ENABLE: u16 = 0x0005;
    /// emergency_stop uint16 (write 1 to trigger)
    pub const EMERGENCY_STOP: u16 = 0x000C;
    /// Total register space (0x0000 through 0x000C inclusive)
    pub const COUNT: u16 = 0x000D;
}

// ---------------------------------------------------------------------------
// IEEE 754 float32 ↔ register helpers
// ---------------------------------------------------------------------------

/// Encode an f32 as two big-endian Modbus registers (high word first).
fn f32_to_registers(val: f32) -> [u16; 2] {
    let bits = val.to_bits();
    [(bits >> 16) as u16, (bits & 0xFFFF) as u16]
}

/// Decode two big-endian Modbus registers into an f32.
fn registers_to_f32(hi: u16, lo: u16) -> f32 {
    f32::from_bits(((hi as u32) << 16) | (lo as u32))
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

/// State shared across all Modbus TCP connections.
#[derive(Clone)]
struct ModbusSharedState {
    /// Live telemetry from devices (shared with Axum/MQTT consumer).
    telemetry_cache: Arc<RwLock<HashMap<String, (serde_json::Value, u64)>>>,
    /// MQTT service for publishing control commands on holding-register writes.
    mqtt: MqttService,
    /// Default device_id whose telemetry is served via input registers.
    device_id: String,
    /// Current holding-register values (0x0000 .. holding_reg::COUNT).
    holding_registers: Arc<tokio::sync::Mutex<Vec<u16>>>,
}

// ---------------------------------------------------------------------------
// Modbus Service implementation
// ---------------------------------------------------------------------------

/// Per-connection Modbus service.
struct RoasterModbusService {
    state: ModbusSharedState,
}

impl tokio_modbus::server::Service for RoasterModbusService {
    type Request = Request<'static>;
    type Response = Response;
    type Exception = ExceptionCode;
    type Future = Pin<Box<dyn Future<Output = Result<Response, ExceptionCode>> + Send>>;

    fn call(&self, req: Self::Request) -> Self::Future {
        let state = self.state.clone();

        Box::pin(async move {
            match req {
                Request::ReadInputRegisters(addr, cnt) => {
                    read_input_registers(&state, addr, cnt).await
                }
                Request::ReadHoldingRegisters(addr, cnt) => {
                    read_holding_registers(&state, addr, cnt).await
                }
                Request::WriteSingleRegister(addr, value) => {
                    write_registers(&state, addr, &[value]).await.map(|_| {
                        Response::WriteSingleRegister(addr, value)
                    })
                }
                Request::WriteMultipleRegisters(addr, values) => {
                    let cnt = values.len() as u16;
                    write_registers(&state, addr, &values).await.map(|_| {
                        Response::WriteMultipleRegisters(addr, cnt)
                    })
                }
                _ => Err(ExceptionCode::IllegalFunction),
            }
        })
    }
}

// ---------------------------------------------------------------------------
// Register read/write logic
// ---------------------------------------------------------------------------

/// Read input registers from the live telemetry cache.
async fn read_input_registers(
    state: &ModbusSharedState,
    addr: u16,
    cnt: u16,
) -> Result<Response, ExceptionCode> {
    let end = addr
        .checked_add(cnt)
        .ok_or(ExceptionCode::IllegalDataAddress)?;
    if end > input_reg::COUNT {
        return Err(ExceptionCode::IllegalDataAddress);
    }

    // Build the full 8-register input image from the latest telemetry.
    let cache = state.telemetry_cache.read().await;
    let (bean_temp, env_temp, ror, heater_pwm, fan_pwm) =
        if let Some((val, _ts)) = cache.get(&state.device_id) {
            (
                val.get("beanTemp")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0) as f32,
                val.get("envTemp")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0) as f32,
                val.get("rateOfRise")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0) as f32,
                val.get("heaterPWM")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u16,
                val.get("fanPWM")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u16,
            )
        } else {
            (0.0, 0.0, 0.0, 0, 0)
        };
    drop(cache);

    let bt = f32_to_registers(bean_temp);
    let et = f32_to_registers(env_temp);
    let rr = f32_to_registers(ror);

    let image = [
        bt[0], bt[1], // 0x0000-0x0001 bean_temp
        et[0], et[1], // 0x0002-0x0003 env_temp
        rr[0], rr[1], // 0x0004-0x0005 rate_of_rise
        heater_pwm,   // 0x0006
        fan_pwm,      // 0x0007
    ];

    Ok(Response::ReadInputRegisters(
        image[addr as usize..end as usize].to_vec(),
    ))
}

/// Read holding registers (current control values).
async fn read_holding_registers(
    state: &ModbusSharedState,
    addr: u16,
    cnt: u16,
) -> Result<Response, ExceptionCode> {
    let end = addr
        .checked_add(cnt)
        .ok_or(ExceptionCode::IllegalDataAddress)?;
    if end > holding_reg::COUNT {
        return Err(ExceptionCode::IllegalDataAddress);
    }

    let regs = state.holding_registers.lock().await;
    Ok(Response::ReadHoldingRegisters(
        regs[addr as usize..end as usize].to_vec(),
    ))
}

/// Write holding registers and publish corresponding MQTT control commands.
async fn write_registers(
    state: &ModbusSharedState,
    addr: u16,
    values: &[u16],
) -> Result<(), ExceptionCode> {
    let end = addr as usize + values.len();
    if end > holding_reg::COUNT as usize {
        return Err(ExceptionCode::IllegalDataAddress);
    }

    // Store values atomically.
    {
        let mut regs = state.holding_registers.lock().await;
        for (i, &val) in values.iter().enumerate() {
            regs[addr as usize + i] = val;
        }
    }

    // Publish MQTT commands for affected control registers.
    publish_control_commands(state, addr, addr + values.len() as u16).await;

    Ok(())
}

/// Publish MQTT control commands for holding registers in the range [start, end).
async fn publish_control_commands(state: &ModbusSharedState, start: u16, end: u16) {
    // Snapshot the registers so we don't hold the lock during async publishes.
    let regs = state.holding_registers.lock().await.clone();
    let device_id = &state.device_id;

    // Track whether we already published the setpoint (spans 2 registers).
    let mut setpoint_published = false;

    for reg_addr in start..end {
        let result = match reg_addr {
            holding_reg::SETPOINT_HI | holding_reg::SETPOINT_LO if !setpoint_published => {
                setpoint_published = true;
                let setpoint = registers_to_f32(regs[0], regs[1]);
                let topic = rustroast_core::control_setpoint(device_id);
                state
                    .mqtt
                    .publish(&topic, QoS::AtMostOnce, false, format!("{setpoint}"))
                    .await
            }
            holding_reg::FAN_PWM => {
                let topic = rustroast_core::control_fan_pwm(device_id);
                state
                    .mqtt
                    .publish(&topic, QoS::AtMostOnce, false, regs[holding_reg::FAN_PWM as usize].to_string())
                    .await
            }
            holding_reg::HEATER_PWM => {
                let topic = rustroast_core::control_heater_pwm(device_id);
                state
                    .mqtt
                    .publish(&topic, QoS::AtMostOnce, false, regs[holding_reg::HEATER_PWM as usize].to_string())
                    .await
            }
            holding_reg::CONTROL_MODE => {
                let mode = if regs[holding_reg::CONTROL_MODE as usize] == 0 {
                    "manual"
                } else {
                    "auto"
                };
                let topic = rustroast_core::control_mode(device_id);
                state.mqtt.publish(&topic, QoS::AtMostOnce, false, mode).await
            }
            holding_reg::HEATER_ENABLE => {
                let val = if regs[holding_reg::HEATER_ENABLE as usize] == 0 {
                    "0"
                } else {
                    "1"
                };
                let topic = rustroast_core::control_heater_enable(device_id);
                state.mqtt.publish(&topic, QoS::AtMostOnce, false, val).await
            }
            holding_reg::EMERGENCY_STOP => {
                if regs[holding_reg::EMERGENCY_STOP as usize] == 1 {
                    let topic = rustroast_core::control_emergency_stop(device_id);
                    state.mqtt.publish(&topic, QoS::AtMostOnce, false, "1").await
                } else {
                    continue;
                }
            }
            _ => continue, // Gap registers (0x0006..0x000B) — no MQTT action.
        };

        if let Err(e) = result {
            tracing::warn!(?e, reg_addr, "Failed to publish MQTT command from Modbus write");
        }
    }
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

/// Start the Modbus TCP server if `RUSTROAST_MODBUS_ADDR` is set.
///
/// Returns `None` if the env var is absent (server disabled by default).
pub async fn start_modbus_server(
    telemetry_cache: Arc<RwLock<HashMap<String, (serde_json::Value, u64)>>>,
    mqtt: MqttService,
) -> Option<tokio::task::JoinHandle<()>> {
    let addr_str = match std::env::var("RUSTROAST_MODBUS_ADDR") {
        Ok(addr) => addr,
        Err(_) => {
            tracing::info!("Modbus TCP server disabled (RUSTROAST_MODBUS_ADDR not set)");
            return None;
        }
    };

    let addr: SocketAddr = match addr_str.parse() {
        Ok(a) => a,
        Err(e) => {
            tracing::error!(%addr_str, %e, "Invalid RUSTROAST_MODBUS_ADDR, Modbus server not started");
            return None;
        }
    };

    let device_id = std::env::var("RUSTROAST_MODBUS_DEVICE_ID")
        .unwrap_or_else(|_| "esp32-001".to_string());

    let shared_state = ModbusSharedState {
        telemetry_cache,
        mqtt,
        device_id: device_id.clone(),
        holding_registers: Arc::new(tokio::sync::Mutex::new(vec![
            0u16;
            holding_reg::COUNT as usize
        ])),
    };

    tracing::info!(%addr, %device_id, "Starting Modbus TCP server");

    let handle = tokio::spawn(async move {
        let listener = match TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                tracing::error!(?e, %addr, "Failed to bind Modbus TCP server");
                return;
            }
        };

        let server = Server::new(listener);

        let on_connected = |stream, socket_addr| {
            let state = shared_state.clone();
            async move {
                tracing::info!(%socket_addr, "Modbus TCP client connected");
                accept_tcp_connection(stream, socket_addr, |_socket_addr| {
                    Ok(Some(RoasterModbusService {
                        state: state.clone(),
                    }))
                })
            }
        };

        let on_process_error = |err| {
            tracing::warn!(%err, "Modbus TCP connection processing error");
        };

        if let Err(e) = server.serve(&on_connected, on_process_error).await {
            tracing::error!(?e, "Modbus TCP server terminated with error");
        }
    });

    Some(handle)
}
