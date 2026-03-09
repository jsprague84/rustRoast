<script lang="ts">
	import { Play, Square, Zap, Check, X } from 'lucide-svelte';
	import { deviceId, telemetry } from '$lib/stores/telemetry.js';
	import { sessions, type RoastSession } from '$lib/api/client.js';
	import { notifications } from '$lib/stores/notifications.js';
	import {
		autotuneState,
		startAutotune,
		stopAutotune,
		applyResults,
		dismissResults,
		initAutotuneSubscription,
		destroyAutotuneSubscription,
		fetchLatestAutotune,
		type AutotuneStartParams
	} from '$lib/stores/autotune.svelte.js';

	const phaseLabelMap: Record<string, string> = {
		HEATING: 'Heating',
		STABILIZING: 'Stabilizing',
		RUNNING: 'Running',
		ANALYZING: 'Analyzing',
		COMPLETE: 'Complete',
		ERROR: 'Error',
		FAILED: 'Failed',
		STEP_BASELINE: 'Baseline',
		STEP_UP: 'Step Up',
		STEP_SETTLE: 'Settling',
		STEP_ANALYZE: 'Analyzing'
	};

	const phaseLabel = $derived(
		autotuneState.status?.phase
			? (phaseLabelMap[autotuneState.status.phase] ?? autotuneState.status.phase.charAt(0) + autotuneState.status.phase.slice(1).toLowerCase())
			: ''
	);

	const phaseColor = $derived.by(() => {
		const phase = autotuneState.status?.phase;
		if (!phase) return 'text-muted-foreground';
		switch (phase) {
			case 'HEATING':
			case 'STABILIZING':
				return 'text-amber-400';
			case 'RUNNING':
				return 'text-green-400';
			case 'ANALYZING':
			case 'STEP_SETTLE':
			case 'STEP_ANALYZE':
				return 'text-blue-400';
			case 'STEP_BASELINE':
				return 'text-cyan-400';
			case 'STEP_UP':
				return 'text-amber-400';
			case 'COMPLETE':
				return 'text-green-400';
			case 'ERROR':
			case 'FAILED':
				return 'text-red-400';
			default:
				return 'text-muted-foreground';
		}
	});

	const progressBarColor = $derived.by(() => {
		const phase = autotuneState.status?.phase;
		if (!phase) return 'bg-amber-500';
		switch (phase) {
			case 'HEATING':
			case 'STABILIZING':
			case 'STEP_UP':
				return 'bg-amber-500';
			case 'RUNNING':
				return 'bg-green-500';
			case 'ANALYZING':
			case 'STEP_BASELINE':
			case 'STEP_SETTLE':
			case 'STEP_ANALYZE':
				return 'bg-blue-500';
			case 'COMPLETE':
				return 'bg-green-500';
			case 'ERROR':
			case 'FAILED':
				return 'bg-red-500';
			default:
				return 'bg-amber-500';
		}
	});

	let targetTemp = $state(200);
	let mode = $state<'relay' | 'step_response'>('relay');
	let tuningMethod = $state('tyreus_luyben');
	let aggressivenessVal = $state(1.0);
	let bias = $state(50);
	let amplitude = $state(25);
	let hysteresisVal = $state(1.0);
	let showAdvanced = $state(false);
	let loading = $state(false);
	let hasActiveSession = $state(false);

	const canStart = $derived(
		!autotuneState.isAutotuning && !hasActiveSession && !!$deviceId && !loading
	);

	// Check for active roast sessions (poll every 5s so it clears after session ends)
	$effect(() => {
		checkActiveSessions();
		const interval = setInterval(checkActiveSessions, 5000);
		return () => clearInterval(interval);
	});

	// Init autotune WebSocket subscription (once)
	$effect(() => {
		initAutotuneSubscription();
		return () => {
			destroyAutotuneSubscription();
		};
	});

	// Fetch latest autotune status only once per device (not on every telemetry tick)
	let lastFetchedDevice: string | null = null;
	$effect(() => {
		const id = $deviceId;
		if (id && id !== lastFetchedDevice) {
			lastFetchedDevice = id;
			fetchLatestAutotune(id);
		}
	});

	async function checkActiveSessions() {
		try {
			const allSessions = await sessions.list(undefined, 10);
			hasActiveSession = allSessions.some(
				(s: RoastSession) => s.status === 'active' || s.status === 'paused'
			);
		} catch {
			hasActiveSession = false;
		}
	}

	async function handleStart() {
		if (!$deviceId) return;
		loading = true;
		try {
			const params: AutotuneStartParams = { targetTemp, mode };
			if (mode === 'relay') {
				params.tuningMethod = tuningMethod;
			} else {
				params.aggressiveness = aggressivenessVal;
			}
			// Only send advanced params if they differ from defaults
			if (bias !== 50) params.bias = bias;
			if (amplitude !== 25) params.amplitude = amplitude;
			if (hysteresisVal !== 1.0) params.hysteresis = hysteresisVal;
			await startAutotune($deviceId, params);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to start autotune: ${msg}`, 'error');
		} finally {
			loading = false;
		}
	}

	async function handleStop() {
		if (!$deviceId) return;
		loading = true;
		try {
			await stopAutotune($deviceId);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to stop autotune: ${msg}`, 'error');
		} finally {
			loading = false;
		}
	}

	let applying = $state(false);
	let showTuningDetails = $state(false);

	const qualityBadge = $derived.by(() => {
		const q = autotuneState.results?.quality;
		if (!q) return null;
		switch (q) {
			case 'good': return { label: 'Good', cls: 'bg-green-500/20 text-green-400 border-green-500/30' };
			case 'acceptable': return { label: 'Acceptable', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
			case 'poor': return { label: 'Poor', cls: 'bg-red-500/20 text-red-400 border-red-500/30' };
			case 'fallback': return { label: 'Fallback', cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
			default: return null;
		}
	});

	const tuningMethodLabel = $derived.by(() => {
		const r = autotuneState.results;
		if (!r) return '';
		if (r.mode === 'step_response') return 'SIMC Step Response';
		switch (r.tuning_method) {
			case 'tyreus_luyben': return 'Tyreus-Luyben';
			case 'zn_classic': return 'Z-N Classic';
			case 'zn_some_overshoot': return 'Z-N Some Overshoot';
			case 'zn_no_overshoot': return 'Z-N No Overshoot';
			default: return r.tuning_method ?? '';
		}
	});

	const durationLabel = $derived.by(() => {
		const d = autotuneState.results?.duration;
		if (d == null) return '';
		const m = Math.floor(d / 60);
		const s = Math.round(d % 60);
		return `Completed in ${m}m ${s}s`;
	});

	async function handleApply() {
		if (!$deviceId) return;
		applying = true;
		try {
			await applyResults($deviceId);
			notifications.add('PID parameters applied successfully', 'success');
			dismissResults($deviceId ?? undefined, { skipStop: true });
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to apply PID parameters: ${msg}`, 'error');
		} finally {
			applying = false;
		}
	}

	function handleDiscard() {
		dismissResults($deviceId ?? undefined);
	}
</script>

<div class="rounded-lg border border-border bg-card p-4">
	<div class="mb-3 flex items-center gap-2">
		<Zap class="h-5 w-5 text-amber-500" />
		<h2 class="text-lg font-semibold text-foreground">PID Autotune</h2>
	</div>
	<p class="mb-4 text-sm text-muted-foreground">
		Run a relay feedback test to find optimal PID parameters for your roaster.
	</p>

	{#if !$deviceId}
		<p class="text-sm text-muted-foreground">No device connected. Connect a roaster to use autotune.</p>
	{:else if hasActiveSession}
		<div class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
			A roast session is in progress. Complete or stop the session before running autotune.
		</div>
	{:else}
		<div class="space-y-3">
			<div>
				<label for="autotune-target" class="mb-1 block text-sm font-medium text-foreground">
					Target Temperature (°C)
				</label>
				<input
					id="autotune-target"
					type="number"
					min={150}
					max={250}
					step={5}
					bind:value={targetTemp}
					disabled={autotuneState.isAutotuning}
					class="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
				/>
				<p class="mt-1 text-xs text-muted-foreground">
					Temperature for auto-tune test (150–250°C)
				</p>
			</div>

			<!-- Mode selector -->
			<fieldset>
				<legend class="mb-1 block text-sm font-medium text-foreground">Auto-Tune Mode</legend>
				<div class="flex gap-3">
					<label class="flex items-center gap-1.5 text-sm text-foreground">
						<input type="radio" bind:group={mode} value="relay" disabled={autotuneState.isAutotuning}
							class="accent-amber-500" />
						Relay (Oscillation)
					</label>
					<label class="flex items-center gap-1.5 text-sm text-foreground">
						<input type="radio" bind:group={mode} value="step_response" disabled={autotuneState.isAutotuning}
							class="accent-amber-500" />
						Step Response (SIMC)
					</label>
				</div>
			</fieldset>

			<!-- Mode-specific options -->
			{#if mode === 'relay'}
				<div>
					<label for="autotune-method" class="mb-1 block text-sm font-medium text-foreground">
						Tuning Method
					</label>
					<select
						id="autotune-method"
						bind:value={tuningMethod}
						disabled={autotuneState.isAutotuning}
						class="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
					>
						<option value="tyreus_luyben">Tyreus-Luyben (Conservative)</option>
						<option value="zn_classic">Z-N Classic (Aggressive)</option>
						<option value="zn_some_overshoot">Z-N Some Overshoot</option>
						<option value="zn_no_overshoot">Z-N No Overshoot</option>
					</select>
				</div>
			{:else}
				<div>
					<label for="autotune-aggressiveness" class="mb-1 block text-sm font-medium text-foreground">
						Aggressiveness
					</label>
					<input
						id="autotune-aggressiveness"
						type="number"
						min={0.1}
						max={2.0}
						step={0.1}
						bind:value={aggressivenessVal}
						disabled={autotuneState.isAutotuning}
						class="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
					/>
					<p class="mt-1 text-xs text-muted-foreground">
						Lower = more conservative, Higher = faster response (0.1–2.0)
					</p>
				</div>
			{/if}

			<!-- Advanced parameters (collapsible) -->
			<div>
				<button
					type="button"
					onclick={() => showAdvanced = !showAdvanced}
					disabled={autotuneState.isAutotuning}
					class="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
				>
					{showAdvanced ? '▾' : '▸'} Advanced Parameters
				</button>
				{#if showAdvanced}
					<div class="mt-2 space-y-2 rounded-md border border-border bg-background p-3">
						<div>
							<label for="autotune-bias" class="mb-1 block text-xs font-medium text-foreground">
								Bias ({bias}%)
							</label>
							<input
								id="autotune-bias"
								type="range"
								min={10}
								max={90}
								step={1}
								bind:value={bias}
								disabled={autotuneState.isAutotuning}
								class="w-full accent-amber-500"
							/>
							<p class="text-xs text-muted-foreground">Relay center point (10–90%)</p>
						</div>
						<div>
							<label for="autotune-amplitude" class="mb-1 block text-xs font-medium text-foreground">
								Amplitude ({amplitude}%)
							</label>
							<input
								id="autotune-amplitude"
								type="range"
								min={5}
								max={45}
								step={1}
								bind:value={amplitude}
								disabled={autotuneState.isAutotuning}
								class="w-full accent-amber-500"
							/>
							<p class="text-xs text-muted-foreground">Relay output swing (5–45%)</p>
						</div>
						<div>
							<label for="autotune-hysteresis" class="mb-1 block text-xs font-medium text-foreground">
								Hysteresis ({hysteresisVal.toFixed(1)}°C)
							</label>
							<input
								id="autotune-hysteresis"
								type="number"
								min={0.1}
								max={5.0}
								step={0.1}
								bind:value={hysteresisVal}
								disabled={autotuneState.isAutotuning}
								class="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
							/>
							<p class="text-xs text-muted-foreground">Relay switching deadband (0.1–5.0°C)</p>
						</div>
					</div>
				{/if}
			</div>

			{#if autotuneState.isAutotuning}
				<!-- Progress display -->
				{#if autotuneState.status}
					<div class="space-y-2 rounded-md border border-border bg-background p-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium {phaseColor}">{phaseLabel}</span>
							{#if autotuneState.status.phase === 'RUNNING' && autotuneState.status.stepCount > 0}
								<span class="text-xs text-muted-foreground">
									Step {autotuneState.status.stepCount} of {autotuneState.status.totalSteps ?? 12}
								</span>
							{/if}
						</div>

						<!-- Progress bar -->
						<div class="h-2 w-full overflow-hidden rounded-full bg-border">
							<div
								class="h-full rounded-full transition-all duration-500 {progressBarColor}"
								style="width: {autotuneState.status.progress}%"
							></div>
						</div>

						<!-- BT and target readings -->
						<div class="flex justify-between text-xs text-muted-foreground">
							<span>
								BT: {$telemetry?.beanTemp != null
									? `${$telemetry.beanTemp.toFixed(1)}°C`
									: '—'}
							</span>
							<span>
								Target: {autotuneState.targetTemp != null
									? `${autotuneState.targetTemp}°C`
									: '—'}
							</span>
						</div>

						{#if (autotuneState.status.phase === 'ERROR' || autotuneState.status.phase === 'FAILED') && autotuneState.status.error}
							<div class="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-400">
								{autotuneState.status.error}
							</div>
						{/if}
					</div>
				{/if}

				<button
					onclick={handleStop}
					disabled={loading}
					class="flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
				>
					<Square class="h-4 w-4" />
					{loading ? 'Stopping...' : 'Stop Autotune'}
				</button>
			{:else}
				<button
					onclick={handleStart}
					disabled={!canStart}
					class="flex w-full items-center justify-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
				>
					<Play class="h-4 w-4" />
					{loading ? 'Starting...' : 'Start Autotune'}
				</button>
			{/if}

			{#if autotuneState.results && !autotuneState.isAutotuning}
				<!-- Autotune results with quality metrics and comparison table -->
				<div class="space-y-3 rounded-md border border-green-500/30 bg-green-500/10 p-3">
					<!-- Quality badge and method -->
					{#if qualityBadge}
						<span class="inline-block rounded-full border px-2 py-0.5 text-xs font-medium {qualityBadge.cls}">
							{qualityBadge.label}
						</span>
					{/if}
					{#if tuningMethodLabel}
						<p class="text-xs text-muted-foreground">Method: {tuningMethodLabel}</p>
					{/if}
					{#if durationLabel}
						<p class="text-xs text-muted-foreground">{durationLabel}</p>
					{/if}

					<h3 class="text-sm font-semibold text-green-400">Recommended PID Parameters</h3>

					<table class="w-full text-sm">
						<thead>
							<tr class="text-xs text-muted-foreground">
								<th class="pb-1 text-left font-medium">Parameter</th>
								<th class="pb-1 text-right font-medium">Original</th>
								<th class="pb-1 text-right font-medium">Recommended</th>
							</tr>
						</thead>
						<tbody class="text-foreground">
							<tr>
								<td class="py-0.5">Kp</td>
								<td class="py-0.5 text-right text-muted-foreground">
									{autotuneState.results.original_kp != null ? autotuneState.results.original_kp.toFixed(2) : ($telemetry?.Kp != null ? $telemetry.Kp.toFixed(2) : '—')}
								</td>
								<td class="py-0.5 text-right font-medium text-green-400">
									{autotuneState.results.Kp.toFixed(2)}
								</td>
							</tr>
							<tr>
								<td class="py-0.5">Ki</td>
								<td class="py-0.5 text-right text-muted-foreground">
									{autotuneState.results.original_ki != null ? autotuneState.results.original_ki.toFixed(4) : ($telemetry?.Ki != null ? $telemetry.Ki.toFixed(4) : '—')}
								</td>
								<td class="py-0.5 text-right font-medium text-green-400">
									{autotuneState.results.Ki.toFixed(4)}
								</td>
							</tr>
							<tr>
								<td class="py-0.5">Kd</td>
								<td class="py-0.5 text-right text-muted-foreground">
									{autotuneState.results.original_kd != null ? autotuneState.results.original_kd.toFixed(2) : ($telemetry?.Kd != null ? $telemetry.Kd.toFixed(2) : '—')}
								</td>
								<td class="py-0.5 text-right font-medium text-green-400">
									{autotuneState.results.Kd.toFixed(2)}
								</td>
							</tr>
						</tbody>
					</table>

					<!-- Tuning details (collapsible) -->
					{#if autotuneState.results.mode !== 'step_response' && (autotuneState.results.oscillation_period != null || autotuneState.results.ultimate_gain != null)}
						<div>
							<button
								type="button"
								onclick={() => showTuningDetails = !showTuningDetails}
								class="text-xs text-muted-foreground hover:text-foreground"
							>
								{showTuningDetails ? '▾' : '▸'} Tuning Details
							</button>
							{#if showTuningDetails}
								<div class="mt-1 space-y-1 text-xs text-muted-foreground">
									{#if autotuneState.results.oscillation_period != null}
										<p>Oscillation Period: {autotuneState.results.oscillation_period.toFixed(1)}s</p>
									{/if}
									{#if autotuneState.results.oscillation_amplitude != null}
										<p>Oscillation Amplitude: {autotuneState.results.oscillation_amplitude.toFixed(2)}°C</p>
									{/if}
									{#if autotuneState.results.ultimate_gain != null}
										<p>Ultimate Gain (Ku): {autotuneState.results.ultimate_gain.toFixed(3)}</p>
									{/if}
									{#if autotuneState.results.consistency_pct != null}
										<p>Consistency: {autotuneState.results.consistency_pct.toFixed(1)}%</p>
									{/if}
									{#if autotuneState.results.asymmetry_ratio != null}
										<p>Asymmetry Ratio: {autotuneState.results.asymmetry_ratio.toFixed(3)}</p>
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					{#if autotuneState.results.mode === 'step_response' && (autotuneState.results.process_gain_K != null || autotuneState.results.time_constant_tau != null)}
						<div>
							<button
								type="button"
								onclick={() => showTuningDetails = !showTuningDetails}
								class="text-xs text-muted-foreground hover:text-foreground"
							>
								{showTuningDetails ? '▾' : '▸'} Process Model (FOPDT)
							</button>
							{#if showTuningDetails}
								<div class="mt-1 space-y-1 text-xs text-muted-foreground">
									{#if autotuneState.results.process_gain_K != null}
										<p>Process Gain K: {autotuneState.results.process_gain_K.toFixed(4)}</p>
									{/if}
									{#if autotuneState.results.time_constant_tau != null}
										<p>Time Constant τ: {autotuneState.results.time_constant_tau.toFixed(1)}s</p>
									{/if}
									{#if autotuneState.results.dead_time_theta != null}
										<p>Dead Time θ: {autotuneState.results.dead_time_theta.toFixed(1)}s</p>
									{/if}
									{#if autotuneState.results.aggressiveness != null}
										<p>Aggressiveness: {autotuneState.results.aggressiveness.toFixed(2)}</p>
									{/if}
									{#if autotuneState.results.simc_tau_c != null}
										<p>Closed-loop τc: {autotuneState.results.simc_tau_c.toFixed(1)}s</p>
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					<div class="flex gap-2">
						<button
							onclick={handleApply}
							disabled={applying}
							class="flex flex-1 items-center justify-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
						>
							<Check class="h-4 w-4" />
							{applying ? 'Applying...' : 'Apply'}
						</button>
						<button
							onclick={handleDiscard}
							disabled={applying}
							class="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50"
						>
							<X class="h-4 w-4" />
							Discard
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
