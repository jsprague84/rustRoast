import { writable, derived, readonly } from 'svelte/store';
import type { Telemetry, TelemetryMessage, AutotuneWsMessage, ConnectionStatus } from '$lib/types/telemetry.js';
import { settings } from '$lib/api/client.js';

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
const _autotuneEvent = writable<AutotuneWsMessage | null>(null);

/** Public read-only stores. */
export const telemetry = readonly(_telemetry);
export const deviceId = readonly(_deviceId);
export const connectionStatus = readonly(_connectionStatus);
export const telemetryHistory = readonly(_history);
/** Latest autotune WebSocket event (status or results). */
export const autotuneEvent = readonly(_autotuneEvent);

/** RoR configuration stores. */
const _rorWindowMs = writable(30_000);
const _rorAlgorithm = writable<string>('moving_average');

export const rorWindowSeconds = derived(_rorWindowMs, ($ms) => $ms / 1000);
export const rorAlgorithm = readonly(_rorAlgorithm);

/** Update RoR configuration. */
export function setRorConfig(windowSeconds: number, algorithm: string) {
	_rorWindowMs.set(windowSeconds * 1000);
	_rorAlgorithm.set(algorithm);
}

/** Load RoR settings from the server. */
export async function loadRorSettings() {
	try {
		const s = await settings.get();
		const windowSec = parseInt(s['ror_window_seconds'] ?? '30', 10);
		const algo = s['ror_smoothing_algorithm'] ?? 'moving_average';
		if (!isNaN(windowSec) && windowSec >= 5 && windowSec <= 120) {
			_rorWindowMs.set(windowSec * 1000);
		}
		_rorAlgorithm.set(algo);
	} catch {
		// Use defaults on error
	}
}

type HistoryEntry = { timestamp: number; telemetry: Telemetry };

/** Moving average: endpoint difference over window (current behavior). */
function rorMovingAverage(windowData: HistoryEntry[]): number | null {
	if (windowData.length < 2) return null;
	const first = windowData[0];
	const last = windowData[windowData.length - 1];
	const dt = (last.timestamp - first.timestamp) / 1000;
	if (dt <= 0) return null;
	const dTemp = last.telemetry.beanTemp - first.telemetry.beanTemp;
	return Math.round(((dTemp / dt) * 60) * 10) / 10;
}

/** Weighted moving average: linearly weighted slope, recent samples weighted higher. */
function rorWeightedMovingAverage(windowData: HistoryEntry[]): number | null {
	if (windowData.length < 2) return null;
	const n = windowData.length;
	const wSum = (n * (n + 1)) / 2;
	const t0 = windowData[0].timestamp / 1000;

	let sumW = 0, sumWT = 0, sumWY = 0, sumWTT = 0, sumWTY = 0;
	for (let i = 0; i < n; i++) {
		const w = (i + 1) / wSum;
		const t = windowData[i].timestamp / 1000 - t0;
		const y = windowData[i].telemetry.beanTemp;
		sumW += w;
		sumWT += w * t;
		sumWY += w * y;
		sumWTT += w * t * t;
		sumWTY += w * t * y;
	}

	const denom = sumW * sumWTT - sumWT * sumWT;
	if (Math.abs(denom) < 1e-10) return null;
	const slope = (sumW * sumWTY - sumWT * sumWY) / denom;
	return Math.round(slope * 60 * 10) / 10;
}

/** Savitzky-Golay: 2nd-order polynomial fit, derivative at center point. */
function rorSavitzkyGolay(windowData: HistoryEntry[]): number | null {
	if (windowData.length < 3) return null;
	const n = windowData.length;
	const tMid = windowData[Math.floor(n / 2)].timestamp / 1000;

	let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
	let r0 = 0, r1 = 0, r2 = 0;

	for (let i = 0; i < n; i++) {
		const t = windowData[i].timestamp / 1000 - tMid;
		const y = windowData[i].telemetry.beanTemp;
		const t2 = t * t;
		s0 += 1;
		s1 += t;
		s2 += t2;
		s3 += t * t2;
		s4 += t2 * t2;
		r0 += y;
		r1 += t * y;
		r2 += t2 * y;
	}

	// Solve 3x3 normal equations via Cramer's rule
	const det = s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s2 * s3) + s2 * (s1 * s3 - s2 * s2);
	if (Math.abs(det) < 1e-10) return null;

	// b coefficient (first derivative at center): replace column 2 with RHS
	const detB = s0 * (r1 * s4 - r2 * s3) - r0 * (s1 * s4 - s2 * s3) + s2 * (s1 * r2 - s2 * r1);
	const b = detB / det;

	// Derivative at t=0 (centered at tMid) is just b; convert to °C/min
	return Math.round(b * 60 * 10) / 10;
}

/** Rate of Rise calculated from telemetry history. */
export const rateOfRise = derived(
	[_history, _rorWindowMs, _rorAlgorithm],
	([$history, $windowMs, $algorithm], set) => {
		if ($history.length < 2) {
			set(null);
			return;
		}
		const now = $history[$history.length - 1].timestamp;
		const windowStart = now - $windowMs;
		const windowData = $history.filter((h) => h.timestamp >= windowStart);
		if (windowData.length < 2) {
			set(null);
			return;
		}

		let result: number | null;
		switch ($algorithm) {
			case 'weighted_moving_average':
				result = rorWeightedMovingAverage(windowData);
				break;
			case 'savitzky_golay':
				result = rorSavitzkyGolay(windowData);
				break;
			default:
				result = rorMovingAverage(windowData);
		}
		set(result);
	},
	null as number | null
);

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityHandler: (() => void) | null = null;
let pausedByVisibility = false;
let selectedDevice: string | null = null;

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
			const msg = JSON.parse(event.data);
			if (msg.telemetry) {
				const tmsg = msg as TelemetryMessage;
				// Filter to selected device (if one is selected)
				if (selectedDevice && tmsg.device_id !== selectedDevice) return;

				_telemetry.set(tmsg.telemetry);
				_deviceId.set(tmsg.device_id);
				_history.update((h) => {
					const next = [...h, { timestamp: Date.now(), telemetry: tmsg.telemetry }];
					// Keep max 3600 points (60 minutes at 1Hz)
					if (next.length > 3600) return next.slice(next.length - 3600);
					return next;
				});
			} else if (msg.autotune) {
				_autotuneEvent.set(msg as AutotuneWsMessage);
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

/** Set the device to filter telemetry for. Clears history on device change. */
export function setSelectedDevice(deviceId: string | null) {
	if (deviceId === selectedDevice) return;
	selectedDevice = deviceId;
	_telemetry.set(null);
	_deviceId.set(null);
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
