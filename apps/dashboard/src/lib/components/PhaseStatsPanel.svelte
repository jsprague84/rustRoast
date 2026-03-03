<script lang="ts">
	import type { RoastEvent } from '$lib/api/client.js';

	interface Props {
		events: RoastEvent[];
		totalTimeSeconds: number | null;
		avgRorDrying?: number | null;
		avgRorMaillard?: number | null;
		avgRorDevelopment?: number | null;
	}

	let {
		events,
		totalTimeSeconds,
		avgRorDrying = null,
		avgRorMaillard = null,
		avgRorDevelopment = null
	}: Props = $props();

	interface PhaseStats {
		name: string;
		color: string;
		duration: number | null;
		pct: number | null;
		avgRor: number | null;
		tempRise: number | null;
	}

	function formatDuration(secs: number): string {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	let phases = $derived.by<PhaseStats[]>(() => {
		const find = (t: string) => events.find((e) => e.event_type === t);
		const charge = find('charge');
		const dryEnd = find('drying_end');
		const fcStart = find('first_crack_start');
		const drop = find('drop');
		const total = totalTimeSeconds ?? drop?.elapsed_seconds ?? 0;

		const dryingDur = dryEnd ? dryEnd.elapsed_seconds - (charge?.elapsed_seconds ?? 0) : null;
		const maillardDur = dryEnd && fcStart ? fcStart.elapsed_seconds - dryEnd.elapsed_seconds : null;
		const devDur = fcStart && drop ? drop.elapsed_seconds - fcStart.elapsed_seconds : null;

		const dryingTempRise =
			dryEnd?.temperature != null && charge?.temperature != null
				? dryEnd.temperature - charge.temperature
				: dryEnd?.temperature != null
					? dryEnd.temperature
					: null;
		const maillardTempRise =
			fcStart?.temperature != null && dryEnd?.temperature != null
				? fcStart.temperature - dryEnd.temperature
				: null;
		const devTempRise =
			drop?.temperature != null && fcStart?.temperature != null
				? drop.temperature - fcStart.temperature
				: null;

		function computeRor(
			precomputed: number | null | undefined,
			tempRise: number | null,
			dur: number | null
		): number | null {
			if (precomputed != null) return Math.round(precomputed * 10) / 10;
			if (tempRise != null && dur != null && dur > 0) {
				return Math.round(((tempRise / dur) * 60) * 10) / 10;
			}
			return null;
		}

		return [
			{
				name: 'Drying',
				color: '#22c55e',
				duration: dryingDur,
				pct: dryingDur != null && total ? (dryingDur / total) * 100 : null,
				avgRor: computeRor(avgRorDrying, dryingTempRise, dryingDur),
				tempRise: dryingTempRise != null ? Math.round(dryingTempRise * 10) / 10 : null
			},
			{
				name: 'Maillard',
				color: '#eab308',
				duration: maillardDur,
				pct: maillardDur != null && total ? (maillardDur / total) * 100 : null,
				avgRor: computeRor(avgRorMaillard, maillardTempRise, maillardDur),
				tempRise: maillardTempRise != null ? Math.round(maillardTempRise * 10) / 10 : null
			},
			{
				name: 'Development',
				color: '#92400e',
				duration: devDur,
				pct: devDur != null && total ? (devDur / total) * 100 : null,
				avgRor: computeRor(avgRorDevelopment, devTempRise, devDur),
				tempRise: devTempRise != null ? Math.round(devTempRise * 10) / 10 : null
			}
		];
	});

	let dtr = $derived.by(() => {
		const find = (t: string) => events.find((e) => e.event_type === t);
		const fcStart = find('first_crack_start');
		const drop = find('drop');
		const total = totalTimeSeconds ?? drop?.elapsed_seconds ?? 0;
		if (!fcStart || !total) return null;
		const devTime = (drop?.elapsed_seconds ?? total) - fcStart.elapsed_seconds;
		if (devTime <= 0) return null;
		return Math.round((devTime / total) * 1000) / 10;
	});
</script>

<div class="rounded-lg border border-border bg-card p-4">
	<h3 class="mb-3 text-sm font-semibold text-foreground">Phase Statistics</h3>
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-border">
				<th class="py-1 text-left font-medium text-muted-foreground">Phase</th>
				<th class="py-1 text-right font-medium text-muted-foreground">Duration</th>
				<th class="py-1 text-right font-medium text-muted-foreground">%</th>
				<th class="py-1 text-right font-medium text-muted-foreground">Avg RoR</th>
				<th class="py-1 text-right font-medium text-muted-foreground">&Delta;T</th>
			</tr>
		</thead>
		<tbody>
			{#each phases as phase}
				<tr class="border-b border-border/50">
					<td class="py-1.5">
						<span class="inline-block mr-1.5 h-2.5 w-2.5 rounded-full" style="background-color: {phase.color}"></span>
						<span class="text-foreground">{phase.name}</span>
					</td>
					<td class="py-1.5 text-right text-muted-foreground">
						{phase.duration != null ? formatDuration(Math.round(phase.duration)) : '—'}
					</td>
					<td class="py-1.5 text-right text-muted-foreground">
						{phase.pct != null ? `${phase.pct.toFixed(1)}%` : '—'}
					</td>
					<td class="py-1.5 text-right text-muted-foreground">
						{phase.avgRor != null ? `${phase.avgRor}°/min` : '—'}
					</td>
					<td class="py-1.5 text-right text-muted-foreground">
						{phase.tempRise != null ? `${phase.tempRise > 0 ? '+' : ''}${phase.tempRise}°C` : '—'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if dtr != null}
		<div class="mt-3 flex items-center gap-2 border-t border-border pt-2">
			<span class="text-sm font-semibold text-amber-400">DTR: {dtr}%</span>
			<span class="text-xs text-muted-foreground">(Development Time Ratio)</span>
		</div>
	{/if}
</div>
