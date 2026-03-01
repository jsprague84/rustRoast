<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageProps } from './$types';
	import Chart, { type ECOption } from '$lib/components/Chart.svelte';
	import { profiles, type ProfileWithPoints } from '$lib/api/client.js';
	import { notifications } from '$lib/stores/notifications.js';

	let { data }: PageProps = $props();

	let selectedProfile = $state<ProfileWithPoints | null>(null);
	let showImport = $state(false);
	let importFile = $state<File | null>(null);
	let importing = $state(false);
	let deleteConfirm = $state<string | null>(null);

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return s > 0 ? `${m}m ${s}s` : `${m}m`;
	}

	async function selectProfile(id: string) {
		try {
			selectedProfile = await profiles.get(id);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to load profile: ${msg}`, 'error');
		}
	}

	async function handleImport() {
		if (!importFile) return;
		importing = true;
		try {
			const text = await importFile.text();
			const imported = await profiles.importArtisan(text, importFile.name.replace(/\.[^.]+$/, ''));
			notifications.add('Profile imported — review and edit before finalizing', 'success');
			goto(`/profiles/${imported.id}/edit`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Import failed';
			notifications.add(msg, 'error');
		} finally {
			importing = false;
		}
	}

	async function deleteProfile(id: string) {
		try {
			await profiles.delete(id);
			if (selectedProfile?.id === id) selectedProfile = null;
			deleteConfirm = null;
			await invalidateAll();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to delete profile: ${msg}`, 'error');
		}
	}

	let profileChartOption = $derived.by<ECOption>(() => {
		if (!selectedProfile?.points?.length) return {};
		const chartData = [...selectedProfile.points]
			.sort((a, b) => a.time_seconds - b.time_seconds)
			.map((p) => [p.time_seconds, p.target_temp]);
		return {
			animation: false,
			grid: { left: 50, right: 20, top: 20, bottom: 40 },
			xAxis: {
				type: 'value',
				name: 'Time (s)',
				nameTextStyle: { color: '#9ca3af' },
				axisLabel: {
					color: '#9ca3af',
					formatter: (val: number) => {
						const m = Math.floor(val / 60);
						const s = val % 60;
						return `${m}:${s.toString().padStart(2, '0')}`;
					}
				},
				axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
				splitLine: { show: false }
			},
			yAxis: {
				type: 'value',
				name: 'Temp (°C)',
				nameTextStyle: { color: '#9ca3af' },
				axisLabel: { color: '#9ca3af' },
				axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
				splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
			},
			series: [
				{
					name: 'Target',
					type: 'line',
					data: chartData,
					itemStyle: { color: '#f59e0b' },
					lineStyle: { width: 2 },
					showSymbol: true,
					symbolSize: 6
				}
			]
		};
	});
</script>

<svelte:head>
	<title>Profiles | rustRoast</title>
</svelte:head>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-foreground">Profiles</h1>
		<div class="flex gap-2">
			<button
				onclick={() => (showImport = !showImport)}
				class="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
			>
				Import Artisan
			</button>
			<a
				href="/profiles/new"
				class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
			>
				New Profile
			</a>
		</div>
	</div>

	<!-- Import form -->
	{#if showImport}
		<div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
			<h3 class="text-sm font-semibold text-amber-400">Import Artisan Profile</h3>
			<div class="mt-2 flex gap-2">
				<input
					type="file"
					accept=".json,.alog"
					onchange={(e) => {
						const target = e.target as HTMLInputElement;
						importFile = target.files?.[0] ?? null;
					}}
					class="flex-1 text-sm text-muted-foreground"
				/>
				<button
					onclick={handleImport}
					disabled={!importFile || importing}
					class="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
				>
					{importing ? 'Importing...' : 'Import'}
				</button>
			</div>
		</div>
	{/if}

	{#if data.profiles.length === 0}
		<div class="mt-8 text-center">
			<p class="text-muted-foreground">No profiles yet.</p>
			<p class="mt-1 text-sm text-muted-foreground">Create a new profile or import an Artisan profile to get started.</p>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2">
			<!-- Profile list -->
			<div class="space-y-2">
				{#each data.profiles as profile}
					<button
						onclick={() => selectProfile(profile.id)}
						class="w-full rounded-lg border p-3 text-left transition-colors
							{selectedProfile?.id === profile.id ? 'border-amber-500/50 bg-amber-500/10' : 'border-border bg-card hover:bg-accent'}"
					>
						<div class="font-medium text-foreground">{profile.name}</div>
						{#if profile.description}
							<div class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{profile.description}</div>
						{/if}
						<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
							{#if profile.charge_temp}<span>Charge: {profile.charge_temp}°C</span>{/if}
							{#if profile.target_end_temp}<span>Target: {profile.target_end_temp}°C</span>{/if}
							{#if profile.target_total_time}
								<span>{formatTime(profile.target_total_time)}</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>

			<!-- Profile detail -->
			{#if selectedProfile}
				<div class="rounded-lg border border-border bg-card p-4">
					<div class="flex items-start justify-between">
						<div>
							<h2 class="text-lg font-semibold text-foreground">{selectedProfile.name}</h2>
							{#if selectedProfile.description}
								<p class="mt-1 text-sm text-muted-foreground">{selectedProfile.description}</p>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							<a href="/profiles/{selectedProfile.id}/edit" class="text-xs text-amber-400 hover:text-amber-300">Edit</a>
							{#if deleteConfirm === selectedProfile.id}
								<div class="flex gap-1">
									<button onclick={() => deleteProfile(selectedProfile!.id)} class="rounded bg-red-600 px-2 py-1 text-xs text-white">Confirm</button>
									<button onclick={() => (deleteConfirm = null)} class="rounded border border-border px-2 py-1 text-xs text-muted-foreground">Cancel</button>
								</div>
							{:else}
								<button onclick={() => (deleteConfirm = selectedProfile!.id)} class="text-xs text-red-400 hover:text-red-300">Delete</button>
							{/if}
						</div>
					</div>
					{#if selectedProfile.charge_temp || selectedProfile.target_end_temp || selectedProfile.target_total_time}
						<div class="mt-3 flex flex-wrap gap-3 text-sm">
							{#if selectedProfile.charge_temp}
								<div class="rounded-md bg-muted px-3 py-1.5">
									<span class="text-muted-foreground">Charge</span>
									<span class="ml-1 font-medium text-foreground">{selectedProfile.charge_temp}°C</span>
								</div>
							{/if}
							{#if selectedProfile.target_end_temp}
								<div class="rounded-md bg-muted px-3 py-1.5">
									<span class="text-muted-foreground">Target</span>
									<span class="ml-1 font-medium text-foreground">{selectedProfile.target_end_temp}°C</span>
								</div>
							{/if}
							{#if selectedProfile.target_total_time}
								<div class="rounded-md bg-muted px-3 py-1.5">
									<span class="text-muted-foreground">Duration</span>
									<span class="ml-1 font-medium text-foreground">{formatTime(selectedProfile.target_total_time)}</span>
								</div>
							{/if}
							{#if selectedProfile.points?.length}
								<div class="rounded-md bg-muted px-3 py-1.5">
									<span class="text-muted-foreground">Points</span>
									<span class="ml-1 font-medium text-foreground">{selectedProfile.points.length}</span>
								</div>
							{/if}
						</div>
					{/if}
					{#if selectedProfile.points?.length}
						<div class="mt-3" style="height: 250px;">
							<Chart option={profileChartOption} />
						</div>
					{:else}
						<p class="mt-3 text-sm text-muted-foreground">No profile points defined.</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
