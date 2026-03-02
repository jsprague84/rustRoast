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
			// Progress: round((7/15)*100) = 47
			expect(autotuneState.status?.progress).toBe(47);
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

			// (20/15)*100 = 133, capped at 95
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

			expect(autotuneState.results).toEqual({ Kp: 2.5, Ki: 0.005, Kd: 1.2 });
		});

		it('falls back to Kp/Ki/Kd when recommended_ fields are absent', () => {
			handleAutotuneEvent({
				autotune: { type: 'results', data: { Kp: 3.0, Ki: 0.01, Kd: 2.0 } }
			});

			expect(autotuneState.results).toEqual({ Kp: 3.0, Ki: 0.01, Kd: 2.0 });
		});

		it('defaults missing PID values to 0', () => {
			handleAutotuneEvent({
				autotune: { type: 'results', data: {} }
			});

			expect(autotuneState.results).toEqual({ Kp: 0, Ki: 0, Kd: 0 });
		});
	});

	// --- Actions ---

	describe('actions', () => {
		it('startAutotune sets initial state and calls API', async () => {
			mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

			await startAutotune('device-1', 200);

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
	});
});
