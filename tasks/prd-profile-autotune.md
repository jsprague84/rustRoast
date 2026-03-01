# PRD: Profile Following & PID Autotune

## Introduction

rustRoast is a coffee roaster control system with an ESP32 hardware controller, Rust (Axum) backend, and SvelteKit dashboard. Two advanced features — **Profile Following** and **PID Autotune** — need frontend implementation and minor backend additions. These features bring rustRoast closer to parity with Artisan Roaster Scope by enabling automated roast control via temperature profiles and optimal PID parameter discovery.

The backend is ~95% complete for both features. The ESP32 firmware already implements full relay feedback autotune. The work is primarily frontend SvelteKit components with Svelte 5 runes, plus a few backend gaps (profile update endpoint, settings table, create profile API client method).

## Goals

- Allow users to create, edit, import, and manage roast profiles with time/temperature/fan curves
- Overlay a loaded profile as a reference curve on the real-time telemetry chart during roasting
- Automatically follow profile temperature targets in auto mode with configurable lookahead
- Display temperature delta between actual BT and profile target in real-time readings
- Provide a UI to start, monitor, and apply PID autotune results from the ESP32 firmware
- Show autotune progress (phase, step count, oscillation data) in real-time during the relay test
- Display recommended Kp/Ki/Kd values with one-click apply after autotune completes

## User Stories

### US-001: Add profile create/update backend support
**Description:** As a developer, I need the backend to support creating profiles with points via API and updating existing profiles so the frontend profile designer has complete CRUD operations.

**Acceptance Criteria:**
- [ ] `profiles.create()` method added to frontend API client (`$lib/api/client.ts`) calling `POST /api/profiles`
- [ ] `PUT /api/profiles/:id` endpoint added to backend for updating profile metadata and points
- [ ] Update service method replaces all profile points atomically (delete old + insert new in transaction)
- [ ] `profiles.update()` method added to frontend API client
- [ ] `cargo test` passes with profile create/update tests
- [ ] `cargo clippy` passes with no warnings
- [ ] `npm run check` passes with no errors

### US-002: Add global settings table and API
**Description:** As a developer, I need a key-value settings table in the database so that user preferences like lookahead time persist across sessions.

**Acceptance Criteria:**
- [ ] `settings` table created via migration: `key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT`
- [ ] `GET /api/settings` endpoint returns all settings as JSON object
- [ ] `PUT /api/settings/:key` endpoint sets a single setting value
- [ ] Default settings seeded on first run: `profile_lookahead_seconds` = `20`
- [ ] Frontend API client has `settings.get()` and `settings.set(key, value)` methods
- [ ] `cargo test` passes
- [ ] `npm run check` passes

### US-003: Create profile designer with visual chart editor
**Description:** As a roaster, I want to create and edit roast profiles by placing points on a chart so that I can design temperature curves visually.

**Acceptance Criteria:**
- [ ] New `ProfileDesigner.svelte` component at `$lib/components/ProfileDesigner.svelte`
- [ ] ECharts scatter+line chart showing profile points (time_seconds vs target_temp)
- [ ] Click on chart to add a new point at that time/temperature position
- [ ] Click existing point to select it; show editable fields for time, temperature, fan_speed
- [ ] Drag points to reposition them on the chart
- [ ] Delete selected point with button or keyboard shortcut
- [ ] Points are connected with lines, sorted by time
- [ ] Table view toggle shows all points in an editable data table as an alternative to the chart
- [ ] Profile metadata fields: name (required), description, charge_temp, target_end_temp
- [ ] Save button calls `profiles.create()` for new profiles or `profiles.update()` for existing
- [ ] Cancel button returns to profile list without saving
- [ ] `npm run check` passes
- [ ] Verify in browser using dev-browser skill

### US-004: Add profile overlay to telemetry chart
**Description:** As a roaster, I want to see the loaded profile as a reference curve on the real-time telemetry chart so that I can visually track how well I'm following the target profile.

**Acceptance Criteria:**
- [ ] Profile store created at `$lib/stores/profile.svelte.ts` using Svelte 5 `$state` runes
- [ ] Store holds: `activeProfile` (ProfileWithPoints | null), `isFollowing` (boolean)
- [ ] When a profile is loaded, its points render as a dashed purple line on TelemetryChart
- [ ] Profile curve uses the same X-axis (elapsed milliseconds from roast start) as telemetry data
- [ ] Profile curve shows in chart legend as "Profile"
- [ ] Loading/unloading a profile does not clear telemetry history
- [ ] `npm run check` passes
- [ ] Verify in browser using dev-browser skill

