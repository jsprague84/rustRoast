// Data compression utilities for telemetry data
export interface TelemetryPoint {
  ts: number
  beanTemp?: number
  envTemp?: number
  setpoint?: number
  fanPWM?: number
  heaterPWM?: number
  controlMode?: number
  heaterEnable?: number
  rateOfRise?: number
  Kp?: number
  Ki?: number
  Kd?: number
}

export interface CompressedTelemetryPoint {
  t: number  // timestamp delta
  bt?: number // bean temp delta
  et?: number // env temp delta
  sp?: number // setpoint delta
  f?: number  // fan PWM delta
  h?: number  // heater PWM delta
  cm?: number // control mode
  he?: number // heater enable
  r?: number  // rate of rise
  kp?: number // Kp
  ki?: number // Ki
  kd?: number // Kd
}

export interface CompressionState {
  lastPoint: TelemetryPoint | null
  baseTimestamp: number
}

// Compress telemetry data using delta encoding and field shortening
export function compressTelemetryData(
  points: TelemetryPoint[],
  precision: number = 1
): { compressed: CompressedTelemetryPoint[]; state: CompressionState } {
  if (points.length === 0) {
    return { compressed: [], state: { lastPoint: null, baseTimestamp: 0 } }
  }

  const compressed: CompressedTelemetryPoint[] = []
  const baseTimestamp = points[0].ts
  let lastPoint: TelemetryPoint | null = null

  for (const point of points) {
    const compressedPoint: CompressedTelemetryPoint = {}

    // Use delta encoding for timestamp (relative to base)
    compressedPoint.t = Math.round((point.ts - baseTimestamp) * precision) / precision

    // Use delta encoding for numeric values where beneficial
    if (lastPoint) {
      if (point.beanTemp !== undefined && lastPoint.beanTemp !== undefined) {
        const delta = point.beanTemp - lastPoint.beanTemp
        compressedPoint.bt = Math.round(delta * precision) / precision
      } else if (point.beanTemp !== undefined) {
        compressedPoint.bt = Math.round(point.beanTemp * precision) / precision
      }

      if (point.envTemp !== undefined && lastPoint.envTemp !== undefined) {
        const delta = point.envTemp - lastPoint.envTemp
        compressedPoint.et = Math.round(delta * precision) / precision
      } else if (point.envTemp !== undefined) {
        compressedPoint.et = Math.round(point.envTemp * precision) / precision
      }

      if (point.setpoint !== undefined && lastPoint.setpoint !== undefined) {
        const delta = point.setpoint - lastPoint.setpoint
        compressedPoint.sp = delta !== 0 ? Math.round(delta * precision) / precision : undefined
      } else if (point.setpoint !== undefined) {
        compressedPoint.sp = Math.round(point.setpoint * precision) / precision
      }
    } else {
      // First point - store absolute values
      if (point.beanTemp !== undefined) {
        compressedPoint.bt = Math.round(point.beanTemp * precision) / precision
      }
      if (point.envTemp !== undefined) {
        compressedPoint.et = Math.round(point.envTemp * precision) / precision
      }
      if (point.setpoint !== undefined) {
        compressedPoint.sp = Math.round(point.setpoint * precision) / precision
      }
    }

    // Handle other fields (less compression benefit, but shorter names)
    if (point.fanPWM !== undefined) compressedPoint.f = point.fanPWM
    if (point.heaterPWM !== undefined) compressedPoint.h = point.heaterPWM
    if (point.controlMode !== undefined) compressedPoint.cm = point.controlMode
    if (point.heaterEnable !== undefined) compressedPoint.he = point.heaterEnable
    if (point.rateOfRise !== undefined) {
      compressedPoint.r = Math.round(point.rateOfRise * precision) / precision
    }
    if (point.Kp !== undefined) compressedPoint.kp = Math.round(point.Kp * precision) / precision
    if (point.Ki !== undefined) compressedPoint.ki = Math.round(point.Ki * precision) / precision
    if (point.Kd !== undefined) compressedPoint.kd = Math.round(point.Kd * precision) / precision

    compressed.push(compressedPoint)
    lastPoint = point
  }

  return {
    compressed,
    state: { lastPoint, baseTimestamp }
  }
}

