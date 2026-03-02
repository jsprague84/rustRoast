# PRD: rustRoast Full Modernization Rewrite

## Introduction

rustRoast is a coffee roaster control system being built as a modern replacement for [Artisan Roaster Scope](https://github.com/artisan-roaster-scope/artisan). It consists of an ESP32 hardware controller, a Rust backend server, and a web dashboard. The current system is functional but has accumulated technical debt: a 1,459-line monolithic React component, no API authentication, hardcoded credentials, no shared type contract between layers, and fragmented state management. This rewrite modernizes the backend architecture and replaces the React frontend with SvelteKit to create a maintainable, extensible platform that can grow to match and exceed Artisan's roasting features over time.

**Vision:** A web-native alternative to Artisan with real-time control, rich roast analytics, and a modern UX — initially for personal use with the architecture to support community sharing in the future.

**Scope:** Backend (Rust) + Frontend (SvelteKit) only. ESP32 firmware is out of scope (Modbus TCP remains in firmware for continued Artisan compatibility). The legacy `coffee-roaster-bridge/` crate will be removed. The Modbus TCP server in the Axum backend is **not** retained — Artisan connects directly to the ESP32 when needed.

## Goals

- Restructure the Rust backend into well-separated modules with proper error handling and tests
- Replace the React frontend with a SvelteKit dashboard optimized for real-time telemetry
- Establish a shared schema contract between backend and frontend to prevent silent data drift
- Add API authentication to secure control endpoints (heater, fan, emergency stop)
- Remove hardcoded credentials and legacy code (`coffee-roaster-bridge/`)
- Eliminate redundant data fetching (polling + WebSocket) in favor of WebSocket-first architecture
- Create a developer experience that supports community contributions (docker-compose, CI, linting)
- Support mobile-friendly use for monitoring roasts away from the desk

## User Stories

### US-001: Restructure Rust backend into modules
**Description:** As a developer, I want the Rust backend organized into clear modules so that I can navigate, test, and contribute to specific areas without understanding the entire codebase.

**Acceptance Criteria:**
- [ ] `main.rs` contains only startup, configuration loading, and server bootstrap (~50 lines)
- [ ] Route handlers are separated into `routes/` modules: `control.rs`, `telemetry.rs`, `sessions.rs`, `profiles.rs`, `autotune.rs`
- [ ] Business logic is in `services/` modules: `mqtt.rs`, `session.rs`, `profile.rs`, `retention.rs`
- [ ] Database queries are in `db/` module with typed models
- [ ] A unified `AppError` enum implements `IntoResponse` — no more repetitive match blocks
- [ ] All existing API endpoints work identically after restructuring
- [ ] `cargo build` succeeds with no warnings
- [ ] `cargo clippy` passes with no warnings

### US-002: Add shared telemetry schema
**Description:** As a developer, I want a single source of truth for telemetry message structure so that field renames on the ESP32 produce compile-time or startup errors instead of silent data loss.

**Acceptance Criteria:**
- [ ] Telemetry struct defined in Rust with serde field mappings matching ESP32 JSON output
- [ ] TypeScript types generated from or validated against the same schema
- [ ] Backend validates incoming MQTT telemetry against the schema (log warning on unknown fields)
- [ ] Frontend validates WebSocket messages against TypeScript types at runtime
- [ ] Dual-field fallbacks (`beanTemp || bean_temp`) are eliminated from frontend code
- [ ] `cargo test` includes a schema validation test with sample ESP32 payloads

### US-003: Add API authentication
**Description:** As a user sharing my roaster dashboard on a home network, I want control endpoints protected by authentication so that only authorized users can operate the heater and fan.

**Acceptance Criteria:**
- [ ] API key authentication middleware protects all `/control/*` endpoints
- [ ] Read-only endpoints (`/telemetry`, `/sessions` GET) are accessible without auth
- [ ] API key is configured via environment variable `RUSTROAST_API_KEY`
- [ ] Unauthenticated control requests return `401 Unauthorized`
- [ ] Frontend stores API key in browser localStorage and sends it via `Authorization` header
- [ ] Login screen prompts for API key on first visit or when key is rejected
- [ ] Emergency stop endpoint requires authentication (safety: prevents unauthorized heater activation, not a barrier to stopping — physical kill switch is the last resort)
- [ ] `cargo test` includes auth middleware tests

### US-004: Remove legacy coffee-roaster-bridge
**Description:** As a developer, I want the legacy `coffee-roaster-bridge/` crate removed so that new contributors aren't confused by duplicate functionality.

**Acceptance Criteria:**
- [ ] `coffee-roaster-bridge/` directory is deleted
- [ ] Any useful code reviewed — Modbus TCP is NOT migrated (Artisan connects directly to ESP32 firmware); other useful patterns documented if applicable
- [ ] Root `Cargo.toml` workspace no longer references `coffee-roaster-bridge`
- [ ] `cargo build` succeeds for the remaining workspace members
- [ ] CLAUDE.md and any docs updated to remove references to the bridge

### US-005: Create SvelteKit project scaffold
**Description:** As a developer, I want a properly configured SvelteKit project with routing, TypeScript, Tailwind CSS, and WebSocket infrastructure so that all subsequent UI work has a solid foundation.

**Acceptance Criteria:**
- [ ] SvelteKit project created at `apps/dashboard/` (replacing the React app)
- [ ] TypeScript enabled with strict mode
- [ ] Tailwind CSS 4 configured and working
- [ ] File-based routing with pages: `/` (dashboard), `/sessions` (history), `/sessions/[id]` (detail), `/profiles` (profiles), `/settings` (configuration)
- [ ] WebSocket store created: connects to backend, provides typed telemetry state, handles reconnection with exponential backoff
- [ ] Base layout with responsive navigation sidebar/header
- [ ] Configured with `adapter-static` for SPA mode (Axum serves the built files)
- [ ] `npm run build` produces a working production build (static HTML/JS/CSS output)
- [ ] `npm run check` (svelte-check) passes with no errors

### US-006: Build real-time telemetry dashboard page
**Description:** As a roaster, I want to see live bean temperature, environment temperature, rate of rise, and PWM values on the main dashboard so that I can monitor my roast in real-time.

**Acceptance Criteria:**
- [ ] Current readings display: BT (orange), ET (blue), RoR, fan PWM, heater PWM
- [ ] Real-time chart with BT and ET lines, RoR on secondary axis, PWM as area fills
- [ ] Chart uses WebSocket data only — no polling for live telemetry
- [ ] Chart maintains a rolling window of the current roast session (up to 60 minutes)
- [ ] Dynamic Y-axis scaling with padding to prevent data cutoff
- [ ] Responsive layout — chart and readings are usable on mobile (min 375px width)
- [ ] Verify in browser using dev server

### US-007: Build roast control panel
**Description:** As a roaster, I want controls for setpoint, fan speed, heater power, and PID parameters so that I can actively manage the roast.

**Acceptance Criteria:**
- [ ] Temperature setpoint control with input field and +/- buttons (range 0-250°C)
- [ ] Fan PWM slider (0-255) with numeric display
- [ ] Heater PWM slider (0-100%) with numeric display
- [ ] Mode toggle: Manual / Auto (PID)
- [ ] PID parameter inputs (Kp, Ki, Kd) visible in Auto mode
- [ ] Heater enable/disable toggle with clear visual state
- [ ] Emergency stop button — prominent, always visible, red
- [ ] All controls send commands via authenticated API
- [ ] Controls are in a collapsible panel on mobile
- [ ] Verify in browser using dev server

### US-008: Build roast session management
**Description:** As a roaster, I want to start, pause, resume, and complete roast sessions with metadata so that my roast history is organized and searchable.

**Acceptance Criteria:**
- [ ] Start Roast button that creates a new session with optional name, bean, and batch size
- [ ] Quick-start option that creates a session with defaults (no form required)
- [ ] Roast timer showing elapsed time since session start
- [ ] Pause/Resume functionality
- [ ] Complete Roast button that ends the session and disables the heater
- [ ] Active session state persists across page refreshes (fetched from backend)
- [ ] Session list page showing past roasts with date, bean, duration, and key temps
- [ ] Verify in browser using dev server

### US-009: Build landmark marking system
**Description:** As a roaster, I want to mark key roast events (Dry End, First Crack, Second Crack, Drop) during a roast so that I can analyze phase timing and temperatures later.

**Acceptance Criteria:**
- [ ] Six landmark buttons: Dry End, FC Start, FC End, SC Start, SC End, Drop
- [ ] Each button shows checkmark, temperature, and elapsed time after marking
- [ ] Landmarks are persisted to backend via RoastEvents API
- [ ] Landmarks appear as vertical annotation lines on the chart with labels
- [ ] Drop landmark automatically sends heater disable command
- [ ] Landmarks are restored from backend on page refresh during active session
- [ ] Landmarks reset when a new session starts
- [ ] Verify in browser using dev server

### US-010: Build session detail/history view
**Description:** As a roaster, I want to view past roast sessions with their full telemetry chart and landmarks so that I can analyze and improve my technique.

**Acceptance Criteria:**
- [ ] Session detail page at `/sessions/[id]` showing full roast chart replay
- [ ] Landmark annotations displayed on historical chart
- [ ] Session metadata displayed: bean name, batch size, duration, date
- [ ] Phase timing table: Drying (start→Dry End), Maillard (Dry End→FC), Development (FC→Drop)
- [ ] Key temperatures: charge temp, turning point, FC temp, drop temp
- [ ] Back navigation to session list
- [ ] Verify in browser using dev server

### US-011: Build profile management page
**Description:** As a roaster, I want to create, view, and import roast profiles so that I can follow established curves for consistent results.

**Acceptance Criteria:**
- [ ] Profile list page at `/profiles` showing all saved profiles
- [ ] Profile detail view showing the target temperature curve as a chart
- [ ] Artisan JSON import (existing backend functionality, new UI)
- [ ] Profile metadata: name, bean, description, target temps at key milestones
- [ ] Delete profile with confirmation dialog
- [ ] Verify in browser using dev server

### US-012: Eliminate redundant polling
**Description:** As a developer, I want the frontend to use WebSocket as the sole source for live telemetry so that we eliminate duplicate network requests and reduce server load.

**Acceptance Criteria:**
- [ ] WebSocket store provides all real-time telemetry data
- [ ] No HTTP polling for `/telemetry/latest` during an active WebSocket connection
- [ ] HTTP API is used only for CRUD operations (sessions, profiles, events) and historical data
- [ ] Fallback: if WebSocket disconnects, show a "Reconnecting..." banner — do NOT fall back to polling
- [ ] Connection status indicator visible in the UI (connected/reconnecting/disconnected)

### US-013: Add docker-compose for local development
**Description:** As a new contributor, I want to run the entire stack locally with one command so that I can start developing without configuring MQTT brokers or databases manually.

**Acceptance Criteria:**
- [ ] `docker-compose.yml` at project root with services: `mosquitto`, `server`, `mock-device`
- [ ] Mosquitto service with basic config (anonymous access for dev, port 1883)
- [ ] Server service builds and runs `rustroast-server` with correct env vars
- [ ] Mock-device service publishes simulated telemetry at 1Hz (realistic temperature curves)
- [ ] `docker-compose up` brings up a working system with simulated data
- [ ] `README.md` documents the docker-compose workflow
- [ ] Dashboard dev server (`npm run dev`) can connect to the dockerized backend

### US-014: Add CI pipeline
**Description:** As a maintainer, I want automated checks on every PR so that code quality stays consistent as the community contributes.

**Acceptance Criteria:**
- [ ] GitHub Actions workflow at `.github/workflows/ci.yml`
- [ ] Rust checks: `cargo build`, `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt -- --check`
- [ ] Frontend checks: `npm ci`, `npm run check` (svelte-check), `npm run build`, `npm run test`
- [ ] CI runs on push to `main` and on all pull requests
- [ ] CI passes on the current codebase before merging

### US-015: Add backend integration tests
**Description:** As a developer, I want integration tests for the Rust backend so that API changes don't silently break functionality.

**Acceptance Criteria:**
- [ ] Test harness that starts the server with an in-memory SQLite database
- [ ] Tests for session CRUD lifecycle: create → update → list → get → complete
- [ ] Tests for roast event creation and retrieval within a session
- [ ] Tests for profile CRUD and Artisan import
- [ ] Tests for auth middleware (authenticated vs unauthenticated requests)
- [ ] Tests for telemetry WebSocket connection and message format
- [ ] All tests pass with `cargo test`

## Functional Requirements

- FR-1: The backend must validate incoming MQTT telemetry against a defined schema and log warnings for unexpected fields
- FR-2: All `/control/*` API endpoints must require a valid API key in the `Authorization` header
- FR-3: Read-only endpoints (`GET /sessions`, `GET /telemetry`, `GET /profiles`) must be accessible without authentication
- FR-4: The frontend must connect to the backend via WebSocket for all real-time telemetry data
- FR-5: The frontend must use HTTP API only for CRUD operations and historical data queries
- FR-6: The frontend must display a connection status indicator showing WebSocket state
- FR-7: The roast control panel must send commands via authenticated HTTP POST (not WebSocket) to maintain audit trail
- FR-8: The Drop landmark must automatically send a heater disable command to the backend
- FR-9: Session telemetry must be stored with `elapsed_seconds` calculated by the backend (not reliant on ESP32)
- FR-10: The session detail page must calculate and display phase timing from landmark events
- FR-11: The mock-device Docker service must simulate specific roast profiles (light roast, medium roast, dark roast curves) with realistic thermal dynamics (~10-15 minutes per roast)
- FR-12: The system must support multiple simultaneous browser clients viewing the same roast
- FR-13: API responses must use consistent field naming (snake_case) with TypeScript types matching exactly
- FR-14: The backend must serve the SvelteKit static build (adapter-static / SPA mode) directly via Axum — single deployment artifact, no Node.js runtime
- FR-15: The Modbus TCP server must NOT be included in the Axum backend — Artisan connects directly to ESP32 firmware when needed
- FR-16: The architecture must be extensible for future Artisan-parity features (roast comparison, profile auto-follow, data export, cupping notes) without requiring structural changes

## Non-Goals (Out of Scope)

- ESP32 firmware changes (no firmware rewrite — Modbus TCP stays in firmware for Artisan compatibility)
- Modbus TCP server in the Axum backend (removed — Artisan connects directly to ESP32)
- Multi-user authentication with accounts/roles (single API key for v1)
- Roast comparison / overlay of multiple roasts on one chart (future Artisan-parity feature)
- Profile auto-follow mode (sending setpoints automatically from a profile curve — future feature)
- Audio/push notification alerts for temperature thresholds (future feature)
- HTTPS/TLS termination (handled by reverse proxy in production)
- Mobile native app (PWA via responsive web is sufficient)
- Data export to CSV or Artisan format (future Artisan-parity feature)
- Cupping notes and roast scoring (future feature)
- Automatic roast scoring or ML-based recommendations
- Historical data migration from the old schema (fresh start is acceptable)

## Design Considerations

### Frontend Architecture
- **Framework:** SvelteKit with TypeScript (strict mode)
- **Styling:** Tailwind CSS 4 with consistent design tokens
- **Charts:** Apache ECharts via `echarts` package with a Svelte wrapper component
- **State:** Svelte stores for WebSocket telemetry; SvelteKit `load` functions for page data
- **Routing:** SvelteKit file-based routing (replaces hash routing)

### Layout
- Responsive sidebar navigation on desktop (collapsible on mobile)
- Main dashboard is the default route (`/`)
- Chart takes priority on all screen sizes — controls collapse on mobile
- Emergency stop button is always visible regardless of scroll position

### Color System
- Bean Temperature: `#f59e0b` (amber/orange)
- Environment Temperature: `#3b82f6` (blue)
- Rate of Rise: `#10b981` (green)
- Heater PWM: `#ef4444` (red)
- Fan PWM: `#8b5cf6` (purple)
- Landmarks: distinct colors per type with emoji labels (retained from current system)

## Technical Considerations

### Rust Backend
- **Framework:** Axum (keep current — it's solid)
- **Database:** SQLite via SQLx with compile-time query checking (keep current)
- **MQTT:** rumqttc (keep current)
- **New:** Tower middleware for API key auth
- **New:** Structured error type replacing ad-hoc error handling
- **Module structure:** See US-001 acceptance criteria

### Frontend Migration Path
1. Create SvelteKit project alongside existing React app (temporarily at `apps/dashboard-v2/`)
2. Build all pages and components in SvelteKit
3. Verify feature parity with existing React dashboard
4. Replace `apps/dashboard/` with SvelteKit app
5. Remove React dependencies

### WebSocket Protocol
- Keep existing delta compression for bandwidth efficiency
- Add message type envelope: `{ type: "telemetry" | "status" | "error", payload: ... }`
- Add heartbeat/ping to detect stale connections (30s interval)

### Database
- Keep SQLite — appropriate for single-instance deployment
- Add `elapsed_seconds` computation on insert (server-side, not from ESP32)
- Consider adding `STRICT` tables for type enforcement
- Retention cleanup remains at 7 days (configurable via env var)

### SvelteKit Adapter
- Use `adapter-static` (SPA mode) — builds to static HTML/JS/CSS files
- Axum serves the static build directly from a `./static/` or `./dist/` directory via `tower-http::services::ServeDir`
- No Node.js runtime needed in production — single Rust binary + static files
- SvelteKit still provides file-based routing (client-side), stores, TypeScript, and all DX benefits
- SSR is unnecessary: this is a local IoT dashboard (no SEO needs) and the main page is inherently client-side (WebSocket real-time data)

### Deployment
- **Single artifact:** Rust binary + SvelteKit static build in `./static/`
- Docker image: `docker run -e MQTT_BROKER_HOST=... rustroast`
- `docker-compose.yml` for development with mock device
- No reverse proxy needed — Axum serves everything (API + WebSocket + static files)

## Success Metrics

- Backend has >80% test coverage on API endpoints
- Frontend `svelte-check` and build pass with zero errors
- `docker-compose up` brings up a working system in under 60 seconds
- Dashboard loads and displays live telemetry within 2 seconds of page load
- Control commands are reflected in telemetry within 1 second (network permitting)
- A new contributor can set up the dev environment and run the app in under 10 minutes (with docker-compose)
- RoastControl equivalent functionality is spread across components none larger than 200 lines
- Zero hardcoded credentials in the repository

## Resolved Questions

1. **Mock-device profiles:** Simulate specific roast profiles (light, medium, dark) with realistic thermal curves — not just a generic ramp.
2. **Data migration:** Fresh start is acceptable. No migration path from the old schema needed.
3. **API key model:** Single shared API key for now. Architecture should allow upgrading to multiple keys later without breaking changes.
4. **SvelteKit adapter:** Use `adapter-static` (SPA mode). Axum serves static files directly — no Node.js in production. SSR is unnecessary for a local IoT dashboard.
5. **Modbus TCP:** Modbus stays in ESP32 firmware for direct Artisan connectivity. The Axum backend does NOT include a Modbus server — Artisan talks to the ESP32 directly when needed.
6. **Chart library:** Apache ECharts. Rich feature set needed for future analysis tools (roast comparison, overlays, statistical annotations).
7. **Post-rewrite priorities:** Analysis tools (roast comparison, RoR analysis, phase statistics) and full profile editing/saving are the first features after the rewrite.

## Future Roadmap (Post-Rewrite Artisan Parity)

These features are explicitly out of scope for this rewrite but represent the path toward full Artisan replacement. The architecture decisions in this rewrite should make each of these achievable without structural changes.

**Phase A — Analysis & Profiles (first priority after rewrite):**

| Feature | Artisan Equivalent |
|---------|-------------------|
| Roast comparison — overlay 2-3 roasts on one chart, aligned by time or landmark | Designer/Comparator |
| Full profile editor — create, edit, and save target temperature curves visually | Designer |
| Profile auto-follow — automatically send setpoints from a target curve | Background Follow |
| Phase statistics — detailed drying/Maillard/development timing and percentages | Roast Properties |
| Background deltaBT smoothing — configurable RoR smoothing algorithms | Config > Curves |

**Phase B — Data & Records:**

| Feature | Artisan Equivalent |
|---------|-------------------|
| Data export — CSV, Artisan JSON, and PDF roast reports | File > Save As |
| Cupping notes — attach tasting scores and notes to sessions | Cupping dialog |
| Roast color prediction — estimate Agtron/color from curve shape | Color prediction |

**Phase C — Inventory & Workflow:**

| Feature | Artisan Equivalent |
|---------|-------------------|
| Bean inventory — track green bean stock, origin, processing | Beans dialog |
| Batch scheduling — plan multiple roasts in sequence | Scheduler |
| Multi-device support — monitor/control multiple roasters | N/A (improvement over Artisan) |

## Open Questions

1. **ECharts Svelte wrapper:** Use an existing wrapper library (e.g., `svelte-echarts`) or write a thin custom wrapper component? Custom gives more control but more code to maintain.
2. **Profile editor UX:** Should the visual profile editor use ECharts' built-in drag interaction for control points, or a separate dedicated drag-and-drop canvas? ECharts drag is simpler but may be limiting for complex curves.