### US-005: Implement profile following (auto setpoint control)
**Description:** As a roaster, I want the system to automatically set temperature targets from the loaded profile when in auto mode so that the PID controller follows the profile curve without manual adjustment.

**Acceptance Criteria:**
- [ ] "Follow Profile" toggle button in session controls area, only enabled when a profile is loaded and session is active
- [ ] When enabled, interpolates target temperature from profile at `(current_elapsed_time + lookahead_seconds)`
- [ ] Linear interpolation between profile points; holds last point value after profile end
- [ ] Sends `POST /api/roaster/:device_id/control/setpoint` at 1Hz update rate
- [ ] 1°C hysteresis: only sends new setpoint when delta from last sent value >= 1°C
- [ ] Automatically switches device to auto mode when following starts
- [ ] Stops following when session ends, profile is unloaded, or user manually disables
- [ ] Lookahead uses global setting from `profile_lookahead_seconds` (default 20s)
- [ ] `npm run check` passes
- [ ] Verify in browser using dev-browser skill

### US-006: Show profile temperature delta in current readings
**Description:** As a roaster, I want to see the difference between actual bean temperature and the profile target so that I can quickly assess if the roast is ahead or behind the curve.

**Acceptance Criteria:**
- [ ] CurrentReadings component shows "Delta" value when a profile is loaded and a session is active
- [ ] Delta = actual BT - profile target BT at current elapsed time (positive = ahead, negative = behind)
- [ ] Color coding: green when within ±2°C, amber when ±2-5°C, red when >±5°C
- [ ] Delta updates in real-time with each telemetry tick
- [ ] Hidden when no profile is loaded
- [ ] `npm run check` passes
- [ ] Verify in browser using dev-browser skill

### US-007: Add profile selector to session creation
**Description:** As a roaster, I want to select a profile when creating a new roast session so that the profile is automatically loaded for following.

**Acceptance Criteria:**
- [ ] Profile dropdown added to session creation form/dialog
- [ ] Selected profile ID sent as `profile_id` in `POST /api/sessions` request
- [ ] When a session with a profile is started, the profile store loads the associated profile
- [ ] Profile list shows name and basic metadata (charge temp, duration) in dropdown
- [ ] Optional — user can start a session without a profile (manual roasting)
- [ ] `npm run check` passes
- [ ] Verify in browser using dev-browser skill

### US-008: Integrate Artisan profile import into profile designer
**Description:** As a roaster, I want to import an Artisan .alog file and have it open in the profile designer for review and editing before saving.

**Acceptance Criteria:**
- [ ] Import button on profiles page opens file picker for `.alog` / `.json` files
- [ ] Imported profile opens in ProfileDesigner for review (points visible on chart)
- [ ] User can edit imported points before saving
- [ ] Import uses existing `POST /api/profiles/import/artisan` endpoint
- [ ] Error messages shown for invalid or unparseable files
- [ ] `npm run check` passes
- [ ] Verify in browser using dev-browser skill

### US-009: Create autotune control panel
**Description:** As a roaster, I want a UI panel to start and control PID autotune so that I can find optimal PID parameters without needing a separate tool.

**Acceptance Criteria:**
- [ ] New `AutotunePanel.svelte` component at `$lib/components/AutotunePanel.svelte`
- [ ] Target temperature input field (range: 150-250°C, default 200°C)
- [ ] Start Autotune button calls `POST /api/roaster/:device_id/autotune/start` with target temperature
- [ ] Stop Autotune button calls `POST /api/roaster/:device_id/autotune/stop`
- [ ] Panel only shown when a device is selected and connected
- [ ] Autotune cannot be started while a roast session is in progress (safety)
- [ ] Accessible from the settings page or a dedicated section on the dashboard
- [ ] `npm run check` passes
- [ ] Verify in browser using dev-browser skill

### US-010: Display autotune progress in real-time
**Description:** As a roaster, I want to see autotune progress while it's running so that I know how far along the relay test is and when it will complete.

**Acceptance Criteria:**
- [ ] Autotune status derived from WebSocket telemetry events (already forwarded by backend)
- [ ] Displays current phase: Heating, Stabilizing, Running, Analyzing, Complete, Error
- [ ] Shows step count and estimated progress percentage during Running phase
- [ ] Shows current BT and target temperature during autotune
- [ ] Progress bar or visual indicator for overall autotune progress
- [ ] Status updates in real-time without polling
- [ ] Error state shown with descriptive message if autotune fails
- [ ] `npm run check` passes
- [ ] Verify in browser using dev-browser skill

