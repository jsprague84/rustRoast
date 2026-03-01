<script lang="ts">
	import { Play, Square, Zap } from 'lucide-svelte';
	import { deviceId, telemetry } from '$lib/stores/telemetry.js';
	import { sessions, type RoastSession } from '$lib/api/client.js';
	import { notifications } from '$lib/stores/notifications.js';
	import {
		autotuneState,
		startAutotune,
		stopAutotune,
		initAutotuneSubscription,
		destroyAutotuneSubscription,
		fetchLatestAutotune
	} from '$lib/stores/autotune.svelte.js';

	const phaseLabel = $derived(
		autotuneState.status?.phase
			? autotuneState.status.phase.charAt(0) + autotuneState.status.phase.slice(1).toLowerCase()
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
				return 'text-blue-400';
			case 'COMPLETE':
				return 'text-green-400';
			case 'ERROR':
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
				return 'bg-amber-500';
			case 'RUNNING':
				return 'bg-green-500';
			case 'ANALYZING':
				return 'bg-blue-500';
			case 'COMPLETE':
				return 'bg-green-500';
			case 'ERROR':
				return 'bg-red-500';
			default:
				return 'bg-amber-500';
		}
	});

	let targetTemp = $state(200);
	let loading = $state(false);
	let hasActiveSession = $state(false);

	const canStart = $derived(
		!autotuneState.isAutotuning && !hasActiveSession && !!$deviceId && !loading
	);

	// Check for active roast sessions
	$effect(() => {
		checkActiveSessions();
	});

	// Init autotune WebSocket subscription and fetch latest status on device connect
	$effect(() => {
		initAutotuneSubscription();
		const id = $deviceId;
		if (id) {
			fetchLatestAutotune(id);
		}
		return () => {
			destroyAutotuneSubscription();
		};
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
			await startAutotune($deviceId, targetTemp);
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
					Temperature for relay test oscillation (150–250°C)
				</p>
			</div>

			{#if autotuneState.isAutotuning}
				<!-- Progress display -->
				{#if autotuneState.status}
					<div class="space-y-2 rounded-md border border-border bg-background p-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium {phaseColor}">{phaseLabel}</span>
							{#if autotuneState.status.phase === 'RUNNING' && autotuneState.status.stepCount > 0}
								<span class="text-xs text-muted-foreground">
									Step {autotuneState.status.stepCount} of ~15
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

						{#if autotuneState.status.phase === 'ERROR' && autotuneState.status.error}
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
		</div>
	{/if}
</div>
