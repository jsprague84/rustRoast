<script lang="ts">
	import Chart, { type ECOption } from './Chart.svelte';
	import { telemetryHistory, rateOfRise } from '$lib/stores/telemetry.js';
	import { landmarkColors, landmarkLabels } from '$lib/constants/landmarks.js';
	import { profileState } from '$lib/stores/profile.svelte.js';
	import { autotuneState } from '$lib/stores/autotune.svelte.js';

	/** Optional landmark annotations to display on the chart. */
	let { landmarks = [] }: { landmarks?: Array<{ type: string; elapsed_seconds: number; temperature?: number }> } = $props();

	function formatTime(ms: number): string {
		const totalSecs = Math.floor(ms / 1000);
		const m = Math.floor(totalSecs / 60);
		const s = totalSecs % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	let chartOption: ECOption = $derived.by(() => {
		const h = $telemetryHistory;
		if (h.length === 0) {
			return {
				title: { text: 'Waiting for telemetry...', left: 'center', top: 'center', textStyle: { color: '#6b7280', fontSize: 16 } },
				xAxis: { type: 'value' },
				yAxis: { type: 'value' },
				series: []
			};
		}

		const startTime = h[0].timestamp;
		const times = h.map((p) => p.timestamp - startTime);
		const btData = h.map((p, i) => [times[i], p.telemetry.beanTemp]);
		const etData = h.map((p, i) => [times[i], p.telemetry.envTemp]);
		const heaterData = h.map((p, i) => [times[i], p.telemetry.heaterPWM]);
		const fanData = h.map((p, i) => [times[i], Math.round(p.telemetry.fanPWM / 2.55)]); // normalize 0-255 to 0-100 for display

		// Calculate RoR per point (30s window)
		const rorData: [number, number | null][] = [];
		for (let i = 0; i < h.length; i++) {
			const windowStart = h[i].timestamp - 30_000;
			const windowIdx = h.findIndex((p) => p.timestamp >= windowStart);
			if (windowIdx < i) {
				const dt = (h[i].timestamp - h[windowIdx].timestamp) / 1000;
				if (dt > 0) {
					const dTemp = h[i].telemetry.beanTemp - h[windowIdx].telemetry.beanTemp;
					rorData.push([times[i], Math.round(((dTemp / dt) * 60) * 10) / 10]);
				} else {
					rorData.push([times[i], null]);
				}
			} else {
				rorData.push([times[i], null]);
			}
		}

		// Build profile overlay data if a profile is loaded
		const activeProfile = profileState.activeProfile;
		const profileData = activeProfile?.points
			?.slice()
			.sort((a, b) => a.time_seconds - b.time_seconds)
			.map((p) => [p.time_seconds * 1000, p.target_temp]) ?? [];

		// Dynamic Y-axis bounds with 10% padding
		const allTemps = h.flatMap((p) => [p.telemetry.beanTemp, p.telemetry.envTemp]);
		if (profileData.length > 0) {
			for (const [, temp] of profileData) {
				allTemps.push(temp);
			}
		}
		if (autotuneState.targetTemp !== null && (autotuneState.isAutotuning || autotuneState.results !== null)) {
			allTemps.push(autotuneState.targetTemp);
		}
		const maxTemp = Math.max(...allTemps);
		const minTemp = Math.min(...allTemps);
		const tempPadding = (maxTemp - minTemp) * 0.1 || 20;

		type MarkLineItem = {
			xAxis?: number;
			yAxis?: number;
			lineStyle: { color: string; type: 'dashed'; width: number };
			label: { formatter: string; fontSize: number; color: string };
		};
		const markLines: MarkLineItem[] = landmarks.map((l) => ({
			xAxis: l.elapsed_seconds * 1000,
			lineStyle: { color: landmarkColors[l.type] ?? '#888', type: 'dashed' as const, width: 1 },
			label: { formatter: landmarkLabels[l.type] ?? l.type, fontSize: 10, color: '#d1d5db' }
		}));

		// Autotune target horizontal line: show when autotuning or results pending
		if ((autotuneState.isAutotuning || autotuneState.results !== null) && autotuneState.targetTemp !== null) {
			markLines.push({
				yAxis: autotuneState.targetTemp,
				lineStyle: { color: '#f97316', type: 'dashed' as const, width: 1.5 },
				label: { formatter: 'AT Target', fontSize: 10, color: '#f97316' }
			});
		}

		const option: ECOption = {
			title: { show: false },
			animation: false,
			grid: { left: 50, right: 60, top: 30, bottom: 40, backgroundColor: 'transparent' },
			tooltip: {
				trigger: 'axis',
				backgroundColor: 'rgba(30, 30, 30, 0.95)',
				borderColor: 'rgba(255, 255, 255, 0.1)',
				textStyle: { color: '#e5e7eb' },
				formatter: (params: unknown) => {
					if (!Array.isArray(params) || params.length === 0) return '';
					const first = params[0] as { value: [number, number] };
					const time = formatTime(first.value[0]);
					let html = `<b>${time}</b><br/>`;
					for (const p of params as Array<{ seriesName: string; value: [number, number]; color: string }>) {
						if (p.value[1] != null) {
							html += `<span style="color:${p.color}">●</span> ${p.seriesName}: ${p.value[1]}<br/>`;
						}
					}
					return html;
				}
			},
			xAxis: {
				type: 'value',
				name: 'Time',
				nameTextStyle: { color: '#9ca3af' },
				axisLabel: { formatter: (val: number) => formatTime(val), color: '#9ca3af' },
				axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
				min: 0,
				splitLine: { show: false }
			},
			yAxis: [
				{
					type: 'value',
					name: 'Temp (°C)',
					nameTextStyle: { color: '#9ca3af' },
					axisLabel: { color: '#9ca3af' },
					axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
					min: Math.floor(minTemp - tempPadding),
					max: Math.ceil(maxTemp + tempPadding),
					splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
				},
				{
					type: 'value',
					name: 'RoR / PWM %',
					nameTextStyle: { color: '#9ca3af' },
					axisLabel: { color: '#9ca3af' },
					axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
					position: 'right',
					min: 0,
					max: 100,
					splitLine: { show: false }
				}
			],
			series: [
				{
					name: 'BT',
					type: 'line',
					data: btData,
					itemStyle: { color: '#f59e0b' },
					lineStyle: { width: 2 },
					showSymbol: false,
					markLine: markLines.length > 0 ? { data: markLines, silent: true } : undefined
				},
				{
					name: 'ET',
					type: 'line',
					data: etData,
					itemStyle: { color: '#60a5fa' },
					lineStyle: { width: 2 },
					showSymbol: false
				},
				{
					name: 'RoR',
					type: 'line',
					yAxisIndex: 1,
					data: rorData,
					itemStyle: { color: '#34d399' },
					lineStyle: { width: 1.5 },
					showSymbol: false
				},
				{
					name: 'Heater',
					type: 'line',
					yAxisIndex: 1,
					data: heaterData,
					itemStyle: { color: '#f87171' },
					lineStyle: { width: 0 },
					areaStyle: { opacity: 0.2 },
					showSymbol: false
				},
				{
					name: 'Fan',
					type: 'line',
					yAxisIndex: 1,
					data: fanData,
					itemStyle: { color: '#a78bfa' },
					lineStyle: { width: 0 },
					areaStyle: { opacity: 0.15 },
					showSymbol: false
				},
				...(profileData.length > 0
					? [
							{
								name: 'Profile',
								type: 'line' as const,
								data: profileData,
								itemStyle: { color: '#a855f7' },
								lineStyle: { type: 'dashed' as const, width: 2 },
								showSymbol: false
							}
						]
					: [])
			]
		};

		return option;
	});
</script>

<div class="h-full w-full" style="min-height: 400px;">
	<Chart option={chartOption} />
</div>
