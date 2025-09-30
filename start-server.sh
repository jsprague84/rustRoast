#!/bin/bash

# Roast Server Startup Script
# This script ensures proper database initialization and graceful recovery

set -e

echo "🔥 Starting RustRoast Server..."

# Create data directory if it doesn't exist
mkdir -p data

# Check if database exists, if not create it
if [ ! -f "data/rustroast.db" ]; then
    echo "📁 Creating new database..."
    touch data/rustroast.db
    chmod 644 data/rustroast.db
fi

# Set environment variables for consistent operation
export RUSTROAST_DB_PATH="./data/rustroast.db"
export MQTT_BROKER_HOST="${MQTT_BROKER_HOST:-192.168.1.254}"
export RUSTROAST_HTTP_ADDR="${RUSTROAST_HTTP_ADDR:-0.0.0.0:8080}"

echo "🗄️  Database: $RUSTROAST_DB_PATH"
echo "📡 MQTT Broker: $MQTT_BROKER_HOST"
echo "🌐 HTTP Server: $RUSTROAST_HTTP_ADDR"
echo ""

# Start the server with proper error handling
exec cargo run -p rustroast-server