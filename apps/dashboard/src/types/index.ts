// Core Device Types
export interface Device {
  device_id: string
  last_seen: string
  device_type?: DeviceType
  capabilities?: DeviceCapabilities
}

export type DeviceType = 'coffee_roaster' | 'smoker' | 'oven' | 'generic'

export interface DeviceCapabilities {
  temperature_sensors: TemperatureSensor[]
  control_outputs: ControlOutput[]
  supported_profiles: ProfileType[]
  mqtt_topics: MqttTopics
}

export interface TemperatureSensor {
  id: string
  name: string
  unit: 'celsius' | 'fahrenheit'
  min_value?: number
  max_value?: number
}

export interface ControlOutput {
  id: string
  name: string
  type: 'pwm' | 'relay' | 'analog'
  min_value: number
  max_value: number
  unit?: string
}

export interface MqttTopics {
  telemetry: string
  control: string
  status: string
  autotune?: string
}

// Telemetry Types
export interface TelemetryPoint {
  ts: number
  telemetry: TelemetryData
}

export interface TelemetryData {
  beanTemp?: number
  envTemp?: number
  setpoint?: number
  fanPWM?: number
  heaterPWM?: number
  rateOfRise?: number
  heaterEnable?: boolean
  controlMode?: ControlMode
  // Extensible for other device types
  [key: string]: number | string | boolean | undefined
}

export type ControlMode = 'manual' | 'auto' | 'profile'

// Session Types
export interface RoastSession {
  id: string
  device_id: string
  name: string
  start_time: string | null
  end_time: string | null
  status: SessionStatus
  profile_id: string | null
  metadata?: SessionMetadata
}

export type SessionStatus = 'planning' | 'active' | 'paused' | 'completed' | 'stopped'

export interface SessionMetadata {
  bean_type?: string
  batch_size?: number
  roast_level?: string
  notes?: string
  ambient_temp?: number
  humidity?: number
  [key: string]: any
}

// Profile Types
export interface RoastProfile {
  id: string
  name: string
  device_type: DeviceType
  description?: string
  created_at: string
  updated_at: string
  profile_data: ProfileData
}

export interface ProfileData {
  points: ProfilePoint[]
  metadata: ProfileMetadata
}

export interface ProfilePoint {
  time: number // seconds from start
  target_temp: number
  fan_speed?: number
  notes?: string
}

export interface ProfileMetadata {
  total_time: number
  max_temp: number
  roast_style?: string
  bean_capacity?: number
  [key: string]: any
}

export type ProfileType = 'temperature' | 'time_temp' | 'artisan' | 'custom'

// UI State Types
export interface UIState {
  theme: 'light' | 'dark'
  selectedDevice: string | null
  activeTab: string
  isLoading: boolean
  error: string | null
}

// Chart Configuration Types
export interface ChartSettings {
  ror_filter: RoRFilterSettings
  display_options: ChartDisplayOptions
  color_scheme: ChartColorScheme
}

export interface RoRFilterSettings {
  smoothingWindow: number
  filterType: 'none' | 'simple' | 'exponential'
  exponentialAlpha: number
}

export interface ChartDisplayOptions {
  show_grid: boolean
  show_legend: boolean
  show_crosshair: boolean
  auto_scale: boolean
  time_format: '12h' | '24h'
}

export interface ChartColorScheme {
  background: string
  grid: string
  bean_temp: string
  env_temp: string
  setpoint: string
  ror: string
  fan_pwm: string
  heater_pwm: string
}

// Auto-tune Types
export interface AutoTuneConfig {
  target_temp: number
  max_output: number
  noise_band: number
  output_step: number
  setpoint_step: number
  control_type: 'PI' | 'PID'
}

export interface AutoTuneResult {
  kp: number
  ki: number
  kd?: number
  ultimate_gain: number
  ultimate_period: number
  status: 'running' | 'completed' | 'failed'
  convergence_data: ConvergencePoint[]
}

export interface ConvergencePoint {
  time: number
  temperature: number
  output: number
  setpoint: number
}

// Error Handling Types
export interface AppError {
  code: string
  message: string
  details?: any
  timestamp: number
  recoverable: boolean
}

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical'

// API Response Types
export interface ApiResponse<T = any> {
  data: T
  success: boolean
  message?: string
  error?: AppError
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// Event Types for Real-time Updates
export interface WebSocketMessage<T = any> {
  type: string
  payload: T
  timestamp: number
  device_id?: string
}

export interface TelemetryMessage extends WebSocketMessage<TelemetryData> {
  type: 'telemetry'
}

export interface StatusMessage extends WebSocketMessage<DeviceStatus> {
  type: 'status'
}

export interface DeviceStatus {
  device_id: string
  online: boolean
  last_heartbeat: number
  error_count: number
  uptime: number
}

// Configuration Types for Multi-Device Support
export interface AppConfig {
  mqtt: MqttConfig
  devices: DeviceConfig[]
  ui: UIConfig
  features: FeatureFlags
}

export interface MqttConfig {
  broker_host: string
  broker_port: number
  username?: string
  password?: string
  ssl: boolean
  topics_prefix: string
}

export interface DeviceConfig {
  device_id: string
  device_type: DeviceType
  display_name: string
  enabled: boolean
  capabilities: DeviceCapabilities
  default_settings: Record<string, any>
}

export interface UIConfig {
  default_theme: 'light' | 'dark'
  chart_refresh_rate: number
  telemetry_buffer_size: number
  enable_debug_mode: boolean
}

export interface FeatureFlags {
  enable_autotune: boolean
  enable_profiles: boolean
  enable_multi_device: boolean
  enable_export: boolean
  enable_advanced_charts: boolean
}

// Utility Types
export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>