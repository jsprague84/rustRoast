import type { RoastSession, ProfileWithPoints } from '$lib/api/client.js';

/** Telemetry data point stored with a roast session (matches backend SessionTelemetry). */
export interface SessionTelemetryPoint {
	id: string;
	session_id: string;
	timestamp: string;
	elapsed_seconds: number;
	bean_temp: number | null;
	env_temp: number | null;
	rate_of_rise: number | null;
	heater_pwm: number | null;
	fan_pwm: number | null;
	setpoint: number | null;
}

/** Session detail response from GET /api/sessions/:id (matches backend SessionWithTelemetry). */
export interface SessionWithTelemetry extends RoastSession {
	telemetry: SessionTelemetryPoint[];
	profile: ProfileWithPoints | null;
}
