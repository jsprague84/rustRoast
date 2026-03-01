<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let { startTime }: { startTime: string | null } = $props();
	let elapsed = $state('00:00');
	let interval: ReturnType<typeof setInterval> | null = null;

	function update() {
		if (!startTime) {
			elapsed = '00:00';
			return;
		}
		const start = new Date(startTime).getTime();
		const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
		const m = Math.floor(diff / 60);
		const s = diff % 60;
		elapsed = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}

	onMount(() => {
		update();
		interval = setInterval(update, 1000);
	});

	onDestroy(() => {
		if (interval) clearInterval(interval);
	});
</script>

<div class="text-center">
	<div class="text-xs font-medium text-muted-foreground">Elapsed</div>
	<div class="font-mono text-3xl font-bold text-foreground">{elapsed}</div>
</div>
