rustRoast
===========

A Rust-based control plane for an ESP32 coffee roaster over MQTT.

This workspace sets up a robust foundation for incremental development:
- Axum HTTP server for control APIs and health/readiness endpoints
- MQTT client service with async runtime (Tokio), ready for subscriptions/publishing
- Clear topic conventions and shared types in a core crate
- Structured logging via `tracing`

Crates
------
- `rustroast-core`: Shared types, topic layout, command enums
- `rustroast-mqtt`: Async MQTT client wrapper with reconnect and channels
- `rustroast-server`: Axum server exposing health endpoints (and later control/telemetry APIs)

Quick start
-----------
1. Copy `.env.example` to `.env` and adjust values as needed.
2. Build and run the server:
   - `cargo run -p rustroast-server`
3. Health endpoints:
   - `GET /healthz` — process is up
   - `GET /readyz` — MQTT connection ready (200) or not (503)
   - `GET /version` — returns server version

Configuration
-------------
Environment variables (see `.env.example`):
- `RUSTROAST_HTTP_ADDR` — HTTP bind address (default: `0.0.0.0:8080`)
- `MQTT_BROKER_HOST` — MQTT broker host (default: `localhost`)
- `MQTT_BROKER_PORT` — MQTT broker port (default: `1883`)
- `MQTT_CLIENT_ID` — Optional client ID (auto-generated if omitted)
- `MQTT_USERNAME` / `MQTT_PASSWORD` — Optional auth
- `MQTT_KEEP_ALIVE_SECS` — Keep-alive in seconds (default: `30`)

Topic layout (ESP32 schema)
---------------------------
- Root: `roaster/{device_id}` where `{device_id}` equals the ESP32 `MQTT_CLIENT_ID`.
- Published by ESP32:
  - Telemetry: `roaster/{device_id}/telemetry`
  - Status: `roaster/{device_id}/status`
- Subscribed by ESP32 (controls):
  - `roaster/{device_id}/control/setpoint`
  - `roaster/{device_id}/control/fan_pwm`
  - `roaster/{device_id}/control/heater_pwm`
  - `roaster/{device_id}/control/mode`
  - `roaster/{device_id}/control/heater_enable`
  - `roaster/{device_id}/control/pid`
  - `roaster/{device_id}/control/emergency_stop`
- Auto-tune topics:
  - `roaster/{device_id}/autotune/status|start|stop|apply|results`

Wildcard subscriptions used by the server:
- `roaster/+/telemetry`, `roaster/+/status`, `roaster/+/autotune/#`

Next steps
----------
- Wire initial command endpoints -> MQTT publishes
- Add WebSocket stream for live telemetry fan-out
- Define richer telemetry/command payloads in `core`
