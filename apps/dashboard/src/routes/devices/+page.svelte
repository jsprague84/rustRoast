<script lang="ts">
	import type { PageProps } from './$types';
	import { Cpu, Plus, Signal, Wifi } from 'lucide-svelte';
	import type { ConfiguredDevice } from '$lib/types/device.js';

	let { data }: PageProps = $props();

	function relativeTime(iso: string | null | undefined): string {
		if (!iso) return 'Never';
		const diff = Date.now() - new Date(iso).getTime();
		if (diff < 0) return 'Just now';
		const secs = Math.floor(diff / 1000);
		if (secs < 60) return `${secs}s ago`;
		const mins = Math.floor(secs / 60);
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	function statusClasses(status: string): string {
		switch (status) {
			case 'active':
				return 'bg-green-500/15 text-green-400';
			case 'pending':
				return 'bg-amber-500/15 text-amber-400';
			case 'error':
				return 'bg-red-500/15 text-red-400';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}

	let configuredDevices = $derived(
		(data.devices as ConfiguredDevice[]).filter((d) => d.status !== 'pending')
	);

	let pendingDevices = $derived(data.discovered as ConfiguredDevice[]);
</script>

<svelte:head>
	<title>Devices | rustRoast</title>
</svelte:head>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-foreground">Devices</h1>
		<div class="flex gap-2">
			<a
				href="/devices/profiles"
				class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
			>
				Device Profiles
			</a>
			<a
				href="/devices/new"
				class="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
			>
				<Plus class="h-4 w-4" />
				Add Device
			</a>
		</div>
	</div>

	<!-- Pending / Discovered devices banner -->
	{#if pendingDevices.length > 0}
		<div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
			<div class="flex items-center gap-2 text-sm font-semibold text-amber-400">
				<Signal class="h-4 w-4" />
				Discovered Devices
			</div>
			<p class="mt-1 text-xs text-amber-400/70">
				These devices were auto-discovered via MQTT. Configure them to start monitoring.
			</p>
			<div class="mt-3 space-y-2">
				{#each pendingDevices as device}
					<div
						class="flex items-center justify-between rounded-md border border-amber-500/20 bg-card px-4 py-2.5"
					>
						<div class="flex items-center gap-3">
							<Wifi class="h-4 w-4 text-amber-400" />
							<div>
								<span class="text-sm font-medium text-foreground">{device.name}</span>
								<span class="ml-2 text-xs text-muted-foreground">{device.device_id}</span>
							</div>
						</div>
						<a
							href="/devices/new?device_id={encodeURIComponent(device.device_id)}"
							class="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
						>
							Configure
						</a>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Device card grid -->
	{#if configuredDevices.length === 0 && pendingDevices.length === 0}
		<div class="mt-12 flex flex-col items-center justify-center text-center">
			<Cpu class="h-12 w-12 text-muted-foreground/50" />
			<p class="mt-4 text-lg font-medium text-muted-foreground">No devices configured</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Add a device manually or power on an MQTT-connected roaster to get started.
			</p>
			<a
				href="/devices/new"
				class="mt-4 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
			>
				<Plus class="h-4 w-4" />
				Add Device
			</a>
		</div>
	{:else if configuredDevices.length > 0}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each configuredDevices as device}
				<a
					href="/devices/{device.id}"
					class="group rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
				>
					<div class="flex items-start justify-between">
						<div class="min-w-0 flex-1">
							<h3 class="truncate text-sm font-semibold text-foreground">
								{device.name}
							</h3>
							<p class="mt-0.5 text-xs text-muted-foreground">{device.device_id}</p>
						</div>
						<span
							class="ml-2 inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {statusClasses(device.status)}"
						>
							{device.status}
						</span>
					</div>

					{#if device.description}
						<p class="mt-2 line-clamp-2 text-xs text-muted-foreground">
							{device.description}
						</p>
					{/if}

					<div class="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
						{#if device.location}
							<span>{device.location}</span>
						{/if}
						<span class="ml-auto">
							{relativeTime(device.last_seen_at)}
						</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
