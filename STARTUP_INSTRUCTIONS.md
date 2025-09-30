# rustRoast System Startup Instructions

## Starting the System

### Method 1: Manual Start (Recommended for Development)

1. **Start the Rust Backend Server**:
   ```bash
   cd /home/jsprague/Development/rustRoast
   MQTT_BROKER_HOST=192.168.1.254 RUSTROAST_DB_PATH=./data/rustroast.db cargo run -p rustroast-server
   ```

2. **Start the React Dashboard** (in a separate terminal):
   ```bash
   cd /home/jsprague/Development/rustRoast/apps/dashboard
   npm run dev
   ```

3. **Access the Dashboard**:
   - Open browser to `http://localhost:5173`
   - The dashboard will automatically connect via WebSocket to the backend

### Method 2: Using the Start Script

```bash
cd /home/jsprague/Development/rustRoast
./start-server.sh
```

This script handles the MQTT broker configuration automatically.

## Stopping the System Cleanly

1. **Stop the React Dashboard**:
   - Press `Ctrl+C` in the terminal running `npm run dev`

2. **Stop the Rust Backend Server**:
   - Press `Ctrl+C` in the terminal running the cargo server

3. **Clean up any background processes** (if needed):
   ```bash
   # Kill any remaining rustroast processes
   pkill -f rustroast-server

   # Kill any remaining npm dev servers
   pkill -f "npm run dev"
   ```

## System Components

- **Backend**: Rust server on port 8080 (HTTP) with WebSocket support
- **Frontend**: React dev server on port 5173 (with Vite)
- **MQTT**: Connects to broker at 192.168.1.254:1883
- **Database**: SQLite at `./data/rustroast.db`
- **ESP32 Device**: esp32_roaster_01 publishing telemetry via MQTT

## Verification

The system is fully operational when:
- ✅ Backend server shows "MQTT connected" and "Starting HTTP server"
- ✅ Frontend shows no connection errors in browser console
- ✅ ESP32 telemetry data is visible in the dashboard
- ✅ WebSocket connection is established (check browser dev tools)

## Troubleshooting

- If MQTT connection fails, verify the ESP32 and MQTT broker are running
- If WebSocket fails, restart the backend server
- If frontend won't start, run `npm install` in the dashboard directory
- Check firewall settings if connections are blocked