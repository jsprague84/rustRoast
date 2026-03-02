# Stage 1: Build frontend
FROM node:20-alpine AS frontend

WORKDIR /app/apps/dashboard
COPY apps/dashboard/package.json apps/dashboard/package-lock.json ./
RUN npm ci
COPY apps/dashboard/ ./
RUN npm run build

# Stage 2: Build Rust backend
FROM rust:1.85-slim-bookworm AS backend

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/
RUN cargo build --release -p rustroast-server

# Stage 3: Runtime
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r rustroast && useradd -r -g rustroast rustroast

WORKDIR /app

COPY --from=backend /app/target/release/rustroast-server /usr/local/bin/rustroast-server
COPY --from=frontend /app/apps/dashboard/build/ /app/static/

RUN mkdir -p /app/data && chown -R rustroast:rustroast /app

USER rustroast

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

EXPOSE 8080

ENV RUSTROAST_APP_DIR=/app/static
ENV RUSTROAST_HTTP_ADDR=0.0.0.0:8080
ENV MQTT_BROKER_HOST=mosquitto
ENV MQTT_BROKER_PORT=1883
ENV RUSTROAST_DB_PATH=/app/data/rustroast.db
ENV RUST_LOG=info

CMD ["rustroast-server"]
