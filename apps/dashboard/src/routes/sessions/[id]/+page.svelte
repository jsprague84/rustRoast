<script lang="ts">
	import type { PageProps } from './$types';
	import Chart, { type ECOption } from '$lib/components/Chart.svelte';
	import KeyTemperatures from '$lib/components/KeyTemperatures.svelte';
	import PhaseTimingTable from '$lib/components/PhaseTimingTable.svelte';
	import { landmarkColors, landmarkLabels } from '$lib/constants/landmarks.js';
	import type { SessionTelemetryPoint } from '$lib/types/session.js';

	let { data }: PageProps = $props();

	let sessionData = $derived(data.session);
	let sessionEvents = $derived(data.events);

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
