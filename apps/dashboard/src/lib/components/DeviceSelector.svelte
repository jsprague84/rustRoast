<script lang="ts">
	import { onMount } from 'svelte';
	import { Monitor } from 'lucide-svelte';
	import { listDevices } from '$lib/api/devices.js';
	import type { ConfiguredDevice } from '$lib/types/device.js';

	interface Props {
		onselect?: (deviceId: string | null) => void;
	}

	let { onselect }: Props = $props();

	let devices = $state<ConfiguredDevice[]>([]);
	let selectedId = $state<string | null>(null);
	let loading = $state(true);

	const STORAGE_KEY = 'rustroast-selected-device';

	onMount(async () => {
		try {
			const all = await listDevices();
			devices = all.filter((d) => d.status === 'active');
		} catch {
			devices = [];
		}

		// Restore from sessionStorage
		if (typeof window !== 'undefined') {
			const stored = sessionStorage.getItem(STORAGE_KEY);
			if (stored && devices.some((d) => d.device_id === stored)) {
				selectedId = stored;
			} else if (devices.length > 0) {
				selectedId = devices[0].device_id;
			}
		} else if (devices.length > 0) {
			selectedId = devices[0].device_id;
		}

		loading = false;
		onselect?.(selectedId);
	});

	function handleChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		selectedId = target.value || null;
		if (typeof window !== 'undefined' && selectedId) {
			sessionStorage.setItem(STORAGE_KEY, selectedId);
		}
		onselect?.(selectedId);
	}

	let selectedDevice = $derived(devices.find((d) => d.device_id === selectedId));

	function statusColor(status: string): string {
		switch (status) {
			case 'active':
				return 'bg-green-400';
			case 'pending':
				return 'bg-amber-400';
			case 'error':
				return 'bg-red-400';
			default:
				return 'bg-gray-400';
		}
	}
</script>

<div class="flex items-center gap-2">
	<Monitor class="h-4 w-4 text-muted-foreground" />
	{#if loading}
		<span class="text-sm text-muted-foreground">Loading devices...</span>
	{:else if devices.length === 0}
		<span class="text-sm text-muted-foreground">No active devices</span>
	{:else}
		<div class="relative">
			<select
				value={selectedId}
				onchange={handleChange}
				class="appearance-none rounded-md border border-border bg-input py-1.5 pl-6 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
			>
				{#each devices as device}
					<option value={device.device_id}>{device.name}</option>
				{/each}
			</select>
			<!-- Status dot positioned inside the select -->
			{#if selectedDevice}
				<span
					class="pointer-events-none absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full {statusColor(selectedDevice.status)}"
				></span>
			{/if}
			<!-- Dropdown chevron -->
			<svg
				class="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</div>
	{/if}
</div>
