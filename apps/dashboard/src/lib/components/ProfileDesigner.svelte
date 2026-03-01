<script lang="ts">
	import { goto } from '$app/navigation';
	import Chart, { type ECOption } from '$lib/components/Chart.svelte';
	import { profiles, type CreateProfileRequest, type ProfileWithPoints } from '$lib/api/client.js';
	import { notifications } from '$lib/stores/notifications.js';
	import { Trash2, Table, LineChart } from 'lucide-svelte';

	interface DesignerPoint {
		time_seconds: number;
		target_temp: number;
		fan_speed: number | null;
	}

	let {
		initialProfile = null
	}: {
		initialProfile?: ProfileWithPoints | null;
	} = $props();

	// Extract initial values once (intentionally non-reactive)
	const initName = initialProfile?.name ?? '';
	const initDescription = initialProfile?.description ?? '';
	const initChargeTemp = initialProfile?.charge_temp ?? undefined;
	const initTargetEndTemp = initialProfile?.target_end_temp ?? undefined;
	const initPoints: DesignerPoint[] = initialProfile?.points
		? [...initialProfile.points]
				.sort((a, b) => a.time_seconds - b.time_seconds)
				.map((p) => ({
					time_seconds: p.time_seconds,
					target_temp: p.target_temp,
					fan_speed: p.fan_speed
				}))
		: [];
	const profileId = initialProfile?.id ?? null;

	// Metadata state
	let name = $state(initName);
	let description = $state(initDescription);
	let chargeTemp = $state<number | undefined>(initChargeTemp);
	let targetEndTemp = $state<number | undefined>(initTargetEndTemp);

	// Points state
	let points = $state<DesignerPoint[]>(initPoints);
	let selectedIndex = $state<number | null>(null);
	let viewMode = $state<'chart' | 'table'>('chart');
	let saving = $state(false);

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
			fan_speed: null
		};
		points.push(newPoint);
		points.sort((a, b) => a.time_seconds - b.time_seconds);
		selectedIndex = points.indexOf(newPoint);
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

		// Click on blank area to add point
		instance.getZr().on('click', (params: { target?: unknown; offsetX: number; offsetY: number }) => {
			if (params.target) return; // clicked on a series element
			const dataPoint = instance.convertFromPixel('grid', [params.offsetX, params.offsetY]);
			if (dataPoint) {
				const [timeSec, temp] = dataPoint;
				if (timeSec >= 0 && temp >= 0 && temp <= 350) {
					addPoint(timeSec, temp);
				}
			}
		});

		// Click on existing point to select
		instance.on('click', (params: { dataIndex?: number; componentType?: string; seriesName?: string }) => {
			if (params.componentType === 'series' && params.seriesName === 'Profile' && params.dataIndex !== undefined) {
				// Find the matching point in our sorted array
				const sorted = sortedPoints();
				if (params.dataIndex < sorted.length) {
					const clickedPoint = sorted[params.dataIndex];
					const idx = points.findIndex(
						(p) => p.time_seconds === clickedPoint.time_seconds && p.target_temp === clickedPoint.target_temp
					);
					selectedIndex = idx >= 0 ? idx : null;
				}
			}
		});

		chartHandlersAttached = true;
	});

	// Chart options
	let chartOption = $derived.by<ECOption>(() => {
		const sorted = sortedPoints();
		const chartData = sorted.map((p) => [p.time_seconds, p.target_temp]);

		// Highlight selected point
		let selectedData: number[][] = [];
		if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < points.length) {
			const p = points[selectedIndex];
			selectedData = [[p.time_seconds, p.target_temp]];
		}

		return {
			animation: false,
			grid: { left: 55, right: 20, top: 30, bottom: 45 },
			tooltip: {
				trigger: 'item',
				formatter: (params: unknown) => {
					const p = params as { data?: number[] };
					if (!p.data) return '';
					const [t, temp] = p.data;
					const m = Math.floor(t / 60);
					const s = Math.round(t % 60);
					return `Time: ${m}:${s.toString().padStart(2, '0')}<br/>Temp: ${temp}°C`;
				}
			},
			xAxis: {
				type: 'value',
				name: 'Time (s)',
				min: 0,
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
			yAxis: {
				type: 'value',
				name: 'Temp (°C)',
				min: 0,
				nameTextStyle: { color: '#9ca3af' },
				axisLabel: { color: '#9ca3af' },
				axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
				splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
			},
			series: [
				{
					name: 'Profile',
					type: 'line',
					data: chartData,
					itemStyle: { color: '#f59e0b' },
					lineStyle: { width: 2 },
					showSymbol: true,
					symbolSize: 10,
					emphasis: {
						itemStyle: { borderWidth: 3, borderColor: '#fff' }
					}
				},
				...(selectedData.length > 0
					? [
							{
								name: 'Selected',
								type: 'line' as const,
								data: selectedData,
								itemStyle: { color: '#ef4444', borderWidth: 2 },
								symbolSize: 14,
								showSymbol: true,
								lineStyle: { width: 0 }
							}
						]
					: [])
			]
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
					fan_speed: p.fan_speed ?? undefined
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
			<p class="mb-2 text-xs text-muted-foreground">Click on the chart to add points. Click a point to select it.</p>
			<div style="height: 350px;">
				<Chart bind:this={chartComponent} option={chartOption} />
			</div>
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
								<th class="px-3 py-2">Temp (°C)</th>
								<th class="px-3 py-2">Fan Speed</th>
								<th class="px-3 py-2 w-10"></th>
							</tr>
						</thead>
						<tbody>
							{#each sortedPoints() as point, i}
								{@const realIndex = points.indexOf(point)}
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
			<div class="grid gap-3 sm:grid-cols-3">
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
					<label for="edit-temp" class="mb-1 block text-xs font-medium text-muted-foreground">Temperature (°C)</label>
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
