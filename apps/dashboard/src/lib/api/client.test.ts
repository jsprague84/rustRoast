import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { control, sessions, setApiKey, clearApiKey } from './client';

// --- fetch mock ---

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('API client', () => {
	beforeEach(() => {
		clearApiKey();
		mockFetch.mockReset();
	});

	afterEach(() => {
		clearApiKey();
	});

	describe('authorization', () => {
		it('sends Authorization header for control endpoints', async () => {
			setApiKey('test-secret-key');
			mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

			await control.setSetpoint('device1', 200);

			expect(mockFetch).toHaveBeenCalledOnce();
			const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
			expect(headers['Authorization']).toBe('Bearer test-secret-key');
		});

		it('does NOT send Authorization header for read-only endpoints', async () => {
			setApiKey('test-secret-key');
			mockFetch.mockResolvedValueOnce(jsonResponse([]));

			await sessions.list();

			expect(mockFetch).toHaveBeenCalledOnce();
			const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
			expect(headers['Authorization']).toBeUndefined();
		});

		it('handles 401 responses by dispatching auth_required event', async () => {
			mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

			const authHandler = vi.fn();
			window.addEventListener('auth_required', authHandler);

			await expect(sessions.list()).rejects.toThrow('Authentication required');
			expect(authHandler).toHaveBeenCalledOnce();

			window.removeEventListener('auth_required', authHandler);
		});
	});

	describe('control endpoints', () => {
		it('sends setpoint with correct URL and body', async () => {
			mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

			await control.setSetpoint('roaster-1', 200);

			const [url, options] = mockFetch.mock.calls[0];
			expect(url).toBe('/api/roaster/roaster-1/control/setpoint');
			expect(options?.method).toBe('POST');
			expect(JSON.parse(options?.body as string)).toEqual({ value: 200 });
		});

		it('sends emergency stop with POST and no body', async () => {
			mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

			await control.emergencyStop('roaster-1');

			const [url, options] = mockFetch.mock.calls[0];
			expect(url).toBe('/api/roaster/roaster-1/control/emergency_stop');
			expect(options?.method).toBe('POST');
		});
	});

	describe('session endpoints', () => {
		it('creates a session with POST', async () => {
			const session = {
				id: '1',
				name: 'Test Roast',
				device_id: 'dev1',
				status: 'created',
				created_at: '2026-01-01T00:00:00Z'
			};
			mockFetch.mockResolvedValueOnce(jsonResponse(session));

			const result = await sessions.create({ name: 'Test Roast', device_id: 'dev1' });

			const [url, options] = mockFetch.mock.calls[0];
			expect(url).toBe('/api/sessions');
			expect(options?.method).toBe('POST');
			expect(result.name).toBe('Test Roast');
		});

		it('lists sessions with optional query params', async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse([]));

			await sessions.list('dev1', 10);

			const [url] = mockFetch.mock.calls[0];
			expect(url).toBe('/api/sessions?device_id=dev1&limit=10');
		});
	});
});
