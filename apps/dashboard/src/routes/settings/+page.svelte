<script lang="ts">
	import { hasApiKey, setApiKey, clearApiKey, settings } from '$lib/api/client.js';
	import { setRorConfig } from '$lib/stores/telemetry.js';
	import AutotunePanel from '$lib/components/AutotunePanel.svelte';

	let apiKey = $state('');
	let saved = $state(false);
	let hasKey = $state(false);

	let lookahead = $state(20);
	let lookaheadSaved = $state(false);

	let rorWindow = $state(30);
	let rorAlgorithm = $state('moving_average');
	let rorSaved = $state(false);

	interface Alarm {
		name: string;
		condition_type: string;
		threshold: number;
		reference_event?: string;
		enabled: boolean;
	}

	let alarms = $state<Alarm[]>([]);
	let alarmSoundEnabled = $state(true);
	let alarmsSaved = $state(false);

	$effect(() => {
		hasKey = hasApiKey();
	});

	$effect(() => {
		settings.get().then((s) => {
			const val = parseInt(s['profile_lookahead_seconds'] ?? '20', 10);
			if (!isNaN(val)) lookahead = val;

			const rorW = parseInt(s['ror_window_seconds'] ?? '30', 10);
			if (!isNaN(rorW)) rorWindow = rorW;
			rorAlgorithm = s['ror_smoothing_algorithm'] ?? 'moving_average';

			alarmSoundEnabled = s['alarm_sound_enabled'] !== 'false';
			try {
				alarms = JSON.parse(s['roast_alarms'] ?? '[]');
			} catch {
				alarms = [];
			}
		});
	});

	function saveKey() {
		if (apiKey.trim()) {
			setApiKey(apiKey.trim());
			hasKey = true;
			saved = true;
			setTimeout(() => (saved = false), 2000);
		}
	}

	function removeKey() {
		clearApiKey();
		apiKey = '';
		hasKey = false;
	}

	function saveLookahead() {
		const clamped = Math.max(5, Math.min(60, lookahead));
		lookahead = clamped;
		settings.set('profile_lookahead_seconds', String(clamped)).then(() => {
			lookaheadSaved = true;
			setTimeout(() => (lookaheadSaved = false), 2000);
		});
	}

	function saveAlarms() {
		Promise.all([
			settings.set('roast_alarms', JSON.stringify(alarms)),
			settings.set('alarm_sound_enabled', String(alarmSoundEnabled))
		]).then(() => {
			alarmsSaved = true;
			setTimeout(() => (alarmsSaved = false), 2000);
		});
	}

	function addAlarm() {
		alarms = [
			...alarms,
			{ name: 'New Alarm', condition_type: 'temp_above', threshold: 200, enabled: true }
		];
	}

	function removeAlarm(index: number) {
		alarms = alarms.filter((_, i) => i !== index);
	}

	function saveRorSettings() {
		const clampedWindow = Math.max(5, Math.min(120, rorWindow));
		rorWindow = clampedWindow;
		Promise.all([
			settings.set('ror_window_seconds', String(clampedWindow)),
			settings.set('ror_smoothing_algorithm', rorAlgorithm)
		]).then(() => {
			setRorConfig(clampedWindow, rorAlgorithm);
			rorSaved = true;
			setTimeout(() => (rorSaved = false), 2000);
		});
	}
</script>

<svelte:head>
	<title>Settings | rustRoast</title>
</svelte:head>