### US-011: Display autotune results with apply/discard
**Description:** As a roaster, I want to see the recommended PID parameters after autotune completes and choose to apply or discard them.

**Acceptance Criteria:**
- [ ] Results panel shows recommended Kp, Ki, Kd values after autotune completes
- [ ] Shows current PID values alongside recommended values for comparison
- [ ] "Apply" button calls `POST /api/roaster/:device_id/autotune/apply` to send new PID params to ESP32
- [ ] "Discard" button dismisses results without applying
- [ ] Success/failure notification after applying
- [ ] Results persist until dismissed (survive page navigation using store)
- [ ] Falls back to `GET /api/roaster/:device_id/autotune/results/latest` on page load if autotune completed recently
- [ ] `npm run check` passes
- [ ] Verify in browser using dev-browser skill

### US-012: Show autotune data on telemetry chart
**Description:** As a roaster, I want to see the autotune relay test visualized on the existing telemetry chart so I can observe the oscillation pattern.

**Acceptance Criteria:**
- [ ] During autotune, telemetry chart continues to show BT, ET, and heater output as normal
- [ ] Autotune target temperature shown as a horizontal dashed line on the chart
- [ ] Chart annotation or shaded region indicates the autotune active period
- [ ] After autotune completes, oscillation period visible in the BT curve history
- [ ] No separate autotune-only chart needed (reuses existing TelemetryChart)
- [ ] `npm run check` passes
- [ ] Verify in browser using dev-browser skill

### US-013: Add autotune store for state management
**Description:** As a developer, I need a centralized store for autotune state so that multiple components (panel, chart, readings) can access autotune status consistently.

**Acceptance Criteria:**
- [ ] Autotune store at `$lib/stores/autotune.svelte.ts` using Svelte 5 runes
- [ ] Derives state from WebSocket autotune events in telemetry stream
- [ ] Exports: `autotuneStatus` (phase, step, progress), `autotuneResults` (Kp, Ki, Kd), `isAutotuning` (boolean)
- [ ] Fetches latest status/results on initialization via API (handles page refresh during autotune)
- [ ] Cleans up state when autotune is stopped or results are dismissed
- [ ] `npm run check` passes
- [ ] Unit tests for store state transitions

### US-014: Add frontend unit tests for profile and autotune features
**Description:** As a developer, I want unit tests covering the profile interpolation logic, autotune store state transitions, and critical component behaviors.

**Acceptance Criteria:**
- [ ] Profile interpolation function has unit tests: linear interpolation, edge cases (before first point, after last point, exact match)
- [ ] Profile store tests: load/unload profile, follow toggle
- [ ] Autotune store tests: status transitions (idle → heating → running → complete), result parsing
- [ ] Hysteresis logic test: setpoint only sent when delta >= 1°C
- [ ] All tests pass with `npm test`
- [ ] `npm run check` passes

### US-015: Add lookahead setting to settings page
**Description:** As a roaster, I want to configure the profile following lookahead time in settings so I can adjust how far ahead the system anticipates the profile curve.

**Acceptance Criteria:**
- [ ] Lookahead input field on the settings page with label explaining its purpose
- [ ] Value displayed in seconds with reasonable range (5-60s)
- [ ] Changes saved to backend via `PUT /api/settings/profile_lookahead_seconds`
- [ ] Current value loaded from backend on page load
- [ ] Default value of 20 seconds shown if no setting exists
- [ ] `npm run check` passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Profile CRUD — Create, read, update, and delete roast profiles with time/temperature/fan_speed points
- FR-2: Profile Designer — Visual chart-based editor for placing and editing profile points, with table view alternative
- FR-3: Profile Overlay — Render loaded profile as dashed purple reference line on real-time telemetry chart
- FR-4: Profile Following — In auto mode, interpolate profile target at (elapsed_time + lookahead) and send 1Hz setpoint updates with 1°C hysteresis
- FR-5: Temperature Delta — Show BT vs profile target difference in CurrentReadings with color coding
- FR-6: Artisan Import — Import .alog files into the profile designer for review and editing before saving
- FR-7: Session-Profile Association — Link a profile to a roast session at creation time
- FR-8: Autotune Control — Start/stop PID autotune with configurable target temperature (150-250°C)
- FR-9: Autotune Progress — Real-time display of autotune phase, step count, and progress from WebSocket events
- FR-10: Autotune Results — Display recommended Kp/Ki/Kd with apply/discard actions
- FR-11: Autotune Visualization — Show target temperature line and active period annotation on telemetry chart
- FR-12: Global Settings — Key-value settings table with API for persistent user preferences
- FR-13: Lookahead Configuration — Configurable profile lookahead time (default 20s) in settings

