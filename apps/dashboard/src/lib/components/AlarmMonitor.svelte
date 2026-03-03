<script lang="ts">
	import { telemetry, telemetryHistory, rateOfRise } from '$lib/stores/telemetry.js';
	import { settings, type RoastSession, type RoastEvent } from '$lib/api/client.js';
	import { notifications } from '$lib/stores/notifications.js';

	interface Alarm {
		name: string;
		condition_type: 'temp_above' | 'temp_below' | 'time_after_event' | 'ror_below';
		threshold: number;
		reference_event?: string;
		enabled: boolean;
	}

	let { activeSession, sessionEvents = [] }: { activeSession: RoastSession | null; sessionEvents?: RoastEvent[] } = $props();

	let alarms = $state<Alarm[]>([]);
	let soundEnabled = $state(true);
	let firedAlarms = $state<Set<string>>(new Set());
	let prevSessionId = $state<string | null>(null);
	let audioCtx: AudioContext | null = null;

	// Load alarm config
	$effect(() => {
		settings.get().then((s) => {
			soundEnabled = s['alarm_sound_enabled'] !== 'false';
			try {
				alarms = JSON.parse(s['roast_alarms'] ?? '[]');
			} catch {
				alarms = [];
			}
		});
	});

	// Reset on session change
	$effect(() => {
		const sid = activeSession?.id ?? null;
		if (sid !== prevSessionId) {
			prevSessionId = sid;
			firedAlarms = new Set();
		}
	});

	function getElapsedSeconds(): number {
		const hist = $telemetryHistory;
		if (hist.length < 2) return 0;
		return (hist[hist.length - 1].timestamp - hist[0].timestamp) / 1000;
	}

	function playBeep() {
		if (!soundEnabled) return;
		try {
			if (!audioCtx) audioCtx = new AudioContext();
			const osc = audioCtx.createOscillator();
			const gain = audioCtx.createGain();
			osc.connect(gain);
			gain.connect(audioCtx.destination);
			osc.frequency.value = 440;
			gain.gain.value = 0.3;
			osc.start();
			osc.stop(audioCtx.currentTime + 0.2);
		} catch {
			// Audio not available
		}
	}

	function getEventElapsed(eventType: string): number | null {
		const evt = sessionEvents.find((e) => e.event_type === eventType);
		return evt ? evt.elapsed_seconds : null;
	}

	function triggerAlarm(alarm: Alarm, detail: string) {
		const next = new Set(firedAlarms);
		next.add(alarm.name);
		firedAlarms = next;
		notifications.add(`${alarm.name}: ${detail}`, 'warning', 10000);
		playBeep();
	}

	// Evaluate alarms
	$effect(() => {
		if (!activeSession || activeSession.status !== 'active') return;
		const current = $telemetry;
		if (!current) return;
		const currentRoR = $rateOfRise;

		for (const alarm of alarms) {
			if (!alarm.enabled) continue;
			if (firedAlarms.has(alarm.name)) continue;

			switch (alarm.condition_type) {
				case 'temp_above':
					if (current.beanTemp > alarm.threshold) {
						triggerAlarm(alarm, `${current.beanTemp.toFixed(1)}°C > ${alarm.threshold}°C`);
					}
					break;
				case 'temp_below':
					if (current.beanTemp < alarm.threshold) {
						triggerAlarm(alarm, `${current.beanTemp.toFixed(1)}°C < ${alarm.threshold}°C`);
					}
					break;
				case 'ror_below':
					if (currentRoR != null && currentRoR < alarm.threshold) {
						if (alarm.reference_event) {
							const refElapsed = getEventElapsed(alarm.reference_event);
							if (refElapsed == null) break; // Event hasn't happened yet
						}
						triggerAlarm(alarm, `RoR ${currentRoR.toFixed(1)} < ${alarm.threshold}`);
					}
					break;
				case 'time_after_event':
					if (alarm.reference_event) {
						const refElapsed = getEventElapsed(alarm.reference_event);
						if (refElapsed != null) {
							const elapsed = getElapsedSeconds();
							if (elapsed - refElapsed > alarm.threshold) {
								const delta = Math.round(elapsed - refElapsed);
								triggerAlarm(alarm, `${delta}s after ${alarm.reference_event}`);
							}
						}
					}
					break;
			}
		}
	});
</script>
