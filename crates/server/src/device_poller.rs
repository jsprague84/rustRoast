//! Background service that connects to configured devices (Modbus TCP, WebSocket)
//! and polls/streams telemetry into the unified TelemetryService pipeline.
//!
//! MQTT devices are handled by the MQTT consumer loop in main.rs; this module
//! covers the other two protocols.

use std::net::SocketAddr;
use std::time::Duration;

use futures_util::StreamExt;
use serde_json::json;
use tokio::time::sleep;
use tokio_modbus::prelude::*;

use crate::models::{
    DeviceConnection, DeviceStatus, ModbusDataType, ModbusRegisterMap, ModbusRegisterType,
    ModbusTcpConnectionConfig, Protocol, WebSocketConnectionConfig,
};
use crate::services::DeviceService;
use crate::telemetry::TelemetryService;

/// Start background pollers for all active devices with Modbus TCP or WebSocket connections.
pub async fn start_device_pollers(
    device_service: DeviceService,
    telemetry_service: TelemetryService,
) {
    let devices = match device_service.list_devices(Some(DeviceStatus::Active)).await {
        Ok(d) => d,
        Err(e) => {
            tracing::error!(error = %e, "Failed to list devices for poller startup");
            return;
        }
    };

    for device in devices {
        let dev = match device_service.get_device(&device.id).await {
            Ok(Some(d)) => d,
            _ => continue,
        };

        for conn in &dev.connections {
            if !conn.enabled {
                continue;
            }

            let device_id = device.device_id.clone();
            let ts = telemetry_service.clone();
            let ds = device_service.clone();

            match conn.protocol {
                Protocol::ModbusTcp => {
                    let conn = conn.clone();
                    tokio::spawn(async move {
                        modbus_poller_loop(device_id, conn, ds, ts).await;
                    });
                }
                Protocol::WebSocket => {
                    let conn = conn.clone();
                    tokio::spawn(async move {
                        websocket_client_loop(device_id, conn, ts).await;
                    });
                }
                Protocol::Mqtt => {
                    // Handled by MQTT consumer loop
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Modbus TCP poller
// ---------------------------------------------------------------------------

async fn modbus_poller_loop(
    device_id: String,
    conn: DeviceConnection,
    device_service: DeviceService,
    telemetry_service: TelemetryService,
) {
    let config: ModbusTcpConnectionConfig = match serde_json::from_value(conn.config.clone()) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(%device_id, error = %e, "Invalid Modbus TCP connection config");
            return;
        }
    };

    let poll_interval = Duration::from_millis(config.poll_interval_ms);
    let addr_str = format!("{}:{}", config.host, config.port);
    let socket_addr: SocketAddr = match addr_str.parse() {
        Ok(a) => a,
        Err(e) => {
            tracing::error!(%device_id, %addr_str, error = %e, "Invalid Modbus TCP address");
            return;
        }
    };

    // Load register map for this device
    let register_map = match device_service.get_register_map(&conn.device_id).await {
        Ok(regs) if !regs.is_empty() => regs,
        _ => {
            tracing::warn!(%device_id, "No register map found, using standard rustRoast layout");
            default_register_map()
        }
    };

    tracing::info!(%device_id, %addr_str, ?poll_interval, registers = register_map.len(),
        "Starting Modbus TCP poller");

    let mut backoff = Duration::from_secs(1);

    loop {
        match tokio_modbus::client::tcp::connect_slave(socket_addr, Slave(config.unit_id)).await {
            Ok(mut ctx) => {
                tracing::info!(%device_id, "Modbus TCP connected");
                backoff = Duration::from_secs(1);

                loop {
                    match poll_modbus_registers(&mut ctx, &register_map).await {
                        Ok(payload) => {
                            telemetry_service
                                .process_telemetry(
                                    &device_id,
                                    &payload,
                                    Some(&DeviceStatus::Active),
                                )
                                .await;
                        }
                        Err(e) => {
                            tracing::warn!(%device_id, error = %e, "Modbus read failed, reconnecting");
                            break;
                        }
                    }
                    sleep(poll_interval).await;
                }
            }
            Err(e) => {
                tracing::warn!(%device_id, error = %e, backoff_secs = backoff.as_secs(),
                    "Modbus TCP connect failed, retrying");
            }
        }

        sleep(backoff).await;
        backoff = (backoff * 2).min(Duration::from_secs(30));
    }
}

/// Read all registers from a Modbus device and build a JSON telemetry payload.
async fn poll_modbus_registers(
    ctx: &mut tokio_modbus::client::Context,
    register_map: &[ModbusRegisterMap],
) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    let mut payload = serde_json::Map::new();

    // Group reads by register type (input vs holding) and batch read
    let input_regs: Vec<&ModbusRegisterMap> = register_map
        .iter()
        .filter(|r| r.register_type == ModbusRegisterType::Input)
        .collect();
    let holding_regs: Vec<&ModbusRegisterMap> = register_map
        .iter()
        .filter(|r| r.register_type == ModbusRegisterType::Holding)
        .collect();

    // Read input registers in a single batch if any exist
    if !input_regs.is_empty() {
        let max_addr = input_regs
            .iter()
            .map(|r| {
                r.address as u16
                    + match r.data_type {
                        ModbusDataType::Float32 | ModbusDataType::Uint32 | ModbusDataType::Int32 => 2,
                        _ => 1,
                    }
            })
            .max()
            .unwrap_or(0);

        let data = ctx.read_input_registers(0, max_addr).await?
            .map_err(|e| format!("Modbus exception: {:?}", e))?;
        decode_registers(&input_regs, &data, &mut payload);
    }

    // Read holding registers in a single batch if any exist
    if !holding_regs.is_empty() {
        let max_addr = holding_regs
            .iter()
            .map(|r| {
                r.address as u16
                    + match r.data_type {
                        ModbusDataType::Float32 | ModbusDataType::Uint32 | ModbusDataType::Int32 => 2,
                        _ => 1,
                    }
            })
            .max()
            .unwrap_or(0);

        let data = ctx.read_holding_registers(0, max_addr).await?
            .map_err(|e| format!("Modbus exception: {:?}", e))?;
        decode_registers(&holding_regs, &data, &mut payload);
    }

    // Map register names to ESP32/frontend camelCase field names
    normalize_field_names(&mut payload);

    // Add timestamp
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    payload.insert("timestamp".to_string(), json!(now));

    Ok(serde_json::Value::Object(payload))
}

/// Map Modbus register names (snake_case) to the camelCase telemetry field names
/// that the frontend expects (matching ESP32 JSON output).
fn normalize_field_names(payload: &mut serde_json::Map<String, serde_json::Value>) {
    let mappings: &[(&str, &str)] = &[
        ("bean_temp", "beanTemp"),
        ("env_temp", "envTemp"),
        ("rate_of_rise", "rateOfRise"),
        ("heater_pwm", "heaterPWM"),
        ("fan_pwm", "fanPWM"),
        ("control_mode", "controlMode"),
        ("heater_enable", "heaterEnable"),
        ("system_status", "systemStatus"),
        ("free_heap", "freeHeap"),
        ("fan_pwm_setpoint", "fanPWM_setpoint"),
        ("heater_pwm_setpoint", "heaterPWM_setpoint"),
        ("emergency_stop", "emergencyStop"),
    ];

    for &(snake, camel) in mappings {
        if let Some(val) = payload.remove(snake) {
            payload.insert(camel.to_string(), val);
        }
    }
}

/// Decode raw register data into named values using the register map.
fn decode_registers(
    registers: &[&ModbusRegisterMap],
    data: &[u16],
    payload: &mut serde_json::Map<String, serde_json::Value>,
) {
    for reg in registers {
        let addr = reg.address as usize;
        let value: Option<f64> = match reg.data_type {
            ModbusDataType::Uint16 => data.get(addr).map(|&v| v as f64),
            ModbusDataType::Int16 => data.get(addr).map(|&v| v as i16 as f64),
            ModbusDataType::Float32 => {
                if addr + 1 < data.len() {
                    let hi = data[addr];
                    let lo = data[addr + 1];
                    Some(f32::from_bits(((hi as u32) << 16) | (lo as u32)) as f64)
                } else {
                    None
                }
            }
            ModbusDataType::Uint32 => {
                if addr + 1 < data.len() {
                    let hi = data[addr] as u32;
                    let lo = data[addr + 1] as u32;
                    Some(((hi << 16) | lo) as f64)
                } else {
                    None
                }
            }
            ModbusDataType::Int32 => {
                if addr + 1 < data.len() {
                    let hi = data[addr] as u32;
                    let lo = data[addr + 1] as u32;
                    Some(((hi << 16) | lo) as i32 as f64)
                } else {
                    None
                }
            }
            ModbusDataType::Bool => data.get(addr).map(|&v| if v != 0 { 1.0 } else { 0.0 }),
        };

        if let Some(mut val) = value {
            // Apply scale factor and offset
            if let Some(scale) = reg.scale_factor {
                val *= scale;
            }
            if let Some(offset) = reg.offset {
                val += offset;
            }

            // Use integer representation for PWM-style values
            if matches!(
                reg.data_type,
                ModbusDataType::Uint16 | ModbusDataType::Int16 | ModbusDataType::Bool
            ) && reg.scale_factor.is_none()
            {
                payload.insert(reg.name.clone(), json!(val as i64));
            } else {
                payload.insert(reg.name.clone(), json!((val * 100.0).round() / 100.0));
            }
        }
    }
}

/// Default register map matching the rustRoast Standard / mock device layout.
fn default_register_map() -> Vec<ModbusRegisterMap> {
    use ModbusDataType::*;
    use ModbusRegisterType::Input;

    let id = String::new(); // Not persisted
    let device_id = String::new();

    vec![
        ModbusRegisterMap {
            id: id.clone(), device_id: device_id.clone(),
            register_type: Input, address: 0, name: "beanTemp".into(),
            data_type: Float32, byte_order: None, scale_factor: None,
            offset: None, unit: Some("°C".into()), description: None, writable: false,
        },
        ModbusRegisterMap {
            id: id.clone(), device_id: device_id.clone(),
            register_type: Input, address: 2, name: "envTemp".into(),
            data_type: Float32, byte_order: None, scale_factor: None,
            offset: None, unit: Some("°C".into()), description: None, writable: false,
        },
        ModbusRegisterMap {
            id: id.clone(), device_id: device_id.clone(),
            register_type: Input, address: 4, name: "rateOfRise".into(),
            data_type: Float32, byte_order: None, scale_factor: None,
            offset: None, unit: Some("°C/min".into()), description: None, writable: false,
        },
        ModbusRegisterMap {
            id: id.clone(), device_id: device_id.clone(),
            register_type: Input, address: 6, name: "heaterPWM".into(),
            data_type: Uint16, byte_order: None, scale_factor: None,
            offset: None, unit: Some("%".into()), description: None, writable: false,
        },
        ModbusRegisterMap {
            id: id.clone(), device_id: device_id.clone(),
            register_type: Input, address: 7, name: "fanPWM".into(),
            data_type: Uint16, byte_order: None, scale_factor: None,
            offset: None, unit: None, description: None, writable: false,
        },
    ]
}

// ---------------------------------------------------------------------------
// WebSocket device client
// ---------------------------------------------------------------------------

async fn websocket_client_loop(
    device_id: String,
    conn: DeviceConnection,
    telemetry_service: TelemetryService,
) {
    let config: WebSocketConnectionConfig = match serde_json::from_value(conn.config.clone()) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(%device_id, error = %e, "Invalid WebSocket connection config");
            return;
        }
    };

    tracing::info!(%device_id, url = %config.url, "Starting WebSocket device client");

    let mut backoff = Duration::from_secs(1);

    loop {
        match tokio_tungstenite::connect_async(&config.url).await {
            Ok((ws_stream, _)) => {
                tracing::info!(%device_id, "WebSocket device connected");
                backoff = Duration::from_secs(1);

                let (_write, mut read) = ws_stream.split();

                while let Some(msg) = read.next().await {
                    match msg {
                        Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                            match serde_json::from_str::<serde_json::Value>(&text) {
                                Ok(val) => {
                                    telemetry_service
                                        .process_telemetry(
                                            &device_id,
                                            &val,
                                            Some(&DeviceStatus::Active),
                                        )
                                        .await;
                                }
                                Err(e) => {
                                    tracing::warn!(%device_id, error = %e,
                                        "Invalid JSON from WebSocket device");
                                }
                            }
                        }
                        Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => {
                            tracing::info!(%device_id, "WebSocket device closed connection");
                            break;
                        }
                        Err(e) => {
                            tracing::warn!(%device_id, error = %e, "WebSocket device error");
                            break;
                        }
                        _ => {} // Ignore binary, ping, pong
                    }
                }
            }
            Err(e) => {
                tracing::warn!(%device_id, error = %e, backoff_secs = backoff.as_secs(),
                    "WebSocket device connect failed, retrying");
            }
        }

        sleep(backoff).await;
        backoff = (backoff * 2).min(Duration::from_secs(30));
    }
}
