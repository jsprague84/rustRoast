<script lang="ts">
	import { telemetry, telemetryHistory, rateOfRise, rorWindowSeconds } from '$lib/stores/telemetry.js';
	import { events as eventsApi, settings, type RoastSession } from '$lib/api/client.js';
	import { notifications } from '$lib/stores/notifications.js';

	let { activeSession }: { activeSession: RoastSession | null } = $props();

	let enabled = $state(true);
	let dryTemp = $state(150);
	let dryFired = $state(false);
	let fcFired = $state(false);
	let rorHistory = $state<number[]>([]);
	let fcConsecutive = $state(0);
	let prevSessionId = $state<string | null>(null);

	// Load settings
	$effect(() => {
		settings.get().then((s) => {
			enabled = s['auto_event_detection'] !== 'false';
			const temp = parseInt(s['auto_dry_temp'] ?? '150', 10);
			if (!isNaN(temp)) dryTemp = temp;
		});
	});

	// Reset on session change
	$effect(() => {
		const sid = activeSession?.id ?? null;
		if (sid !== prevSessionId) {
			prevSessionId = sid;
			dryFired = false;
			fcFired = false;
			rorHistory = [];
			fcConsecutive = 0;
		}
	});

	// Compute elapsed seconds from telemetry history
	function getElapsedSeconds(): number {
		const hist = $telemetryHistory;
		if (hist.length < 2) return 0;
		return (hist[hist.length - 1].timestamp - hist[0].timestamp) / 1000;
	}

	// AutoDRY: detect when bean_temp crosses threshold
	$effect(() => {
		if (!enabled || !activeSession || activeSession.status !== 'active') return;
		if (dryFired) return;

		const current = $telemetry;
		if (!current) return;

		if (current.beanTemp >= dryTemp) {
			dryFired = true;
			const elapsed = getElapsedSeconds();
			const temp = current.beanTemp;
			const sessionId = activeSession.id;

			notifications.add(
				`AutoDRY: Bean temp reached ${dryTemp}°C — mark Drying End?`,
				'warning',
				15000,
				{
					label: 'Mark Event',
					callback: () => {
						eventsApi.create(sessionId, {
							event_type: 'drying_end',
							elapsed_seconds: Math.round(elapsed),
							temperature: temp
						}).catch(() => {
							notifications.add('Failed to mark drying end event', 'error');
						});
					}
				}
			);
		}
	});

	// AutoFC: detect RoR drop below 80% of 30s moving average
	$effect(() => {
		if (!enabled || !activeSession || activeSession.status !== 'active') return;
		if (fcFired || dryFired === false) return; // Only after DRY has been detected

		const currentRoR = $rateOfRise;
		if (currentRoR == null) return;

		// Track RoR history using configured window size (at ~1Hz telemetry, readings ≈ seconds)
		const windowSize = Math.max(10, $rorWindowSeconds);
		rorHistory = [...rorHistory.slice(-windowSize), currentRoR];

		if (rorHistory.length < Math.min(10, windowSize)) return; // Need some history

		const avg = rorHistory.reduce((s, v) => s + v, 0) / rorHistory.length;
		if (avg <= 0) return;

		if (currentRoR < avg * 0.8) {
			fcConsecutive++;
		} else {
			fcConsecutive = 0;
		}

		if (fcConsecutive >= 3) {
			fcFired = true;
			const elapsed = getElapsedSeconds();
			const temp = $telemetry?.beanTemp ?? 0;
			const sessionId = activeSession.id;

			notifications.add(
				'AutoFC: RoR drop detected — mark First Crack?',
				'warning',
				15000,
				{
					label: 'Mark Event',
					callback: () => {
						eventsApi.create(sessionId, {
							event_type: 'first_crack_start',
							elapsed_seconds: Math.round(elapsed),
							temperature: temp
						}).catch(() => {
							notifications.add('Failed to mark first crack event', 'error');
						});
					}
				}
			);
		}
	});
</script>
