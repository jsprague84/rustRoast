import { describe, it, expect, beforeEach } from 'vitest'
import {
  TelemetryRingBuffer,
  compressTelemetryData,
  decompressTelemetryData,
  adaptiveDataThinning,
  calculateMemoryUsage,
  type TelemetryPoint,
  type CompressionState
} from './dataCompression'

describe('TelemetryRingBuffer', () => {
  let buffer: TelemetryRingBuffer

  beforeEach(() => {
    buffer = new TelemetryRingBuffer(5)
  })

  it('should initialize with correct capacity', () => {
    expect(buffer.size()).toBe(0)
    expect(buffer.getPoints()).toEqual([])
  })

  it('should add points correctly', () => {
    const point: TelemetryPoint = {
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
    }

    buffer.push(point)
    expect(buffer.size()).toBe(1)
    expect(buffer.getPoints()).toEqual([point])
  })

  it('should maintain capacity limit', () => {
    for (let i = 0; i < 10; i++) {
      buffer.push({
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
      })
    }

    expect(buffer.size()).toBe(5)
    const points = buffer.getPoints()
    expect(points[0].ts).toBe(1005) // Should contain last 5 points
    expect(points[4].ts).toBe(1009)
  })

  it('should filter points by time range', () => {
    for (let i = 0; i < 5; i++) {
      buffer.push({
        ts: 1000 + i * 10,
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
      })
    }

    const filtered = buffer.getPointsInRange(1015, 1035)
    expect(filtered).toHaveLength(3)
    expect(filtered[0].ts).toBe(1020)
    expect(filtered[2].ts).toBe(1040)
  })

  it('should clear all points', () => {
    buffer.push({
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
    })

    expect(buffer.size()).toBe(1)
    buffer.clear()
    expect(buffer.size()).toBe(0)
    expect(buffer.getPoints()).toEqual([])
  })
})

describe('Data Compression', () => {
  const generateTestData = (count: number): TelemetryPoint[] => {
    return Array.from({ length: count }, (_, i) => ({
      ts: 1000 + i,
      beanTemp: 200 + Math.sin(i * 0.1) * 10,
      envTemp: 180 + Math.cos(i * 0.1) * 5,
      setpoint: 210,
      fanPWM: 128,
      heaterPWM: 85 + i % 20,
      controlMode: 'auto' as const,
      heaterEnable: true,
      rateOfRise: 5.2 + Math.random() * 2,
      Kp: 10,
      Ki: 0.5,
      Kd: 2
    }))
  }

  it('should compress telemetry data with delta encoding', () => {
    const data = generateTestData(100)
    const { compressed, state } = compressTelemetryData(data, 10)

    expect(compressed.length).toBeLessThan(data.length)
    expect(state.baseTimestamp).toBe(data[0].ts)
    expect(state.lastPoint).toBeDefined()
  })

  it('should decompress data to original values', () => {
    const data = generateTestData(50)
    const { compressed, state } = compressTelemetryData(data, 10)
    const decompressed = decompressTelemetryData(compressed, state)

    expect(decompressed).toHaveLength(data.length)

    // Check that values are within precision tolerance
    for (let i = 0; i < data.length; i++) {
      expect(Math.abs(decompressed[i].ts - data[i].ts)).toBeLessThanOrEqual(1)
      expect(Math.abs((decompressed[i].beanTemp || 0) - (data[i].beanTemp || 0))).toBeLessThanOrEqual(0.1)
      expect(Math.abs((decompressed[i].envTemp || 0) - (data[i].envTemp || 0))).toBeLessThanOrEqual(0.1)
    }
  })

  it('should handle null values in compression', () => {
    const data: TelemetryPoint[] = [
      {
        ts: 1000,
        beanTemp: null,
        envTemp: 180,
        setpoint: 210,
        fanPWM: null,
        heaterPWM: 85,
        controlMode: 'auto',
        heaterEnable: true,
        rateOfRise: null,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      }
    ]

    const { compressed, state } = compressTelemetryData(data, 10)
    const decompressed = decompressTelemetryData(compressed, state)

    expect(decompressed[0].beanTemp).toBeNull()
    expect(decompressed[0].fanPWM).toBeNull()
    expect(decompressed[0].rateOfRise).toBeNull()
    expect(decompressed[0].envTemp).toBe(180)
  })
})

