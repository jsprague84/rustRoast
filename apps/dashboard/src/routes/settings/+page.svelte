<script lang="ts">
	import { hasApiKey, setApiKey, clearApiKey } from '$lib/api/client.js';

	let apiKey = $state('');
	let saved = $state(false);
	let hasKey = $state(false);

	$effect(() => {
		hasKey = hasApiKey();
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
</script>

<svelte:head>
	<title>Settings | rustRoast</title>
</svelte:head>

<div class="max-w-lg">
	<h1 class="text-2xl font-bold text-foreground">Settings</h1>

	<div class="mt-6 rounded-lg border border-border bg-card p-4">
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
</div>
