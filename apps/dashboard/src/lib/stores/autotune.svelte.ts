import { autotune as autotuneApi } from '$lib/api/client.js';
import { autotuneEvent } from '$lib/stores/telemetry.js';

// --- Types ---

export interface AutotuneStatus {
	phase: string;
	stepCount: number;
	progress: number;
	error?: string;
}

export interface AutotuneResults {
	Kp: number;
	Ki: number;
	Kd: number;
}

// --- Reactive state (Svelte 5 runes) ---

export const autotuneState = $state<{
	status: AutotuneStatus | null;
	results: AutotuneResults | null;
	isAutotuning: boolean;
	targetTemp: number | null;
}>({
	status: null,
	results: null,
	isAutotuning: false,
	targetTemp: null
});

// --- WebSocket event subscription ---

let unsubscribe: (() => void) | null = null;

/** Process an autotune WebSocket event. Exported for unit testing. */
export function handleAutotuneEvent(msg: { autotune: { type: string; data: Record<string, unknown> } } | null) {
	if (!msg) return;

	const { type, data } = msg.autotune;

	if (type === 'status') {
		const phase = String(data.phase ?? data.state ?? '').toUpperCase();
		const stepCount = typeof data.current_step === 'number' ? data.current_step
			: typeof data.step_count === 'number' ? data.step_count : 0;

		// Estimate progress: ~15 relay cycles expected
		let progress: number;
		if (phase === 'COMPLETE' || phase === 'ANALYZING') {
			progress = phase === 'COMPLETE' ? 100 : 95;
		} else {
			progress = Math.min(Math.round((stepCount / 15) * 100), 95);
		}

		autotuneState.status = {
			phase,
			stepCount,
			progress,
			error: typeof data.error === 'string' ? data.error : undefined
		};

		// Update isAutotuning based on phase
		const activePhases = ['HEATING', 'STABILIZING', 'RUNNING', 'ANALYZING'];
		autotuneState.isAutotuning = activePhases.includes(phase);

		if (phase === 'ERROR' || phase === 'COMPLETE') {
			autotuneState.isAutotuning = false;
		}
	} else if (type === 'results') {
		const Kp = typeof data.recommended_kp === 'number' ? data.recommended_kp
			: typeof data.Kp === 'number' ? data.Kp : 0;
		const Ki = typeof data.recommended_ki === 'number' ? data.recommended_ki
			: typeof data.Ki === 'number' ? data.Ki : 0;
		const Kd = typeof data.recommended_kd === 'number' ? data.recommended_kd
			: typeof data.Kd === 'number' ? data.Kd : 0;
		autotuneState.results = { Kp, Ki, Kd };
	}
}

/** Subscribe to WebSocket autotune events. Call once on app init. */
export function initAutotuneSubscription() {
	if (unsubscribe) return;
	unsubscribe = autotuneEvent.subscribe(handleAutotuneEvent);
}

/** Unsubscribe from WebSocket events. */
export function destroyAutotuneSubscription() {
	unsubscribe?.();
	unsubscribe = null;
}

// --- Actions ---

export async function startAutotune(deviceId: string, targetTemp: number) {
	// The Start button is only visible after apply or dismiss, both of which
	// already reset the ESP32 to IDLE.  Do NOT send stop here — the ESP32's
	// stop handler unconditionally reverts PID values to pre-autotune originals,
	// which would undo any previously applied autotune or manual PID changes.
	autotuneState.targetTemp = targetTemp;
	autotuneState.status = { phase: 'HEATING', stepCount: 0, progress: 0 };
	autotuneState.results = null;
	autotuneState.isAutotuning = true;
	await autotuneApi.start(deviceId, targetTemp);
}

export async function stopAutotune(deviceId: string) {
	autotuneState.isAutotuning = false;
	autotuneState.status = null;
	autotuneState.targetTemp = null;
	await autotuneApi.stop(deviceId);
}

export async function applyResults(deviceId: string) {
	await autotuneApi.apply(deviceId);
}

export function dismissResults(deviceId?: string, { skipStop = false } = {}) {
	autotuneState.results = null;
	autotuneState.status = null;
	autotuneState.targetTemp = null;
	// Reset the ESP32 out of COMPLETE state so a future start will work.
	// Skip when results were just applied — apply already resets to IDLE,
	// and stop would revert the PID values to the pre-autotune originals.
	if (deviceId && !skipStop) {
		autotuneApi.stop(deviceId).catch(() => {});
	}
}

/** Fetch latest status/results from the API (for page refresh recovery). */
export async function fetchLatestAutotune(deviceId: string) {
	const base = import.meta.env.VITE_API_URL ?? '';
	let latestPhase = '';

	try {
		const statusRes = await fetch(`${base}/api/roaster/${deviceId}/autotune/status/latest`);
		if (statusRes.ok) {
			const statusResp = await statusRes.json();
			if (!statusResp) return; // no autotune data
			const data = statusResp.status ?? statusResp;
			latestPhase = String(data.phase ?? data.state ?? '').toUpperCase();
			const stepCount = typeof data.current_step === 'number' ? data.current_step
			: typeof data.step_count === 'number' ? data.step_count : 0;

			const activePhases = ['HEATING', 'STABILIZING', 'RUNNING', 'ANALYZING'];
			if (activePhases.includes(latestPhase)) {
				const progress = latestPhase === 'ANALYZING' ? 95 : Math.min(Math.round((stepCount / 15) * 100), 95);
				autotuneState.status = { phase: latestPhase, stepCount, progress };
				autotuneState.isAutotuning = true;
				autotuneState.targetTemp = typeof data.target_temperature === 'number' ? data.target_temperature : null;
			}
		}
	} catch {
		// No status available — that's fine
	}

	// Only fetch and show results if the latest status is COMPLETE.
	// After apply or dismiss the ESP32 transitions to IDLE, so stale
	// results in the cache won't re-appear on page navigation.
	if (latestPhase === 'COMPLETE') {
		try {
			const resultsRes = await fetch(`${base}/api/roaster/${deviceId}/autotune/results/latest`);
			if (resultsRes.ok) {
				const resultsResp = await resultsRes.json();
				const data = resultsResp.results ?? resultsResp;
				const Kp = typeof data.recommended_kp === 'number' ? data.recommended_kp
					: typeof data.Kp === 'number' ? data.Kp : 0;
				const Ki = typeof data.recommended_ki === 'number' ? data.recommended_ki
					: typeof data.Ki === 'number' ? data.Ki : 0;
				const Kd = typeof data.recommended_kd === 'number' ? data.recommended_kd
					: typeof data.Kd === 'number' ? data.Kd : 0;
				autotuneState.results = { Kp, Ki, Kd };
			}
		} catch {
			// No results available — that's fine
		}
	}
}
