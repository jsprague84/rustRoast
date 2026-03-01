<script lang="ts">
	import CurrentReadings from '$lib/components/CurrentReadings.svelte';
	import TelemetryChart from '$lib/components/TelemetryChart.svelte';
	import SessionControls from '$lib/components/SessionControls.svelte';
	import FollowProfile from '$lib/components/FollowProfile.svelte';
	import LandmarkPanel from '$lib/components/LandmarkPanel.svelte';
	import ControlPanel from '$lib/components/ControlPanel.svelte';
	import PidControls from '$lib/components/PidControls.svelte';
	import EmergencyStop from '$lib/components/EmergencyStop.svelte';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import { setSelectedDevice } from '$lib/stores/telemetry.js';
	import { events, type RoastSession, type RoastEvent } from '$lib/api/client.js';

	let activeSession = $state<RoastSession | null>(null);
	let landmarks = $state<Array<{ type: string; elapsed_seconds: number; temperature?: number }>>([]);
	let showControls = $state(false);
	let selectedDeviceId = $state<string | null>(null);

	// Load landmarks when active session changes
	$effect(() => {
		if (activeSession) {
			loadLandmarks(activeSession.id);
		} else {
			landmarks = [];
		}
	});

	async function loadLandmarks(sessionId: string) {
		try {
			const evts = await events.list(sessionId);
			landmarks = evts.map((e: RoastEvent) => ({
				type: e.event_type,
				elapsed_seconds: e.elapsed_seconds,
				temperature: e.temperature ?? undefined
			}));
		} catch {
			landmarks = [];
		}
	}

	function onSessionChange(session: RoastSession | null) {
		activeSession = session;
	}

	function onLandmarkAdded() {
		if (activeSession) {
			loadLandmarks(activeSession.id);
		}
	}
</script>

<svelte:head>
	<title>Dashboard | rustRoast</title>
</svelte:head>

<div class="mb-4 flex items-center justify-between">
	<h1 class="text-lg font-semibold text-foreground">Dashboard</h1>
	<DeviceSelector onselect={(id) => { selectedDeviceId = id; setSelectedDevice(id); }} />
</div>

<div class="flex h-full flex-col gap-4 lg:flex-row lg:items-stretch">
	<!-- Main content: readings + chart -->
	<div class="flex min-w-0 flex-1 flex-col gap-4">
		<CurrentReadings />
		<div class="flex-1" style="min-height: 400px;">
			<TelemetryChart {landmarks} />
		</div>
	</div>

	<!-- Sidebar: session + controls -->
	<div class="flex w-full flex-col gap-3 lg:w-72 lg:shrink-0">
		<SessionControls onchange={onSessionChange} />
		<FollowProfile {activeSession} deviceId={selectedDeviceId} />
		<LandmarkPanel {activeSession} />

		<!-- Controls toggle (mobile) -->
		<button
			onclick={() => (showControls = !showControls)}
			class="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent lg:hidden"
		>
			{showControls ? 'Hide Controls' : 'Show Controls'}
		</button>

		<!-- Controls sidebar (always visible on desktop, collapsible on mobile) -->
		<div class="space-y-3 {showControls ? '' : 'hidden lg:block'}">
			<div class="rounded-lg border border-border bg-card p-4">
				<h3 class="mb-3 text-sm font-semibold text-foreground">Controls</h3>
				<ControlPanel />
			</div>
			<div class="rounded-lg border border-border bg-card p-4">
				<PidControls />
			</div>
		</div>
	</div>
</div>

<EmergencyStop />
