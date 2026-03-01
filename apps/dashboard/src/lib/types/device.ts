// Device Configuration Types (persistent devices table)
// These types mirror the Rust backend models for the device management API.

export type ConfiguredDeviceStatus = 'pending' | 'active' | 'disabled' | 'error'
export type ConnectionProtocol = 'mqtt' | 'websocket' | 'modbus_tcp'

export type ConfiguredDevice = {
  id: string
  name: string
  device_id: string
  profile_id?: string
  status: ConfiguredDeviceStatus
  description?: string
  location?: string
  created_at: string
  updated_at: string
  last_seen_at?: string
}

export type DeviceConnection = {
  id: string
  device_id: string
  protocol: ConnectionProtocol
  enabled: boolean
  priority: number
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type ConfiguredDeviceWithConnections = ConfiguredDevice & {
  connections: DeviceConnection[]
}

export type CreateDeviceRequest = {
  device_id: string
  name: string
  profile_id?: string
  description?: string
  location?: string
}

export type UpdateDeviceRequest = {
  name?: string
  profile_id?: string
  status?: ConfiguredDeviceStatus
  description?: string
  location?: string
}

export type DeviceProfile = {
  id: string
  name: string
  description?: string
  default_control_mode?: string
  default_setpoint?: number
  default_fan_pwm?: number
  default_kp?: number
  default_ki?: number
  default_kd?: number
  max_temp?: number
  min_fan_pwm?: number
  telemetry_interval_ms?: number
  created_at: string
  updated_at: string
}

export type CreateDeviceProfileRequest = {
  name: string
  description?: string
  default_control_mode?: string
  default_setpoint?: number
  default_fan_pwm?: number
  default_kp?: number
  default_ki?: number
  default_kd?: number
  max_temp?: number
  min_fan_pwm?: number
  telemetry_interval_ms?: number
}

// Connection testing types
export type TestConnectionRequest = {
  protocol: ConnectionProtocol
  config: Record<string, unknown>
  device_id?: string
}

export type TestConnectionResponse = {
  success: boolean
  message: string
  latency_ms?: number
}

export type CreateConnectionRequest = {
  protocol: ConnectionProtocol
  enabled: boolean
  priority?: number
  config: Record<string, unknown>
}

export type UpdateConnectionRequest = {
  enabled?: boolean
  priority?: number
  config?: Record<string, unknown>
}

// Modbus register map types
export type ModbusRegisterMapEntry = {
  id: string
  device_id: string
  register_type: string
  address: number
  name: string
  data_type: string
  byte_order: string
  scale_factor: number
  offset: number
  unit?: string
  description?: string
  writable: boolean
}

export type CreateRegisterMapEntry = {
  register_type: string
  address: number
  name: string
  data_type: string
  byte_order?: string
  scale_factor?: number
  offset?: number
  unit?: string
  description?: string
  writable?: boolean
}
