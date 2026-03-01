<script lang="ts">
	import type { RoastEvent } from '$lib/api/client.js';
	import type { SessionTelemetryPoint } from '$lib/types/session.js';

	interface Props {
		telemetry: SessionTelemetryPoint[];
		events: RoastEvent[];
	}

	let { telemetry, events }: Props = $props();

	let keyTemps = $derived.by(() => {
		if (!telemetry.length) return { charge: null, turningPoint: null, fc: null, drop: null };

		const charge = telemetry[0]?.bean_temp ?? null;
		let turningPoint = charge;
		for (const t of telemetry) {
			if (t.bean_temp != null && (turningPoint == null || t.bean_temp < turningPoint))
				turningPoint = t.bean_temp;
			else break;
		}
		const fcEvent = events.find((e) => e.event_type === 'first_crack_start');
		const dropEvent = events.find((e) => e.event_type === 'drop');
		return {
			charge,
			turningPoint,
			fc: fcEvent?.temperature ?? null,
			drop: dropEvent?.temperature ?? null
		};
	});

	function fmt(val: number | null | undefined): string {
		return val != null ? `${val.toFixed(1)}°C` : 'N/A';
	}
</script>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
	<div class="rounded-lg border border-border bg-card p-3 text-center">
		<div class="text-xs text-muted-foreground">Charge</div>
		<div class="text-lg font-bold text-foreground">{fmt(keyTemps.charge)}</div>
	</div>
	<div class="rounded-lg border border-border bg-card p-3 text-center">
		<div class="text-xs text-muted-foreground">Turning Point</div>
		<div class="text-lg font-bold text-foreground">{fmt(keyTemps.turningPoint)}</div>
	</div>
	<div class="rounded-lg border border-border bg-card p-3 text-center">
		<div class="text-xs text-muted-foreground">FC Temp</div>
		<div class="text-lg font-bold text-foreground">{fmt(keyTemps.fc)}</div>
	</div>
	<div class="rounded-lg border border-border bg-card p-3 text-center">
		<div class="text-xs text-muted-foreground">Drop Temp</div>
		<div class="text-lg font-bold text-foreground">{fmt(keyTemps.drop)}</div>
	</div>
</div>
