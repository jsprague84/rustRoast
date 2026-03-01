import { writable } from 'svelte/store';

export interface Notification {
	id: string;
	message: string;
	type: 'error' | 'warning' | 'success';
	timestamp: number;
}

const { subscribe, update } = writable<Notification[]>([]);

let counter = 0;

function add(message: string, type: Notification['type'] = 'error', dismissMs = 5000) {
	const id = `notif-${++counter}`;
	const notification: Notification = { id, message, type, timestamp: Date.now() };
	update((n) => [...n, notification]);
	if (dismissMs > 0) {
		setTimeout(() => dismiss(id), dismissMs);
	}
	return id;
}

function dismiss(id: string) {
	update((n) => n.filter((notif) => notif.id !== id));
}

function clear() {
	update(() => []);
}

export const notifications = { subscribe, add, dismiss, clear };

/** Convenience: call in .catch() to show an error toast */
export function notifyError(prefix: string) {
	return (err: unknown) => {
		const msg = err instanceof Error ? err.message : String(err);
		notifications.add(`${prefix}: ${msg}`, 'error');
	};
}
