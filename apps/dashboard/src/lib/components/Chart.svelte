<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as echarts from 'echarts/core';
	import { LineChart } from 'echarts/charts';
	import {
		GridComponent,
		TitleComponent,
		TooltipComponent,
		MarkLineComponent,
		GraphicComponent
	} from 'echarts/components';
	import { CanvasRenderer } from 'echarts/renderers';
	import type { ECharts, ComposeOption } from 'echarts/core';
	import type { LineSeriesOption } from 'echarts/charts';
	import type {
		GridComponentOption,
		TitleComponentOption,
		TooltipComponentOption,
		MarkLineComponentOption,
		GraphicComponentOption
	} from 'echarts/components';

	export type ECOption = ComposeOption<
		| LineSeriesOption
		| GridComponentOption
		| TitleComponentOption
		| TooltipComponentOption
		| MarkLineComponentOption
		| GraphicComponentOption
	>;

	echarts.use([LineChart, GridComponent, TitleComponent, TooltipComponent, MarkLineComponent, GraphicComponent, CanvasRenderer]);

	let { option = $bindable<ECOption>({}) }: { option: ECOption } = $props();

	let container: HTMLDivElement;
	let chart: ECharts | null = null;
	let resizeObserver: ResizeObserver | null = null;

	onMount(() => {
		chart = echarts.init(container);
		chart.setOption(option);

		resizeObserver = new ResizeObserver(() => {
			chart?.resize();
		});
		resizeObserver.observe(container);
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		chart?.dispose();
		chart = null;
	});

	$effect(() => {
		if (chart && option) {
			chart.setOption(option, { replaceMerge: ['series', 'graphic'] });
		}
	});

	export function getInstance(): ECharts | null {
		return chart;
	}
</script>

<div bind:this={container} class="h-full w-full" style="min-height: 300px;"></div>
