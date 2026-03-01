# Hardware Integration Guide

This guide documents how to connect a coffee roaster microcontroller to the rustRoast server. Three communication protocols are supported: **MQTT**, **WebSocket**, and **Modbus TCP**. Choose the one that best fits your hardware and network environment.

## Choosing a Protocol

| Feature | MQTT | WebSocket | Modbus TCP |
|---|---|---|---|
| **Best for** | Unreliable networks, multiple devices | Direct connections, browser simulators | SCADA/HMI integration |
| **Complexity** | Medium (needs MQTT broker) | Low (direct to server) | Low (standard industrial) |
| **Bidirectional** | Yes (pub/sub) | Yes (full-duplex) | Yes (read/write registers) |
| **Firewall friendly** | Requires broker access (port 1883) | Single HTTP upgrade (port 8080) | Dedicated port (default 502) |
| **Libraries needed** | PubSubClient (Arduino), rumqttc (Rust) | WebSocketsClient (Arduino), tungstenite (Rust) | Arduino Modbus, tokio-modbus (Rust) |
| **Auto-discovery** | Yes (server detects new device_ids) | No (device must be pre-registered) | No (server polls one device) |
| **Multiple devices** | Yes (topic-based routing) | Yes (per-device endpoint) | One device per server instance |
| **Message format** | JSON text | JSON text | Binary registers |
| **Latency** | Low (broker hop) | Very low (direct) | Very low (direct) |

**Recommendations:**
- **MQTT** is the default and most flexible option. It handles intermittent connectivity gracefully through broker-based pub/sub, supports auto-discovery, and works well when the device and server are on different networks.
- **WebSocket** is simplest for direct connections where you don't want to run an MQTT broker. Good for ESP32 devices on the same LAN, browser-based simulators, or devices behind firewalls that only allow outbound HTTP.
- **Modbus TCP** is ideal for integrating with SCADA/HMI software (e.g., connecting Artisan roasting software alongside the rustRoast dashboard). Data is encoded as binary registers rather than JSON.

## Telemetry JSON Format

Both MQTT and WebSocket protocols use the same JSON telemetry format. The field names use camelCase to match the ESP32 firmware convention.

