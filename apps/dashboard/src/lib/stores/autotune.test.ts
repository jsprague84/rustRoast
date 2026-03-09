import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- fetch mock (must be before module imports that use fetch) ---

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

import {
	autotuneState,
	handleAutotuneEvent,
	startAutotune,
	stopAutotune,
	dismissResults
} from './autotune.svelte.js';

function resetAutotuneState() {
	autotuneState.status = null;
	autotuneState.results = null;
	autotuneState.isAutotuning = false;
	autotuneState.targetTemp = null;
	autotuneState.mode = 'relay';
}

describe('autotune store', () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	afterEach(() => {
		resetAutotuneState();
	});

	// --- handleAutotuneEvent status transitions ---

	describe('handleAutotuneEvent status transitions', () => {
		it('ignores null events', () => {
			handleAutotuneEvent(null);
			expect(autotuneState.status).toBeNull();
		});

		it('transitions to HEATING phase', () => {
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'HEATING', current_step: 0 } }
			});

			expect(autotuneState.status?.phase).toBe('HEATING');
			expect(autotuneState.isAutotuning).toBe(true);
			expect(autotuneState.status?.progress).toBe(0);
		});

		it('transitions through STABILIZING phase', () => {
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'STABILIZING', current_step: 0 } }
			});

			expect(autotuneState.status?.phase).toBe('STABILIZING');
			expect(autotuneState.isAutotuning).toBe(true);
		});

		it('transitions to RUNNING phase with step count and progress', () => {
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'RUNNING', current_step: 7 } }
			});

			expect(autotuneState.status?.phase).toBe('RUNNING');
			expect(autotuneState.status?.stepCount).toBe(7);
			expect(autotuneState.isAutotuning).toBe(true);
			// Progress: round((7/12)*100) = 58 (default totalSteps=12)
			expect(autotuneState.status?.progress).toBe(58);
		});

		it('transitions to ANALYZING phase at 95% progress', () => {
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'ANALYZING', current_step: 15 } }
			});

			expect(autotuneState.status?.phase).toBe('ANALYZING');
			expect(autotuneState.status?.progress).toBe(95);
			expect(autotuneState.isAutotuning).toBe(true);
		});

		it('transitions to COMPLETE phase at 100% and stops autotuning', () => {
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'COMPLETE', current_step: 15 } }
			});

			expect(autotuneState.status?.phase).toBe('COMPLETE');
			expect(autotuneState.status?.progress).toBe(100);
			expect(autotuneState.isAutotuning).toBe(false);
		});

		it('transitions to ERROR phase and stops autotuning', () => {
			handleAutotuneEvent({
				autotune: {
					type: 'status',
					data: { phase: 'ERROR', current_step: 0, error: 'Temperature sensor failed' }
				}
			});

			expect(autotuneState.status?.phase).toBe('ERROR');
			expect(autotuneState.status?.error).toBe('Temperature sensor failed');
			expect(autotuneState.isAutotuning).toBe(false);
		});

		it('caps progress at 95% during RUNNING phase', () => {
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'RUNNING', current_step: 20 } }
			});

			// (20/12)*100 = 167, capped at 95
			expect(autotuneState.status?.progress).toBe(95);
		});

		it('normalizes phase to uppercase', () => {
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'running', current_step: 5 } }
			});

			expect(autotuneState.status?.phase).toBe('RUNNING');
		});

		it('falls back to step_count when current_step is absent', () => {
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'RUNNING', step_count: 7 } }
			});

			expect(autotuneState.status?.stepCount).toBe(7);
		});

		it('handles full idle → heating → running → complete lifecycle', () => {
			// Initially idle
			expect(autotuneState.isAutotuning).toBe(false);

			// Heating
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'HEATING', current_step: 0 } }
			});
			expect(autotuneState.isAutotuning).toBe(true);
			expect(autotuneState.status?.phase).toBe('HEATING');

			// Running with progress
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'RUNNING', current_step: 10 } }
			});
			expect(autotuneState.isAutotuning).toBe(true);
			expect(autotuneState.status?.phase).toBe('RUNNING');
			expect(autotuneState.status?.stepCount).toBe(10);

			// Complete
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'COMPLETE', current_step: 15 } }
			});
			expect(autotuneState.isAutotuning).toBe(false);
			expect(autotuneState.status?.phase).toBe('COMPLETE');
			expect(autotuneState.status?.progress).toBe(100);
		});
	});

	// --- handleAutotuneEvent result parsing ---

	describe('handleAutotuneEvent result parsing', () => {
		it('parses recommended_kp/ki/kd from results event', () => {
			handleAutotuneEvent({
				autotune: { type: 'results', data: { recommended_kp: 2.5, recommended_ki: 0.005, recommended_kd: 1.2 } }
			});

			expect(autotuneState.results?.Kp).toBe(2.5);
			expect(autotuneState.results?.Ki).toBe(0.005);
			expect(autotuneState.results?.Kd).toBe(1.2);
		});

		it('falls back to Kp/Ki/Kd when recommended_ fields are absent', () => {
			handleAutotuneEvent({
				autotune: { type: 'results', data: { Kp: 3.0, Ki: 0.01, Kd: 2.0 } }
			});

			expect(autotuneState.results?.Kp).toBe(3.0);
			expect(autotuneState.results?.Ki).toBe(0.01);
			expect(autotuneState.results?.Kd).toBe(2.0);
		});

		it('defaults missing PID values to 0', () => {
			handleAutotuneEvent({
				autotune: { type: 'results', data: {} }
			});

			expect(autotuneState.results?.Kp).toBe(0);
			expect(autotuneState.results?.Ki).toBe(0);
			expect(autotuneState.results?.Kd).toBe(0);
		});
	});

	// --- Actions ---

	describe('actions', () => {
		it('startAutotune sets initial state and calls API', async () => {
			mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

			await startAutotune('device-1', { targetTemp: 200 });

			expect(autotuneState.isAutotuning).toBe(true);
			expect(autotuneState.targetTemp).toBe(200);
			expect(autotuneState.status?.phase).toBe('HEATING');
			expect(autotuneState.status?.stepCount).toBe(0);
			expect(autotuneState.results).toBeNull();
		});

		it('stopAutotune clears state and calls API', async () => {
			// Set up running state
			autotuneState.isAutotuning = true;
			autotuneState.targetTemp = 200;
			autotuneState.status = { phase: 'RUNNING', stepCount: 5, progress: 33 };

			mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

			await stopAutotune('device-1');

			expect(autotuneState.isAutotuning).toBe(false);
			expect(autotuneState.status).toBeNull();
			expect(autotuneState.targetTemp).toBeNull();
		});

		it('dismissResults clears results, status, and targetTemp', () => {
			autotuneState.results = { Kp: 2.5, Ki: 0.005, Kd: 1.2 };
			autotuneState.status = { phase: 'COMPLETE', stepCount: 15, progress: 100 };
			autotuneState.targetTemp = 200;

			dismissResults();

			expect(autotuneState.results).toBeNull();
			expect(autotuneState.status).toBeNull();
			expect(autotuneState.targetTemp).toBeNull();
		});

		it('startAutotune passes full params', async () => {
			mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

			await startAutotune('device-1', {
				targetTemp: 200,
				mode: 'relay',
				tuningMethod: 'tyreus_luyben',
				bias: 55,
				amplitude: 30,
				hysteresis: 1.5,
				aggressiveness: 0.8
			});

			expect(autotuneState.isAutotuning).toBe(true);
			expect(autotuneState.targetTemp).toBe(200);
			expect(autotuneState.mode).toBe('relay');

			// Verify fetch was called with all params in the body
			const fetchCall = mockFetch.mock.calls[0];
			const body = JSON.parse(fetchCall[1]?.body as string);
			expect(body.target_temperature).toBe(200);
			expect(body.mode).toBe('relay');
			expect(body.tuning_method).toBe('tyreus_luyben');
			expect(body.bias).toBe(55);
			expect(body.amplitude).toBe(30);
			expect(body.hysteresis).toBe(1.5);
			expect(body.aggressiveness).toBe(0.8);
		});
	});

	// --- Step response phase tests ---

	describe('step response phases', () => {
		it('parses step response status phases as active', () => {
			const stepPhases = ['STEP_BASELINE', 'STEP_UP', 'STEP_SETTLE', 'STEP_ANALYZE'];
			for (const phase of stepPhases) {
				handleAutotuneEvent({
					autotune: { type: 'status', data: { phase, current_step: 0 } }
				});
				expect(autotuneState.isAutotuning).toBe(true);
				expect(autotuneState.status?.phase).toBe(phase);
			}
		});

		it('parses FAILED phase as inactive', () => {
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'FAILED', current_step: 0, error: 'Timeout' } }
			});
			expect(autotuneState.isAutotuning).toBe(false);
			expect(autotuneState.status?.phase).toBe('FAILED');
			expect(autotuneState.status?.error).toBe('Timeout');
		});

		it('parses mode from status messages', () => {
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'RUNNING', current_step: 5, mode: 'step_response' } }
			});
			expect(autotuneState.status?.mode).toBe('step_response');
			expect(autotuneState.mode).toBe('step_response');
		});

		it('uses total_steps for progress calculation', () => {
			handleAutotuneEvent({
				autotune: { type: 'status', data: { phase: 'RUNNING', current_step: 5, total_steps: 10 } }
			});
			// Progress: round((5/10)*100) = 50
			expect(autotuneState.status?.progress).toBe(50);
			expect(autotuneState.status?.totalSteps).toBe(10);
		});
	});

	// --- Extended results parsing ---

	describe('extended results parsing', () => {
		it('parses extended results with quality metrics', () => {
			handleAutotuneEvent({
				autotune: {
					type: 'results',
					data: {
						recommended_kp: 5.0, recommended_ki: 0.1, recommended_kd: 3.0,
						tuning_method: 'tyreus_luyben',
						quality: 'good',
						oscillation_period: 45.2,
						consistency_pct: 97.5,
						mode: 'relay'
					}
				}
			});

			expect(autotuneState.results?.Kp).toBe(5.0);
			expect(autotuneState.results?.tuning_method).toBe('tyreus_luyben');
			expect(autotuneState.results?.quality).toBe('good');
			expect(autotuneState.results?.oscillation_period).toBe(45.2);
			expect(autotuneState.results?.consistency_pct).toBe(97.5);
			expect(autotuneState.results?.mode).toBe('relay');
		});

		it('parses step response results with FOPDT model', () => {
			handleAutotuneEvent({
				autotune: {
					type: 'results',
					data: {
						recommended_kp: 3.2, recommended_ki: 0.05, recommended_kd: 2.1,
						mode: 'step_response',
						process_gain_K: 0.85,
						time_constant_tau: 120.5,
						dead_time_theta: 8.3,
						aggressiveness: 1.0,
						simc_tau_c: 16.3,
						quality: 'acceptable'
					}
				}
			});

			expect(autotuneState.results?.process_gain_K).toBe(0.85);
			expect(autotuneState.results?.time_constant_tau).toBe(120.5);
			expect(autotuneState.results?.dead_time_theta).toBe(8.3);
			expect(autotuneState.results?.aggressiveness).toBe(1.0);
			expect(autotuneState.results?.simc_tau_c).toBe(16.3);
			expect(autotuneState.results?.quality).toBe('acceptable');
			expect(autotuneState.results?.mode).toBe('step_response');
		});
	});
});
