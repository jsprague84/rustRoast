<script lang="ts">
	import { goto } from '$app/navigation';
	import Chart, { type ECOption } from '$lib/components/Chart.svelte';
	import { profiles, type CreateProfileRequest, type ProfileWithPoints } from '$lib/api/client.js';
	import { notifications } from '$lib/stores/notifications.js';
	import { Trash2, Table, LineChart, ArrowRightLeft } from 'lucide-svelte';
	import type { GraphicComponentOption } from 'echarts/components';
	import ProfileTransposer from '$lib/components/ProfileTransposer.svelte';
	import { fitNaturalCubicSpline, evaluateSplineGrid, evaluateDerivativeGrid } from '$lib/utils/spline.js';

	interface DesignerPoint {
		time_seconds: number;
		target_temp: number;
		fan_speed: number | null;
		target_env_temp: number | null;
	}

	const SYMBOL_SIZE = 14;

	// The designer works on an independent snapshot of the initial profile,
	// not a live reactive binding — intentionally capture-once.
	const { initialProfile = null }: { initialProfile?: ProfileWithPoints | null } = $props();

	// svelte-ignore state_referenced_locally
	const profileId = initialProfile?.id ?? null;

	// svelte-ignore state_referenced_locally
	let name = $state(initialProfile?.name ?? '');
	// svelte-ignore state_referenced_locally
	let description = $state(initialProfile?.description ?? '');
	// svelte-ignore state_referenced_locally
	let chargeTemp = $state<number | undefined>(initialProfile?.charge_temp ?? undefined);
	// svelte-ignore state_referenced_locally
	let targetEndTemp = $state<number | undefined>(initialProfile?.target_end_temp ?? undefined);
	// svelte-ignore state_referenced_locally
	let points = $state<DesignerPoint[]>(
		initialProfile?.points
			? [...initialProfile.points]
					.sort((a, b) => a.time_seconds - b.time_seconds)
					.map((p) => ({
						time_seconds: p.time_seconds,
						target_temp: p.target_temp,
						fan_speed: p.fan_speed,
						target_env_temp: p.target_env_temp ?? null
					}))
			: []
	);
	let selectedIndex = $state<number | null>(null);
	let viewMode = $state<'chart' | 'table'>('chart');
	let saving = $state(false);
	let dragging = $state(false);
	let chartReady = $state(false);
	let showTransposer = $state(false);

	let chartComponent: ReturnType<typeof Chart> | undefined = $state();

	// Sort points helper
	function sortedPoints(): DesignerPoint[] {
		return [...points].sort((a, b) => a.time_seconds - b.time_seconds);
	}

	// Add point
	function addPoint(timeSec: number, temp: number) {
		const newPoint: DesignerPoint = {
			time_seconds: Math.round(timeSec),
			target_temp: Math.round(temp * 10) / 10,
			fan_speed: null,
			target_env_temp: null
		};
		points.push(newPoint);
		points.sort((a, b) => a.time_seconds - b.time_seconds);
		selectedIndex = points.findIndex(
			(p) => p.time_seconds === newPoint.time_seconds && p.target_temp === newPoint.target_temp
		);
	}

	// Delete selected point
	function deleteSelected() {
		if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= points.length) return;
		points.splice(selectedIndex, 1);
		selectedIndex = null;
	}

	// Handle keyboard delete
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Delete' && selectedIndex !== null) {
			deleteSelected();
		}
	}

	// Chart click handler setup
	let chartHandlersAttached = false;

	$effect(() => {
		if (!chartComponent || chartHandlersAttached) return;
		const instance = chartComponent.getInstance();
		if (!instance) return;

		// Click on blank area (zrender level) to add a new point.
		// We must ignore clicks that land on a graphic element (existing point handle)
		// and also ignore clicks that are the "mouseup" of a drag gesture.
		instance.getZr().on('click', (params: { target?: unknown; offsetX: number; offsetY: number }) => {
			if (params.target) return; // clicked on a graphic element or series symbol
			if (dragging) { dragging = false; return; }
			const dataPoint = instance.convertFromPixel('grid', [params.offsetX, params.offsetY]);
			if (dataPoint) {
				const [timeSec, temp] = dataPoint as number[];
				if (timeSec >= 0 && temp >= 0 && temp <= 350) {
					addPoint(timeSec, temp);
				}
			}
		});

		chartHandlersAttached = true;
		// Trigger a re-computation of chartOption now that the instance is ready
		// for convertToPixel/convertFromPixel calls
		chartReady = true;
	});

	// Compute axis ranges that always give convertFromPixel a valid mapping,
	// even when there are zero or few points.
	function axisRange(vals: number[], defaultMax: number, padding: number): { min: number; max: number } {
		if (vals.length === 0) return { min: 0, max: defaultMax };
		const lo = Math.min(...vals);
		const hi = Math.max(...vals);
		return { min: Math.max(0, Math.floor(lo - padding)), max: Math.ceil(hi + padding) };
	}

	// Build the graphic overlay elements — draggable circles for each point
	function buildGraphic(instance: ReturnType<NonNullable<typeof chartComponent>['getInstance']>): GraphicComponentOption[] {
		if (!instance) return [];
		const sorted = sortedPoints();
		const elements: GraphicComponentOption[] = [];

		for (const pt of sorted) {
			// Map back to the real index in the unsorted `points` array
			const realIdx = points.findIndex(
				(p) => p.time_seconds === pt.time_seconds && p.target_temp === pt.target_temp
			);
			const isSelected = selectedIndex === realIdx;

			// BT handle (amber)
			const btPos = instance.convertToPixel('grid', [pt.time_seconds, pt.target_temp]);
			if (btPos) {
				const [px, py] = btPos as number[];
				elements.push({
					type: 'circle',
					x: px,
					y: py,
					shape: { r: SYMBOL_SIZE / 2 },
					style: {
						fill: isSelected ? '#ef4444' : '#f59e0b',
						stroke: isSelected ? '#fff' : 'rgba(255,255,255,0.6)',
						lineWidth: isSelected ? 3 : 1
					},
					draggable: true,
					z: 100,
					cursor: 'move',
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					ondrag(this: any) {
						dragging = true;
						const newVal = instance.convertFromPixel('grid', [this.x, this.y] as [number, number]);
						if (!newVal || realIdx < 0) return;
						const [newTime, newTemp] = newVal as number[];
						points[realIdx].time_seconds = Math.max(0, Math.round(newTime));
						points[realIdx].target_temp = Math.max(0, Math.round(newTemp * 10) / 10);
					},
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					ondragend(this: any) {
						points.sort((a, b) => a.time_seconds - b.time_seconds);
						if (realIdx >= 0 && realIdx < points.length) {
							const movedPt = points[realIdx];
							selectedIndex = points.findIndex((p) => p === movedPt);
						}
					},
					onclick() {
						selectedIndex = realIdx >= 0 ? realIdx : null;
					}
				});
			}

			// ET handle (blue) — only for points that have an ET value
			if (pt.target_env_temp !== null) {
				const etPos = instance.convertToPixel('grid', [pt.time_seconds, pt.target_env_temp]);
				if (etPos) {
					const [epx, epy] = etPos as number[];
					elements.push({
						type: 'circle',
						x: epx,
						y: epy,
						shape: { r: SYMBOL_SIZE / 2 - 1 },
						style: {
							fill: isSelected ? '#ef4444' : '#60a5fa',
							stroke: isSelected ? '#fff' : 'rgba(255,255,255,0.6)',
							lineWidth: isSelected ? 3 : 1
						},
						draggable: 'vertical' as unknown as boolean,
						z: 99,
						cursor: 'ns-resize',
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						ondrag(this: any) {
							dragging = true;
							const newVal = instance.convertFromPixel('grid', [this.x, this.y] as [number, number]);
							if (!newVal || realIdx < 0) return;
							const [, newTemp] = newVal as number[];
							points[realIdx].target_env_temp = Math.max(0, Math.round(newTemp * 10) / 10);
						},
						onclick() {
							selectedIndex = realIdx >= 0 ? realIdx : null;
						}
					});
				}
			}
		}

		return elements;
	}

	// Find time (seconds) where interpolated temp crosses a threshold
	function findTempCrossing(sorted: DesignerPoint[], threshold: number): number | null {
		if (sorted.length < 2) return null;
		for (let i = 0; i < sorted.length - 1; i++) {
			const p0 = sorted[i];
			const p1 = sorted[i + 1];
			if (p0.target_temp <= threshold && p1.target_temp >= threshold) {
				const frac = (threshold - p0.target_temp) / (p1.target_temp - p0.target_temp);
				return Math.round(p0.time_seconds + frac * (p1.time_seconds - p0.time_seconds));
			}
		}
		return null;
	}

	// Phase temperature thresholds
	const DRY_TEMP = 150;
	const FC_TEMP = 200;

	// Derived DTR preview
	let dtrInfo = $derived.by(() => {
		const sorted = sortedPoints();
		if (sorted.length < 2) return null;
		const totalTime = sorted[sorted.length - 1].time_seconds;
		const fcTime = findTempCrossing(sorted, FC_TEMP);
		if (fcTime === null || totalTime <= 0) return null;
		const dtr = ((totalTime - fcTime) / totalTime) * 100;
		return { dtr: Math.round(dtr * 10) / 10, fcTime, totalTime };
	});

	// Chart options — includes graphic overlay for draggable points
	let chartOption = $derived.by<ECOption>(() => {
		const sorted = sortedPoints();

		const times = sorted.map((p) => p.time_seconds);
		const temps = sorted.map((p) => p.target_temp);
		const xRange = axisRange(times, 720, 30); // default 12 min for empty chart
		const yRange = axisRange(temps, 250, 20);  // default 250°C for empty chart
		const maxTime = sorted.length > 0 ? sorted[sorted.length - 1].time_seconds : 0;

		// Fit cubic spline for BT curve
		const btSpline = fitNaturalCubicSpline(sorted.map((p) => ({ x: p.time_seconds, y: p.target_temp })));
		const btCurveData = sorted.length >= 2
			? evaluateSplineGrid(btSpline, 0, maxTime, 2)
			: sorted.map((p): [number, number] => [p.time_seconds, p.target_temp]);

		// Compute RoR from spline derivative (°C/s → °C/min)
		const rorData: [number, number][] = sorted.length >= 2
			? evaluateDerivativeGrid(btSpline, 0, maxTime, 5).map(([t, dy]) => [t, Math.round(dy * 60 * 10) / 10])
			: [];
		const rorValues = rorData.map(([, v]) => v);
		const rorMax = rorValues.length > 0 ? Math.max(...rorValues, 5) : 30;
		const rorMin = rorValues.length > 0 ? Math.min(...rorValues, 0) : 0;

		// ET (Environment Temp) spline — only when ET data exists
		const etPoints = sorted.filter((p) => p.target_env_temp !== null);
		const hasEtData = etPoints.length >= 2;
		let etCurveData: [number, number][] = [];
		if (hasEtData) {
			const etSpline = fitNaturalCubicSpline(etPoints.map((p) => ({ x: p.time_seconds, y: p.target_env_temp! })));
			etCurveData = evaluateSplineGrid(etSpline, 0, maxTime, 2);
		}

		// Fan speed data (only points with non-null fan_speed)
		const fanData = sorted
			.filter((p) => p.fan_speed !== null)
			.map((p) => [p.time_seconds, p.fan_speed as number]);
		const hasFanData = fanData.length > 0;

		// Right Y-axis range: use 0-100 when fan data exists, otherwise fit RoR
		const rightAxisMax = hasFanData ? 100 : Math.ceil(rorMax + 2);
		const rightAxisMin = hasFanData ? 0 : Math.floor(rorMin);

		// Phase markers (vertical dashed lines)
		const dryTime = findTempCrossing(sorted, DRY_TEMP);
		const fcTime = findTempCrossing(sorted, FC_TEMP);

		const markLineData: { xAxis: number; label?: { formatter: string; position: 'insideEndTop' }; lineStyle?: { color: string } }[] = [];
		if (dryTime !== null) {
			markLineData.push({
				xAxis: dryTime,
				label: { formatter: 'DRY', position: 'insideEndTop' },
				lineStyle: { color: '#22c55e' }
			});
		}
		if (fcTime !== null) {
			markLineData.push({
				xAxis: fcTime,
				label: { formatter: 'FC', position: 'insideEndTop' },
				lineStyle: { color: '#eab308' }
			});
		}

		// Build graphic overlays (draggable handles).
		// Access chartReady to re-run this derivation after the chart instance is initialized.
		const instance = chartReady ? chartComponent?.getInstance() : null;
		const graphicElements: GraphicComponentOption[] = instance ? buildGraphic(instance) : [];

		return {
			animation: false,
			grid: { left: 55, right: 55, top: 40, bottom: 45 },
			legend: {
				show: true,
				top: 5,
				textStyle: { color: '#9ca3af', fontSize: 11 }
			},
			tooltip: {
				trigger: 'item',
				formatter: (params: unknown) => {
					const p = params as { data?: number[]; seriesName?: string };
					if (!p.data) return '';
					const [t, val] = p.data;
					const m = Math.floor(t / 60);
					const s = Math.round(t % 60);
					const unit = p.seriesName === 'Simulated RoR' ? '°C/min' : p.seriesName === 'Fan Speed' ? '%' : '°C';
					return `Time: ${m}:${s.toString().padStart(2, '0')}<br/>${p.seriesName}: ${val.toFixed(1)}${unit}`;
				}
			},
			xAxis: {
				type: 'value',
				name: 'Time (s)',
				min: xRange.min,
				max: xRange.max,
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
					min: yRange.min,
					max: yRange.max,
					nameTextStyle: { color: '#9ca3af' },
					axisLabel: { color: '#9ca3af' },
					axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
					splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
				},
				{
					type: 'value',
					name: hasFanData ? 'RoR / Fan %' : 'RoR (°C/min)',
					min: rightAxisMin,
					max: rightAxisMax,
					nameTextStyle: { color: '#34d399' },
					axisLabel: { color: '#34d399' },
					axisLine: { lineStyle: { color: '#34d399' } },
					splitLine: { show: false }
				}
			],
			series: [
				{
					id: 'profile',
					name: 'BT Profile',
					type: 'line',
					data: btCurveData,
					itemStyle: { color: '#f59e0b' },
					lineStyle: { width: 2 },
					showSymbol: false,
					symbolSize: 0,
					markLine: markLineData.length > 0 ? {
						silent: true,
						symbol: 'none',
						lineStyle: { type: 'dashed', width: 1 },
						label: { color: '#9ca3af', fontSize: 10 },
						data: markLineData
					} : undefined
				},
				...(hasEtData ? [{
					id: 'et',
					name: 'ET Profile',
					type: 'line' as const,
					data: etCurveData,
					itemStyle: { color: '#60a5fa' },
					lineStyle: { width: 1.5, type: 'dashed' as const, color: '#60a5fa' },
					showSymbol: false,
					symbolSize: 0,
					silent: true
				}] : []),
				{
					id: 'ror',
					name: 'Simulated RoR',
					type: 'line',
					data: rorData,
					yAxisIndex: 1,
					itemStyle: { color: '#34d399' },
					lineStyle: { width: 1.5, type: 'dashed', color: '#34d399' },
					showSymbol: false,
					symbolSize: 0,
					silent: true
				},
				...(hasFanData ? [{
					id: 'fan',
					name: 'Fan Speed',
					type: 'line' as const,
					step: 'end' as const,
					data: fanData,
					yAxisIndex: 1,
					itemStyle: { color: '#a78bfa' },
					lineStyle: { width: 1.5, color: '#a78bfa' },
					areaStyle: { opacity: 0.15, color: '#a78bfa' },
					showSymbol: false,
					symbolSize: 0,
					silent: true
				}] : [])
			],
			graphic: graphicElements
		};
	});

	// Save handler
	async function handleSave() {
		if (!name.trim()) {
			notifications.add('Profile name is required', 'error');
			return;
		}
		if (points.length === 0) {
			notifications.add('At least one point is required', 'error');
			return;
		}

		saving = true;
		try {
			const sorted = sortedPoints();
			const totalTime = sorted.length > 0 ? sorted[sorted.length - 1].time_seconds : undefined;
			const req: CreateProfileRequest = {
				name: name.trim(),
				description: description.trim() || undefined,
				charge_temp: chargeTemp,
				target_end_temp: targetEndTemp,
				target_total_time: totalTime,
				points: sorted.map((p) => ({
					time_seconds: p.time_seconds,
					target_temp: p.target_temp,
					fan_speed: p.fan_speed ?? undefined,
					target_env_temp: p.target_env_temp ?? undefined
				}))
			};

			if (profileId) {
				await profiles.update(profileId, req);
				notifications.add('Profile updated', 'success');
			} else {
				await profiles.create(req);
				notifications.add('Profile created', 'success');
			}
			goto('/profiles');
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to save profile: ${msg}`, 'error');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-foreground">
			{profileId ? 'Edit Profile' : 'New Profile'}
		</h1>
		<div class="flex gap-2">
			<button
				onclick={() => goto('/profiles')}
				class="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
			>
				Cancel
			</button>
			<button
				onclick={handleSave}
				disabled={saving || !name.trim()}
				class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
			>
				{saving ? 'Saving...' : 'Save'}
			</button>
		</div>
	</div>

	<!-- Metadata -->
	<div class="rounded-lg border border-border bg-card p-4">
		<h2 class="mb-3 text-sm font-semibold text-foreground">Profile Details</h2>
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="sm:col-span-2">
				<label for="profile-name" class="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
				<input
					id="profile-name"
					type="text"
					bind:value={name}
					placeholder="My Roast Profile"
					class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
				/>
			</div>
			<div class="sm:col-span-2">
				<label for="profile-description" class="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
				<input
					id="profile-description"
					type="text"
					bind:value={description}
					placeholder="Optional description"
					class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
				/>
			</div>
			<div>
				<label for="charge-temp" class="mb-1 block text-xs font-medium text-muted-foreground">Charge Temp (°C)</label>
				<input
					id="charge-temp"
					type="number"
					bind:value={chargeTemp}
					placeholder="200"
					class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
				/>
			</div>
			<div>
				<label for="target-end-temp" class="mb-1 block text-xs font-medium text-muted-foreground">Target End Temp (°C)</label>
				<input
					id="target-end-temp"
					type="number"
					bind:value={targetEndTemp}
					placeholder="215"
					class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
				/>
			</div>
		</div>
	</div>

	<!-- Chart / Table toggle -->
	<div class="rounded-lg border border-border bg-card p-4">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-semibold text-foreground">
				Profile Points ({points.length})
			</h2>
			<div class="flex gap-1">
				<button
					onclick={() => (viewMode = 'chart')}
					class="rounded px-2 py-1 text-xs {viewMode === 'chart' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:text-foreground'}"
					title="Chart view"
				>
					<LineChart class="h-4 w-4" />
				</button>
				<button
					onclick={() => (viewMode = 'table')}
					class="rounded px-2 py-1 text-xs {viewMode === 'table' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:text-foreground'}"
					title="Table view"
				>
					<Table class="h-4 w-4" />
				</button>
				{#if points.length >= 2}
					<button
						onclick={() => (showTransposer = true)}
						class="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
						title="Transpose profile"
					>
						<ArrowRightLeft class="h-4 w-4" />
					</button>
				{/if}
				{#if selectedIndex !== null}
					<button
						onclick={deleteSelected}
						class="ml-2 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
						title="Delete selected point"
					>
						<Trash2 class="h-4 w-4" />
					</button>
				{/if}
			</div>
		</div>

		{#if viewMode === 'chart'}
			<p class="mb-2 text-xs text-muted-foreground">Click to add points. Drag points to move them. Click a point to select, then press Delete to remove.</p>
			<div style="height: 350px;">
				<Chart bind:this={chartComponent} option={chartOption} />
			</div>
			{#if dtrInfo}
				<div class="mt-2 flex items-center gap-4 rounded border border-border/50 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground">
					<span class="font-medium text-amber-400">Est. DTR: {dtrInfo.dtr}%</span>
					<span>FC at {Math.floor(dtrInfo.fcTime / 60)}:{(dtrInfo.fcTime % 60).toString().padStart(2, '0')}</span>
					<span>Total: {Math.floor(dtrInfo.totalTime / 60)}:{(dtrInfo.totalTime % 60).toString().padStart(2, '0')}</span>
				</div>
			{/if}
		{:else}
			<!-- Table view -->
			{#if points.length === 0}
				<p class="py-4 text-center text-sm text-muted-foreground">No points yet. Switch to chart view and click to add points.</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-border text-left text-xs text-muted-foreground">
								<th class="px-3 py-2">Time (s)</th>
								<th class="px-3 py-2">BT (°C)</th>
								<th class="px-3 py-2">ET (°C)</th>
								<th class="px-3 py-2">Fan Speed</th>
								<th class="px-3 py-2 w-10"></th>
							</tr>
						</thead>
						<tbody>
							{#each sortedPoints() as point, i}
								{@const realIndex = points.findIndex((p) => p.time_seconds === point.time_seconds && p.target_temp === point.target_temp)}
								<tr
									class="border-b border-border/50 {selectedIndex === realIndex ? 'bg-amber-500/10' : 'hover:bg-accent'}"
									onclick={() => (selectedIndex = realIndex)}
								>
									<td class="px-3 py-1.5">
										<input
											type="number"
											value={point.time_seconds}
											oninput={(e) => {
												const val = parseInt((e.target as HTMLInputElement).value);
												if (!isNaN(val) && val >= 0) points[realIndex].time_seconds = val;
											}}
											class="w-20 rounded border border-border bg-input px-2 py-1 text-sm text-foreground"
											min="0"
										/>
									</td>
									<td class="px-3 py-1.5">
										<input
											type="number"
											value={point.target_temp}
											oninput={(e) => {
												const val = parseFloat((e.target as HTMLInputElement).value);
												if (!isNaN(val) && val >= 0) points[realIndex].target_temp = val;
											}}
											class="w-20 rounded border border-border bg-input px-2 py-1 text-sm text-foreground"
											step="0.1"
											min="0"
										/>
									</td>
									<td class="px-3 py-1.5">
										<input
											type="number"
											value={point.target_env_temp ?? ''}
											oninput={(e) => {
												const v = (e.target as HTMLInputElement).value;
												points[realIndex].target_env_temp = v === '' ? null : parseFloat(v);
											}}
											class="w-20 rounded border border-border bg-input px-2 py-1 text-sm text-foreground"
											placeholder="-"
											step="0.1"
											min="0"
										/>
									</td>
									<td class="px-3 py-1.5">
										<input
											type="number"
											value={point.fan_speed ?? ''}
											oninput={(e) => {
												const v = (e.target as HTMLInputElement).value;
												points[realIndex].fan_speed = v === '' ? null : parseInt(v);
											}}
											class="w-20 rounded border border-border bg-input px-2 py-1 text-sm text-foreground"
											placeholder="-"
											min="0"
											max="255"
										/>
									</td>
									<td class="px-3 py-1.5">
										<button
											onclick={(e) => { e.stopPropagation(); selectedIndex = realIndex; deleteSelected(); }}
											class="text-red-400 hover:text-red-300"
											title="Delete point"
										>
											<Trash2 class="h-3.5 w-3.5" />
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Selected point editor (chart view) -->
	{#if viewMode === 'chart' && selectedIndex !== null && selectedIndex >= 0 && selectedIndex < points.length}
		{@const point = points[selectedIndex]}
		<div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
			<h3 class="mb-2 text-sm font-semibold text-amber-400">Selected Point</h3>
			<div class="grid gap-3 sm:grid-cols-4">
				<div>
					<label for="edit-time" class="mb-1 block text-xs font-medium text-muted-foreground">Time (seconds)</label>
					<input
						id="edit-time"
						type="number"
						bind:value={point.time_seconds}
						class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground"
						min="0"
					/>
				</div>
				<div>
					<label for="edit-temp" class="mb-1 block text-xs font-medium text-muted-foreground">BT (°C)</label>
					<input
						id="edit-temp"
						type="number"
						bind:value={point.target_temp}
						class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground"
						step="0.1"
						min="0"
					/>
				</div>
				<div>
					<label for="edit-et" class="mb-1 block text-xs font-medium text-muted-foreground">ET (°C)</label>
					<input
						id="edit-et"
						type="number"
						value={point.target_env_temp ?? ''}
						oninput={(e) => {
							const v = (e.target as HTMLInputElement).value;
							point.target_env_temp = v === '' ? null : parseFloat(v);
						}}
						class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground"
						placeholder="Optional"
						step="0.1"
						min="0"
					/>
				</div>
				<div>
					<label for="edit-fan" class="mb-1 block text-xs font-medium text-muted-foreground">Fan Speed (0-255)</label>
					<input
						id="edit-fan"
						type="number"
						value={point.fan_speed ?? ''}
						oninput={(e) => {
							const v = (e.target as HTMLInputElement).value;
							point.fan_speed = v === '' ? null : parseInt(v);
						}}
						class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground"
						placeholder="Optional"
						min="0"
						max="255"
					/>
				</div>
			</div>
		</div>
	{/if}
</div>

{#if showTransposer}
	<ProfileTransposer
		points={sortedPoints()}
		onApply={(transformed) => {
			points = transformed.map((p) => ({
				time_seconds: p.time_seconds,
				target_temp: p.target_temp,
				fan_speed: p.fan_speed,
				target_env_temp: p.target_env_temp
			}));
			selectedIndex = null;
			showTransposer = false;
		}}
		onCancel={() => (showTransposer = false)}
	/>
{/if}
