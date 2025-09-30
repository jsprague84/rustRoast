import { useMemo } from 'react'
import { useWsStore } from '../ws/useTelemetryWS'
import { TelemetryPoint, adaptiveDataThinning } from '../utils/dataCompression'

export interface UseTelemetryDataOptions {
  deviceId: string
  windowSeconds?: number
  maxPoints?: number
  changeThreshold?: number
  startTime?: number
  endTime?: number
}

export interface TelemetryDataResult {
  points: TelemetryPoint[]
  latest: TelemetryPoint | null
  isEmpty: boolean
  totalPoints: number
  compressionRatio: number
}

export function useTelemetryData({
  deviceId,
  windowSeconds = 900, // 15 minutes default
  maxPoints = 1000,
  changeThreshold = 0.5,
  startTime,
  endTime
}: UseTelemetryDataOptions): TelemetryDataResult {

  // More efficient: select only the data we need and let Zustand handle reactivity
  const deviceBuffer = useWsStore(state => state.ringBuffers[deviceId])
  const getDeviceData = useWsStore(state => state.getDeviceData)

  const result = useMemo((): TelemetryDataResult => {
    // Calculate time range if not provided
    const now = Date.now() / 1000
    const calculatedStartTime = startTime ?? (now - windowSeconds)
    const calculatedEndTime = endTime ?? now

    // Get raw data from ring buffer
    const rawPoints = getDeviceData(deviceId, calculatedStartTime, calculatedEndTime)

    if (rawPoints.length === 0) {
      return {
        points: [],
        latest: null,
        isEmpty: true,
        totalPoints: 0,
        compressionRatio: 1
      }
    }

    // Apply adaptive data thinning if we have too many points
    const processedPoints = rawPoints.length > maxPoints
      ? adaptiveDataThinning(rawPoints, maxPoints, changeThreshold)
      : rawPoints

    // Calculate compression ratio
    const compressionRatio = processedPoints.length / Math.max(rawPoints.length, 1)

    // Get latest point
    const latest = rawPoints[rawPoints.length - 1] || null

    // Get total points in ring buffer for this device
    const totalPoints = deviceBuffer?.length || 0

    return {
      points: processedPoints,
      latest,
      isEmpty: false,
      totalPoints,
      compressionRatio
    }
  }, [deviceId, windowSeconds, maxPoints, changeThreshold, startTime, endTime, getDeviceData, deviceBuffer])

  return result
}

export function useLatestTelemetry(deviceId: string): TelemetryPoint | null {
  const getDeviceData = useWsStore(state => state.getDeviceData)
  const deviceBuffer = useWsStore(state => state.ringBuffers[deviceId])

  return useMemo(() => {
    const points = getDeviceData(deviceId)
    return points.length > 0 ? points[points.length - 1] : null
  }, [deviceId, getDeviceData, deviceBuffer])
}

export function useTelemetryStats(deviceId: string) {
  const ringBuffers = useWsStore(state => state.ringBuffers)
  const compressionStates = useWsStore(state => state.compressionStates)

  return useMemo(() => {
    const buffer = ringBuffers[deviceId]
    const compressionState = compressionStates[deviceId]

    if (!buffer) {
      return {
        totalPoints: 0,
        memoryUsage: 0,
        isBufferFull: false,
        oldestTimestamp: null,
        newestTimestamp: null
      }
    }

    const points = buffer.getPoints()
    const totalPoints = buffer.length
    const isBufferFull = buffer.length >= 3000 // MAX_POINTS

    // Estimate memory usage (rough calculation)
    const avgPointSize = 200 // bytes per point (estimate)
    const memoryUsage = totalPoints * avgPointSize

    const oldestTimestamp = points.length > 0 ? points[0].ts : null
    const newestTimestamp = points.length > 0 ? points[points.length - 1].ts : null

    return {
      totalPoints,
      memoryUsage,
      isBufferFull,
      oldestTimestamp,
      newestTimestamp,
      compressionBaseTimestamp: compressionState?.baseTimestamp || null
    }
  }, [deviceId, ringBuffers, compressionStates])
}