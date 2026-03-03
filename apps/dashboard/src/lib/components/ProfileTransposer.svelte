<script lang="ts">
	import Chart, { type ECOption } from '$lib/components/Chart.svelte';
	import { fitNaturalCubicSpline, evaluateSplineGrid, evaluateDerivativeGrid } from '$lib/utils/spline.js';

	interface TransposerPoint {
		time_seconds: number;
		target_temp: number;
		fan_speed: number | null;
		target_env_temp: number | null;
	}

	const {
		points,
		onApply,
		onCancel
	}: {
		points: TransposerPoint[];
		onApply: (transformed: TransposerPoint[]) => void;
		onCancel: () => void;
	} = $props();

	let timeScale = $state(1.0);
	let tempShift = $state(0);
	let tempScale = $state(1.0);

	// Compute transposed points
	let transposed = $derived.by(() => {
		const sorted = [...points].sort((a, b) => a.time_seconds - b.time_seconds);
		const meanTemp = sorted.length > 0
			? sorted.reduce((s, p) => s + p.target_temp, 0) / sorted.length
			: 0;

		return sorted.map((p) => {
			const newTime = Math.max(1, Math.round(p.time_seconds * timeScale));
			const scaledTemp = meanTemp + (p.target_temp - meanTemp) * tempScale;
			const newTemp = Math.round((scaledTemp + tempShift) * 10) / 10;

			// Apply same transforms to ET if present
			let newEt: number | null = null;
			if (p.target_env_temp !== null) {
				const scaledEt = meanTemp + (p.target_env_temp - meanTemp) * tempScale;
				newEt = Math.max(0, Math.round((scaledEt + tempShift) * 10) / 10);
			}

			return {
				time_seconds: newTime,
				target_temp: Math.max(0, newTemp),
				fan_speed: p.fan_speed,
				target_env_temp: newEt
			};
		});
	});

	// Chart option for preview
	let chartOption = $derived.by<ECOption>(() => {
		const original = [...points].sort((a, b) => a.time_seconds - b.time_seconds);
		const originalData = original.map((p) => [p.time_seconds, p.target_temp]);

		// Transposed BT spline
		const maxTime = transposed.length > 0 ? transposed[transposed.length - 1].time_seconds : 0;
		const btSpline = fitNaturalCubicSpline(transposed.map((p) => ({ x: p.time_seconds, y: p.target_temp })));
		const transposedData = transposed.length >= 2
			? evaluateSplineGrid(btSpline, 0, maxTime, 2)
			: transposed.map((p): [number, number] => [p.time_seconds, p.target_temp]);

		// Transposed RoR from spline derivative
		const rorData: [number, number][] = transposed.length >= 2
			? evaluateDerivativeGrid(btSpline, 0, maxTime, 5).map(([t, dy]) => [t, Math.round(dy * 60 * 10) / 10])
			: [];

		// ET spline (transposed)
		const etPoints = transposed.filter((p) => p.target_env_temp !== null);
		const hasEtData = etPoints.length >= 2;
		let etCurveData: [number, number][] = [];
		if (hasEtData) {
			const etSpline = fitNaturalCubicSpline(etPoints.map((p) => ({ x: p.time_seconds, y: p.target_env_temp! })));
			etCurveData = evaluateSplineGrid(etSpline, 0, maxTime, 2);
		}

		return {
			animation: false,
			grid: { left: 50, right: 50, top: 35, bottom: 35 },
			legend: {
				show: true,
				top: 5,
				textStyle: { color: '#9ca3af', fontSize: 10 }
			},
			tooltip: { trigger: 'axis' },
			xAxis: {
				type: 'value',
				name: 'Time (s)',
				nameTextStyle: { color: '#9ca3af' },
				axisLabel: {
					color: '#9ca3af',
					formatter: (val: number) => {
						const m = Math.floor(val / 60);
						const s = Math.round(val % 60);
						return `${m}:${s.toString().padStart(2, '0')}`;
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
					name: 'RoR',
					nameTextStyle: { color: '#34d399' },
					axisLabel: { color: '#34d399' },
					axisLine: { lineStyle: { color: '#34d399' } },
					splitLine: { show: false }
				}
			],
			series: [
				{
					name: 'Original',
					type: 'line',
					data: originalData,
					itemStyle: { color: '#6b7280' },
					lineStyle: { width: 1.5, type: 'dashed', color: '#6b7280' },
					showSymbol: false
				},
				{
					name: 'Transposed',
					type: 'line',
					data: transposedData,
					itemStyle: { color: '#f59e0b' },
					lineStyle: { width: 2, color: '#f59e0b' },
					showSymbol: false
				},
				...(hasEtData ? [{
					name: 'Transposed ET',
					type: 'line' as const,
					data: etCurveData,
					itemStyle: { color: '#60a5fa' },
					lineStyle: { width: 1.5, type: 'dashed' as const, color: '#60a5fa' },
					showSymbol: false,
					silent: true
				}] : []),
				{
					name: 'Transposed RoR',
					type: 'line',
					data: rorData,
					yAxisIndex: 1,
					itemStyle: { color: '#34d399' },
					lineStyle: { width: 1, type: 'dashed', color: '#34d399' },
					showSymbol: false,
					silent: true
				}
			]
		};
	});

	function handleApply() {
		onApply(transposed);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
	onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
>
	<div class="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-xl">
		<h2 class="mb-4 text-lg font-semibold text-foreground">Transpose Profile</h2>

		<!-- Controls -->
		<div class="mb-4 grid gap-3 sm:grid-cols-3">
			<div>
				<label for="time-scale" class="mb-1 block text-xs font-medium text-muted-foreground">
					Time Scale ({timeScale.toFixed(2)}x)
				</label>
				<input
					id="time-scale"
					type="range"
					min="0.5"
					max="2.0"
					step="0.05"
					bind:value={timeScale}
					class="w-full"
				/>
				<div class="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
					<span>0.5x (faster)</span>
					<span>2x (slower)</span>
				</div>
			</div>
			<div>
				<label for="temp-shift" class="mb-1 block text-xs font-medium text-muted-foreground">
					Temp Shift ({tempShift > 0 ? '+' : ''}{tempShift}°C)
				</label>
				<input
					id="temp-shift"
					type="range"
					min="-30"
					max="30"
					step="1"
					bind:value={tempShift}
					class="w-full"
				/>
				<div class="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
					<span>-30°C</span>
					<span>+30°C</span>
				</div>
			</div>
			<div>
				<label for="temp-scale" class="mb-1 block text-xs font-medium text-muted-foreground">
					Temp Scale ({tempScale.toFixed(2)}x)
				</label>
				<input
					id="temp-scale"
					type="range"
					min="0.7"
					max="1.3"
					step="0.05"
					bind:value={tempScale}
					class="w-full"
				/>
				<div class="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
					<span>0.7x (less spread)</span>
					<span>1.3x (more spread)</span>
				</div>
			</div>
		</div>

		<!-- Preview chart -->
		<div style="height: 300px;" class="mb-4">
			<Chart option={chartOption} />
		</div>

		<!-- Actions -->
		<div class="flex justify-end gap-2">
			<button
				onclick={onCancel}
				class="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
			>
				Cancel
			</button>
			<button
				onclick={handleApply}
				class="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
			>
				Apply
			</button>
		</div>
	</div>
</div>
