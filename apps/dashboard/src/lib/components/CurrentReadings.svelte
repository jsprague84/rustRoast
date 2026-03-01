<script lang="ts">
	import { telemetry, rateOfRise } from '$lib/stores/telemetry.js';

	function fmt(val: number | null | undefined, decimals = 1): string {
		if (val == null) return '--';
		return val.toFixed(decimals);
	}
</script>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
	<!-- Bean Temperature -->
	<div class="rounded-lg border border-border bg-card p-3">
		<div class="text-xs font-medium text-muted-foreground">Bean Temp</div>
		<div class="mt-1 text-2xl font-bold text-amber-400">
			{fmt($telemetry?.beanTemp)}
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
</div>
