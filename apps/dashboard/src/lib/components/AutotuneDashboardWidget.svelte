<script lang="ts">
	import { Zap, Play, Square, Check, X } from 'lucide-svelte';
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
		fetchLatestAutotune
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
		if (!phase) return 'text-amber-400';
		switch (phase) {
			case 'HEATING':
			case 'STABILIZING':
			case 'STEP_UP':
				return 'text-amber-400';
			case 'RUNNING':
				return 'text-green-400';
			case 'ANALYZING':
			case 'STEP_SETTLE':
			case 'STEP_ANALYZE':
				return 'text-blue-400';
			case 'STEP_BASELINE':
				return 'text-cyan-400';
			case 'COMPLETE':
				return 'text-green-400';
			case 'ERROR':
			case 'FAILED':
				return 'text-red-400';
			default:
				return 'text-amber-400';
		}
	});

	const modeIndicator = $derived(
		autotuneState.mode === 'step_response' ? 'Step' : 'Relay'
	);

	const qualityBadge = $derived.by(() => {
		const q = autotuneState.results?.quality;
		if (!q) return null;
		switch (q) {
			case 'good': return { label: 'Good', cls: 'text-green-400' };
			case 'acceptable': return { label: 'Acceptable', cls: 'text-amber-400' };
			case 'poor': return { label: 'Poor', cls: 'text-red-400' };
			case 'fallback': return { label: 'Fallback', cls: 'text-gray-400' };
			default: return null;
		}
	});

	const progressBarColor = $derived.by(() => {
		const phase = autotuneState.status?.phase;
		if (!phase) return 'bg-amber-500';
		switch (phase) {
			case 'RUNNING': return 'bg-green-500';
			case 'ANALYZING':
			case 'STEP_BASELINE':
			case 'STEP_SETTLE':
			case 'STEP_ANALYZE':
				return 'bg-blue-500';
			case 'COMPLETE': return 'bg-green-500';
			case 'ERROR':
			case 'FAILED':
				return 'bg-red-500';
			default: return 'bg-amber-500';
		}
	});

	let targetTemp = $state(200);
	let loading = $state(false);
	let applying = $state(false);
	let hasActiveSession = $state(false);

	const canStart = $derived(
		!autotuneState.isAutotuning && !hasActiveSession && !!$deviceId && !loading
	);

	$effect(() => {
		checkActiveSessions();
		const interval = setInterval(checkActiveSessions, 5000);
		return () => clearInterval(interval);
	});

	$effect(() => {
		initAutotuneSubscription();
		return () => {
			destroyAutotuneSubscription();
		};
	});

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
			await startAutotune($deviceId, { targetTemp });
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
</script>

<div class="rounded-lg border border-border bg-card p-3">
	<!-- Header -->
	<div class="mb-2 flex items-center gap-2">
		<Zap class="h-4 w-4 text-amber-500" />
		<h3 class="text-sm font-semibold text-foreground">PID Autotune</h3>
	</div>

	{#if !$deviceId}
		<p class="text-xs text-muted-foreground">No device connected.</p>
	{:else if hasActiveSession && !autotuneState.isAutotuning}
		<p class="text-xs text-amber-400">Unavailable during active session.</p>
	{:else if autotuneState.results && !autotuneState.isAutotuning}
		<!-- Results state -->
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<p class="text-xs font-medium text-green-400">Recommended PID</p>
				{#if qualityBadge}
					<span class="text-xs {qualityBadge.cls}">({qualityBadge.label})</span>
				{/if}
			</div>
			<div class="flex gap-3 text-xs text-muted-foreground">
				<span>Kp: <span class="text-green-400">{autotuneState.results.Kp?.toFixed(2) ?? '—'}</span></span>
				<span>Ki: <span class="text-green-400">{autotuneState.results.Ki?.toFixed(4) ?? '—'}</span></span>
				<span>Kd: <span class="text-green-400">{autotuneState.results.Kd?.toFixed(2) ?? '—'}</span></span>
			</div>
			<div class="flex gap-2">
				<button
					onclick={handleApply}
					disabled={applying}
					class="flex flex-1 items-center justify-center gap-1 rounded-md bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
				>
					<Check class="h-3 w-3" />
					{applying ? 'Applying...' : 'Apply'}
				</button>
				<button
					onclick={() => dismissResults($deviceId ?? undefined)}
					disabled={applying}
					class="flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground hover:bg-background disabled:opacity-50"
				>
					<X class="h-3 w-3" />
					Discard
				</button>
			</div>
		</div>
	{:else if autotuneState.isAutotuning}
		<!-- Active state -->
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="flex items-center gap-1.5">
					<span class="text-xs font-medium {phaseColor}">{phaseLabel}</span>
					<span class="text-xs text-muted-foreground">({modeIndicator})</span>
				</span>
				{#if autotuneState.status && autotuneState.status.stepCount > 0}
					<span class="text-xs text-muted-foreground">
						Step {autotuneState.status.stepCount}/{autotuneState.status.totalSteps ?? 12}
					</span>
				{/if}
			</div>

			{#if autotuneState.status}
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-border">
					<div
						class="h-full rounded-full transition-all duration-500 {progressBarColor}"
						style="width: {autotuneState.status.progress}%"
					></div>
				</div>
			{/if}

			<div class="flex justify-between text-xs text-muted-foreground">
				<span>
					BT: {$telemetry?.beanTemp != null ? `${$telemetry.beanTemp.toFixed(1)}°C` : '—'}
				</span>
				<span>
					Target: {autotuneState.targetTemp != null ? `${autotuneState.targetTemp}°C` : '—'}
				</span>
			</div>

			<button
				onclick={handleStop}
				disabled={loading}
				class="flex w-full items-center justify-center gap-1 rounded-md bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
			>
				<Square class="h-3 w-3" />
				{loading ? 'Stopping...' : 'Stop Autotune'}
			</button>
		</div>
	{:else}
		<!-- Idle state -->
		<div class="flex items-center gap-2">
			<div class="flex items-center gap-1">
				<input
					type="number"
					min={150}
					max={250}
					step={5}
					bind:value={targetTemp}
					aria-label="Autotune target temperature"
					class="w-16 rounded-md border border-border bg-input px-2 py-1 text-xs text-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
				/>
				<span class="text-xs text-muted-foreground">°C</span>
			</div>
			<button
				onclick={handleStart}
				disabled={!canStart}
				class="flex flex-1 items-center justify-center gap-1 rounded-md bg-amber-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
			>
				<Play class="h-3 w-3" />
				{loading ? 'Starting...' : 'Start'}
			</button>
		</div>
	{/if}
</div>
