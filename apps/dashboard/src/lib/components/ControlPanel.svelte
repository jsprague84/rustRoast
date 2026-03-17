<script lang="ts">
	import { control } from '$lib/api/client.js';
	import { telemetry, deviceId } from '$lib/stores/telemetry.js';
	import { notifyError } from '$lib/stores/notifications.js';

	let setpointValue = $state(200);
	let fanValue = $state(128);
	let heaterValue = $state(0);
	let heaterEnabled = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let synced = false;

	let isAutoMode = $derived($telemetry?.controlMode === 1);

	// Sync values from telemetry on first mount (manual controls)
	// and continuously sync heater value in auto mode (PID-driven)
	$effect(() => {
		const t = $telemetry;
		if (!t) return;
		if (!synced) {
			setpointValue = t.setpoint ?? 200;
			fanValue = t.fanPWM ?? 128;
			heaterValue = t.heaterPWM ?? 0;
			heaterEnabled = t.heaterEnable === 1;
			synced = true;
		} else if (isAutoMode) {
			// In auto mode, PID controls the heater — keep slider in sync
			heaterValue = t.heaterPWM ?? 0;
		}
	});

	function debounce(fn: () => void, ms = 300) {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(fn, ms);
	}

	function adjustSetpoint(delta: number) {
		setpointValue = Math.max(0, Math.min(250, setpointValue + delta));
		sendSetpoint();
	}

	async function sendSetpoint() {
		if (!$deviceId) return;
		await control.setSetpoint($deviceId, setpointValue).catch(notifyError('Failed to set setpoint'));
	}

	function onFanChange() {
		if (!$deviceId) return;
		debounce(() => control.setFanPwm($deviceId!, fanValue).catch(notifyError('Failed to set fan')));
	}

	function onHeaterChange() {
		if (!$deviceId) return;
		debounce(() => control.setHeaterPwm($deviceId!, heaterValue).catch(notifyError('Failed to set heater')));
	}

	async function toggleHeater() {
		if (!$deviceId) return;
		heaterEnabled = !heaterEnabled;
		await control.setHeaterEnable($deviceId, heaterEnabled).catch(notifyError('Failed to toggle heater'));
	}
</script>

<div class="space-y-4">
	<!-- Setpoint -->
	<div>
		<label for="setpoint-input" class="text-xs font-medium text-muted-foreground">Setpoint (°C)</label>
		<div class="mt-1 flex items-center gap-2">
			<button
				onclick={() => adjustSetpoint(-5)}
				disabled={!$deviceId}
				aria-label="Decrease setpoint by 5°C"
				class="rounded border border-border px-2 py-1 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
			>
				-5
			</button>
			<input
				id="setpoint-input"
				type="number"
				bind:value={setpointValue}
				onchange={sendSetpoint}
				min="0"
				max="250"
				step="1"
				disabled={!$deviceId}
				class="w-20 rounded border border-border bg-input px-2 py-1.5 text-center text-sm text-foreground disabled:opacity-40"
			/>
			<button
				onclick={() => adjustSetpoint(5)}
				disabled={!$deviceId}
				aria-label="Increase setpoint by 5°C"
				class="rounded border border-border px-2 py-1 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
			>
				+5
			</button>
		</div>
	</div>

	<!-- Fan PWM -->
	<div>
		<label for="fan-slider" class="text-xs font-medium text-muted-foreground">Fan ({fanValue})</label>
		<input
			id="fan-slider"
			type="range"
			bind:value={fanValue}
			oninput={onFanChange}
			min="0"
			max="255"
			disabled={!$deviceId}
			class="mt-1 w-full accent-violet-500 disabled:opacity-40"
		/>
	</div>

	<!-- Heater PWM -->
	<div>
		<label for="heater-slider" class="text-xs font-medium text-muted-foreground">
			Heater ({heaterValue}%){#if isAutoMode} <span class="text-amber-400">(PID)</span>{/if}
		</label>
		<input
			id="heater-slider"
			type="range"
			bind:value={heaterValue}
			oninput={onHeaterChange}
			min="0"
			max="100"
			disabled={!$deviceId || isAutoMode}
			class="mt-1 w-full accent-red-500 disabled:opacity-40"
		/>
	</div>

	<!-- Heater Enable -->
	<div class="flex items-center justify-between">
		<span class="text-xs font-medium text-muted-foreground">Heater</span>
		<button
			onclick={toggleHeater}
			disabled={!$deviceId}
			aria-label="Toggle heater {heaterEnabled ? 'off' : 'on'}"
			class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40
				{heaterEnabled ? 'bg-red-500' : 'bg-muted'}"
		>
			<span
				class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform
					{heaterEnabled ? 'translate-x-6' : 'translate-x-1'}"
			></span>
		</button>
	</div>
</div>
