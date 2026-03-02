<script lang="ts">
	import { control } from '$lib/api/client.js';
	import { deviceId } from '$lib/stores/telemetry.js';
	import { notifications } from '$lib/stores/notifications.js';
	import { OctagonX } from 'lucide-svelte';

	let stopping = $state(false);

	async function emergencyStop() {
		if (!$deviceId) return;
		stopping = true;
		try {
			await Promise.all([
				control.setHeaterEnable($deviceId, false),
				control.setHeaterPwm($deviceId, 0),
				control.emergencyStop($deviceId)
			]);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			notifications.add(`Emergency stop error: ${msg}`, 'error');
		} finally {
			stopping = false;
		}
	}
</script>

<button
	onclick={emergencyStop}
	disabled={!$deviceId || stopping}
	aria-label="Emergency stop"
	class="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-lg font-bold text-white shadow-lg hover:bg-red-700 active:bg-red-800 disabled:opacity-50"
>
	<OctagonX class="h-5 w-5" />
	{stopping ? '...' : 'STOP'}
</button>
