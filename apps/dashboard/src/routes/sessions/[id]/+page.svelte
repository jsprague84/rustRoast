<script lang="ts">
	import type { PageProps } from './$types';
	import { goto } from '$app/navigation';
	import Chart, { type ECOption } from '$lib/components/Chart.svelte';
	import KeyTemperatures from '$lib/components/KeyTemperatures.svelte';
	import PhaseTimingTable from '$lib/components/PhaseTimingTable.svelte';
	import { landmarkColors, landmarkLabels } from '$lib/constants/landmarks.js';
	import type { SessionTelemetryPoint } from '$lib/types/session.js';
	import { sessions } from '$lib/api/client.js';
	import type { ProfileWithPoints } from '$lib/api/client.js';
	import { notifications } from '$lib/stores/notifications.js';

	let { data }: PageProps = $props();

	let sessionData = $derived(data.session);
	let sessionEvents = $derived(data.events);

	async function handleDelete() {
		if (!confirm('Delete this session? This cannot be undone.')) return;
		try {
			await sessions.delete(sessionData.id);
			notifications.add('Session deleted', 'success');
			goto('/sessions');
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			notifications.add(`Failed to delete session: ${msg}`, 'error');
		}
	}

	function handleSaveAsProfile() {
		const telemetry = sessionData.telemetry ?? [];
		if (!telemetry.length) {
			notifications.add('No telemetry data to create a profile from', 'warning');
			return;
		}

		// Decimate to ~1 point per 30s if there are many points
		const interval = 30;
		let decimated: SessionTelemetryPoint[];
		if (telemetry.length > 60) {
			decimated = [];
			let nextTime = 0;
			for (const pt of telemetry) {
				if (pt.elapsed_seconds >= nextTime) {
					decimated.push(pt);
					nextTime = pt.elapsed_seconds + interval;
				}
			}
			// Always include the last point
			const last = telemetry[telemetry.length - 1];
			if (decimated[decimated.length - 1] !== last) {
				decimated.push(last);
			}
		} else {
			decimated = telemetry;
		}

		const points = decimated
			.filter((t) => t.bean_temp != null)
			.map((t) => ({
				id: '',
				time_seconds: t.elapsed_seconds,
				target_temp: t.bean_temp!,
				fan_speed: t.fan_pwm != null ? Math.round(t.fan_pwm / 2.55) : null,
				notes: null
			}));

		const firstTemp = points[0]?.target_temp ?? null;
		const lastTemp = points[points.length - 1]?.target_temp ?? null;

		const fromSession: ProfileWithPoints = {
			id: '',
			name: `${sessionData.name} (from session)`,
			description: null,
			target_total_time: sessionData.total_time_seconds ?? null,
			target_end_temp: lastTemp,
			charge_temp: firstTemp,
			created_at: '',
			points
		};

		sessionStorage.setItem('rustroast_profile_from_session', JSON.stringify(fromSession));
		goto('/profiles/new');
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString();
	}

	function formatDuration(secs: number): string {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	// Chart option from historical telemetry
	let chartOption = $derived.by<ECOption>(() => {
		const telemetry = sessionData?.telemetry ?? [];
		if (!telemetry.length) return { title: { text: 'No telemetry data', left: 'center', top: 'center', textStyle: { color: '#6b7280' } } };

		const times = telemetry.map((t: SessionTelemetryPoint) => t.elapsed_seconds * 1000);
		const btData = telemetry.map((t: SessionTelemetryPoint, i: number) => [times[i], t.bean_temp]);
		const etData = telemetry.map((t: SessionTelemetryPoint, i: number) => [times[i], t.env_temp]);
		const heaterData = telemetry.map((t: SessionTelemetryPoint, i: number) => [times[i], t.heater_pwm]);
		const fanData = telemetry.map((t: SessionTelemetryPoint, i: number) => [times[i], t.fan_pwm != null ? Math.round(t.fan_pwm / 2.55) : null]);

		const allTemps = telemetry.flatMap((t: SessionTelemetryPoint) => [t.bean_temp, t.env_temp].filter((v): v is number => v != null));
		const maxTemp = Math.max(...allTemps);
		const minTemp = Math.min(...allTemps);
		const padding = (maxTemp - minTemp) * 0.1 || 20;

		const markLines = sessionEvents.map((e: { event_type: string; elapsed_seconds: number }) => ({
			xAxis: e.elapsed_seconds * 1000,
			lineStyle: { color: landmarkColors[e.event_type] ?? '#888', type: 'dashed' as const, width: 1 },
			label: { formatter: landmarkLabels[e.event_type] ?? e.event_type, fontSize: 10, color: '#d1d5db' }
		}));

		return {
			animation: false,
			grid: { left: 50, right: 60, top: 30, bottom: 40 },
			tooltip: {
				trigger: 'axis',
				backgroundColor: 'rgba(30, 30, 30, 0.95)',
				borderColor: 'rgba(255, 255, 255, 0.1)',
				textStyle: { color: '#e5e7eb' }
			},
			xAxis: {
				type: 'value',
				name: 'Time',
				nameTextStyle: { color: '#9ca3af' },
				axisLabel: {
					color: '#9ca3af',
					formatter: (val: number) => {
						const s = Math.floor(val / 1000);
						return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
					}
				},
				axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
				splitLine: { show: false }
			},
			yAxis: [
				{
					type: 'value', name: 'Temp (°C)',
					nameTextStyle: { color: '#9ca3af' },
					axisLabel: { color: '#9ca3af' },
					axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
					min: Math.floor(minTemp - padding), max: Math.ceil(maxTemp + padding),
					splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
				},
				{
					type: 'value', name: 'PWM %', position: 'right',
					nameTextStyle: { color: '#9ca3af' },
					axisLabel: { color: '#9ca3af' },
					axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
					min: 0, max: 100, splitLine: { show: false }
				}
			],
			series: [
				{ name: 'BT', type: 'line', data: btData, itemStyle: { color: '#f59e0b' }, lineStyle: { width: 2 }, showSymbol: false, markLine: markLines.length ? { data: markLines, silent: true } : undefined },
				{ name: 'ET', type: 'line', data: etData, itemStyle: { color: '#60a5fa' }, lineStyle: { width: 2 }, showSymbol: false },
				{ name: 'Heater', type: 'line', yAxisIndex: 1, data: heaterData, itemStyle: { color: '#f87171' }, lineStyle: { width: 0 }, areaStyle: { opacity: 0.2 }, showSymbol: false },
				{ name: 'Fan', type: 'line', yAxisIndex: 1, data: fanData, itemStyle: { color: '#a78bfa' }, lineStyle: { width: 0 }, areaStyle: { opacity: 0.15 }, showSymbol: false }
			]
		};
	});
</script>

<svelte:head>
	<title>Session Detail | rustRoast</title>
</svelte:head>

<div class="space-y-4">
		<div class="flex items-center gap-4">
			<a href="/sessions" class="text-sm text-amber-400 hover:underline">&larr; Sessions</a>
			<h1 class="text-2xl font-bold text-foreground">{sessionData.name}</h1>
			<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium
				{sessionData.status === 'completed' ? 'bg-green-500/15 text-green-400' : 'bg-muted text-muted-foreground'}">
				{sessionData.status}
			</span>
			<div class="ml-auto flex items-center gap-2">
				<button
					onclick={handleSaveAsProfile}
					class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent"
					title="Save as profile"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
					Save as Profile
				</button>
				<button
					onclick={handleDelete}
					class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/15"
					title="Delete session"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
					Delete
				</button>
			</div>
		</div>

		<!-- Metadata -->
		<div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
			<span>Date: {formatDate(sessionData.created_at)}</span>
			{#if sessionData.bean_origin}<span>Bean: {sessionData.bean_origin}</span>{/if}
			{#if sessionData.green_weight}<span>Weight: {sessionData.green_weight}g</span>{/if}
			{#if sessionData.total_time_seconds}<span>Duration: {formatDuration(sessionData.total_time_seconds)}</span>{/if}
		</div>

		<!-- Chart -->
		<div class="rounded-lg border border-border bg-card p-4" style="height: 400px;">
			<Chart option={chartOption} />
		</div>

		<!-- Key Temperatures -->
		<KeyTemperatures telemetry={sessionData.telemetry ?? []} events={sessionEvents} />

		<!-- Phase Timing -->
		<PhaseTimingTable events={sessionEvents} totalTimeSeconds={sessionData.total_time_seconds ?? null} />
	</div>
