<script lang="ts">
	import * as echarts from 'echarts/core';
	import { RadarChart } from 'echarts/charts';
	import { TooltipComponent, TitleComponent } from 'echarts/components';
	import { CanvasRenderer } from 'echarts/renderers';
	import { cupping, type CreateCuppingRequest } from '$lib/api/client.js';
	import { notifications } from '$lib/stores/notifications.js';

	echarts.use([RadarChart, TooltipComponent, TitleComponent, CanvasRenderer]);

	const SCA_ATTRIBUTES = [
		{ key: 'fragrance_aroma', label: 'Fragrance/Aroma' },
		{ key: 'flavor', label: 'Flavor' },
		{ key: 'aftertaste', label: 'Aftertaste' },
		{ key: 'acidity', label: 'Acidity' },
		{ key: 'body', label: 'Body' },
		{ key: 'balance', label: 'Balance' },
		{ key: 'uniformity', label: 'Uniformity' },
		{ key: 'clean_cup', label: 'Clean Cup' },
		{ key: 'sweetness', label: 'Sweetness' },
		{ key: 'overall', label: 'Overall' }
	] as const;

	let { sessionId }: { sessionId: string } = $props();

	let scores = $state<Record<string, number>>(
		Object.fromEntries(SCA_ATTRIBUTES.map((a) => [a.key, 6.0]))
	);
	let notes = $state('');
	let saving = $state(false);
	let hasExisting = $state(false);
	let loaded = $state(false);

	let totalScore = $derived(
		SCA_ATTRIBUTES.reduce((sum, a) => sum + (scores[a.key] ?? 0), 0)
	);

	let chartContainer: HTMLDivElement;
	let chart: echarts.ECharts | null = null;

	// Initialize chart and load data
	$effect(() => {
		if (!chartContainer) return;
		chart = echarts.init(chartContainer);
		updateChart();

		// Load existing cupping data
		cupping.get(sessionId).then((existing) => {
			if (existing) {
				hasExisting = true;
				notes = existing.notes ?? '';
				for (const attr of existing.attributes) {
					if (attr.attribute_name in scores) {
						scores[attr.attribute_name] = attr.score;
					}
				}
			}
			loaded = true;
		}).catch(() => {
			loaded = true;
		});

		return () => {
			chart?.dispose();
			chart = null;
		};
	});

	function updateChart() {
		if (!chart) return;
		chart.setOption({
			animation: false,
			radar: {
				indicator: SCA_ATTRIBUTES.map((a) => ({ name: a.label, max: 10 })),
				shape: 'polygon' as const,
				splitNumber: 5,
				axisName: {
					color: '#9ca3af',
					fontSize: 11
				},
				splitLine: {
					lineStyle: { color: 'rgba(255,255,255,0.08)' }
				},
				splitArea: { show: false },
				axisLine: {
					lineStyle: { color: 'rgba(255,255,255,0.12)' }
				}
			},
			series: [
				{
					type: 'radar',
					data: [
						{
							value: SCA_ATTRIBUTES.map((a) => scores[a.key] ?? 0),
							name: 'Cupping Score',
							lineStyle: { color: '#f59e0b', width: 2 },
							itemStyle: { color: '#f59e0b' },
							areaStyle: { color: 'rgba(245, 158, 11, 0.15)' }
						}
					],
					symbol: 'circle',
					symbolSize: 6
				}
			]
		});
	}

	$effect(() => {
		// Track scores reactively to update chart
		const _ = SCA_ATTRIBUTES.map((a) => scores[a.key]);
		updateChart();
	});

	async function handleSave() {
		saving = true;
		try {
			const req: CreateCuppingRequest = {
				scoring_framework: 'sca',
				notes: notes || undefined,
				attributes: SCA_ATTRIBUTES.map((a) => ({
					name: a.key,
					score: scores[a.key] ?? 0
				}))
			};
			await cupping.create(sessionId, req);
			hasExisting = true;
			notifications.add('Cupping scores saved', 'success');
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			notifications.add(`Failed to save cupping: ${msg}`, 'error');
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!confirm('Delete cupping scores? This cannot be undone.')) return;
		try {
			await cupping.delete(sessionId);
			hasExisting = false;
			scores = Object.fromEntries(SCA_ATTRIBUTES.map((a) => [a.key, 6.0]));
			notes = '';
			notifications.add('Cupping scores deleted', 'success');
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			notifications.add(`Failed to delete cupping: ${msg}`, 'error');
		}
	}
</script>

<div class="space-y-4">
	<div class="grid gap-4 md:grid-cols-2">
		<!-- Radar Chart -->
		<div class="flex items-center justify-center">
			<div bind:this={chartContainer} class="h-72 w-full" style="min-height: 288px;"></div>
		</div>

		<!-- Score Inputs -->
		<div class="space-y-2">
			{#each SCA_ATTRIBUTES as attr}
				<div class="flex items-center gap-3">
					<label for="cupping-{attr.key}" class="w-32 text-xs font-medium text-muted-foreground">{attr.label}</label>
					<input
						id="cupping-{attr.key}"
						type="range"
						min="0"
						max="10"
						step="0.25"
						bind:value={scores[attr.key]}
						class="flex-1"
					/>
					<span class="w-10 text-right text-sm font-mono text-foreground">{scores[attr.key].toFixed(2)}</span>
				</div>
			{/each}

			<div class="mt-2 flex items-center justify-between border-t border-border pt-2">
				<span class="text-sm font-medium text-muted-foreground">Total Score</span>
				<span class="text-lg font-bold text-amber-400">{totalScore.toFixed(2)}</span>
			</div>
		</div>
	</div>

	<!-- Notes -->
	<div>
		<label for="cupping-notes" class="block text-sm font-medium text-foreground">Tasting Notes</label>
		<textarea
			id="cupping-notes"
			bind:value={notes}
			rows={3}
			placeholder="Describe flavors, aromas, and impressions..."
			class="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
		></textarea>
	</div>

	<!-- Actions -->
	<div class="flex items-center gap-2">
		<button
			onclick={handleSave}
			disabled={saving}
			class="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
		>
			{saving ? 'Saving...' : hasExisting ? 'Update Scores' : 'Save Scores'}
		</button>
		{#if hasExisting}
			<button
				onclick={handleDelete}
				class="rounded-md border border-border px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/15"
			>
				Delete
			</button>
		{/if}
	</div>
</div>