```json
{
  "timestamp": 123456,
  "beanTemp": 185.5,
  "envTemp": 145.2,
  "rateOfRise": 12.5,
  "heaterPWM": 75,
  "fanPWM": 180,
  "setpoint": 200.0,
  "controlMode": 1,
  "heaterEnable": 1,
  "uptime": 1234,
  "Kp": 15.0,
  "Ki": 1.0,
  "Kd": 25.0,
  "freeHeap": 245760,
  "rssi": -45,
  "systemStatus": 0
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `beanTemp` | float | Yes | Bean temperature in °C |
| `envTemp` | float | Yes | Environment/exhaust temperature in °C |
| `rateOfRise` | float | No | Bean temperature rate of rise in °C/min |
| `heaterPWM` | int | Yes | Heater PWM duty cycle (0-100%) |
| `fanPWM` | int | Yes | Fan PWM value (0-255) |
| `setpoint` | float | Yes | Current target bean temperature in °C |
| `controlMode` | int | Yes | 0 = manual, 1 = auto (PID) |
| `heaterEnable` | int | Yes | 0 = heater disabled, 1 = heater enabled |
| `timestamp` | int | No | Device uptime in milliseconds |
| `uptime` | int | No | Device uptime in seconds |
| `Kp` | float | No | Current PID proportional gain |
| `Ki` | float | No | Current PID integral gain |
| `Kd` | float | No | Current PID derivative gain |
| `freeHeap` | int | No | Free heap memory in bytes |
| `rssi` | int | No | WiFi signal strength in dBm |
| `systemStatus` | int | No | System status code (0 = normal) |

## MQTT Connection

### Overview

The ESP32 publishes telemetry and subscribes to control commands via an MQTT broker. The rustRoast server connects to the same broker, consuming telemetry and publishing control commands on behalf of the dashboard.

```
ESP32 <--MQTT--> Broker <--MQTT--> rustRoast Server <--HTTP/WS--> Dashboard
```

### Server Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `MQTT_BROKER_HOST` | `localhost` | MQTT broker hostname |
| `MQTT_BROKER_PORT` | `1883` | MQTT broker port |
| `MQTT_CLIENT_ID` | auto-generated | Server's MQTT client ID |
| `MQTT_USERNAME` | (none) | MQTT authentication username |
| `MQTT_PASSWORD` | (none) | MQTT authentication password |

### Topic Layout

All topics are namespaced under `roaster/{device_id}/` where `{device_id}` is a unique identifier for the device (e.g., `esp32_roaster_01`).

#### Published by Device (consumed by server)

| Topic | Payload | QoS | Retained | Frequency |
|---|---|---|---|---|
| `roaster/{device_id}/telemetry` | Telemetry JSON (see above) | 0 | No | 1 Hz |
| `roaster/{device_id}/status` | Status JSON (see below) | 0 | Yes | On connect/disconnect |

**Status JSON:**
```json
{
  "status": "online",
  "id": "esp32_roaster_01-ABC123",
  "ip": "192.168.1.100",
  "rssi": -45,
  "freeHeap": 245760,
  "version": "2.0.0-mqtt-only"
}
```

#### Subscribed by Device (published by server)

| Topic | Payload | Description |
|---|---|---|
| `roaster/{device_id}/control/setpoint` | `200.0` | Target bean temperature (°C, float) |
| `roaster/{device_id}/control/fan_pwm` | `180` | Fan PWM value (0-255, integer) |
| `roaster/{device_id}/control/heater_pwm` | `75` | Heater PWM duty cycle (0-100, integer) |
| `roaster/{device_id}/control/mode` | `"auto"` or `"manual"` | Control mode selection |
| `roaster/{device_id}/control/heater_enable` | `"1"` or `"0"` | Enable/disable heater |
| `roaster/{device_id}/control/pid` | `{"kp":15.0,"ki":1.0,"kd":25.0}` | PID tuning parameters |
| `roaster/{device_id}/control/emergency_stop` | `"1"` | Trigger emergency stop |

### Auto-discovery

When the rustRoast server receives telemetry from an unknown `device_id`, it automatically creates a device entry with status `pending`. The device appears in the dashboard's device setup wizard under "Discovered Devices", where the user can configure its connections and control parameters.

### ESP32 Example (Arduino/PlatformIO)

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// --- Configuration ---
const char* WIFI_SSID     = "your-wifi";
const char* WIFI_PASSWORD = "your-password";
const char* MQTT_HOST     = "192.168.1.254";
const int   MQTT_PORT     = 1883;
const char* DEVICE_ID     = "esp32_roaster_01";

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

// Topic strings
String telemetryTopic;
String controlPrefix;

void setup() {
    Serial.begin(115200);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) delay(500);

    telemetryTopic = String("roaster/") + DEVICE_ID + "/telemetry";
    controlPrefix  = String("roaster/") + DEVICE_ID + "/control/";

    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setCallback(onMqttMessage);
}

void loop() {
    if (!mqtt.connected()) reconnectMqtt();
    mqtt.loop();

    // Publish telemetry at 1 Hz
    static unsigned long lastPublish = 0;
    if (millis() - lastPublish >= 1000) {
        lastPublish = millis();
        publishTelemetry();
    }
}

void publishTelemetry() {
    DynamicJsonDocument doc(512);
    doc["timestamp"]     = millis();
    doc["beanTemp"]      = readBeanTemp();
    doc["envTemp"]       = readEnvTemp();
    doc["rateOfRise"]    = calculateRoR();
    doc["heaterPWM"]     = getHeaterDuty();
    doc["fanPWM"]        = getFanPWM();
    doc["setpoint"]      = getSetpoint();
    doc["controlMode"]   = getControlMode();   // 0=manual, 1=auto
    doc["heaterEnable"]  = isHeaterEnabled();   // 0 or 1
    doc["uptime"]        = millis() / 1000;
    doc["freeHeap"]      = ESP.getFreeHeap();
    doc["rssi"]          = WiFi.RSSI();

    String payload;
    serializeJson(doc, payload);
    mqtt.publish(telemetryTopic.c_str(), payload.c_str());
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    String topicStr(topic);
    String payloadStr((char*)payload, length);

    if (topicStr == controlPrefix + "setpoint") {
        setTargetTemp(payloadStr.toFloat());
    } else if (topicStr == controlPrefix + "fan_pwm") {
        setFanPWM(payloadStr.toInt());
    } else if (topicStr == controlPrefix + "heater_pwm") {
        setHeaterDuty(payloadStr.toInt());
    } else if (topicStr == controlPrefix + "mode") {
        setControlMode(payloadStr == "auto" ? 1 : 0);
    } else if (topicStr == controlPrefix + "heater_enable") {
        setHeaterEnabled(payloadStr == "1");
    } else if (topicStr == controlPrefix + "emergency_stop") {
        emergencyStop();
    } else if (topicStr == controlPrefix + "pid") {
        DynamicJsonDocument doc(256);
        if (!deserializeJson(doc, payloadStr)) {
            setPIDTunings(doc["kp"], doc["ki"], doc["kd"]);
        }
    }
}

void reconnectMqtt() {
    while (!mqtt.connected()) {
        if (mqtt.connect(DEVICE_ID)) {
            // Subscribe to all control topics
            String wildcard = controlPrefix + "#";
            mqtt.subscribe(wildcard.c_str());
        } else {
            delay(5000);
        }
    }
}
```

