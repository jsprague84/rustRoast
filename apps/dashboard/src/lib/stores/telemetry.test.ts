import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// --- WebSocket mock ---

let wsInstances: MockWS[] = [];

class MockWS {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly CLOSING = 2;
	readonly CLOSED = 3;

	readyState = MockWS.CONNECTING;
	url: string;
	onopen: ((ev: Event) => void) | null = null;
	onmessage: ((ev: MessageEvent) => void) | null = null;
	onclose: ((ev: CloseEvent) => void) | null = null;
	onerror: ((ev: Event) => void) | null = null;

	constructor(url: string) {
		this.url = url;
		wsInstances.push(this);
	}

	close() {
		this.readyState = MockWS.CLOSED;
		// Real WebSocket fires onclose asynchronously. Don't fire synchronously
		// here to avoid triggering scheduleReconnect() during destroyTelemetrySocket().
		// Tests should use simulateClose() to trigger onclose explicitly.
	}

	send(_data: string) {}

	simulateOpen() {
		this.readyState = MockWS.OPEN;
		this.onopen?.(new Event('open'));
	}

	simulateClose() {
		this.readyState = MockWS.CLOSED;
		this.onclose?.(new CloseEvent('close'));
	}

	simulateMessage(data: string) {
		this.onmessage?.(new MessageEvent('message', { data }));
	}
}

vi.stubGlobal('WebSocket', MockWS);

import {
	telemetry,
	deviceId,
	connectionStatus,
	telemetryHistory,
	rateOfRise,
	clearHistory,
	initTelemetrySocket,
	destroyTelemetrySocket
} from './telemetry';

function makeTelemetryMsg(beanTemp: number, device = 'test-device') {
	return JSON.stringify({
		device_id: device,
		telemetry: {
			beanTemp,
			envTemp: 150,
			heaterPWM: 50,
			fanPWM: 200,
			setpoint: 200,
			controlMode: 0,
			heaterEnable: 1
		}
	});
}

describe('telemetry store', () => {
	beforeEach(() => {
		wsInstances = [];
		vi.useFakeTimers();
	});

	afterEach(() => {
		destroyTelemetrySocket();
		vi.clearAllTimers();
		clearHistory();
		vi.useRealTimers();
	});

	it('parses a sample WebSocket message correctly', () => {
		initTelemetrySocket();
		wsInstances[0].simulateOpen();
		wsInstances[0].simulateMessage(makeTelemetryMsg(185.5, 'roaster-1'));

		expect(get(telemetry)).toEqual(
			expect.objectContaining({
				beanTemp: 185.5,
				envTemp: 150,
				heaterPWM: 50,
				fanPWM: 200,
				setpoint: 200,
				controlMode: 0,
				heaterEnable: 1
			})
		);
		expect(get(deviceId)).toBe('roaster-1');
	});

	it('adds received telemetry to history', () => {
		initTelemetrySocket();
		wsInstances[0].simulateOpen();

		wsInstances[0].simulateMessage(makeTelemetryMsg(180));
		wsInstances[0].simulateMessage(makeTelemetryMsg(182));

		const history = get(telemetryHistory);
		expect(history).toHaveLength(2);
		expect(history[0].telemetry.beanTemp).toBe(180);
		expect(history[1].telemetry.beanTemp).toBe(182);
	});

	it('calculates RoR from history correctly', () => {
		initTelemetrySocket();
		wsInstances[0].simulateOpen();

		// First data point at t=0
		vi.setSystemTime(new Date('2026-01-01T00:00:00'));
		wsInstances[0].simulateMessage(makeTelemetryMsg(180));

		// Second data point at t=30s
		vi.setSystemTime(new Date('2026-01-01T00:00:30'));
		wsInstances[0].simulateMessage(makeTelemetryMsg(190));

		// RoR = (190-180) / 30s * 60 = 20 °C/min
		expect(get(rateOfRise)).toBe(20);
	});

	it('returns null RoR with insufficient history', () => {
		initTelemetrySocket();
		wsInstances[0].simulateOpen();

		// Only one data point
		wsInstances[0].simulateMessage(makeTelemetryMsg(180));

		expect(get(rateOfRise)).toBeNull();
	});

	it('handles reconnection state transitions', () => {
		// Initially disconnected
		expect(get(connectionStatus)).toBe('disconnected');

		// Initiating connection sets status to reconnecting
		initTelemetrySocket();
		expect(get(connectionStatus)).toBe('reconnecting');

		// Opening connection sets status to connected
		wsInstances[0].simulateOpen();
		expect(get(connectionStatus)).toBe('connected');

		// Closing connection sets status to disconnected
		wsInstances[0].simulateClose();
		expect(get(connectionStatus)).toBe('disconnected');

		// Reconnect scheduled — advance past first backoff (1000ms)
		vi.advanceTimersByTime(1100);
		expect(wsInstances).toHaveLength(2);
		expect(get(connectionStatus)).toBe('reconnecting');

		// New connection opens
		wsInstances[1].simulateOpen();
		expect(get(connectionStatus)).toBe('connected');
	});

	it('uses exponential backoff for reconnection', () => {
		initTelemetrySocket();
		wsInstances[0].simulateOpen();

		// First disconnect — backoff = 1000ms * 2^0 = 1000ms
		wsInstances[0].simulateClose();
		vi.advanceTimersByTime(900);
		expect(wsInstances).toHaveLength(1);
		vi.advanceTimersByTime(200);
		expect(wsInstances).toHaveLength(2);

		// Second disconnect — backoff = 1000ms * 2^1 = 2000ms
		wsInstances[1].simulateClose();
		vi.advanceTimersByTime(1900);
		expect(wsInstances).toHaveLength(2);
		vi.advanceTimersByTime(200);
		expect(wsInstances).toHaveLength(3);
	});
});
