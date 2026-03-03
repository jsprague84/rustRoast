# syntax=docker/dockerfile:1
# Multi-stage optimized build for rustRoast with cargo-chef + sccache

# ============================================
# Frontend: Build SvelteKit SPA
# ============================================
FROM node:20-alpine AS frontend

WORKDIR /app/apps/dashboard
COPY apps/dashboard/package.json apps/dashboard/package-lock.json ./
RUN npm ci
COPY apps/dashboard/ ./
RUN npm run build

# ============================================
# Base: Install Rust build tools
# ============================================
FROM rust:bookworm AS base

# Install cargo-chef and sccache for optimal caching
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    cargo install cargo-chef --locked && \
    cargo install sccache --version ^0.8 --locked

# Configure sccache
ENV RUSTC_WRAPPER=sccache
ENV SCCACHE_DIR=/sccache

WORKDIR /app

# ============================================
# Planner: Generate dependency recipe
# ============================================
FROM base AS planner

# Copy entire workspace to analyze dependencies
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/

# Generate recipe.json containing all workspace dependencies
RUN cargo chef prepare --recipe-path recipe.json

# ============================================
# Builder: Cook dependencies + build app
# ============================================
FROM base AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency recipe from planner
COPY --from=planner /app/recipe.json recipe.json

# Cook dependencies with cache mounts
# This layer is cached until Cargo.toml/Cargo.lock change
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/sccache,sharing=locked \
    cargo chef cook --release --recipe-path recipe.json

# Copy source code (invalidates cache only when source changes)
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/

# Build server binary
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/sccache,sharing=locked \
    cargo build --release -p rustroast-server

# Show sccache statistics for debugging
RUN sccache --show-stats || true

# ============================================
# Runtime: Minimal production image
# ============================================
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user for security
RUN groupadd -r rustroast && useradd -r -g rustroast rustroast

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/rustroast-server /usr/local/bin/rustroast-server

# Copy SvelteKit SPA build from frontend stage
COPY --from=frontend /app/apps/dashboard/build/ /app/static/

# Create data directory
RUN mkdir -p /app/data && chown -R rustroast:rustroast /app

# Switch to non-root user
USER rustroast

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

# Expose port
EXPOSE 8080

# Set default environment variables
ENV RUSTROAST_APP_DIR=/app/static
ENV RUSTROAST_HTTP_ADDR=0.0.0.0:8080
ENV MQTT_BROKER_HOST=mosquitto
ENV MQTT_BROKER_PORT=1883
ENV RUSTROAST_DB_PATH=/app/data/rustroast.db
ENV RUST_LOG=info

CMD ["rustroast-server"]
