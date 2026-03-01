import type {
  ConfiguredDevice,
  ConfiguredDeviceStatus,
  ConfiguredDeviceWithConnections,
  CreateConnectionRequest,
  CreateDeviceProfileRequest,
  CreateDeviceRequest,
  CreateRegisterMapEntry,
  DeviceConnection,
  DeviceProfile,
  ModbusRegisterMapEntry,
  TestConnectionRequest,
  TestConnectionResponse,
  UpdateConnectionRequest,
  UpdateDeviceRequest,
} from '../types/device'

const BASE = '' // proxied in dev via Vite, same-origin in prod

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + url, init)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  if (r.headers.get('content-type')?.includes('application/json')) return r.json()
  // @ts-ignore
  return undefined
}

const jsonHeaders = { 'content-type': 'application/json' } as const

// --- Device CRUD ---

export function listDevices(status?: ConfiguredDeviceStatus): Promise<ConfiguredDevice[]> {
  const params = status ? `?status=${status}` : ''
  return j<ConfiguredDevice[]>(`/api/devices${params}`)
}

export function getDevice(id: string): Promise<ConfiguredDeviceWithConnections> {
  return j<ConfiguredDeviceWithConnections>(`/api/devices/${encodeURIComponent(id)}`)
}

export function createDevice(req: CreateDeviceRequest): Promise<ConfiguredDevice> {
  return j<ConfiguredDevice>(`/api/devices`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(req),
  })
}

export function updateDevice(id: string, req: UpdateDeviceRequest): Promise<ConfiguredDevice> {
  return j<ConfiguredDevice>(`/api/devices/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(req),
  })
}

export function deleteDevice(id: string): Promise<void> {
  return j<void>(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// --- Discovered devices ---

export function getDiscoveredDevices(): Promise<ConfiguredDevice[]> {
  return j<ConfiguredDevice[]>(`/api/devices/discovered`)
}

// --- Device Profiles ---

export function listDeviceProfiles(): Promise<DeviceProfile[]> {
  return j<DeviceProfile[]>(`/api/device-profiles`)
}

export function getDeviceProfile(id: string): Promise<DeviceProfile> {
  return j<DeviceProfile>(`/api/device-profiles/${encodeURIComponent(id)}`)
}

export function createDeviceProfile(req: CreateDeviceProfileRequest): Promise<DeviceProfile> {
  return j<DeviceProfile>(`/api/device-profiles`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(req),
  })
}

export function deleteDeviceProfile(id: string): Promise<void> {
  return j<void>(`/api/device-profiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// --- Connections ---

export function addConnection(deviceId: string, req: CreateConnectionRequest): Promise<DeviceConnection> {
  return j<DeviceConnection>(`/api/devices/${encodeURIComponent(deviceId)}/connections`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(req),
  })
}

export function updateConnection(deviceId: string, connId: string, req: UpdateConnectionRequest): Promise<DeviceConnection> {
  return j<DeviceConnection>(`/api/devices/${encodeURIComponent(deviceId)}/connections/${encodeURIComponent(connId)}`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(req),
  })
}

export function removeConnection(deviceId: string, connId: string): Promise<void> {
  return j<void>(`/api/devices/${encodeURIComponent(deviceId)}/connections/${encodeURIComponent(connId)}`, {
    method: 'DELETE',
  })
}

// --- Register Map ---

export function getRegisterMap(deviceId: string): Promise<ModbusRegisterMapEntry[]> {
  return j<ModbusRegisterMapEntry[]>(`/api/devices/${encodeURIComponent(deviceId)}/register-map`)
}

export function setRegisterMap(deviceId: string, registers: CreateRegisterMapEntry[]): Promise<unknown> {
  return j<unknown>(`/api/devices/${encodeURIComponent(deviceId)}/register-map`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(registers),
  })
}

// --- Connection Testing ---

export function testConnection(req: TestConnectionRequest): Promise<TestConnectionResponse> {
  return j<TestConnectionResponse>(`/api/devices/test-connection`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(req),
  })
}
