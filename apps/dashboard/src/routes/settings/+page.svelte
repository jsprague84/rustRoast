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

	<AutotunePanel />
</div>
