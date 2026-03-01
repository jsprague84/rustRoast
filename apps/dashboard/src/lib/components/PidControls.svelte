<script lang="ts">
	import { control } from '$lib/api/client.js';
	import { telemetry, deviceId } from '$lib/stores/telemetry.js';
	import { notifyError } from '$lib/stores/notifications.js';

	let mode = $state<'manual' | 'auto'>('manual');
	let kp = $state(15);
	let ki = $state(1);
	let kd = $state(25);
	let synced = false;

	// Sync from telemetry only on first mount
	$effect(() => {
		const t = $telemetry;
		if (t && !synced) {
			mode = t.controlMode === 1 ? 'auto' : 'manual';
			if (t.Kp != null) kp = t.Kp;
			if (t.Ki != null) ki = t.Ki;
			if (t.Kd != null) kd = t.Kd;
			synced = true;
		}
	});

	async function setMode(newMode: 'manual' | 'auto') {
		if (!$deviceId) return;
		mode = newMode;
		await control.setMode($deviceId, newMode).catch(notifyError('Failed to set mode'));
	}

	async function applyPid() {
		if (!$deviceId) return;
		await control.setPid($deviceId, kp, ki, kd).catch(notifyError('Failed to apply PID'));
	}
</script>

<div class="space-y-3">
	<!-- Mode Toggle -->
	<div>
		<span class="text-xs font-medium text-muted-foreground" id="control-mode-label">Control Mode</span>
		<div class="mt-1 flex rounded-md border border-border" role="group" aria-labelledby="control-mode-label">
			<button
				onclick={() => setMode('manual')}
				disabled={!$deviceId}
				class="flex-1 rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors
					{mode === 'manual' ? 'bg-foreground text-background' : 'bg-card text-muted-foreground hover:bg-accent'}
					disabled:opacity-40"
			>
				Manual
			</button>
			<button
				onclick={() => setMode('auto')}
				disabled={!$deviceId}
				class="flex-1 rounded-r-md px-3 py-1.5 text-xs font-medium transition-colors
					{mode === 'auto' ? 'bg-amber-600 text-white' : 'bg-card text-muted-foreground hover:bg-accent'}
					disabled:opacity-40"
			>
				Auto (PID)
			</button>
		</div>
	</div>

	<!-- PID Parameters (visible in Auto mode) -->
	{#if mode === 'auto'}
		<div class="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
			<div class="grid grid-cols-3 gap-2">
				<div>
					<label for="pid-kp" class="text-[10px] font-medium text-amber-400">Kp</label>
					<input
						id="pid-kp"
						type="number"
						bind:value={kp}
						step="0.1"
						class="w-full rounded border border-amber-500/30 bg-input px-2 py-1 text-xs text-foreground"
					/>
				</div>
				<div>
					<label for="pid-ki" class="text-[10px] font-medium text-amber-400">Ki</label>
					<input
						id="pid-ki"
						type="number"
						bind:value={ki}
						step="0.01"
						class="w-full rounded border border-amber-500/30 bg-input px-2 py-1 text-xs text-foreground"
					/>
				</div>
				<div>
					<label for="pid-kd" class="text-[10px] font-medium text-amber-400">Kd</label>
					<input
						id="pid-kd"
						type="number"
						bind:value={kd}
						step="0.1"
						class="w-full rounded border border-amber-500/30 bg-input px-2 py-1 text-xs text-foreground"
					/>
				</div>
			</div>
			<button
				onclick={applyPid}
				disabled={!$deviceId}
				class="w-full rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
			>
				Apply PID
			</button>
		</div>
	{/if}
</div>