## WebSocket Connection

### Overview

Devices can connect directly to the rustRoast server via WebSocket, bypassing the need for an MQTT broker. The device pushes telemetry JSON over the WebSocket and receives control commands on the same connection.

```
ESP32 <--WebSocket--> rustRoast Server <--HTTP/WS--> Dashboard
```

### Requirements

- The device must be **pre-registered** in the rustRoast device configuration with status `active`. Unlike MQTT, there is no auto-discovery for WebSocket devices.
- The WebSocket endpoint is **public** (no API key required), but validates that the `device_id` exists and is active.

### Endpoint

```
WS /ws/device/{device_id}/telemetry
```

Connect to: `ws://<server-host>:8080/ws/device/{device_id}/telemetry`

### Sending Telemetry

Send JSON text messages using the same telemetry format described above. Messages are processed identically to MQTT telemetry: cached, persisted to the database, and recorded to any active roast session.

### Receiving Control Commands

The server sends control commands as JSON messages on the same WebSocket connection:

```json
{
  "type": "control",
  "topic": "roaster/{device_id}/control/setpoint",
  "payload": "200.0"
}
```

The `topic` field uses the same MQTT topic format, so devices can parse it the same way regardless of transport. The `payload` field contains the control value as a string.

### Connection Lifecycle

1. **Connect** — HTTP upgrade to WebSocket at `/ws/device/{device_id}/telemetry`
2. **Validate** — Server checks device exists and has status `active`; returns HTTP 404 if not found, HTTP 403 if not active
3. **Stream** — Device sends telemetry JSON; server sends control commands JSON
4. **Disconnect** — Either side closes the connection; server cleans up and logs the event

### ESP32 Example (Arduino)

