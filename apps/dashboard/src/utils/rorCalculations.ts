// Rate of Rise (RoR) Calculations
// Based on Artisan Coffee Roaster implementation patterns

export interface TemperaturePoint {
  time: number      // Time in seconds
  temperature: number  // Temperature in Celsius
}

export interface RoRPoint extends TemperaturePoint {
  ror: number       // Rate of Rise in °C/min
}

export interface RoRConfig {
  windowSize: number      // Number of points for calculation window (default: 3)
  method: 'simple' | 'polynomial'  // Calculation method
  filterSpikes: boolean   // Enable spike detection and filtering
  maxRoRLimit: number     // Maximum valid RoR value (°C/min)
  minRoRLimit: number     // Minimum valid RoR value (°C/min)
}

// Default RoR configuration based on Artisan best practices
export const DEFAULT_ROR_CONFIG: RoRConfig = {
  windowSize: 3,
  method: 'polynomial',
  filterSpikes: true,
  maxRoRLimit: 30,     // 30°C/min max reasonable RoR
  minRoRLimit: -10     // -10°C/min min reasonable RoR (for temperature drops)
}

/**
 * Simple Array-based RoR calculation (Basic method from Artisan)
 * Formula: RoR = (temp[wsize:] - temp[:-wsize]) / ((tx[wsize:] - tx[:-wsize])/60.)
 */
export function calculateSimpleRoR(
  points: TemperaturePoint[],
  windowSize: number = 3
): RoRPoint[] {
  if (points.length < windowSize + 1) {
    return []
  }

  const result: RoRPoint[] = []
  
  for (let i = windowSize; i < points.length; i++) {
    const currentPoint = points[i]
    const previousPoint = points[i - windowSize]
    
    const deltaTemp = currentPoint.temperature - previousPoint.temperature
    const deltaTime = (currentPoint.time - previousPoint.time) / 60 // Convert to minutes
    
    if (deltaTime > 0) {
      const ror = deltaTemp / deltaTime
      result.push({
        time: currentPoint.time,
        temperature: currentPoint.temperature,
        ror: ror
      })
    }
  }
  
  return result
}

/**
 * Polynomial Least Squares RoR calculation (Advanced method from Artisan)
 * Uses linear regression over the window for noise reduction
 */
export function calculatePolynomialRoR(
  points: TemperaturePoint[],
  windowSize: number = 3
): RoRPoint[] {
  if (points.length < windowSize + 1) {
    return []
  }

  const result: RoRPoint[] = []
  
  for (let i = windowSize; i < points.length; i++) {
    const leftIndex = Math.max(0, i - windowSize)
    const windowPoints = points.slice(leftIndex, i + 1)
    
    // Perform linear least squares fit
    const slope = calculateLinearRegressionSlope(windowPoints)
    
    if (slope !== null) {
      result.push({
        time: points[i].time,
        temperature: points[i].temperature,
        ror: slope * 60 // Convert from °C/second to °C/minute
      })
    }
  }
  
  return result
}

/**
 * Linear regression to find slope (temperature change rate)
 */
function calculateLinearRegressionSlope(points: TemperaturePoint[]): number | null {
  if (points.length < 2) return null
  
  const n = points.length
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
  
  for (const point of points) {
    sumX += point.time
    sumY += point.temperature
    sumXY += point.time * point.temperature
    sumXX += point.time * point.time
  }
  
  const denominator = n * sumXX - sumX * sumX
  if (Math.abs(denominator) < 1e-10) return null // Avoid division by zero
  
  const slope = (n * sumXY - sumX * sumY) / denominator
  return slope
}

/**
 * Filter spikes and outliers from RoR data
 * Based on Artisan's spike detection algorithm
 */
export function filterRoRSpikes(
  rorPoints: RoRPoint[],
  config: RoRConfig
): RoRPoint[] {
  if (!config.filterSpikes || rorPoints.length < 3) {
    return rorPoints
  }

  const filtered: RoRPoint[] = []
  
  for (let i = 0; i < rorPoints.length; i++) {
    const point = rorPoints[i]
    let ror = point.ror
    
    // Clamp to reasonable limits
    if (ror > config.maxRoRLimit) {
      ror = config.maxRoRLimit
    } else if (ror < config.minRoRLimit) {
      ror = config.minRoRLimit
    }
    
    // Apply median filter for spike removal (3-point window)
    if (i > 0 && i < rorPoints.length - 1) {
      const prev = rorPoints[i - 1].ror
      const next = rorPoints[i + 1].ror
      const values = [prev, ror, next].sort((a, b) => a - b)
      ror = values[1] // Median value
    }
    
    filtered.push({
      ...point,
      ror: ror
    })
  }
  
  return filtered
}

/**
 * Apply exponential smoothing to RoR data (real-time filtering)
 * Based on Artisan's live smoothing implementation
 */
export function applyExponentialSmoothing(
  rorPoints: RoRPoint[],
  alpha: number = 0.3  // Smoothing factor (0 = no smoothing, 1 = no memory)
): RoRPoint[] {
  if (rorPoints.length === 0) return []
  
  const smoothed: RoRPoint[] = [rorPoints[0]] // First point unchanged
  
  for (let i = 1; i < rorPoints.length; i++) {
    const currentRoR = rorPoints[i].ror
    const previousSmoothedRoR = smoothed[i - 1].ror
    
    const smoothedRoR = alpha * currentRoR + (1 - alpha) * previousSmoothedRoR
    
    smoothed.push({
      ...rorPoints[i],
      ror: smoothedRoR
    })
  }
  
  return smoothed
}