<div class="max-w-lg space-y-6">
	<h1 class="text-2xl font-bold text-foreground">Settings</h1>

	<div class="rounded-lg border border-border bg-card p-4">
		<h2 class="text-lg font-semibold text-foreground">API Key</h2>
		<p class="mt-1 text-sm text-muted-foreground">Required for controlling the roaster (setpoint, fan, heater, emergency stop).</p>

		<div class="mt-3 flex gap-2">
			<input
				type="password"
				bind:value={apiKey}
				placeholder={hasKey ? '••••••••' : 'Enter API key'}
				class="flex-1 rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
			/>
			<button
				onclick={saveKey}
				class="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
			>
				Save
			</button>
			{#if hasKey}
				<button
					onclick={removeKey}
					class="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
				>
					Clear
				</button>
			{/if}
		</div>
		{#if saved}
			<p class="mt-2 text-sm text-green-400">API key saved.</p>
		{/if}
	</div>

	<div class="rounded-lg border border-border bg-card p-4">
		<h2 class="text-lg font-semibold text-foreground">Profile Following</h2>

		<label for="lookahead" class="mt-3 block text-sm font-medium text-foreground">
			Profile Lookahead (seconds)
		</label>
		<p class="mt-1 text-sm text-muted-foreground">
			How far ahead to read the profile curve when following. Higher values smooth out transitions. Default: 20s
		</p>
		<div class="mt-2 flex gap-2">
			<input
				id="lookahead"
				type="number"
				min="5"
				max="60"
				step="1"
				bind:value={lookahead}
				onblur={saveLookahead}
				class="w-24 rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
			/>
			<button
				onclick={saveLookahead}
				class="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
			>
				Save
			</button>
		</div>
		{#if lookaheadSaved}
			<p class="mt-2 text-sm text-green-400">Lookahead saved.</p>
		{/if}
	</div>

	<div class="rounded-lg border border-border bg-card p-4">
		<h2 class="text-lg font-semibold text-foreground">Rate of Rise</h2>

		<label for="ror-window" class="mt-3 block text-sm font-medium text-foreground">
			Smoothing Window ({rorWindow}s)
		</label>
		<p class="mt-1 text-sm text-muted-foreground">
			Time window for RoR calculation. Larger values produce smoother curves. Default: 30s
		</p>
		<input
			id="ror-window"
			type="range"
			min="5"
			max="120"
			step="5"
			bind:value={rorWindow}
			class="mt-2 w-full"
		/>
		<div class="mt-0.5 flex justify-between text-xs text-muted-foreground">
			<span>5s (responsive)</span>
			<span>120s (smooth)</span>
		</div>

		<label for="ror-algorithm" class="mt-4 block text-sm font-medium text-foreground">
			Smoothing Algorithm
		</label>
		<p class="mt-1 text-sm text-muted-foreground">
			Method used to calculate rate of change from temperature data.
		</p>
		<select
			id="ror-algorithm"
			bind:value={rorAlgorithm}
			class="mt-2 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
		>
			<option value="moving_average">Moving Average</option>
			<option value="weighted_moving_average">Weighted Moving Average</option>
			<option value="savitzky_golay">Savitzky-Golay</option>
		</select>

		<button
			onclick={saveRorSettings}
			class="mt-3 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
		>
			Save
		</button>
		{#if rorSaved}
			<p class="mt-2 text-sm text-green-400">RoR settings saved.</p>
		{/if}
	</div>

	<div class="rounded-lg border border-border bg-card p-4">
		<h2 class="text-lg font-semibold text-foreground">Roast Alarms</h2>
		<p class="mt-1 text-sm text-muted-foreground">Configure alarms that trigger during active roasts.</p>

		<div class="mt-3 flex items-center gap-2">
			<input
				id="alarm-sound"
				type="checkbox"
				bind:checked={alarmSoundEnabled}
				class="h-4 w-4 rounded border-border"
			/>
			<label for="alarm-sound" class="text-sm text-foreground">Enable alarm sound</label>
		</div>

		<div class="mt-4 space-y-3">
			{#each alarms as alarm, i}
				<div class="rounded-md border border-border/50 bg-muted/30 p-3 space-y-2">
					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							bind:checked={alarm.enabled}
							class="h-4 w-4 rounded border-border"
						/>
						<input
							type="text"
							bind:value={alarm.name}
							class="flex-1 rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground"
							placeholder="Alarm name"
						/>
						<button
							onclick={() => removeAlarm(i)}
							class="rounded p-1 text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
							title="Remove alarm"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
					<div class="flex flex-wrap items-center gap-2 text-sm">
						<select
							bind:value={alarm.condition_type}
							class="rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground"
						>
							<option value="temp_above">Temp above</option>
							<option value="temp_below">Temp below</option>
							<option value="ror_below">RoR below</option>
							<option value="time_after_event">Time after event</option>
						</select>
						<input
							type="number"
							bind:value={alarm.threshold}
							step="0.5"
							class="w-20 rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground"
						/>
						<span class="text-muted-foreground">
							{alarm.condition_type.includes('temp') ? '°C' : alarm.condition_type === 'ror_below' ? '°C/min' : 's'}
						</span>
						{#if alarm.condition_type === 'ror_below' || alarm.condition_type === 'time_after_event'}
							<span class="text-muted-foreground">after</span>
							<select
								bind:value={alarm.reference_event}
								class="rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground"
							>
								<option value="charge">Charge</option>
								<option value="drying_end">Drying End</option>
								<option value="first_crack_start">First Crack</option>
							</select>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<div class="mt-3 flex items-center gap-2">
			<button
				onclick={addAlarm}
				class="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
			>
				+ Add Alarm
			</button>
			<button
				onclick={saveAlarms}
				class="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
			>
				Save
			</button>
		</div>
		{#if alarmsSaved}
			<p class="mt-2 text-sm text-green-400">Alarms saved.</p>
		{/if}
	</div>

	<AutotunePanel />
</div>
