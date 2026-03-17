<script lang="ts">
	import { telemetry, rateOfRise } from '$lib/stores/telemetry.js';
	import { profileState, interpolateTarget } from '$lib/stores/profile.svelte.js';
	import type { RoastSession } from '$lib/api/client.js';

	let { activeSession }: { activeSession: RoastSession | null } = $props();

	function fmt(val: number | null | undefined, decimals = 1): string {
		if (val == null) return '--';
		return val.toFixed(decimals);
	}

	function fmtDelta(val: number): string {
		const sign = val >= 0 ? '+' : '';
		return `${sign}${val.toFixed(1)}`;
	}

	// Compute profile target and delta on each telemetry tick
	const profileTarget = $derived.by(() => {
		if (!profileState.activeProfile || !activeSession?.start_time || $telemetry?.beanTemp == null)
			return null;
		const elapsedMs = Date.now() - new Date(activeSession.start_time).getTime();
		if (elapsedMs <= 0) return null;
		return interpolateTarget(profileState.activeProfile.points, elapsedMs, 0);
	});

	const delta = $derived(
		profileTarget != null && $telemetry?.beanTemp != null
			? $telemetry.beanTemp - profileTarget
			: null
	);

	const deltaColor = $derived.by(() => {
		if (delta == null) return '';
		const abs = Math.abs(delta);
		if (abs <= 2) return 'text-green-400';
		if (abs <= 5) return 'text-amber-400';
		return 'text-red-400';
	});
</script>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
	<!-- Bean Temperature -->
	<div class="rounded-lg border border-border bg-card p-3">
		<div class="text-xs font-medium text-muted-foreground">Bean Temp</div>
		<div class="mt-1 text-2xl font-bold text-amber-400">
			{fmt($telemetry?.beanTemp)}
			<span class="text-sm font-normal text-muted-foreground">°C</span>
		</div>
	</div>

	<!-- Setpoint -->
	<div class="rounded-lg border border-border bg-card p-3">
		<div class="text-xs font-medium text-muted-foreground">
			SP{#if $telemetry?.controlMode === 1} <span class="text-amber-400">(PID)</span>{/if}
		</div>
		<div class="mt-1 text-2xl font-bold text-orange-400">
			{fmt($telemetry?.setpoint)}
			<span class="text-sm font-normal text-muted-foreground">°C</span>
		</div>
	</div>

	<!-- Environment Temperature -->
	<div class="rounded-lg border border-border bg-card p-3">
		<div class="text-xs font-medium text-muted-foreground">Env Temp</div>
		<div class="mt-1 text-2xl font-bold text-blue-400">
			{fmt($telemetry?.envTemp)}
			<span class="text-sm font-normal text-muted-foreground">°C</span>
		</div>
	</div>

	<!-- Rate of Rise -->
	<div class="rounded-lg border border-border bg-card p-3">
		<div class="text-xs font-medium text-muted-foreground">RoR</div>
		<div class="mt-1 text-2xl font-bold text-emerald-400">
			{fmt($rateOfRise)}
			<span class="text-sm font-normal text-muted-foreground">°C/min</span>
		</div>
	</div>

	<!-- Heater PWM -->
	<div class="rounded-lg border border-border bg-card p-3">
		<div class="text-xs font-medium text-muted-foreground">Heater</div>
		<div class="mt-1 text-2xl font-bold text-red-400">
			{fmt($telemetry?.heaterPWM, 0)}
			<span class="text-sm font-normal text-muted-foreground">%</span>
		</div>
	</div>

	<!-- Fan PWM -->
	<div class="rounded-lg border border-border bg-card p-3">
		<div class="text-xs font-medium text-muted-foreground">Fan</div>
		<div class="mt-1 text-2xl font-bold text-violet-400">
			{fmt($telemetry?.fanPWM, 0)}
			<span class="text-sm font-normal text-muted-foreground">PWM</span>
		</div>
	</div>

	<!-- Profile Delta (shown when profile loaded + session active) -->
	{#if profileState.activeProfile && activeSession && delta != null}
		<div class="rounded-lg border border-border bg-card p-3">
			<div class="text-xs font-medium text-muted-foreground">Delta</div>
			<div class="mt-1 text-2xl font-bold {deltaColor}">
				{fmtDelta(delta)}
				<span class="text-sm font-normal text-muted-foreground">°C</span>
			</div>
		</div>
	{/if}
</div>
