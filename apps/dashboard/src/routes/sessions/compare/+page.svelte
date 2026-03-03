<script lang="ts">
	import type { PageProps } from './$types';
	import Chart, { type ECOption } from '$lib/components/Chart.svelte';
	import { sessions, events as eventsApi, type RoastEvent } from '$lib/api/client.js';
	import type { SessionWithTelemetry } from '$lib/types/session.js';

	let { data }: PageProps = $props();

	const COLORS = ['#f59e0b', '#60a5fa', '#34d399', '#f87171', '#a78bfa'];

	interface LoadedSession {
		session: SessionWithTelemetry;
		events: RoastEvent[];
		color: string;
	}

	let loaded = $state<LoadedSession[]>([]);
	let loading = $state(true);
	let alignMode = $state<'time' | 'event'>('time');
	let alignEvent = $state('first_crack_start');

	// Load sessions on mount
	$effect(() => {
		const ids = data.ids;
		if (ids.length === 0) {
			loading = false;
			return;
		}
		loading = true;
		Promise.all(
			ids.slice(0, 5).map(async (id, i) => {
				const [session, sessionEvents] = await Promise.all([
					sessions.get(id),
					eventsApi.list(id)
				]);
				return { session, events: sessionEvents, color: COLORS[i % COLORS.length] } as LoadedSession;
			})
		)
			.then((results) => {
				loaded = results;
			})
			.catch(() => {
				loaded = [];
			})
			.finally(() => {
				loading = false;
			});
	});

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatDuration(secs: number): string {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function getEventOffset(ls: LoadedSession, eventType: string): number {
		const evt = ls.events.find((e) => e.event_type === eventType);
		return evt ? evt.elapsed_seconds : 0;
	}

	let chartOption = $derived.by<ECOption>(() => {
		if (loaded.length === 0) return {};

		const series: ECOption['series'] = [];

		for (const ls of loaded) {
			const telemetry = ls.session.telemetry ?? [];
			if (telemetry.length === 0) continue;

			const offset = alignMode === 'event' ? getEventOffset(ls, alignEvent) : 0;

			const btData = telemetry
				.filter((t) => t.bean_temp != null)
				.map((t) => [t.elapsed_seconds - offset, t.bean_temp]);

			// Compute RoR from telemetry
			const rorData: [number, number][] = [];
			for (let i = 1; i < telemetry.length; i++) {
				const dt = telemetry[i].elapsed_seconds - telemetry[i - 1].elapsed_seconds;
				if (dt > 0 && telemetry[i].bean_temp != null && telemetry[i - 1].bean_temp != null) {
					const ror = ((telemetry[i].bean_temp! - telemetry[i - 1].bean_temp!) / dt) * 60;
					rorData.push([telemetry[i].elapsed_seconds - offset, Math.round(ror * 10) / 10]);
				}
			}

			series.push({
				name: `${ls.session.name} BT`,
				type: 'line',
				data: btData,
				itemStyle: { color: ls.color },
				lineStyle: { width: 2, color: ls.color },
				showSymbol: false
			});

			series.push({
				name: `${ls.session.name} RoR`,
				type: 'line',
				data: rorData,
				yAxisIndex: 1,
				itemStyle: { color: ls.color },
				lineStyle: { width: 1, type: 'dashed', color: ls.color },
				showSymbol: false
			});
		}

		return {
			animation: false,
			grid: { left: 55, right: 55, top: 40, bottom: 40 },
			legend: {
				show: true,
				top: 5,
				textStyle: { color: '#9ca3af', fontSize: 10 }
			},
			tooltip: {
				trigger: 'axis',
				backgroundColor: 'rgba(30, 30, 30, 0.95)',
				borderColor: 'rgba(255, 255, 255, 0.1)',
				textStyle: { color: '#e5e7eb' }
			},
			xAxis: {
				type: 'value',
				name: alignMode === 'event' ? `Time from ${alignEvent}` : 'Time',
				nameTextStyle: { color: '#9ca3af' },
				axisLabel: {
					color: '#9ca3af',
					formatter: (val: number) => {
						const abs = Math.abs(val);
						const m = Math.floor(abs / 60);
						const s = Math.round(abs % 60);
						const sign = val < 0 ? '-' : '';
						return `${sign}${m}:${s.toString().padStart(2, '0')}`;
					}
				},
				axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
				splitLine: { show: false }
			},
			yAxis: [
				{
					type: 'value',
					name: 'Temp (°C)',
					nameTextStyle: { color: '#9ca3af' },
					axisLabel: { color: '#9ca3af' },
					axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
					splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
				},
				{
					type: 'value',
					name: 'RoR (°C/min)',
					nameTextStyle: { color: '#9ca3af' },
					axisLabel: { color: '#9ca3af' },
					axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
					splitLine: { show: false }
				}
			],
			series
		};
	});
</script>

<svelte:head>
	<title>Compare Sessions | rustRoast</title>
</svelte:head>

<div class="space-y-4">
	<div class="flex items-center gap-4">
		<a href="/sessions" class="text-sm text-amber-400 hover:underline">&larr; Sessions</a>
		<h1 class="text-2xl font-bold text-foreground">Compare Sessions</h1>
	</div>

	{#if loading}
		<div class="py-12 text-center text-muted-foreground">Loading sessions...</div>
	{:else if loaded.length === 0}
		<div class="py-12 text-center">
			<p class="text-muted-foreground">No sessions selected for comparison.</p>
			<a href="/sessions" class="mt-2 inline-block text-sm text-amber-400 hover:underline">Select sessions to compare</a>
		</div>
	{:else}
		<!-- Alignment controls -->
		<div class="flex items-center gap-3">
			<span class="text-sm font-medium text-muted-foreground">Align:</span>
			<button
				onclick={() => (alignMode = 'time')}
				class="rounded-md px-3 py-1 text-sm {alignMode === 'time' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:text-foreground'}"
			>
				By Time
			</button>
			<button
				onclick={() => (alignMode = 'event')}
				class="rounded-md px-3 py-1 text-sm {alignMode === 'event' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:text-foreground'}"
			>
				By Event
			</button>
			{#if alignMode === 'event'}
				<select
					bind:value={alignEvent}
					class="rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground"
				>
					<option value="drying_end">Drying End</option>
					<option value="first_crack_start">First Crack</option>
					<option value="drop">Drop</option>
				</select>
			{/if}
		</div>

		<!-- Chart -->
		<div class="rounded-lg border border-border bg-card p-4" style="height: 450px;">
			<Chart option={chartOption} />
		</div>

		<!-- Summary table -->
		<div class="overflow-x-auto rounded-lg border border-border bg-card">
			<table class="min-w-full text-sm">
				<thead>
					<tr class="border-b border-border">
						<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground"></th>
						<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Session</th>
						<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
						<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Bean</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Duration</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Max Temp</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-muted-foreground">DTR</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Weight Loss</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-muted-foreground">AUC</th>
					</tr>
				</thead>
				<tbody>
					{#each loaded as ls}
						<tr class="border-b border-border/50">
							<td class="px-4 py-2">
								<span class="inline-block h-3 w-3 rounded-full" style="background-color: {ls.color}"></span>
							</td>
							<td class="px-4 py-2 text-foreground">{ls.session.name}</td>
							<td class="px-4 py-2 text-muted-foreground">{formatDate(ls.session.created_at)}</td>
							<td class="px-4 py-2 text-muted-foreground">{ls.session.bean_origin ?? '—'}</td>
							<td class="px-4 py-2 text-right text-muted-foreground">
								{ls.session.total_time_seconds != null ? formatDuration(ls.session.total_time_seconds) : '—'}
							</td>
							<td class="px-4 py-2 text-right text-muted-foreground">
								{ls.session.max_temp != null ? `${ls.session.max_temp.toFixed(1)}°C` : '—'}
							</td>
							<td class="px-4 py-2 text-right text-muted-foreground">
								{ls.session.development_time_ratio != null ? `${ls.session.development_time_ratio.toFixed(1)}%` : '—'}
							</td>
							<td class="px-4 py-2 text-right text-muted-foreground">
								{ls.session.weight_loss_pct != null ? `${ls.session.weight_loss_pct.toFixed(1)}%` : '—'}
							</td>
							<td class="px-4 py-2 text-right text-muted-foreground">
								{ls.session.auc_value != null ? `${Math.round(ls.session.auc_value)}` : '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