describe('Adaptive Data Thinning', () => {
  it('should thin data based on change threshold', () => {
    const data: TelemetryPoint[] = [
      { ts: 1000, beanTemp: 200, envTemp: 180, setpoint: 210, fanPWM: 128, heaterPWM: 85, controlMode: 'auto', heaterEnable: true, rateOfRise: 5.2, Kp: 10, Ki: 0.5, Kd: 2 },
      { ts: 1001, beanTemp: 200.1, envTemp: 180.1, setpoint: 210, fanPWM: 128, heaterPWM: 85, controlMode: 'auto', heaterEnable: true, rateOfRise: 5.2, Kp: 10, Ki: 0.5, Kd: 2 },
      { ts: 1002, beanTemp: 205, envTemp: 185, setpoint: 210, fanPWM: 128, heaterPWM: 85, controlMode: 'auto', heaterEnable: true, rateOfRise: 5.2, Kp: 10, Ki: 0.5, Kd: 2 },
      { ts: 1003, beanTemp: 205.1, envTemp: 185.1, setpoint: 210, fanPWM: 128, heaterPWM: 85, controlMode: 'auto', heaterEnable: true, rateOfRise: 5.2, Kp: 10, Ki: 0.5, Kd: 2 }
    ]

    const thinned = adaptiveDataThinning(data, 1.0) // 1 degree threshold
    expect(thinned.length).toBe(3) // Should keep first, third (significant change), and last
    expect(thinned[0].ts).toBe(1000)
    expect(thinned[1].ts).toBe(1002)
    expect(thinned[2].ts).toBe(1003)
  })

  it('should keep all points when changes are significant', () => {
    const data: TelemetryPoint[] = [
      { ts: 1000, beanTemp: 200, envTemp: 180, setpoint: 210, fanPWM: 128, heaterPWM: 85, controlMode: 'auto', heaterEnable: true, rateOfRise: 5.2, Kp: 10, Ki: 0.5, Kd: 2 },
      { ts: 1001, beanTemp: 210, envTemp: 190, setpoint: 210, fanPWM: 128, heaterPWM: 85, controlMode: 'auto', heaterEnable: true, rateOfRise: 5.2, Kp: 10, Ki: 0.5, Kd: 2 },
      { ts: 1002, beanTemp: 220, envTemp: 200, setpoint: 210, fanPWM: 128, heaterPWM: 85, controlMode: 'auto', heaterEnable: true, rateOfRise: 5.2, Kp: 10, Ki: 0.5, Kd: 2 }
    ]

    const thinned = adaptiveDataThinning(data, 1.0)
    expect(thinned.length).toBe(3) // All points should be kept
  })

  it('should handle empty data', () => {
    const thinned = adaptiveDataThinning([], 1.0)
    expect(thinned).toEqual([])
  })

  it('should handle single data point', () => {
    const data: TelemetryPoint[] = [
      { ts: 1000, beanTemp: 200, envTemp: 180, setpoint: 210, fanPWM: 128, heaterPWM: 85, controlMode: 'auto', heaterEnable: true, rateOfRise: 5.2, Kp: 10, Ki: 0.5, Kd: 2 }
    ]

    const thinned = adaptiveDataThinning(data, 1.0)
    expect(thinned).toEqual(data)
  })
})

describe('Memory Usage Calculation', () => {
  it('should calculate memory usage for telemetry points', () => {
    const data: TelemetryPoint[] = [
      { ts: 1000, beanTemp: 200, envTemp: 180, setpoint: 210, fanPWM: 128, heaterPWM: 85, controlMode: 'auto', heaterEnable: true, rateOfRise: 5.2, Kp: 10, Ki: 0.5, Kd: 2 }
    ]

    const usage = calculateMemoryUsage(data)
    expect(usage).toBeGreaterThan(0)
    expect(typeof usage).toBe('number')
  })

  it('should return 0 for empty data', () => {
    const usage = calculateMemoryUsage([])
    expect(usage).toBe(0)
  })

  it('should scale linearly with data size', () => {
    const singlePoint: TelemetryPoint[] = [
      { ts: 1000, beanTemp: 200, envTemp: 180, setpoint: 210, fanPWM: 128, heaterPWM: 85, controlMode: 'auto', heaterEnable: true, rateOfRise: 5.2, Kp: 10, Ki: 0.5, Kd: 2 }
    ]
    const multiplePoints = [...singlePoint, ...singlePoint, ...singlePoint]

    const singleUsage = calculateMemoryUsage(singlePoint)
    const multipleUsage = calculateMemoryUsage(multiplePoints)

    expect(multipleUsage).toBeGreaterThan(singleUsage * 2)
  })
})

describe('Integration Tests', () => {
  it('should handle full compression and storage cycle', () => {
    const buffer = new TelemetryRingBuffer(100)
    const testData: TelemetryPoint[] = []

    // Simulate real-time data streaming
    for (let i = 0; i < 150; i++) {
      const point: TelemetryPoint = {
        ts: 1000 + i,
        beanTemp: 150 + i * 0.5 + Math.sin(i * 0.1) * 5,
        envTemp: 120 + i * 0.3 + Math.cos(i * 0.1) * 3,
        setpoint: 200,
        fanPWM: 128 + (i % 50),
        heaterPWM: 70 + (i % 30),
        controlMode: i % 10 === 0 ? 'manual' : 'auto',
        heaterEnable: i % 20 !== 0,
        rateOfRise: 3 + Math.random() * 4,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      }

      buffer.push(point)
      testData.push(point)
    }

    // Should maintain only the last 100 points
    expect(buffer.size()).toBe(100)

    const allPoints = buffer.getPoints()
    expect(allPoints[0].ts).toBe(1050) // First of last 100
    expect(allPoints[99].ts).toBe(1149) // Last point

    // Test compression on the buffered data
    const { compressed, state } = compressTelemetryData(allPoints, 10)
    expect(compressed.length).toBeLessThanOrEqual(allPoints.length)

    // Test decompression
    const decompressed = decompressTelemetryData(compressed, state)
    expect(decompressed.length).toBe(allPoints.length)

    // Verify data integrity within precision
    for (let i = 0; i < allPoints.length; i++) {
      expect(Math.abs(decompressed[i].ts - allPoints[i].ts)).toBeLessThanOrEqual(1)
      if (allPoints[i].beanTemp !== null && decompressed[i].beanTemp !== null) {
        expect(Math.abs(decompressed[i].beanTemp! - allPoints[i].beanTemp!)).toBeLessThanOrEqual(0.1)
      }
    }
  })
})