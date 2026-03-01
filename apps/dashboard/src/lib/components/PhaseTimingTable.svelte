<script lang="ts">
	import type { RoastEvent } from '$lib/api/client.js';

	interface Props {
		events: RoastEvent[];
		totalTimeSeconds: number | null;
	}

	let { events, totalTimeSeconds }: Props = $props();

	interface PhaseInfo {
		name: string;
		duration: number | null;
		pct: number | null;
	}

	function formatDuration(secs: number): string {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	let phases = $derived.by<PhaseInfo[]>(() => {
		const find = (t: string) => events.find((e) => e.event_type === t);
		const dryEnd = find('drying_end');
		const fcStart = find('first_crack_start');
		const drop = find('drop');
		const total = totalTimeSeconds ?? drop?.elapsed_seconds ?? 0;

		const dryingDur = dryEnd ? dryEnd.elapsed_seconds : null;
		const maillardDur = dryEnd && fcStart ? fcStart.elapsed_seconds - dryEnd.elapsed_seconds : null;
		const devDur = fcStart && drop ? drop.elapsed_seconds - fcStart.elapsed_seconds : null;

		return [
			{
				name: 'Drying',
				duration: dryingDur,
				pct: dryingDur != null && total ? (dryingDur / total) * 100 : null
			},
			{
				name: 'Maillard',
				duration: maillardDur,
				pct: maillardDur != null && total ? (maillardDur / total) * 100 : null
			},
			{
				name: 'Development',
				duration: devDur,
				pct: devDur != null && total ? (devDur / total) * 100 : null
			}
		];
	});
</script>

<div class="rounded-lg border border-border bg-card p-4">
	<h3 class="mb-3 text-sm font-semibold text-foreground">Phase Timing</h3>
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-border">
				<th class="py-1 text-left font-medium text-muted-foreground">Phase</th>
				<th class="py-1 text-right font-medium text-muted-foreground">Duration</th>
				<th class="py-1 text-right font-medium text-muted-foreground">%</th>
			</tr>
		</thead>
		<tbody>
			{#each phases as phase}
				<tr class="border-b border-border/50">
					<td class="py-1.5 text-foreground">{phase.name}</td>
					<td class="py-1.5 text-right text-muted-foreground">
						{phase.duration != null ? formatDuration(Math.round(phase.duration)) : 'N/A'}
					</td>
					<td class="py-1.5 text-right text-muted-foreground">
						{phase.pct != null ? `${phase.pct.toFixed(1)}%` : 'N/A'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