## Non-Goals (Out of Scope)

- Per-session or per-profile lookahead values (global setting only)
- Ramp/soak multi-segment PID programming (Artisan advanced feature)
- Profile sharing or export functionality
- Automatic profile suggestion based on bean type
- Multi-device simultaneous profile following
- Custom autotune algorithms (ESP32 firmware relay feedback method only)
- Autotune parameter presets (e.g., aggressive vs conservative tuning)
- Background profile — this is a single-profile overlay, not a compare-two-profiles feature
- Dedicated autotune-only chart component (reuses existing TelemetryChart)

## Design Considerations

### UI Layout
- Profile designer opens as a full-page view at `/profiles/new` or `/profiles/:id/edit`
- Table view is a toggle within the designer, not a separate page
- Autotune panel is a collapsible section on the settings page with a quick-access button on the dashboard
- Temperature delta shown inline with existing BT/ET readings in CurrentReadings component
- "Follow Profile" toggle integrated into the session controls bar near Start/Pause/Stop buttons

### Color Scheme (Consistent with existing dashboard)
- Profile reference curve: `#a855f7` (purple, dashed line)
- Temperature delta: green (`#34d399`) for ±2°C, amber (`#f59e0b`) for ±2-5°C, red (`#ef4444`) for >±5°C
- Autotune target line: `#f97316` (orange, horizontal dashed)
- Autotune active period: semi-transparent amber overlay on chart

### Existing Components to Reuse
- `Chart.svelte` — ECharts wrapper with responsive sizing
- `TelemetryChart.svelte` — Add profile overlay series and autotune annotations
- `CurrentReadings.svelte` — Add delta display
- `SessionControls.svelte` — Add "Follow Profile" toggle
- `ControlPanel.svelte` / `PidControls.svelte` — Autotune result comparison
- `$lib/api/client.ts` — Extend with profile create/update and settings methods
- `$lib/stores/telemetry.ts` — Source for autotune event data

## Technical Considerations

### Profile Interpolation Algorithm
- Linear interpolation between adjacent profile points
- Before first point: use first point's temperature
- After last point: hold last point's temperature
- Lookahead: `target_temp = interpolate(elapsed_seconds + lookahead_seconds)`
- Implementation as a pure function for easy unit testing

### Setpoint Update Strategy
- Update rate: 1Hz (send at most one setpoint per second)
- Hysteresis: only send when `|new_setpoint - last_sent_setpoint| >= 1.0°C`
- This prevents flooding the MQTT broker while maintaining responsive following
- Uses `$effect` with a 1-second interval timer

### Autotune State Machine (ESP32 firmware — read-only from frontend)
- Phases: IDLE → HEATING → STABILIZING → RUNNING → ANALYZING → COMPLETE
- WebSocket events include: `phase`, `step_count`, `target_temp`, `Ku`, `Tu`, `Kp`, `Ki`, `Kd`
- Frontend derives progress from step_count (typical autotune: 10-20 oscillation cycles)
- Results available via both WebSocket event and `GET /api/roaster/:device_id/autotune/results/latest`

### Store Architecture
- Profile store: `$lib/stores/profile.svelte.ts` — Svelte 5 module with `$state` runes, exported as reactive getters
- Autotune store: `$lib/stores/autotune.svelte.ts` — Derives from WebSocket events, falls back to API on init
- Both stores are .svelte.ts files to use runes outside components

### Backend Gaps to Fill
- `PUT /api/profiles/:id` — Update profile metadata + replace points atomically
- `settings` table + `GET /api/settings` + `PUT /api/settings/:key` endpoints
- `profiles.create()` missing from frontend API client (backend endpoint already exists)
- `profiles.update()` frontend API client method (needs backend endpoint first)
- `settings.get()` and `settings.set()` frontend API client methods

## Success Metrics

- Profile can be created, edited, and loaded in under 5 clicks
- Profile overlay is visually distinguishable from live telemetry curves
- Auto-following maintains BT within ±3°C of profile target during steady-state roasting
- Autotune can be started and monitored without leaving the dashboard
- Autotune results applied in one click with immediate PID parameter update
- All new code has TypeScript strict mode compliance (zero `npm run check` errors)
- Unit test coverage for interpolation, hysteresis, and store state transitions

## Open Questions

- Should the profile designer support undo/redo for point edits?
- Should profile following pause during landmark events (e.g., first crack) to allow manual adjustment?
- What is a reasonable timeout for autotune? (ESP32 currently has no timeout — should frontend add one?)
- Should completed autotune results be persisted in a history for comparison across runs?
