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

/** WebSocket message envelope for autotune events. */
export interface AutotuneWsMessage {
	device_id: string;
	autotune: {
		type: 'status' | 'results';
		data: Record<string, unknown>;
	};
}

/** WebSocket connection state. */
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';
