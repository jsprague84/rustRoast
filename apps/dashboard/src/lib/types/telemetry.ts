/** Telemetry data structure matching ESP32 JSON output. */
export interface Telemetry {
	beanTemp: number;
	envTemp: number;
	heaterPWM: number;
	fanPWM: number;
	setpoint: number;
	controlMode: number; // 0 = manual, 1 = auto
	heaterEnable: number; // 0 or 1
	rateOfRise?: number;
	Kp?: number;
	Ki?: number;
	Kd?: number;
	uptime?: number;
	freeHeap?: number;
	rssi?: number;
	systemStatus?: number;
	timestamp?: number;
}

/** WebSocket message envelope wrapping telemetry with device context. */
export interface TelemetryMessage {
	device_id: string;
	telemetry: Telemetry;
}

/** WebSocket message envelope for autotune events.
 *
 * Status data fields: phase, current_step/step_count, target_temperature,
 *   error, mode ('relay'|'step_response'), total_steps
 *
 * Results data fields: recommended_kp/ki/kd, tuning_method, quality
 *   ('good'|'acceptable'|'fallback'|'poor'), mode, duration,
 *   original_kp/ki/kd, oscillation_period, oscillation_amplitude,
 *   ultimate_gain, consistency_pct, asymmetry_ratio, hysteresis_correction,
 *   process_gain_K, time_constant_tau, dead_time_theta, aggressiveness, simc_tau_c
 */
export interface AutotuneWsMessage {
	device_id: string;
	autotune: {
		type: 'status' | 'results';
		data: Record<string, unknown>;
	};
}

/** WebSocket connection state. */
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';
