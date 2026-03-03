<script lang="ts">
	import Chart, { type ECOption } from '$lib/components/Chart.svelte';

	interface TransposerPoint {
		time_seconds: number;
		target_temp: number;
		fan_speed: number | null;
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
			return {
				time_seconds: newTime,
				target_temp: Math.max(0, newTemp),
				fan_speed: p.fan_speed
			};
		});
	});

	// Simulated RoR for transposed curve
	function computeSimpleRoR(pts: TransposerPoint[]): [number, number][] {
		if (pts.length < 2) return [];
		const result: [number, number][] = [];
		for (let i = 0; i < pts.length - 1; i++) {
			const dt = pts[i + 1].time_seconds - pts[i].time_seconds;
			if (dt > 0) {
				const ror = ((pts[i + 1].target_temp - pts[i].target_temp) / dt) * 60;
				const midTime = (pts[i].time_seconds + pts[i + 1].time_seconds) / 2;
				result.push([midTime, Math.round(ror * 10) / 10]);
			}
		}
		return result;
	}

	// Chart option for preview
	let chartOption = $derived.by<ECOption>(() => {
		const original = [...points].sort((a, b) => a.time_seconds - b.time_seconds);
		const originalData = original.map((p) => [p.time_seconds, p.target_temp]);
		const transposedData = transposed.map((p) => [p.time_seconds, p.target_temp]);
		const rorData = computeSimpleRoR(transposed);

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
		<div style="height: 250px;" class="mb-4">
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