```cpp
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID       = "your-wifi";
const char* WIFI_PASSWORD   = "your-password";
const char* SERVER_HOST     = "192.168.1.100";
const int   SERVER_PORT     = 8080;
const char* DEVICE_ID       = "esp32_roaster_01";

WebSocketsClient ws;

void setup() {
    Serial.begin(115200);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) delay(500);

    String path = String("/ws/device/") + DEVICE_ID + "/telemetry";
    ws.begin(SERVER_HOST, SERVER_PORT, path);
    ws.onEvent(onWebSocketEvent);
    ws.setReconnectInterval(5000);
}

void loop() {
    ws.loop();

    static unsigned long lastPublish = 0;
    if (millis() - lastPublish >= 1000) {
        lastPublish = millis();
        sendTelemetry();
    }
}

void sendTelemetry() {
    if (!ws.isConnected()) return;

    DynamicJsonDocument doc(512);
    doc["timestamp"]     = millis();
    doc["beanTemp"]      = readBeanTemp();
    doc["envTemp"]       = readEnvTemp();
    doc["rateOfRise"]    = calculateRoR();
    doc["heaterPWM"]     = getHeaterDuty();
    doc["fanPWM"]        = getFanPWM();
    doc["setpoint"]      = getSetpoint();
    doc["controlMode"]   = getControlMode();
    doc["heaterEnable"]  = isHeaterEnabled();
    doc["uptime"]        = millis() / 1000;
    doc["freeHeap"]      = ESP.getFreeHeap();
    doc["rssi"]          = WiFi.RSSI();

    String payload;
    serializeJson(doc, payload);
    ws.sendTXT(payload);
}

void onWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            Serial.println("WebSocket connected");
            break;
        case WStype_DISCONNECTED:
            Serial.println("WebSocket disconnected");
            break;
        case WStype_TEXT: {
            // Parse control command from server
            DynamicJsonDocument doc(512);
            if (deserializeJson(doc, payload, length)) break;

            const char* msgType = doc["type"];
            if (msgType && strcmp(msgType, "control") == 0) {
                String topic = doc["topic"].as<String>();
                String value = doc["payload"].as<String>();
                handleControlCommand(topic, value);
            }
            break;
        }
        default:
            break;
    }
}

void handleControlCommand(const String& topic, const String& value) {
    // Extract the command suffix from the MQTT-style topic
    // e.g., "roaster/esp32_roaster_01/control/setpoint" -> "setpoint"
    int lastSlash = topic.lastIndexOf('/');
    if (lastSlash < 0) return;
    String command = topic.substring(lastSlash + 1);

    if (command == "setpoint") {
        setTargetTemp(value.toFloat());
    } else if (command == "fan_pwm") {
        setFanPWM(value.toInt());
    } else if (command == "heater_pwm") {
        setHeaterDuty(value.toInt());
    } else if (command == "mode") {
        setControlMode(value == "auto" ? 1 : 0);
    } else if (command == "heater_enable") {
        setHeaterEnabled(value == "1");
    } else if (command == "emergency_stop") {
        emergencyStop();
    } else if (command == "pid") {
        DynamicJsonDocument pidDoc(256);
        if (!deserializeJson(pidDoc, value)) {
            setPIDTunings(pidDoc["kp"], pidDoc["ki"], pidDoc["kd"]);
        }
    }
}
```

## Modbus TCP Connection

### Overview

The rustRoast server can expose a Modbus TCP server, allowing SCADA/HMI software (such as Artisan roasting software) to read telemetry and write control values using the standard industrial Modbus protocol.

```
Artisan/HMI <--Modbus TCP--> rustRoast Server <--MQTT/WS--> ESP32
```

The Modbus server acts as a **bridge**: it reads telemetry from the server's in-memory cache (populated by MQTT or WebSocket) and translates Modbus register writes into MQTT control commands.

### Server Configuration

The Modbus TCP server is **disabled by default**. Set the following environment variables to enable it:

| Environment Variable | Default | Description |
|---|---|---|
| `RUSTROAST_MODBUS_ADDR` | (disabled) | Bind address, e.g., `0.0.0.0:502` |
| `RUSTROAST_MODBUS_DEVICE_ID` | `esp32-001` | Device whose telemetry is served via input registers |

### Register Map: rustRoast Standard

#### Input Registers (Function Code 0x04 — Read Only)

These registers expose live telemetry data. Float32 values are encoded as IEEE 754 big-endian across two consecutive 16-bit registers (high word at lower address).

| Address | Name | Data Type | Unit | Description |
|---|---|---|---|---|
| 0x0000-0x0001 | bean_temp | float32 | °C | Bean temperature |
| 0x0002-0x0003 | env_temp | float32 | °C | Environment temperature |
| 0x0004-0x0005 | rate_of_rise | float32 | °C/min | Bean temperature rate of rise |
| 0x0006 | heater_pwm | uint16 | % | Heater PWM duty cycle (0-100) |
| 0x0007 | fan_pwm | uint16 | — | Fan PWM value (0-255) |