// Decompress telemetry data back to original format
export function decompressTelemetryData(
  compressed: CompressedTelemetryPoint[],
  state: CompressionState
): TelemetryPoint[] {
  if (compressed.length === 0) return []

  const decompressed: TelemetryPoint[] = []
  let lastPoint: TelemetryPoint | null = state.lastPoint

  for (const compPoint of compressed) {
    const point: TelemetryPoint = {}

    // Reconstruct timestamp
    point.ts = state.baseTimestamp + compPoint.t

    // Reconstruct delta-encoded values
    if (compPoint.bt !== undefined) {
      if (lastPoint?.beanTemp !== undefined) {
        point.beanTemp = lastPoint.beanTemp + compPoint.bt
      } else {
        point.beanTemp = compPoint.bt
      }
    }

    if (compPoint.et !== undefined) {
      if (lastPoint?.envTemp !== undefined) {
        point.envTemp = lastPoint.envTemp + compPoint.et
      } else {
        point.envTemp = compPoint.et
      }
    }

    if (compPoint.sp !== undefined) {
      if (lastPoint?.setpoint !== undefined) {
        point.setpoint = lastPoint.setpoint + compPoint.sp
      } else {
        point.setpoint = compPoint.sp
      }
    }

    // Direct field mapping
    if (compPoint.f !== undefined) point.fanPWM = compPoint.f
    if (compPoint.h !== undefined) point.heaterPWM = compPoint.h
    if (compPoint.cm !== undefined) point.controlMode = compPoint.cm
    if (compPoint.he !== undefined) point.heaterEnable = compPoint.he
    if (compPoint.r !== undefined) point.rateOfRise = compPoint.r
    if (compPoint.kp !== undefined) point.Kp = compPoint.kp
    if (compPoint.ki !== undefined) point.Ki = compPoint.ki
    if (compPoint.kd !== undefined) point.Kd = compPoint.kd

    decompressed.push(point)
    lastPoint = point
  }

  return decompressed
}

// Calculate compression ratio
export function calculateCompressionRatio(
  original: TelemetryPoint[],
  compressed: CompressedTelemetryPoint[]
): number {
  const originalSize = JSON.stringify(original).length
  const compressedSize = JSON.stringify(compressed).length
  return compressedSize / originalSize
}

// Adaptive data thinning based on rate of change
export function adaptiveDataThinning(
  points: TelemetryPoint[],
  maxPoints: number = 1000,
  changeThreshold: number = 0.5
): TelemetryPoint[] {
  if (points.length <= maxPoints) return points

  const thinned: TelemetryPoint[] = []
  const step = Math.ceil(points.length / maxPoints)

  // Always include first and last points
  thinned.push(points[0])

  for (let i = step; i < points.length - step; i += step) {
    const point = points[i]
    const prevPoint = thinned[thinned.length - 1]

    // Include point if significant change detected
    if (
      Math.abs((point.beanTemp || 0) - (prevPoint.beanTemp || 0)) > changeThreshold ||
      Math.abs((point.envTemp || 0) - (prevPoint.envTemp || 0)) > changeThreshold ||
      (point.controlMode !== prevPoint.controlMode) ||
      (point.heaterEnable !== prevPoint.heaterEnable)
    ) {
      thinned.push(point)
    }
  }

  // Always include last point
  if (points.length > 1) {
    thinned.push(points[points.length - 1])
  }

  return thinned
}

// Efficient binary search for time-based data filtering
export function filterPointsByTimeRange(
  points: TelemetryPoint[],
  startTime: number,
  endTime: number
): TelemetryPoint[] {
  if (points.length === 0) return []

  // Binary search for start index
  let left = 0
  let right = points.length - 1
  let startIndex = 0

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (points[mid].ts >= startTime) {
      startIndex = mid
      right = mid - 1
    } else {
      left = mid + 1
    }
  }

  // Binary search for end index
  left = startIndex
  right = points.length - 1
  let endIndex = points.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (points[mid].ts <= endTime) {
      endIndex = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  return points.slice(startIndex, endIndex + 1)
}

// Memory-efficient ring buffer for real-time data
export class TelemetryRingBuffer {
  private buffer: TelemetryPoint[]
  private writeIndex: number = 0
  private size: number
  private isFull: boolean = false

  constructor(maxSize: number = 3000) {
    this.size = maxSize
    this.buffer = new Array(maxSize)
  }

  push(point: TelemetryPoint): void {
    this.buffer[this.writeIndex] = point
    this.writeIndex = (this.writeIndex + 1) % this.size

    if (this.writeIndex === 0) {
      this.isFull = true
    }
  }

  getPoints(): TelemetryPoint[] {
    if (!this.isFull) {
      return this.buffer.slice(0, this.writeIndex)
    }

    // Return points in chronological order
    return [
      ...this.buffer.slice(this.writeIndex),
      ...this.buffer.slice(0, this.writeIndex)
    ]
  }

  getPointsInRange(startTime: number, endTime: number): TelemetryPoint[] {
    const allPoints = this.getPoints()
    return filterPointsByTimeRange(allPoints, startTime, endTime)
  }

  clear(): void {
    this.writeIndex = 0
    this.isFull = false
  }

  get length(): number {
    return this.isFull ? this.size : this.writeIndex
  }
}