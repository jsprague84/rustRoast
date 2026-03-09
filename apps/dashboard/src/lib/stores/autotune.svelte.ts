import { autotune as autotuneApi } from '$lib/api/client.js';
import { autotuneEvent } from '$lib/stores/telemetry.js';

// --- Types ---

export interface AutotuneStatus {
	phase: string;
	stepCount: number;
	progress: number;
	error?: string;
	mode?: string;
	totalSteps?: number;
}

export interface AutotuneResults {
	Kp: number;
	Ki: number;
	Kd: number;
	mode?: string;
	tuning_method?: string;
	quality?: 'good' | 'acceptable' | 'fallback' | 'poor';
	original_kp?: number;
	original_ki?: number;
	original_kd?: number;
	oscillation_period?: number;
	oscillation_amplitude?: number;
	ultimate_gain?: number;
	consistency_pct?: number;
	asymmetry_ratio?: number;
	hysteresis_correction?: number;
	process_gain_K?: number;
	time_constant_tau?: number;
	dead_time_theta?: number;
	aggressiveness?: number;
	simc_tau_c?: number;
	duration?: number;
}

export interface AutotuneStartParams {
	targetTemp: number;
	mode?: 'relay' | 'step_response';
	tuningMethod?: string;
	bias?: number;
	amplitude?: number;
	hysteresis?: number;
	aggressiveness?: number;
}

// --- Reactive state (Svelte 5 runes) ---

