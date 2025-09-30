import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { create } from 'zustand'
import { useTelemetryData, useLatestTelemetry, useTelemetryStats } from './useTelemetryData'
import { useWsStore } from '../ws/useTelemetryWS'
import { TelemetryRingBuffer, type TelemetryPoint } from '../utils/dataCompression'

// Mock the WebSocket store
vi.mock('../ws/useTelemetryWS', () => ({
  useWsStore: vi.fn()
}))

describe('useTelemetryData', () => {
  const mockDeviceId = 'test-device'
  let mockStore: any

  beforeEach(() => {
    mockStore = {
      ringBuffers: {},
      getDeviceData: vi.fn(),
      push: vi.fn()
    }
    vi.mocked(useWsStore).mockReturnValue(mockStore)
  })

  it('should return empty data for non-existent device', () => {
    mockStore.getDeviceData.mockReturnValue([])

    const { result } = renderHook(() => useTelemetryData({
      deviceId: mockDeviceId,
      windowSeconds: 300
    }))

    expect(result.current.points).toEqual([])
    expect(result.current.latest).toBeNull()
    expect(result.current.compressionRatio).toBe(1)
  })

  it('should return filtered data within time window', () => {
    const now = Date.now() / 1000
    const testData: TelemetryPoint[] = [
      {
        ts: now - 600, // 10 minutes ago
        beanTemp: 200,
        envTemp: 180,
        setpoint: 210,
        fanPWM: 128,
        heaterPWM: 85,
        controlMode: 'auto',
        heaterEnable: true,
        rateOfRise: 5.2,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      },
      {
        ts: now - 150, // 2.5 minutes ago (within 5-minute window)
        beanTemp: 205,
        envTemp: 185,
        setpoint: 210,
        fanPWM: 130,
        heaterPWM: 90,
        controlMode: 'auto',
        heaterEnable: true,
        rateOfRise: 6.1,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      }
    ]

    mockStore.getDeviceData.mockReturnValue(testData)

    const { result } = renderHook(() => useTelemetryData({
      deviceId: mockDeviceId,
      windowSeconds: 300 // 5 minutes
    }))

    expect(result.current.points).toHaveLength(1) // Only the recent point
    expect(result.current.points[0].ts).toBe(now - 150)
    expect(result.current.latest).toEqual(testData[1])
  })

  it('should apply data thinning based on change threshold', () => {
    const now = Date.now() / 1000
    const testData: TelemetryPoint[] = [
      {
        ts: now - 30,
        beanTemp: 200,
        envTemp: 180,
        setpoint: 210,
        fanPWM: 128,
        heaterPWM: 85,
        controlMode: 'auto',
        heaterEnable: true,
        rateOfRise: 5.2,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      },
      {
        ts: now - 20,
        beanTemp: 200.1, // Minimal change
        envTemp: 180.1,
        setpoint: 210,
        fanPWM: 128,
        heaterPWM: 85,
        controlMode: 'auto',
        heaterEnable: true,
        rateOfRise: 5.2,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      },
      {
        ts: now - 10,
        beanTemp: 205, // Significant change
        envTemp: 185,
        setpoint: 210,
        fanPWM: 128,
        heaterPWM: 85,
        controlMode: 'auto',
        heaterEnable: true,
        rateOfRise: 5.2,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      }
    ]

    mockStore.getDeviceData.mockReturnValue(testData)

    const { result } = renderHook(() => useTelemetryData({
      deviceId: mockDeviceId,
      windowSeconds: 60,
      changeThreshold: 1.0 // 1 degree threshold
    }))

    expect(result.current.points.length).toBeLessThan(testData.length)
    expect(result.current.compressionRatio).toBeLessThan(1)
  })

  it('should limit data points based on maxPoints', () => {
    const now = Date.now() / 1000
    const testData: TelemetryPoint[] = Array.from({ length: 100 }, (_, i) => ({
      ts: now - (100 - i),
      beanTemp: 200 + i,
      envTemp: 180,
      setpoint: 210,
      fanPWM: 128,
      heaterPWM: 85,
      controlMode: 'auto',
      heaterEnable: true,
      rateOfRise: 5.2,
      Kp: 10,
      Ki: 0.5,
      Kd: 2
    }))

    mockStore.getDeviceData.mockReturnValue(testData)

    const { result } = renderHook(() => useTelemetryData({
      deviceId: mockDeviceId,
      windowSeconds: 300,
      maxPoints: 50
    }))

    expect(result.current.points).toHaveLength(50)
    expect(result.current.compressionRatio).toBe(0.5)
  })
})

describe('useLatestTelemetry', () => {
  let mockStore: any

  beforeEach(() => {
    mockStore = {
      ringBuffers: {},
      getDeviceData: vi.fn()
    }
    vi.mocked(useWsStore).mockReturnValue(mockStore)
  })

  it('should return null for device with no data', () => {
    mockStore.getDeviceData.mockReturnValue([])

    const { result } = renderHook(() => useLatestTelemetry('test-device'))

    expect(result.current).toBeNull()
  })

  it('should return latest telemetry point', () => {
    const testData: TelemetryPoint[] = [
      {
        ts: 1000,
        beanTemp: 200,
        envTemp: 180,
        setpoint: 210,
        fanPWM: 128,
        heaterPWM: 85,
        controlMode: 'auto',
        heaterEnable: true,
        rateOfRise: 5.2,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      },
      {
        ts: 2000,
        beanTemp: 205,
        envTemp: 185,
        setpoint: 210,
        fanPWM: 130,
        heaterPWM: 90,
        controlMode: 'auto',
        heaterEnable: true,
        rateOfRise: 6.1,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      }
    ]

    mockStore.getDeviceData.mockReturnValue(testData)

    const { result } = renderHook(() => useLatestTelemetry('test-device'))

    expect(result.current).toEqual(testData[1]) // Latest point
  })
})

describe('useTelemetryStats', () => {
  let mockStore: any

  beforeEach(() => {
    mockStore = {
      ringBuffers: {},
      getDeviceData: vi.fn()
    }
    vi.mocked(useWsStore).mockReturnValue(mockStore)
  })

  it('should return stats for device with data', () => {
    const buffer = new TelemetryRingBuffer(100)
    const testData: TelemetryPoint[] = Array.from({ length: 50 }, (_, i) => ({
      ts: 1000 + i,
      beanTemp: 200 + i,
      envTemp: 180,
      setpoint: 210,
      fanPWM: 128,
      heaterPWM: 85,
      controlMode: 'auto',
      heaterEnable: true,
      rateOfRise: 5.2,
      Kp: 10,
      Ki: 0.5,
      Kd: 2
    }))

    testData.forEach(point => buffer.push(point))
    mockStore.ringBuffers = { 'test-device': buffer }
    mockStore.getDeviceData.mockReturnValue(testData)

    const { result } = renderHook(() => useTelemetryStats('test-device'))

    expect(result.current.totalPoints).toBe(50)
    expect(result.current.memoryUsage).toBeGreaterThan(0)
    expect(result.current.bufferUtilization).toBe(0.5) // 50/100
  })

  it('should return zero stats for non-existent device', () => {
    mockStore.getDeviceData.mockReturnValue([])

    const { result } = renderHook(() => useTelemetryStats('non-existent'))

    expect(result.current.totalPoints).toBe(0)
    expect(result.current.memoryUsage).toBe(0)
    expect(result.current.bufferUtilization).toBe(0)
  })
})