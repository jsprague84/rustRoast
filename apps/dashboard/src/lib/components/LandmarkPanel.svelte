<script lang="ts">
	import { events, control, type RoastSession, type RoastEvent } from '$lib/api/client.js';
	import { telemetry, deviceId, telemetryHistory } from '$lib/stores/telemetry.js';
	import { landmarkLabels } from '$lib/constants/landmarks.js';
	import { notifications } from '$lib/stores/notifications.js';
	import { Droplets, Sparkles, Flame, Zap, Activity, ArrowDown } from 'lucide-svelte';

	let { activeSession }: { activeSession: RoastSession | null } = $props();

	interface MarkedLandmark {
		type: string;
		label: string;
		temperature: number;
		elapsedSeconds: number;
	}

	let marked = $state<MarkedLandmark[]>([]);

	const landmarks = Object.entries(landmarkLabels).map(([type, label]) => ({
		type,
		label
	}));

	// Restore landmarks from backend when active session changes
	$effect(() => {
		if (activeSession) {
			loadExistingLandmarks(activeSession.id);
		} else {
			marked = [];
		}
	});

	async function loadExistingLandmarks(sessionId: string) {
		try {
			const existing = await events.list(sessionId);
			marked = existing.map((e: RoastEvent) => ({
				type: e.event_type,
				label: landmarks.find((l) => l.type === e.event_type)?.label ?? e.event_type,
				temperature: e.temperature ?? 0,
				elapsedSeconds: e.elapsed_seconds
			}));
		} catch {
			// Ignore errors loading existing landmarks
		}
	}

	function isMarked(type: string): MarkedLandmark | undefined {
		return marked.find((m) => m.type === type);
	}

	function getElapsedSeconds(): number {
		if (!activeSession?.start_time) return 0;
		return Math.floor((Date.now() - new Date(activeSession.start_time).getTime()) / 1000);
	}

	async function markLandmark(type: string) {
		if (!activeSession || isMarked(type)) return;
		const temp = $telemetry?.beanTemp ?? 0;
		const elapsed = getElapsedSeconds();

		try {
			await events.create(activeSession.id, {
				event_type: type,
				elapsed_seconds: elapsed,
				temperature: temp
			});

			marked = [
				...marked,
				{
					type,
					label: landmarks.find((l) => l.type === type)?.label ?? type,
					temperature: temp,
					elapsedSeconds: elapsed
				}
			];

			// Drop automatically disables heater
			if (type === 'drop' && $deviceId) {
				await control.setHeaterEnable($deviceId, false).catch(() => {});
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Failed to mark landmark: ${msg}`, 'error');
		}
	}

	function formatTime(secs: number): string {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
</script>

<div class="rounded-lg border border-border bg-card p-4">
	<h3 class="mb-3 text-sm font-semibold text-foreground">Landmarks</h3>
	<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
		{#each landmarks as lm}
			{@const existing = isMarked(lm.type)}
			<button
				onclick={() => markLandmark(lm.type)}
				disabled={!activeSession || activeSession.status !== 'active' || !!existing}
				aria-label="Mark {lm.label}{existing ? ` (marked at ${existing.temperature.toFixed(1)}°C)` : ''}"
				class="flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors
					{existing
						? 'border-green-500/30 bg-green-500/10 text-green-400'
						: 'border-border text-muted-foreground hover:bg-accent disabled:opacity-40'}"
			>
				{#if lm.type === 'drying_end'}<Droplets class="h-4 w-4" />
				{:else if lm.type === 'first_crack_start'}<Sparkles class="h-4 w-4" />
				{:else if lm.type === 'first_crack_end'}<Flame class="h-4 w-4" />
				{:else if lm.type === 'second_crack_start'}<Zap class="h-4 w-4" />
				{:else if lm.type === 'second_crack_end'}<Activity class="h-4 w-4" />
				{:else if lm.type === 'drop'}<ArrowDown class="h-4 w-4" />
				{/if}
				<span class="font-medium">{lm.label}</span>
				{#if existing}
					<span class="text-[10px]">
						{existing.temperature.toFixed(1)}°C · {formatTime(existing.elapsedSeconds)}
					</span>
				{/if}
			</button>
		{/each}
	</div>
</div>
