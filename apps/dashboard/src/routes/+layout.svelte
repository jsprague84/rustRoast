<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { initTelemetrySocket, destroyTelemetrySocket, connectionStatus } from '$lib/stores/telemetry.js';
	import NotificationToast from '$lib/components/NotificationToast.svelte';
	import { Gauge, ScrollText, BarChart3, Cpu, Settings, Menu } from 'lucide-svelte';

	let { children } = $props();
	let sidebarOpen = $state(false);

	onMount(() => {
		initTelemetrySocket();
	});

	onDestroy(() => {
		destroyTelemetrySocket();
	});

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: Gauge },
		{ href: '/sessions', label: 'Sessions', icon: ScrollText },
		{ href: '/profiles', label: 'Profiles', icon: BarChart3 },
		{ href: '/devices', label: 'Devices', icon: Cpu },
		{ href: '/settings', label: 'Settings', icon: Settings }
	];

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}

	const statusColor: Record<string, string> = {
		connected: 'bg-green-500',
		reconnecting: 'bg-yellow-500',
		disconnected: 'bg-red-500'
	};
</script>

<div class="flex h-screen bg-background">
	<!-- Mobile sidebar backdrop -->
	{#if sidebarOpen}
		<div
			class="fixed inset-0 z-20 bg-black/50 md:hidden"
			onclick={() => (sidebarOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (sidebarOpen = false)}
			role="button"
			tabindex="-1"
		></div>
	{/if}

	<!-- Sidebar -->
	<aside
		class="fixed z-30 flex h-full w-56 flex-col border-r border-sidebar-border bg-sidebar transition-transform md:static md:translate-x-0
		{sidebarOpen ? 'translate-x-0' : '-translate-x-full'}"
	>
		<div class="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
			<span class="text-xl font-bold text-sidebar-foreground">rustRoast</span>
			<span class="inline-block h-2 w-2 rounded-full {statusColor[$connectionStatus] ?? 'bg-gray-400'}" title={$connectionStatus}></span>
		</div>
		<nav class="flex-1 px-2 py-4">
			{#each navItems as item}
				<a
					href={item.href}
					class="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
					{isActive(item.href) ? 'bg-amber-500/15 text-amber-400' : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'}"
					onclick={() => (sidebarOpen = false)}
				>
					<item.icon class="h-4 w-4" />
					{item.label}
				</a>
			{/each}
		</nav>
	</aside>

	<!-- Main content -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<!-- Mobile header -->
		<header class="flex items-center gap-3 border-b border-border bg-card px-4 py-3 md:hidden">
			<button
				class="rounded p-1 text-muted-foreground hover:bg-accent"
				onclick={() => (sidebarOpen = !sidebarOpen)}
				aria-label="Toggle menu"
			>
				<Menu class="h-6 w-6" />
			</button>
			<span class="text-lg font-bold text-foreground">rustRoast</span>
			<span class="inline-block h-2 w-2 rounded-full {statusColor[$connectionStatus] ?? 'bg-gray-400'}" title={$connectionStatus}></span>
		</header>

		<!-- Page content -->
		<main class="flex-1 overflow-auto p-4">
			{@render children()}
		</main>
	</div>

	<NotificationToast />
</div>
