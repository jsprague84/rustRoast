const BASE = '' // proxied in dev via Vite, same-origin in prod

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + url, init)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  if (r.headers.get('content-type')?.includes('application/json')) return r.json()
  // @ts-ignore
  return undefined
}

export const api = {
  // Devices
  devices: () => j<{ devices: DeviceInfo[] }>(`/api/devices`),
  // Telemetry
  latestTelemetry: (deviceId: string) => j<LatestTelemetryResponse>(`/api/roaster/${encodeURIComponent(deviceId)}/telemetry/latest`),
  telemetryHistory: (deviceId: string, since_secs = 3600, limit = 300) =>
    j<TelemetryHistoryResponse>(`/api/roaster/${encodeURIComponent(deviceId)}/telemetry?since_secs=${since_secs}&limit=${limit}`),
  // Controls
  setSetpoint: (deviceId: string, value: number) => j<void>(`/api/roaster/${deviceId}/control/setpoint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value }) }),
  setFanPwm: (deviceId: string, value: number) => j<void>(`/api/roaster/${deviceId}/control/fan_pwm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value }) }),
  setHeaterPwm: (deviceId: string, value: number) => j<void>(`/api/roaster/${deviceId}/control/heater_pwm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value }) }),
  setMode: (deviceId: string, mode: 'auto' | 'manual') => j<void>(`/api/roaster/${deviceId}/control/mode`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }) }),
  setHeaterEnable: (deviceId: string, enabled: boolean) => j<void>(`/api/roaster/${deviceId}/control/heater_enable`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) }),
  setPid: (deviceId: string, kp: number, ki: number, kd: number) => j<void>(`/api/roaster/${deviceId}/control/pid`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kp, ki, kd }) }),
  // Auto-tune
  autotuneStart: (deviceId: string, target_temperature: number) => j<void>(`/api/roaster/${deviceId}/autotune/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target_temperature }) }),
  autotuneStop: (deviceId: string) => j<void>(`/api/roaster/${deviceId}/autotune/stop`, { method: 'POST' }),
  autotuneApply: (deviceId: string) => j<void>(`/api/roaster/${deviceId}/autotune/apply`, { method: 'POST' }),
  autotuneStatusLatest: (deviceId: string) => j<{ device_id: string, timestamp: number, status: any }>(`/api/roaster/${deviceId}/autotune/status/latest`),
  autotuneResultsLatest: (deviceId: string) => j<{ device_id: string, timestamp: number, results: any }>(`/api/roaster/${deviceId}/autotune/results/latest`),
  autotuneStatusHistory: (deviceId: string, since_secs = 3600, limit = 200) => j<{ device_id: string, count: number, items: { ts: number, telemetry: any }[] }>(`/api/roaster/${deviceId}/autotune/status?since_secs=${since_secs}&limit=${limit}`),
  autotuneResultsHistory: (deviceId: string, since_secs = 3600, limit = 200) => j<{ device_id: string, count: number, items: { ts: number, telemetry: any }[] }>(`/api/roaster/${deviceId}/autotune/results?since_secs=${since_secs}&limit=${limit}`),
  
  // Roast Sessions
  createSession: (req: CreateSessionRequest) => j<RoastSession>(`/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) }),
  listSessions: (deviceId?: string, limit?: number) => {
    const params = new URLSearchParams()
    if (deviceId) params.set('device_id', deviceId)
    if (limit) params.set('limit', limit.toString())
    const query = params.toString()
    return j<RoastSession[]>(`/api/sessions${query ? '?' + query : ''}`)
  },
  getSession: (id: string) => j<RoastSession>(`/api/sessions/${encodeURIComponent(id)}`),
  getSessionWithTelemetry: (id: string) => j<SessionWithTelemetry>(`/api/sessions/${encodeURIComponent(id)}/telemetry`),
  updateSession: (id: string, req: UpdateSessionRequest) => j<RoastSession>(`/api/sessions/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) }),
  startSession: (id: string) => j<RoastSession>(`/api/sessions/${encodeURIComponent(id)}/start`, { method: 'POST' }),
  pauseSession: (id: string) => j<RoastSession>(`/api/sessions/${encodeURIComponent(id)}/pause`, { method: 'POST' }),
  resumeSession: (id: string) => j<RoastSession>(`/api/sessions/${encodeURIComponent(id)}/resume`, { method: 'POST' }),
  completeSession: (id: string) => j<RoastSession>(`/api/sessions/${encodeURIComponent(id)}/complete`, { method: 'POST' }),
  deleteSession: (id: string) => j<void>(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  
  // Roast Events
  addRoastEvent: (sessionId: string, req: CreateRoastEventRequest) => j<RoastEvent>(`/api/sessions/${encodeURIComponent(sessionId)}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) }),
  getRoastEvents: (sessionId: string) => j<RoastEvent[]>(`/api/sessions/${encodeURIComponent(sessionId)}/events`),
  updateRoastEvent: (sessionId: string, eventId: string, req: UpdateRoastEventRequest) => j<RoastEvent>(`/api/sessions/${encodeURIComponent(sessionId)}/events/${encodeURIComponent(eventId)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) }),
  deleteRoastEvent: (sessionId: string, eventId: string) => j<void>(`/api/sessions/${encodeURIComponent(sessionId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' }),
  
  // Roast Profiles
  createProfile: (req: CreateProfileRequest) => j<ProfileWithPoints>(`/api/profiles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) }),
  listProfiles: (includePrivate = false) => j<RoastProfile[]>(`/api/profiles?include_private=${includePrivate}`),
  getProfile: async (id: string) => {
    const response = await j<any>(`/api/profiles/${encodeURIComponent(id)}`)
    // Transform flat response to nested ProfileWithPoints structure
    const { points, ...profileData } = response
    return {
      profile: profileData as RoastProfile,
      points: points as ProfilePoint[]
    } as ProfileWithPoints
  },
  deleteProfile: (id: string) => j<void>(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  importArtisanProfile: (alogContent: string, name?: string) => j<ProfileWithPoints>(`/api/profiles/import/artisan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alog_content: alogContent, name }) }),
  
  // Admin/Debug
  mqttReset: () => j<void>(`/api/admin/mqtt/reset`, { method: 'POST' }),
}

// Types (mirror server JSON)
export type DeviceInfo = { device_id: string; last_seen: number; id?: string; ip?: string; version?: string; rssi?: number }
export type LatestTelemetryResponse = { device_id: string; timestamp: number; telemetry: any }
export type TelemetryHistoryItem = { ts: number; telemetry: any }
export type TelemetryHistoryResponse = { device_id: string; count: number; items: TelemetryHistoryItem[] }

// Roast Session Types
export type SessionStatus = 'planning' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled'

export type RoastSession = {
  id: string
  name: string
  device_id: string
  profile_id?: string
  status: SessionStatus
  start_time?: string
  end_time?: string
  created_at: string
  updated_at: string
  
  // Bean metadata
  bean_origin?: string
  bean_variety?: string
  green_weight?: number
  roasted_weight?: number
  target_roast_level?: string
  notes?: string
  
  // Environmental conditions
  ambient_temp?: number
  humidity?: number
  
  // Session summary data
  max_temp?: number
  total_time_seconds?: number
  first_crack_time?: number
  development_time_ratio?: number
}

export type CreateSessionRequest = {
  name: string
  device_id: string
  profile_id?: string
  bean_origin?: string
  bean_variety?: string
  green_weight?: number
  target_roast_level?: string
  notes?: string
  ambient_temp?: number
  humidity?: number
}

export type UpdateSessionRequest = {
  name?: string
  roasted_weight?: number
  notes?: string
  first_crack_time?: number
  development_time_ratio?: number
}

export type RoastProfile = {
  id: string
  name: string
  description?: string
  created_by?: string
  created_at: string
  updated_at: string
  is_public: boolean
  
  // Profile settings
  target_total_time?: number
  target_first_crack?: number
  target_end_temp?: number
  preheat_temp?: number
  charge_temp?: number
}

export type ProfilePoint = {
  id: string
  profile_id: string
  time_seconds: number
  target_temp: number
  fan_speed?: number
  notes?: string
  created_at: string
}

export type CreateProfileRequest = {
  name: string
  description?: string
  target_total_time?: number
  target_first_crack?: number
  target_end_temp?: number
  preheat_temp?: number
  charge_temp?: number
  points: CreateProfilePointRequest[]
}

export type CreateProfilePointRequest = {
  time_seconds: number
  target_temp: number
  fan_speed?: number
  notes?: string
}

export type SessionTelemetry = {
  id: string
  session_id: string
  timestamp: string
  elapsed_seconds: number
  bean_temp?: number
  env_temp?: number
  rate_of_rise?: number
  heater_pwm?: number
  fan_pwm?: number
  setpoint?: number
}

export type SessionWithTelemetry = {
  session: RoastSession
  telemetry: SessionTelemetry[]
  profile?: ProfileWithPoints
}

export type ProfileWithPoints = {
  profile: RoastProfile
  points: ProfilePoint[]
}

// Roast Event Types
export type RoastEventType = 'drop' | 'drying_end' | 'first_crack_start' | 'first_crack_end' | 'second_crack_start' | 'second_crack_end' | 'development_start' | 'drop_out' | 'custom'

export type RoastEvent = {
  id: string
  session_id: string
  event_type: RoastEventType
  elapsed_seconds: number
  temperature?: number
  notes?: string
  created_at: string
}

export type CreateRoastEventRequest = {
  event_type: RoastEventType
  elapsed_seconds: number
  temperature?: number
  notes?: string
}

export type UpdateRoastEventRequest = {
  elapsed_seconds?: number
  temperature?: number
  notes?: string
}

