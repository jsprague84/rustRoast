/**
 * Artisan Profile Parser
 * Converts Artisan .alog files to usable profile data for the roaster dashboard
 */

export interface ProfilePoint {
  time: number        // seconds from start
  beanTemp: number   // Bean temperature (BT)
  envTemp: number    // Environment temperature (ET)
}

export interface RoastEvent {
  name: string
  time: number
  beanTemp: number
  envTemp: number
  type: 'TP' | 'DRY' | 'FCs' | 'FCe' | 'SCs' | 'DROP' | 'CHARGE'
}

export interface ParsedProfile {
  title: string
  roastDate: string
  totalTime: number
  points: ProfilePoint[]
  events: RoastEvent[]
  metadata: {
    operator: string
    roasterType: string
    beans: string
    weight: number
    totalRor: number
    dryPhaseRor: number
    midPhaseRor: number
    finishPhaseRor: number
  }
}

/**
 * Parse Artisan .alog file content
 */
export function parseArtisanProfile(content: string): ParsedProfile {
  let profileData: any
  
  try {
    // Try to parse as JSON first (some .alog files are JSON)
    profileData = JSON.parse(content)
  } catch (e) {
    // If not JSON, try to evaluate as Python literal
    try {
      // Replace Python literals with JSON equivalents
      const jsonContent = content
        .replace(/True/g, 'true')
        .replace(/False/g, 'false')
        .replace(/None/g, 'null')
      profileData = JSON.parse(jsonContent)
    } catch (e2) {
      throw new Error('Unable to parse Artisan profile file format')
    }
  }

  // Extract time and temperature arrays
  const timex = profileData.timex || []
  const temp1 = profileData.temp1 || [] // Environment Temperature (ET)
  const temp2 = profileData.temp2 || [] // Bean Temperature (BT)
  const computed = profileData.computed || {}

  // Convert to profile points
  const points: ProfilePoint[] = timex.map((time: number, index: number) => ({
    time,
    beanTemp: temp2[index] || 0,
    envTemp: temp1[index] || 0
  }))

  // Extract roast events from computed data
  const events: RoastEvent[] = []
  
  if (computed.CHARGE_time !== undefined) {
    events.push({
      name: 'Charge',
      time: 0,
      beanTemp: computed.CHARGE_BT || 0,
      envTemp: computed.CHARGE_ET || 0,
      type: 'CHARGE'
    })
  }

  if (computed.TP_time !== undefined) {
    events.push({
      name: 'Turning Point',
      time: computed.TP_time,
      beanTemp: computed.TP_BT || 0,
      envTemp: computed.TP_ET || 0,
      type: 'TP'
    })
  }

  if (computed.DRY_time !== undefined) {
    events.push({
      name: 'Dry End',
      time: computed.DRY_time,
      beanTemp: computed.DRY_BT || 0,
      envTemp: computed.DRY_ET || 0,
      type: 'DRY'
    })
  }

  if (computed.FCs_time !== undefined) {
    events.push({
      name: 'First Crack Start',
      time: computed.FCs_time,
      beanTemp: computed.FCs_BT || 0,
      envTemp: computed.FCs_ET || 0,
      type: 'FCs'
    })
  }

  if (computed.FCe_time !== undefined) {
    events.push({
      name: 'First Crack End',
      time: computed.FCe_time,
      beanTemp: computed.FCe_BT || 0,
      envTemp: computed.FCe_ET || 0,
      type: 'FCe'
    })
  }

  if (computed.SCs_time !== undefined) {
    events.push({
      name: 'Second Crack Start',
      time: computed.SCs_time,
      beanTemp: computed.SCs_BT || 0,
      envTemp: computed.SCs_ET || 0,
      type: 'SCs'
    })
  }

  if (computed.DROP_time !== undefined) {
    events.push({
      name: 'Drop',
      time: computed.DROP_time,
      beanTemp: computed.DROP_BT || 0,
      envTemp: computed.DROP_ET || 0,
      type: 'DROP'
    })
  }

  return {
    title: profileData.title || 'Imported Profile',
    roastDate: profileData.roastdate || '',
    totalTime: computed.totaltime || Math.max(...timex),
    points,
    events,
    metadata: {
      operator: profileData.operator || '',
      roasterType: profileData.roastertype || '',
      beans: profileData.beans || '',
      weight: (profileData.weight && profileData.weight[0]) || 0,
      totalRor: computed.total_ror || 0,
      dryPhaseRor: computed.dry_phase_ror || 0,
      midPhaseRor: computed.mid_phase_ror || 0,
      finishPhaseRor: computed.finish_phase_ror || 0
    }
  }
}

/**
 * Get target bean temperature at specific time from profile
 */
export function getTargetTemperature(profile: ParsedProfile, currentTime: number): number {
  if (!profile?.points?.length) return 0
  
  // Find the closest point or interpolate between two points
  if (currentTime <= profile.points[0].time) {
    return profile.points[0].beanTemp
  }
  
  if (currentTime >= profile.points[profile.points.length - 1].time) {
    return profile.points[profile.points.length - 1].beanTemp
  }
  
  // Find surrounding points and interpolate
  for (let i = 0; i < profile.points.length - 1; i++) {
    const point1 = profile.points[i]
    const point2 = profile.points[i + 1]
    
    if (currentTime >= point1.time && currentTime <= point2.time) {
      const ratio = (currentTime - point1.time) / (point2.time - point1.time)
      return point1.beanTemp + (point2.beanTemp - point1.beanTemp) * ratio
    }
  }
  
  return 0
}

/**
 * Get rate of rise at specific time from profile
 */
export function getTargetRateOfRise(profile: ParsedProfile, currentTime: number, windowSize = 30): number {
  if (!profile.points.length) return 0
  
  const currentTemp = getTargetTemperature(profile, currentTime)
  const pastTemp = getTargetTemperature(profile, currentTime - windowSize)
  
  if (currentTemp === 0 || pastTemp === 0) return 0
  
  return (currentTemp - pastTemp) / (windowSize / 60) // °C per minute
}