#### Holding Registers (Function Code 0x03 — Read/Write)

Writing to these registers publishes corresponding MQTT control commands to the device.

| Address | Name | Data Type | Unit | Description |
|---|---|---|---|---|
| 0x0000-0x0001 | setpoint | float32 | °C | Target bean temperature |
| 0x0002 | fan_pwm_setpoint | uint16 | — | Fan PWM setpoint (0-255) |
| 0x0003 | heater_pwm_setpoint | uint16 | % | Heater PWM setpoint (0-100) |
| 0x0004 | control_mode | uint16 | — | 0 = manual, 1 = auto |
| 0x0005 | heater_enable | uint16 | — | 0 = off, 1 = on |
| 0x0006-0x000B | (reserved) | — | — | Gap registers (reads return 0, writes are no-ops) |
| 0x000C | emergency_stop | uint16 | — | Write 1 to trigger emergency stop |

### Float32 Encoding

Float32 values occupy two consecutive 16-bit registers using IEEE 754 big-endian byte order (ABCD):

```
Value: 185.5 (0x4339C000)

Register N:     0x4339  (high word, bytes A and B)
Register N+1:   0xC000  (low word, bytes C and D)
```

To decode: `float_value = (reg[N] << 16) | reg[N+1]`, interpreted as IEEE 754 single-precision.

### Register Map: Artisan Compatible

