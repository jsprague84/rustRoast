import { writable, derived, readonly } from 'svelte/store';
import type { Telemetry, TelemetryMessage, ConnectionStatus } from '$lib/types/telemetry.js';

function getWsUrl(): string {
	if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
	if (typeof window === 'undefined') return 'ws://localhost:8080/ws/telemetry';
	const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${proto}//${window.location.host}/ws/telemetry`;
}
const WS_URL = getWsUrl();

const MAX_BACKOFF_MS = 30_000;

/** Internal writable stores. */
const _telemetry = writable<Telemetry | null>(null);
const _deviceId = writable<string | null>(null);
const _connectionStatus = writable<ConnectionStatus>('disconnected');
const _history = writable<{ timestamp: number; telemetry: Telemetry }[]>([]);

/** Public read-only stores. */
export const telemetry = readonly(_telemetry);
export const deviceId = readonly(_deviceId);
export const connectionStatus = readonly(_connectionStatus);
export const telemetryHistory = readonly(_history);

/** Rate of Rise calculated from telemetry history. */
export const rateOfRise = derived(_history, ($history, set) => {
	if ($history.length < 2) {
		set(null);
		return;
	}
	// Use last 30 seconds of data for RoR calculation
	const now = $history[$history.length - 1].timestamp;
	const windowStart = now - 30_000;
	const windowData = $history.filter((h) => h.timestamp >= windowStart);
	if (windowData.length < 2) {
		set(null);
		return;
	}
	const first = windowData[0];
	const last = windowData[windowData.length - 1];
	const dt = (last.timestamp - first.timestamp) / 1000; // seconds
	if (dt <= 0) {
		set(null);
		return;
	}
	const dTemp = last.telemetry.beanTemp - first.telemetry.beanTemp;
	// RoR in °C/min
	set(Math.round(((dTemp / dt) * 60) * 10) / 10);
}, null as number | null);

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityHandler: (() => void) | null = null;
let pausedByVisibility = false;

function connect() {
	if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

	_connectionStatus.set('reconnecting');
	ws = new WebSocket(WS_URL);

	ws.onopen = () => {
		reconnectAttempts = 0;
		_connectionStatus.set('connected');
	};

	ws.onmessage = (event) => {
		try {
			const msg: TelemetryMessage = JSON.parse(event.data);
			if (msg.telemetry) {
				_telemetry.set(msg.telemetry);
				_deviceId.set(msg.device_id);
				_history.update((h) => {
					const next = [...h, { timestamp: Date.now(), telemetry: msg.telemetry }];
					// Keep max 3600 points (60 minutes at 1Hz)
					if (next.length > 3600) return next.slice(next.length - 3600);
					return next;
				});
			}
		} catch {
			// Ignore unparseable messages
		}
	};

	ws.onclose = () => {
		_connectionStatus.set('disconnected');
		if (!pausedByVisibility) {
			scheduleReconnect();
		}
	};

	ws.onerror = () => {
		ws?.close();
	};
}

function scheduleReconnect() {
	if (reconnectTimer) return;
	const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_BACKOFF_MS);
	reconnectAttempts++;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connect();
	}, delay);
}

/** Clear telemetry history (e.g. when starting a new roast). */
export function clearHistory() {
	_history.set([]);
}

/** Start the WebSocket connection. Call once on app init. */
export function initTelemetrySocket() {
	connect();

	if (typeof document !== 'undefined') {
		visibilityHandler = () => {
			if (document.hidden) {
				// Tab hidden: close connection to save bandwidth
				pausedByVisibility = true;
				if (reconnectTimer) {
					clearTimeout(reconnectTimer);
					reconnectTimer = null;
				}
				ws?.close();
				ws = null;
				_connectionStatus.set('disconnected');
			} else {
				// Tab visible: reconnect immediately (skip backoff)
				pausedByVisibility = false;
				reconnectAttempts = 0;
				connect();
			}
		};
		document.addEventListener('visibilitychange', visibilityHandler);
	}
}

/** Disconnect and clean up. */
export function destroyTelemetrySocket() {
	if (visibilityHandler) {
		document.removeEventListener('visibilitychange', visibilityHandler);
		visibilityHandler = null;
	}
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	ws?.close();
	ws = null;
	_connectionStatus.set('disconnected');
}
