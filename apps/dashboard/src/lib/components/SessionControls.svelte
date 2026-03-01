<script lang="ts">
	import { sessions, control, profiles, type RoastSession, type CreateSessionRequest, type RoastProfile } from '$lib/api/client.js';
	import { deviceId } from '$lib/stores/telemetry.js';
	import { clearHistory } from '$lib/stores/telemetry.js';
	import { notifications } from '$lib/stores/notifications.js';
	import { loadProfile } from '$lib/stores/profile.svelte.js';
	import RoastTimer from './RoastTimer.svelte';

	let { onchange }: { onchange?: (session: RoastSession | null) => void } = $props();

	let activeSession = $state<RoastSession | null>(null);
	let loading = $state(false);
	let showForm = $state(false);

	function notifyChange(session: RoastSession | null) {
		activeSession = session;
		onchange?.(session);
	}

	// Form fields
	let sessionName = $state('');
	let beanOrigin = $state('');
	let beanVariety = $state('');
	let greenWeight = $state('');

	// Profile selection
	let profileList = $state<RoastProfile[]>([]);
	let selectedProfileId = $state('');

	$effect(() => {
		fetchProfiles();
	});

	async function fetchProfiles() {
		try {
			profileList = await profiles.list();
		} catch {
			profileList = [];
		}
	}

	// Check for active session on mount
	$effect(() => {
		checkActiveSession();
	});

	async function checkActiveSession() {
		try {
			const allSessions = await sessions.list(undefined, 10);
			const active = allSessions.find((s) => s.status === 'active' || s.status === 'paused');
			if (active) {
				notifyChange(active);
				if (active.profile_id) {
					loadProfile(active.profile_id).catch(() => {});
				}
			}
		} catch {
			// No active session
		}
	}

	async function quickStart() {
		if (!$deviceId) return;
		loading = true;
		try {
			const req: CreateSessionRequest = {
				name: `Roast ${new Date().toLocaleString()}`,
				device_id: $deviceId,
				profile_id: selectedProfileId || undefined
			};
			const session = await sessions.create(req);
			const started = await sessions.start(session.id);
			notifyChange(started);
			clearHistory();
			if (selectedProfileId) {
				loadProfile(selectedProfileId).catch(() => {});
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to start session: ${msg}`, 'error');
		} finally {
			loading = false;
		}
	}

	async function startWithForm() {
		if (!$deviceId) return;
		loading = true;
		try {
			const req: CreateSessionRequest = {
				name: sessionName || `Roast ${new Date().toLocaleString()}`,
				device_id: $deviceId,
				profile_id: selectedProfileId || undefined,
				bean_origin: beanOrigin || undefined,
				bean_variety: beanVariety || undefined,
				green_weight: greenWeight ? parseFloat(greenWeight) : undefined
			};
			const session = await sessions.create(req);
			const started = await sessions.start(session.id);
			notifyChange(started);
			clearHistory();
			if (selectedProfileId) {
				loadProfile(selectedProfileId).catch(() => {});
			}
			showForm = false;
			sessionName = '';
			beanOrigin = '';
			beanVariety = '';
			greenWeight = '';
			selectedProfileId = '';
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to start session: ${msg}`, 'error');
		} finally {
			loading = false;
		}
	}

	async function pauseSession() {
		if (!activeSession) return;
		loading = true;
		try {
			notifyChange(await sessions.pause(activeSession.id));
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to pause session: ${msg}`, 'error');
		} finally {
			loading = false;
		}
	}

	async function resumeSession() {
		if (!activeSession) return;
		loading = true;
		try {
			notifyChange(await sessions.resume(activeSession.id));
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to resume session: ${msg}`, 'error');
		} finally {
			loading = false;
		}
	}

	async function completeSession() {
		if (!activeSession) return;
		loading = true;
		try {
			// Disable heater for safety
			if ($deviceId) {
				await control.setHeaterEnable($deviceId, false).catch(() => {});
			}
			await sessions.complete(activeSession.id);
			notifyChange(null);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to complete session: ${msg}`, 'error');
		} finally {
			loading = false;
		}
	}
</script>

<div class="rounded-lg border border-border bg-card p-4">
	{#if !activeSession}
		<!-- No active session -->
		{#if showForm}
			<form onsubmit={(e) => { e.preventDefault(); startWithForm(); }} class="space-y-3">
				<input bind:value={sessionName} placeholder="Session name (optional)" class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground" />
				{#if profileList.length > 0}
					<select bind:value={selectedProfileId} class="w-full appearance-none rounded border border-border bg-card px-3 py-1.5 text-sm text-foreground">
						<option value="">No profile</option>
						{#each profileList as profile}
							<option class="bg-card text-foreground" value={profile.id}>
								{profile.name}{profile.charge_temp ? ` · ${profile.charge_temp}°C` : ''}{profile.target_total_time ? ` · ${Math.round(profile.target_total_time / 60)}min` : ''}
							</option>
						{/each}
					</select>
				{/if}
				<input bind:value={beanOrigin} placeholder="Bean origin (optional)" class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground" />
				<input bind:value={beanVariety} placeholder="Bean variety (optional)" class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground" />
				<input bind:value={greenWeight} type="number" step="0.1" placeholder="Green weight (g)" class="w-full rounded border border-border bg-input px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground" />
				<div class="flex gap-2">
					<button type="submit" disabled={loading} class="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
						Start Roast
					</button>
					<button type="button" onclick={() => (showForm = false)} class="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
						Cancel
					</button>
				</div>
			</form>
		{:else}
			{#if profileList.length > 0}
				<select bind:value={selectedProfileId} class="mb-2 w-full appearance-none rounded border border-border bg-card px-3 py-1.5 text-sm text-foreground">
					<option value="">No profile</option>
					{#each profileList as profile}
						<option class="bg-card text-foreground" value={profile.id}>
							{profile.name}{profile.charge_temp ? ` · ${profile.charge_temp}°C` : ''}{profile.target_total_time ? ` · ${Math.round(profile.target_total_time / 60)}min` : ''}
						</option>
					{/each}
				</select>
			{/if}
			<div class="flex gap-2">
				<button onclick={quickStart} disabled={loading || !$deviceId} class="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
					{loading ? 'Starting...' : 'Quick Start'}
				</button>
				<button onclick={() => (showForm = true)} disabled={!$deviceId} class="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
					Details...
				</button>
			</div>
			{#if !$deviceId}
				<p class="mt-2 text-xs text-muted-foreground">Waiting for device connection...</p>
			{/if}
		{/if}
	{:else}
		<!-- Active session -->
		<div class="mb-3 flex items-center justify-between">
			<div>
				<div class="text-sm font-medium text-foreground">{activeSession.name}</div>
				<div class="text-xs text-muted-foreground">
					{activeSession.status === 'paused' ? 'Paused' : 'Roasting'}
					{#if activeSession.bean_origin}
						· {activeSession.bean_origin}
					{/if}
				</div>
			</div>
			<RoastTimer startTime={activeSession.start_time} />
		</div>
		<div class="flex gap-2">
			{#if activeSession.status === 'active'}
				<button onclick={pauseSession} disabled={loading} class="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
					Pause
				</button>
			{:else if activeSession.status === 'paused'}
				<button onclick={resumeSession} disabled={loading} class="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
					Resume
				</button>
			{/if}
			<button onclick={completeSession} disabled={loading} class="flex-1 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50">
				Complete
			</button>
		</div>
	{/if}
</div>