For integration with [Artisan](https://artisan-scope.org/) roasting software, an alternative register layout is available that uses int16 values scaled by x10 (the standard convention for industrial PID controllers):

#### Input Registers (Function Code 0x04)

| Address | Name | Data Type | Scale | Unit | Description |
|---|---|---|---|---|---|
| 0x0000 | BT | int16 | x0.1 | °C | Bean Temperature (value / 10 = °C) |
| 0x0001 | ET | int16 | x0.1 | °C | Environment Temperature (value / 10 = °C) |
| 0x0002 | BT_RoR | int16 | x0.1 | °C/min | BT Rate of Rise (value / 10 = °C/min) |
| 0x0003 | heater_duty | uint16 | 1 | % | Heater duty cycle (0-100) |
| 0x0004 | fan_duty | uint16 | 1 | % | Fan duty cycle (0-100) |

#### Holding Registers (Function Code 0x03)

| Address | Name | Data Type | Scale | Unit | Description |
|---|---|---|---|---|---|
| 0x0000 | SV | int16 | x0.1 | °C | Set Value / target temperature (value / 10 = °C) |
| 0x0001 | heater_cmd | uint16 | 1 | % | Heater command (0-100) |
| 0x0002 | fan_cmd | uint16 | 1 | % | Fan command (0-100) |
| 0x0003 | pid_mode | uint16 | 1 | — | 0 = manual, 1 = auto |

#### Coil Registers (Function Code 0x01/0x05)

| Address | Name | Description |
|---|---|---|
| 0x0000 | heater_on | Heater enable (on/off) |
| 0x0001 | fan_on | Fan enable (on/off) |
| 0x0002 | e_stop | Emergency stop |

> **Note:** The Artisan compatible layout is a dashboard-side preset for configuring custom Modbus devices. The built-in rustRoast Modbus server uses the rustRoast Standard layout. If you need the Artisan layout served by the rustRoast server, implement a custom register map on your device and configure it through the device setup wizard.

### Modbus TCP Slave Example (Arduino/ESP32)

If your device acts as a Modbus TCP slave (the rustRoast server or Artisan polls it directly), use a Modbus library:

```cpp
#include <WiFi.h>
#include <ModbusServerTCPasync.h>  // eModbus library

const char* WIFI_SSID     = "your-wifi";
const char* WIFI_PASSWORD = "your-password";

ModbusServerTCPasync modbusServer;

// Input register storage (8 registers)
uint16_t inputRegisters[8] = {0};
// Holding register storage (13 registers)
uint16_t holdingRegisters[13] = {0};

void setup() {
    Serial.begin(115200);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) delay(500);

    // Register callbacks for Modbus function codes
    modbusServer.registerWorker(1, READ_INPUT_REGISTER, &handleReadInput);
    modbusServer.registerWorker(1, READ_HOLD_REGISTER, &handleReadHolding);
    modbusServer.registerWorker(1, WRITE_HOLD_REGISTER, &handleWriteHolding);
    modbusServer.registerWorker(1, WRITE_MULT_REGISTERS, &handleWriteMultiple);
    modbusServer.start(502, 4, 2000);  // port, max clients, timeout

    Serial.printf("Modbus TCP server on %s:502\n", WiFi.localIP().toString().c_str());
}

void loop() {
    // Update input registers with current sensor data
    updateInputRegisters();
    delay(100);
}

void updateInputRegisters() {
    // Encode bean_temp as float32 across registers 0-1
    float beanTemp = readBeanTemp();
    uint32_t bits = *(uint32_t*)&beanTemp;
    inputRegisters[0] = (bits >> 16) & 0xFFFF;  // High word
    inputRegisters[1] = bits & 0xFFFF;           // Low word

    // Encode env_temp as float32 across registers 2-3
    float envTemp = readEnvTemp();
    bits = *(uint32_t*)&envTemp;
    inputRegisters[2] = (bits >> 16) & 0xFFFF;
    inputRegisters[3] = bits & 0xFFFF;

    // Encode rate_of_rise as float32 across registers 4-5
    float ror = calculateRoR();
    bits = *(uint32_t*)&ror;
    inputRegisters[4] = (bits >> 16) & 0xFFFF;
    inputRegisters[5] = bits & 0xFFFF;

    // Single uint16 registers
    inputRegisters[6] = getHeaterDuty();  // 0-100%
    inputRegisters[7] = getFanPWM();      // 0-255
}

ModbusMessage handleReadInput(ModbusMessage request) {
    uint16_t addr = 0, count = 0;
    request.get(1, addr);
    request.get(3, count);

    ModbusMessage response;
    if (addr + count > 8) {
        response.setError(request.getServerID(), request.getFunctionCode(),
                          ILLEGAL_DATA_ADDRESS);
        return response;
    }

    response.add(request.getServerID(), request.getFunctionCode(),
                 (uint8_t)(count * 2));
    for (uint16_t i = 0; i < count; i++) {
        response.add(inputRegisters[addr + i]);
    }
    return response;
}

// handleReadHolding, handleWriteHolding, handleWriteMultiple
// follow the same pattern for holding registers.
// On write: apply control changes (setpoint, fan PWM, heater, mode, etc.)
```

## Minimal Implementation Checklist

Regardless of which protocol you choose, your device firmware must:

1. **Read sensors** — Sample bean and environment thermocouples at >= 1 Hz
2. **Compute rate of rise** — Track bean temperature change over a rolling window
3. **Report telemetry** — Send all required fields at 1 Hz (see Field Reference above)
4. **Accept control commands** — Handle setpoint, fan PWM, heater PWM, mode, heater enable, PID tuning, and emergency stop
5. **Implement safety** — Fan failsafe (minimum fan speed when heater is on), emergency stop handler, watchdog timer

### Protocol-specific steps:

**MQTT:**
- Connect to broker and publish to `roaster/{device_id}/telemetry`
- Subscribe to `roaster/{device_id}/control/#` for control commands
- Publish status to `roaster/{device_id}/status` with retained flag

**WebSocket:**
- Register device in rustRoast dashboard first (status must be `active`)
- Connect to `ws://<server>:8080/ws/device/{device_id}/telemetry`
- Send telemetry as JSON text frames
- Parse incoming `{"type":"control","topic":"...","payload":"..."}` messages

**Modbus TCP:**
- Run a Modbus TCP slave on port 502 (or configure alternate port in rustRoast)
- Populate input registers with sensor data using the register map above
- Handle holding register writes for control commands
- Configure the device connection in the rustRoast dashboard with host, port, and unit ID
