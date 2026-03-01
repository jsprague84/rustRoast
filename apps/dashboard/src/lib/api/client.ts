import type { SessionWithTelemetry } from '$lib/types/session.js';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const API_KEY_STORAGE_KEY = 'rustroast_api_key';

function getApiKey(): string | null {
	if (typeof window === 'undefined') return null;
	return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setApiKey(key: string) {
	localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function clearApiKey() {
	localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export function hasApiKey(): boolean {
	return !!getApiKey();
}

async function request<T>(
	path: string,
	options: RequestInit = {},
	requiresAuth = false
): Promise<T> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(options.headers as Record<string, string> ?? {})
	};

	if (requiresAuth) {
		const key = getApiKey();
		if (key) {
			headers['Authorization'] = `Bearer ${key}`;
		}
	}

	const res = await fetch(`${BASE_URL}${path}`, {
		...options,
		headers
	});

	if (res.status === 401) {
		window.dispatchEvent(new CustomEvent('auth_required'));
		throw new Error('Authentication required');
	}

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`API error ${res.status}: ${body}`);
	}

	if (res.status === 204) return undefined as T;
	return res.json();
}

// --- Control API (requires auth) ---

export interface ControlApi {
	setSetpoint(deviceId: string, value: number): Promise<void>;
	setFanPwm(deviceId: string, value: number): Promise<void>;
	setHeaterPwm(deviceId: string, value: number): Promise<void>;
	setMode(deviceId: string, mode: 'manual' | 'auto'): Promise<void>;
	setHeaterEnable(deviceId: string, enabled: boolean): Promise<void>;
	setPid(deviceId: string, kp: number, ki: number, kd: number): Promise<void>;
	emergencyStop(deviceId: string): Promise<void>;
}

export const control: ControlApi = {
	setSetpoint: (deviceId, value) =>
		request(`/api/roaster/${deviceId}/control/setpoint`, {
			method: 'POST',
			body: JSON.stringify({ value })
		}, true),

	setFanPwm: (deviceId, value) =>
		request(`/api/roaster/${deviceId}/control/fan_pwm`, {
			method: 'POST',
			body: JSON.stringify({ value })
		}, true),

	setHeaterPwm: (deviceId, value) =>
		request(`/api/roaster/${deviceId}/control/heater_pwm`, {
			method: 'POST',
			body: JSON.stringify({ value })
		}, true),

	setMode: (deviceId, mode) =>
		request(`/api/roaster/${deviceId}/control/mode`, {
			method: 'POST',
			body: JSON.stringify({ mode })
		}, true),

	setHeaterEnable: (deviceId, enabled) =>
		request(`/api/roaster/${deviceId}/control/heater_enable`, {
			method: 'POST',
			body: JSON.stringify({ enabled })
		}, true),

	setPid: (deviceId, kp, ki, kd) =>
		request(`/api/roaster/${deviceId}/control/pid`, {
			method: 'POST',
			body: JSON.stringify({ kp, ki, kd })
		}, true),

	emergencyStop: (deviceId) =>
		request(`/api/roaster/${deviceId}/control/emergency_stop`, {
			method: 'POST'
		}, true)
};

// --- Session API ---

export interface RoastSession {
	id: string;
	name: string;
	device_id: string;
	status: string;
	start_time: string | null;
	end_time: string | null;
	created_at: string;
	bean_origin: string | null;
	bean_variety: string | null;
	green_weight: number | null;
	roasted_weight: number | null;
	notes: string | null;
	total_time_seconds: number | null;
}

export interface CreateSessionRequest {
	name: string;
	device_id: string;
	bean_origin?: string;
	bean_variety?: string;
	green_weight?: number;
	notes?: string;
}

export const sessions = {
	create: (req: CreateSessionRequest) =>
		request<RoastSession>('/api/sessions', {
			method: 'POST',
			body: JSON.stringify(req)
		}),

	list: (deviceId?: string, limit?: number) => {
		const params = new URLSearchParams();
		if (deviceId) params.set('device_id', deviceId);
		if (limit) params.set('limit', String(limit));
		const qs = params.toString();
		return request<RoastSession[]>(`/api/sessions${qs ? `?${qs}` : ''}`);
	},

	get: (id: string) =>
		request<SessionWithTelemetry>(`/api/sessions/${id}`),

	start: (id: string) =>
		request<RoastSession>(`/api/sessions/${id}/start`, { method: 'POST' }),

	pause: (id: string) =>
		request<RoastSession>(`/api/sessions/${id}/pause`, { method: 'POST' }),

	resume: (id: string) =>
		request<RoastSession>(`/api/sessions/${id}/resume`, { method: 'POST' }),

	complete: (id: string) =>
		request<RoastSession>(`/api/sessions/${id}/complete`, { method: 'POST' }),

	delete: (id: string) =>
		request<void>(`/api/sessions/${id}`, { method: 'DELETE' })
};

// --- Roast Events API ---

export interface RoastEvent {
	id: string;
	session_id: string;
	event_type: string;
	elapsed_seconds: number;
	temperature: number | null;
	notes: string | null;
	created_at: string;
}

export interface CreateRoastEventRequest {
	event_type: string;
	elapsed_seconds: number;
	temperature?: number;
	notes?: string;
}

export const events = {
	list: (sessionId: string) =>
		request<RoastEvent[]>(`/api/sessions/${sessionId}/events`),

	create: (sessionId: string, req: CreateRoastEventRequest) =>
		request<RoastEvent>(`/api/sessions/${sessionId}/events`, {
			method: 'POST',
			body: JSON.stringify(req)
		}),

	delete: (sessionId: string, eventId: string) =>
		request<void>(`/api/sessions/${sessionId}/events/${eventId}`, { method: 'DELETE' })
};

// --- Profiles API ---

export interface RoastProfile {
	id: string;
	name: string;
	description: string | null;
	target_total_time: number | null;
	target_end_temp: number | null;
	charge_temp: number | null;
	created_at: string;
}

export interface ProfileWithPoints extends RoastProfile {
	points: ProfilePoint[];
}

export interface ProfilePoint {
	id: string;
	time_seconds: number;
	target_temp: number;
	fan_speed: number | null;
	notes: string | null;
}

export interface CreateProfileRequest {
	name: string;
	description?: string;
	target_total_time?: number;
	target_first_crack?: number;
	target_end_temp?: number;
	preheat_temp?: number;
	charge_temp?: number;
	points: { time_seconds: number; target_temp: number; fan_speed?: number; notes?: string }[];
}

export const profiles = {
	list: () =>
		request<RoastProfile[]>('/api/profiles'),

	get: (id: string) =>
		request<ProfileWithPoints>(`/api/profiles/${id}`),

	create: (req: CreateProfileRequest) =>
		request<ProfileWithPoints>('/api/profiles', {
			method: 'POST',
			body: JSON.stringify(req)
		}),

	update: (id: string, req: CreateProfileRequest) =>
		request<ProfileWithPoints>(`/api/profiles/${id}`, {
			method: 'PUT',
			body: JSON.stringify(req)
		}),

	delete: (id: string) =>
		request<void>(`/api/profiles/${id}`, { method: 'DELETE' }),

	importArtisan: (alogContent: string, name?: string) =>
		request<RoastProfile>('/api/profiles/import/artisan', {
			method: 'POST',
			body: JSON.stringify({ alog_content: alogContent, name })
		})
};