/**
 * Main RoR calculation function with all processing steps
 */
export function calculateRoR(
  points: TemperaturePoint[],
  config: RoRConfig = DEFAULT_ROR_CONFIG
): RoRPoint[] {
  if (points.length < 2) return []
  
  // Step 1: Calculate raw RoR using selected method
  let rorPoints: RoRPoint[]
  if (config.method === 'polynomial') {
    rorPoints = calculatePolynomialRoR(points, config.windowSize)
  } else {
    rorPoints = calculateSimpleRoR(points, config.windowSize)
  }
  
  // Step 2: Filter spikes and outliers
  if (config.filterSpikes) {
    rorPoints = filterRoRSpikes(rorPoints, config)
  }
  
  // Step 3: Apply smoothing for better visualization
  rorPoints = applyExponentialSmoothing(rorPoints, 0.2)
  
  return rorPoints
}

/**
 * Calculate roast phase statistics (inspired by Artisan)
 */
export interface RoastPhaseStats {
  dryPhaseRoR: number     // Average RoR during drying phase
  maillardPhaseRoR: number // Average RoR during maillard phase  
  developmentPhaseRoR: number // Average RoR during development phase
  overallRoR: number      // Overall average RoR
  maxRoR: number         // Maximum RoR reached
  minRoR: number         // Minimum RoR reached
}

export function calculateRoastPhaseStats(
  rorPoints: RoRPoint[],
  dryEndTime?: number,      // Time when drying phase ends
  firstCrackTime?: number,  // Time of first crack
  dropTime?: number         // Time of drop
): RoastPhaseStats {
  if (rorPoints.length === 0) {
    return {
      dryPhaseRoR: 0,
      maillardPhaseRoR: 0, 
      developmentPhaseRoR: 0,
      overallRoR: 0,
      maxRoR: 0,
      minRoR: 0
    }
  }
  
  const allRoRs = rorPoints.map(p => p.ror)
  const maxRoR = Math.max(...allRoRs)
  const minRoR = Math.min(...allRoRs)
  const overallRoR = allRoRs.reduce((sum, ror) => sum + ror, 0) / allRoRs.length
  
  // Calculate phase-specific RoRs if phase times are provided
  let dryPhaseRoR = overallRoR
  let maillardPhaseRoR = overallRoR
  let developmentPhaseRoR = overallRoR
  
  if (dryEndTime) {
    const dryPhasePoints = rorPoints.filter(p => p.time <= dryEndTime)
    if (dryPhasePoints.length > 0) {
      dryPhaseRoR = dryPhasePoints.reduce((sum, p) => sum + p.ror, 0) / dryPhasePoints.length
    }
  }
  
  if (dryEndTime && firstCrackTime) {
    const maillardPoints = rorPoints.filter(p => p.time > dryEndTime && p.time <= firstCrackTime)
    if (maillardPoints.length > 0) {
      maillardPhaseRoR = maillardPoints.reduce((sum, p) => sum + p.ror, 0) / maillardPoints.length
    }
  }
  
  if (firstCrackTime && dropTime) {
    const developmentPoints = rorPoints.filter(p => p.time > firstCrackTime && p.time <= dropTime)
    if (developmentPoints.length > 0) {
      developmentPhaseRoR = developmentPoints.reduce((sum, p) => sum + p.ror, 0) / developmentPoints.length
    }
  }
  
  return {
    dryPhaseRoR,
    maillardPhaseRoR,
    developmentPhaseRoR,
    overallRoR,
    maxRoR,
    minRoR
  }
}

/**
 * Utility function to convert profile points to temperature points
 */
export function profilePointsToTemperaturePoints(
  profilePoints: Array<{ time_seconds: number; target_temp: number }>
): TemperaturePoint[] {
  return profilePoints.map(point => ({
    time: point.time_seconds,
    temperature: point.target_temp
  }))
}

/**
 * Calculate typical roast landmarks based on temperature profile
 * Based on standard coffee roasting temperatures
 */
export interface RoastLandmarks {
  dryEndTime?: number      // Typically around 160°C
  firstCrackTime?: number  // Typically around 196°C
  secondCrackTime?: number // Typically around 224°C
  developmentStart?: number // Usually same as first crack
}

export function calculateRoastLandmarks(
  profilePoints: Array<{ time_seconds: number; target_temp: number }>,
  customFirstCrack?: number
): RoastLandmarks {
  if (profilePoints.length === 0) {
    return {}
  }

  // Sort points by time to ensure proper order
  const sortedPoints = [...profilePoints].sort((a, b) => a.time_seconds - b.time_seconds)
  
  const landmarks: RoastLandmarks = {}

  // Dry End: Typically around 160°C (end of drying phase)
  const dryEndPoint = sortedPoints.find(point => point.target_temp >= 160)
  if (dryEndPoint) {
    landmarks.dryEndTime = dryEndPoint.time_seconds
  }

  // First Crack: Use custom time if provided, otherwise estimate at 196°C
  if (customFirstCrack) {
    landmarks.firstCrackTime = customFirstCrack
  } else {
    const firstCrackPoint = sortedPoints.find(point => point.target_temp >= 196)
    if (firstCrackPoint) {
      landmarks.firstCrackTime = firstCrackPoint.time_seconds
    }
  }

  // Second Crack: Typically around 224°C
  const secondCrackPoint = sortedPoints.find(point => point.target_temp >= 224)
  if (secondCrackPoint) {
    landmarks.secondCrackTime = secondCrackPoint.time_seconds
  }

  // Development Start: Usually begins at first crack
  landmarks.developmentStart = landmarks.firstCrackTime

  return landmarks
}