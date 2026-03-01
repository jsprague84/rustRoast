<script lang="ts">
	import {
		profileState,
		interpolateTarget,
		startFollowing,
		stopFollowing
	} from '$lib/stores/profile.svelte.js';
	import { control, settings, type RoastSession } from '$lib/api/client.js';
	import { notifications } from '$lib/stores/notifications.js';

	let {
		activeSession,
		deviceId
	}: { activeSession: RoastSession | null; deviceId: string | null } = $props();

	let lookaheadMs = $state(20_000); // default 20s

	// Load lookahead setting on mount
	$effect(() => {
		settings
			.get()
			.then((s) => {
				const val = s['profile_lookahead_seconds'];
				if (val) lookaheadMs = parseInt(val, 10) * 1000;
			})
			.catch(() => {});
	});

	// Can follow when profile loaded and session is active
	const canFollow = $derived(
		profileState.activeProfile !== null &&
			activeSession !== null &&
			activeSession.status === 'active'
	);

	// Auto-stop following when conditions no longer met
	$effect(() => {
		if (profileState.isFollowing && !canFollow) {
			stopFollowing();
		}
	});

	// Following interval — sends setpoints every second with hysteresis
	$effect(() => {
		if (
			!profileState.isFollowing ||
			!activeSession?.start_time ||
			!deviceId ||
			!profileState.activeProfile
		)
			return;

		const currentDeviceId = deviceId;
		const points = profileState.activeProfile.points;
		const sessionStartMs = new Date(activeSession.start_time).getTime();

		const id = setInterval(() => {
			const elapsedMs = Date.now() - sessionStartMs;
			const target = interpolateTarget(points, elapsedMs, lookaheadMs);
			if (target === null) return;

			const last = profileState.lastSentSetpoint;
			if (last === null || Math.abs(target - last) >= 1.0) {
				profileState.lastSentSetpoint = target;
				control
					.setSetpoint(currentDeviceId, Math.round(target * 10) / 10)
					.catch((e) => {
						const msg = e instanceof Error ? e.message : String(e);
						notifications.add(`Failed to send setpoint: ${msg}`, 'error');
					});
			}
		}, 1000);

		return () => clearInterval(id);
	});

	async function toggleFollowing() {
		if (profileState.isFollowing) {
			stopFollowing();
		} else {
			if (!deviceId) return;
			try {
				await control.setMode(deviceId, 'auto');
				startFollowing();
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				notifications.add(`Failed to enable auto mode: ${msg}`, 'error');
			}
		}
	}
</script>

{#if profileState.activeProfile}
	<div class="rounded-lg border border-border bg-card p-4">
		<div class="flex items-center justify-between">
			<div>
				<div class="text-sm font-medium text-foreground">Profile Following</div>
				<div class="text-xs text-muted-foreground">{profileState.activeProfile.name}</div>
			</div>
			<button
				onclick={toggleFollowing}
				disabled={!canFollow}
				class="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 {profileState.isFollowing
					? 'bg-amber-600 text-white hover:bg-amber-700'
					: 'bg-green-600 text-white hover:bg-green-700'}"
			>
				{profileState.isFollowing ? 'Stop Following' : 'Follow Profile'}
			</button>
		</div>
		{#if profileState.isFollowing}
			<div class="mt-2 text-xs text-muted-foreground">
				Auto mode active · Lookahead: {lookaheadMs / 1000}s
				{#if profileState.lastSentSetpoint !== null}
					· Target: {profileState.lastSentSetpoint.toFixed(1)}°C
				{/if}
			</div>
		{/if}
	</div>
{/if}