export const autotuneState = $state<{
	status: AutotuneStatus | null;
	results: AutotuneResults | null;
	isAutotuning: boolean;
	targetTemp: number | null;
	mode: 'relay' | 'step_response';
}>({
	status: null,
	results: null,
	isAutotuning: false,
	targetTemp: null,
	mode: 'relay'
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
		const mode = typeof data.mode === 'string' ? data.mode : undefined;
		const totalSteps = typeof data.total_steps === 'number' ? data.total_steps : undefined;

		// Determine default total steps based on mode
		const effectiveTotalSteps = totalSteps ?? (mode === 'step_response' ? 4 : 12);

		// Estimate progress using total_steps from ESP32
		let progress: number;
		const stepResponsePhases = ['STEP_BASELINE', 'STEP_UP', 'STEP_SETTLE', 'STEP_ANALYZE'];
		if (phase === 'COMPLETE') {
			progress = 100;
		} else if (phase === 'ANALYZING' || phase === 'STEP_ANALYZE') {
			progress = 95;
		} else if (stepResponsePhases.includes(phase)) {
			// Phase-based progress for step response
			const phaseIdx = stepResponsePhases.indexOf(phase);
			progress = Math.min(Math.round(((phaseIdx + 1) / (stepResponsePhases.length + 1)) * 100), 95);
		} else {
			progress = Math.min(Math.round((stepCount / effectiveTotalSteps) * 100), 95);
		}

		autotuneState.status = {
			phase,
			stepCount,
			progress,
			error: typeof data.error === 'string' ? data.error : undefined,
			mode,
			totalSteps: effectiveTotalSteps
		};

		// Update mode in state if reported
		if (mode === 'relay' || mode === 'step_response') {
			autotuneState.mode = mode;
		}

		// Update isAutotuning based on phase
		const activePhases = ['HEATING', 'STABILIZING', 'RUNNING', 'ANALYZING',
			'STEP_BASELINE', 'STEP_UP', 'STEP_SETTLE', 'STEP_ANALYZE'];
		autotuneState.isAutotuning = activePhases.includes(phase);

		if (phase === 'ERROR' || phase === 'COMPLETE' || phase === 'FAILED') {
			autotuneState.isAutotuning = false;
		}
	} else if (type === 'results') {
		const Kp = typeof data.recommended_kp === 'number' ? data.recommended_kp
			: typeof data.Kp === 'number' ? data.Kp : 0;
		const Ki = typeof data.recommended_ki === 'number' ? data.recommended_ki
			: typeof data.Ki === 'number' ? data.Ki : 0;
		const Kd = typeof data.recommended_kd === 'number' ? data.recommended_kd
			: typeof data.Kd === 'number' ? data.Kd : 0;

		const optNum = (key: string): number | undefined => {
			const v = data[key];
			return typeof v === 'number' ? v : undefined;
		};
		const optStr = (key: string): string | undefined => {
			const v = data[key];
			return typeof v === 'string' ? v : undefined;
		};

		autotuneState.results = {
			Kp, Ki, Kd,
			mode: optStr('mode'),
			tuning_method: optStr('tuning_method'),
			quality: optStr('quality') as AutotuneResults['quality'],
			original_kp: optNum('original_kp'),
			original_ki: optNum('original_ki'),
			original_kd: optNum('original_kd'),
			oscillation_period: optNum('oscillation_period'),
			oscillation_amplitude: optNum('oscillation_amplitude'),
			ultimate_gain: optNum('ultimate_gain'),
			consistency_pct: optNum('consistency_pct'),
			asymmetry_ratio: optNum('asymmetry_ratio'),
			hysteresis_correction: optNum('hysteresis_correction'),
			process_gain_K: optNum('process_gain_K'),
			time_constant_tau: optNum('time_constant_tau'),
			dead_time_theta: optNum('dead_time_theta'),
			aggressiveness: optNum('aggressiveness'),
			simc_tau_c: optNum('simc_tau_c'),
			duration: optNum('duration')
		};
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

export async function startAutotune(deviceId: string, params: AutotuneStartParams) {
	// The Start button is only visible after apply or dismiss, both of which
	// already reset the ESP32 to IDLE.  Do NOT send stop here — the ESP32's
	// stop handler unconditionally reverts PID values to pre-autotune originals,
	// which would undo any previously applied autotune or manual PID changes.
	autotuneState.targetTemp = params.targetTemp;
	autotuneState.mode = params.mode ?? 'relay';
	autotuneState.status = { phase: 'HEATING', stepCount: 0, progress: 0 };
	autotuneState.results = null;
	autotuneState.isAutotuning = true;
	await autotuneApi.start(deviceId, params);
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
			const mode = typeof data.mode === 'string' ? data.mode : undefined;
			const totalSteps = typeof data.total_steps === 'number' ? data.total_steps : undefined;
			const effectiveTotalSteps = totalSteps ?? (mode === 'step_response' ? 4 : 12);

			const activePhases = ['HEATING', 'STABILIZING', 'RUNNING', 'ANALYZING',
				'STEP_BASELINE', 'STEP_UP', 'STEP_SETTLE', 'STEP_ANALYZE'];
			if (activePhases.includes(latestPhase)) {
				const stepResponsePhases = ['STEP_BASELINE', 'STEP_UP', 'STEP_SETTLE', 'STEP_ANALYZE'];
				let progress: number;
				if (latestPhase === 'ANALYZING' || latestPhase === 'STEP_ANALYZE') {
					progress = 95;
				} else if (stepResponsePhases.includes(latestPhase)) {
					const phaseIdx = stepResponsePhases.indexOf(latestPhase);
					progress = Math.min(Math.round(((phaseIdx + 1) / (stepResponsePhases.length + 1)) * 100), 95);
				} else {
					progress = Math.min(Math.round((stepCount / effectiveTotalSteps) * 100), 95);
				}
				autotuneState.status = { phase: latestPhase, stepCount, progress, mode, totalSteps: effectiveTotalSteps };
				autotuneState.isAutotuning = true;
				autotuneState.targetTemp = typeof data.target_temperature === 'number' ? data.target_temperature : null;
				if (mode === 'relay' || mode === 'step_response') {
					autotuneState.mode = mode;
				}
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

				const optNum = (key: string): number | undefined => {
					const v = data[key];
					return typeof v === 'number' ? v : undefined;
				};
				const optStr = (key: string): string | undefined => {
					const v = data[key];
					return typeof v === 'string' ? v : undefined;
				};

				autotuneState.results = {
					Kp, Ki, Kd,
					mode: optStr('mode'),
					tuning_method: optStr('tuning_method'),
					quality: optStr('quality') as AutotuneResults['quality'],
					original_kp: optNum('original_kp'),
					original_ki: optNum('original_ki'),
					original_kd: optNum('original_kd'),
					oscillation_period: optNum('oscillation_period'),
					oscillation_amplitude: optNum('oscillation_amplitude'),
					ultimate_gain: optNum('ultimate_gain'),
					consistency_pct: optNum('consistency_pct'),
					asymmetry_ratio: optNum('asymmetry_ratio'),
					hysteresis_correction: optNum('hysteresis_correction'),
					process_gain_K: optNum('process_gain_K'),
					time_constant_tau: optNum('time_constant_tau'),
					dead_time_theta: optNum('dead_time_theta'),
					aggressiveness: optNum('aggressiveness'),
					simc_tau_c: optNum('simc_tau_c'),
					duration: optNum('duration')
				};
			}
		} catch {
			// No results available — that's fine
		}
	}
}
