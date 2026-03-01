import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ConfiguredDevice, ConnectionProtocol, DeviceInfo, DeviceProfile } from '../api/client'

const STEPS = ['Device', 'Connections', 'Configuration', 'Review'] as const

export type ConnectionConfig = {
  mqtt: { enabled: boolean; topic_prefix: string; qos: number }
  websocket: { enabled: boolean; url: string; reconnect_interval_ms: number }
  modbus_tcp: { enabled: boolean; host: string; port: number; unit_id: number; poll_interval_ms: number }
}

export type ConnectionTestStatus = 'idle' | 'testing' | 'success' | 'failure'

export type ConnectionTestState = {
  status: ConnectionTestStatus
  message?: string
  latency_ms?: number
}

export type ModbusRegisterEntry = {
  address: number
  name: string
  register_type: 'input' | 'holding' | 'coil' | 'discrete'
  data_type: 'uint16' | 'int16' | 'float32' | 'uint32' | 'int32' | 'bool'
  byte_order: string
  scale_factor: number
  offset: number
  unit: string
  writable: boolean
  description: string
}

export type DeviceConfigData = {
  control_mode: 'manual' | 'auto'
  default_setpoint: number
  default_fan_pwm: number
  max_temp: number
  min_fan_pwm: number
  kp: number
  ki: number
  kd: number
}

export type WizardFormData = {
  // Step 1: Device identification
  device_id: string
  name: string
  description: string
  location: string
  profile_id: string
  // Step 2: Connection configuration
  connections: ConnectionConfig
  // Step 3: Device configuration
  config: DeviceConfigData
  register_map: ModbusRegisterEntry[]
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      marginBottom: '32px',
      padding: '0 4px',
    }}>
      {STEPS.map((label, i) => {
        const isActive = i === currentStep
        const isComplete = i < currentStep
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 600,
              flexShrink: 0,
              backgroundColor: isActive ? '#2563eb' : isComplete ? '#16a34a' : '#e5e7eb',
              color: isActive || isComplete ? '#fff' : '#6b7280',
              transition: 'all 0.2s ease',
            }}>
              {isComplete ? '\u2713' : i + 1}
            </div>
            <span style={{
              fontSize: '13px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#111827' : '#6b7280',
              whiteSpace: 'nowrap',
            }}>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1,
                height: '2px',
                backgroundColor: isComplete ? '#16a34a' : '#e5e7eb',
                marginLeft: '8px',
                transition: 'background-color 0.2s ease',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function DiscoveredDeviceRow({ device, registryInfo, onSelect }: {
  device: ConfiguredDevice
  registryInfo?: DeviceInfo
  onSelect: () => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: '1px solid var(--color-gray-200, #e5e7eb)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: '#f59e0b',
          flexShrink: 0,
        }} />
        <div style={{ flex: 1 }}>
          <div className="text-sm font-medium text-gray-900">{device.device_id}</div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '2px' }}>
            {registryInfo?.ip && (
              <span className="text-xs text-gray-500">IP: {registryInfo.ip}</span>
            )}
            {registryInfo?.version && (
              <span className="text-xs text-gray-500">FW: {registryInfo.version}</span>
            )}
            {registryInfo?.rssi != null && (
              <span className="text-xs text-gray-500">RSSI: {registryInfo.rssi} dBm</span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={onSelect}
        className="px-3 py-1.5 bg-blue-600 text-white border-0 rounded text-xs font-medium cursor-pointer hover:bg-blue-700"
      >
        Select
      </button>
    </div>
  )
}

function Step1Device({ formData, onUpdate, discoveredDevices, registryDevices, profiles }: {
  formData: WizardFormData
  onUpdate: (updates: Partial<WizardFormData>) => void
  discoveredDevices: ConfiguredDevice[]
  registryDevices: DeviceInfo[]
  profiles: DeviceProfile[]
}) {
  const registryMap = new Map(registryDevices.map(d => [d.device_id, d]))

  const handleSelectDiscovered = (device: ConfiguredDevice) => {
    onUpdate({
      device_id: device.device_id,
      name: device.name || device.device_id,
    })
  }

  return (
    <div>
      {/* Discovered Devices Section */}
      {discoveredDevices.length > 0 && (
        <div style={{
          marginBottom: '24px',
          border: '1px solid #fbbf24',
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: 'rgba(251, 191, 36, 0.05)',
        }}>
          <div style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            borderBottom: '1px solid #fbbf24',
          }}>
            <span className="text-sm font-semibold text-yellow-800">
              Discovered Devices ({discoveredDevices.length})
            </span>
            <span className="text-xs text-yellow-600 ml-2">
              Select a device to auto-fill its details
            </span>
          </div>
          {discoveredDevices.map(device => (
            <DiscoveredDeviceRow
              key={device.id}
              device={device}
              registryInfo={registryMap.get(device.device_id)}
              onSelect={() => handleSelectDiscovered(device)}
            />
          ))}
        </div>
      )}

      {/* Manual Setup Form */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: 600, color: '#111827' }}>
          {discoveredDevices.length > 0 ? 'Manual Setup' : 'Device Details'}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Device ID */}
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Device ID <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.device_id}
              onChange={e => onUpdate({ device_id: e.target.value })}
              placeholder="e.g. esp32-001"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-gray-300, #d1d5db)',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'var(--color-white, #fff)',
                color: 'var(--color-gray-900, #111827)',
                boxSizing: 'border-box',
              }}
            />
            <p className="text-xs text-gray-400" style={{ margin: '4px 0 0' }}>
              The unique identifier used in MQTT topics
            </p>
          </div>

          {/* Name */}
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => onUpdate({ name: e.target.value })}
              placeholder="e.g. My Coffee Roaster"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-gray-300, #d1d5db)',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'var(--color-white, #fff)',
                color: 'var(--color-gray-900, #111827)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Description
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={e => onUpdate({ description: e.target.value })}
              placeholder="Optional description"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-gray-300, #d1d5db)',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'var(--color-white, #fff)',
                color: 'var(--color-gray-900, #111827)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Location
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={e => onUpdate({ location: e.target.value })}
              placeholder="e.g. Workshop, Garage"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-gray-300, #d1d5db)',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'var(--color-white, #fff)',
                color: 'var(--color-gray-900, #111827)',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Device Profile */}
        <div style={{ marginTop: '16px' }}>
          <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
            Device Profile
          </label>
          <select
            value={formData.profile_id}
            onChange={e => onUpdate({ profile_id: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--color-gray-300, #d1d5db)',
              borderRadius: '6px',
              fontSize: '14px',
              backgroundColor: 'var(--color-white, #fff)',
              color: 'var(--color-gray-900, #111827)',
              boxSizing: 'border-box',
            }}
          >
            <option value="">None</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.description ? ` — ${p.description}` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400" style={{ margin: '4px 0 0' }}>
            Profiles provide default control settings and safety limits
          </p>
        </div>
      </div>
    </div>
  )
}

function ProtocolCard({ title, icon, enabled, onToggle, testState, onTest, children }: {
  title: string
  icon: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  testState: ConnectionTestState
  onTest: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{
      border: `1px solid ${enabled ? '#3b82f6' : 'var(--color-gray-200, #e5e7eb)'}`,
      borderRadius: '12px',
      overflow: 'hidden',
      backgroundColor: enabled ? 'rgba(59, 130, 246, 0.03)' : 'transparent',
      transition: 'all 0.2s ease',
    }}>
      {/* Header with toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: enabled ? '1px solid var(--color-gray-200, #e5e7eb)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>{icon}</span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{title}</span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <span className="text-xs text-gray-500">{enabled ? 'Enabled' : 'Disabled'}</span>
          <div
            onClick={() => onToggle(!enabled)}
            style={{
              width: '40px',
              height: '22px',
              borderRadius: '11px',
              backgroundColor: enabled ? '#3b82f6' : '#d1d5db',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
            }}
          >
            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: '#fff',
              position: 'absolute',
              top: '2px',
              left: enabled ? '20px' : '2px',
              transition: 'left 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
        </label>
      </div>

      {/* Config fields */}
      {enabled && (
        <div style={{ padding: '16px' }}>
          {children}

          {/* Test Connection Button + Status */}
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={onTest}
              disabled={testState.status === 'testing'}
              style={{
                padding: '8px 16px',
                border: '1px solid var(--color-gray-300, #d1d5db)',
                borderRadius: '6px',
                backgroundColor: 'var(--color-white, #fff)',
                color: 'var(--color-gray-700, #374151)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: testState.status === 'testing' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: testState.status === 'testing' ? 0.7 : 1,
              }}
            >
              {testState.status === 'testing' && (
                <span style={{
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  border: '2px solid #d1d5db',
                  borderTopColor: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
              )}
              {testState.status === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>

            {testState.status === 'success' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontSize: '13px', fontWeight: 500 }}>
                <span style={{ fontSize: '16px' }}>&#10003;</span>
                Connected
                {testState.latency_ms != null && (
                  <span className="text-gray-400" style={{ fontWeight: 400 }}> ({testState.latency_ms}ms)</span>
                )}
              </span>
            )}
            {testState.status === 'failure' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '13px', fontWeight: 500 }}>
                <span style={{ fontSize: '16px' }}>&#10007;</span>
                {testState.message || 'Connection failed'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--color-gray-300, #d1d5db)',
  borderRadius: '6px',
  fontSize: '14px',
  backgroundColor: 'var(--color-white, #fff)',
  color: 'var(--color-gray-900, #111827)',
  boxSizing: 'border-box' as const,
}

function Step2Connections({ formData, onUpdate, testStates, onTestConnection }: {
  formData: WizardFormData
  onUpdate: (updates: Partial<WizardFormData>) => void
  testStates: Record<ConnectionProtocol, ConnectionTestState>
  onTestConnection: (protocol: ConnectionProtocol) => void
}) {
  const conn = formData.connections

  const updateConn = <K extends keyof ConnectionConfig>(
    protocol: K,
    updates: Partial<ConnectionConfig[K]>,
  ) => {
    onUpdate({
      connections: {
        ...conn,
        [protocol]: { ...conn[protocol], ...updates },
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* MQTT */}
      <ProtocolCard
        title="MQTT"
        icon="📡"
        enabled={conn.mqtt.enabled}
        onToggle={(enabled) => updateConn('mqtt', { enabled })}
        testState={testStates.mqtt}
        onTest={() => onTestConnection('mqtt')}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Topic Prefix
            </label>
            <input
              type="text"
              value={conn.mqtt.topic_prefix}
              onChange={e => updateConn('mqtt', { topic_prefix: e.target.value })}
              placeholder="roaster/esp32-001"
              style={inputStyle}
            />
            <p className="text-xs text-gray-400" style={{ margin: '4px 0 0' }}>
              Base topic for telemetry and control messages
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              QoS
            </label>
            <select
              value={conn.mqtt.qos}
              onChange={e => updateConn('mqtt', { qos: Number(e.target.value) })}
              style={inputStyle}
            >
              <option value={0}>0 — At most once</option>
              <option value={1}>1 — At least once</option>
              <option value={2}>2 — Exactly once</option>
            </select>
          </div>
        </div>
      </ProtocolCard>

      {/* WebSocket */}
      <ProtocolCard
        title="WebSocket"
        icon="🔌"
        enabled={conn.websocket.enabled}
        onToggle={(enabled) => updateConn('websocket', { enabled })}
        testState={testStates.websocket}
        onTest={() => onTestConnection('websocket')}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              URL
            </label>
            <input
              type="text"
              value={conn.websocket.url}
              onChange={e => updateConn('websocket', { url: e.target.value })}
              placeholder="ws://device-ip:port/ws"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Reconnect Interval (ms)
            </label>
            <input
              type="number"
              value={conn.websocket.reconnect_interval_ms}
              onChange={e => updateConn('websocket', { reconnect_interval_ms: Number(e.target.value) })}
              min={100}
              style={inputStyle}
            />
          </div>
        </div>
      </ProtocolCard>

      {/* Modbus TCP */}
      <ProtocolCard
        title="Modbus TCP"
        icon="🏭"
        enabled={conn.modbus_tcp.enabled}
        onToggle={(enabled) => updateConn('modbus_tcp', { enabled })}
        testState={testStates.modbus_tcp}
        onTest={() => onTestConnection('modbus_tcp')}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Host
            </label>
            <input
              type="text"
              value={conn.modbus_tcp.host}
              onChange={e => updateConn('modbus_tcp', { host: e.target.value })}
              placeholder="192.168.1.100"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Port
            </label>
            <input
              type="number"
              value={conn.modbus_tcp.port}
              onChange={e => updateConn('modbus_tcp', { port: Number(e.target.value) })}
              min={1}
              max={65535}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Unit ID
            </label>
            <input
              type="number"
              value={conn.modbus_tcp.unit_id}
              onChange={e => updateConn('modbus_tcp', { unit_id: Number(e.target.value) })}
              min={1}
              max={247}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Poll Interval (ms)
            </label>
            <input
              type="number"
              value={conn.modbus_tcp.poll_interval_ms}
              onChange={e => updateConn('modbus_tcp', { poll_interval_ms: Number(e.target.value) })}
              min={100}
              style={inputStyle}
            />
          </div>
        </div>
      </ProtocolCard>

      {/* Validation hint */}
      {!hasAnyEnabledAndTested(conn, testStates) && (
        <p className="text-xs text-gray-400" style={{ textAlign: 'center', marginTop: '4px' }}>
          Enable at least one protocol and test it successfully to continue.
        </p>
      )}

      {/* Spin animation style */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const DEFAULT_REGISTER_MAP: ModbusRegisterEntry[] = [
  // Input registers (read-only, telemetry)
  { address: 0x0000, name: 'bean_temp', register_type: 'input', data_type: 'float32', byte_order: 'ABCD', scale_factor: 1.0, offset: 0.0, unit: '\u00B0C', writable: false, description: 'Bean temperature (high word at 0x0000, low word at 0x0001)' },
  { address: 0x0002, name: 'env_temp', register_type: 'input', data_type: 'float32', byte_order: 'ABCD', scale_factor: 1.0, offset: 0.0, unit: '\u00B0C', writable: false, description: 'Environment temperature (high word at 0x0002, low word at 0x0003)' },
  { address: 0x0004, name: 'rate_of_rise', register_type: 'input', data_type: 'float32', byte_order: 'ABCD', scale_factor: 1.0, offset: 0.0, unit: '\u00B0C/min', writable: false, description: 'Rate of rise (high word at 0x0004, low word at 0x0005)' },
  { address: 0x0006, name: 'heater_pwm', register_type: 'input', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '%', writable: false, description: 'Heater PWM percentage (0-100)' },
  { address: 0x0007, name: 'fan_pwm', register_type: 'input', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '', writable: false, description: 'Fan PWM value (0-255)' },
  // Holding registers (read-write, control)
  { address: 0x0000, name: 'setpoint', register_type: 'holding', data_type: 'float32', byte_order: 'ABCD', scale_factor: 1.0, offset: 0.0, unit: '\u00B0C', writable: true, description: 'Target bean temperature (high word at 0x0000, low word at 0x0001)' },
  { address: 0x0002, name: 'fan_pwm_setpoint', register_type: 'holding', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '', writable: true, description: 'Fan PWM setpoint (0-255)' },
  { address: 0x0003, name: 'heater_pwm_setpoint', register_type: 'holding', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '%', writable: true, description: 'Heater PWM setpoint (0-100)' },
  { address: 0x0004, name: 'control_mode', register_type: 'holding', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '', writable: true, description: 'Control mode: 0 = manual, 1 = auto' },
  { address: 0x0005, name: 'heater_enable', register_type: 'holding', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '', writable: true, description: 'Heater enable: 0 = off, 1 = on' },
  { address: 0x000C, name: 'emergency_stop', register_type: 'holding', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '', writable: true, description: 'Emergency stop: write 1 to trigger' },
]

function emptyRegisterEntry(): ModbusRegisterEntry {
  return {
    address: 0,
    name: '',
    register_type: 'input',
    data_type: 'uint16',
    byte_order: 'AB',
    scale_factor: 1.0,
    offset: 0.0,
    unit: '',
    writable: false,
    description: '',
  }
}

function CollapsibleSection({ title, defaultOpen = true, children }: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      border: '1px solid var(--color-gray-200, #e5e7eb)',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: 'rgba(0,0,0,0.02)',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 600,
          color: '#111827',
          textAlign: 'left',
        }}
      >
        <span>{title}</span>
        <span style={{
          fontSize: '12px',
          color: '#6b7280',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }}>&#9660;</span>
      </button>
      {open && (
        <div style={{ padding: '16px', borderTop: '1px solid var(--color-gray-200, #e5e7eb)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function formatHex(val: number): string {
  return '0x' + val.toString(16).toUpperCase().padStart(4, '0')
}

function RegisterMapEditor({ registers, onChange }: {
  registers: ModbusRegisterEntry[]
  onChange: (regs: ModbusRegisterEntry[]) => void
}) {
  const updateRow = (idx: number, updates: Partial<ModbusRegisterEntry>) => {
    const next = [...registers]
    next[idx] = { ...next[idx], ...updates }
    onChange(next)
  }

  const addRow = () => {
    onChange([...registers, emptyRegisterEntry()])
  }

  const removeRow = (idx: number) => {
    onChange(registers.filter((_, i) => i !== idx))
  }

  const smallSelect: React.CSSProperties = {
    padding: '4px 6px',
    border: '1px solid var(--color-gray-300, #d1d5db)',
    borderRadius: '4px',
    fontSize: '12px',
    backgroundColor: 'var(--color-white, #fff)',
    color: 'var(--color-gray-900, #111827)',
    boxSizing: 'border-box' as const,
    width: '100%',
  }

  const smallInput: React.CSSProperties = {
    ...smallSelect,
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-gray-200, #e5e7eb)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Address</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Name</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Type</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Data Type</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Byte Order</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Scale</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Offset</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Unit</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Writable</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}></th>
            </tr>
          </thead>
          <tbody>
            {registers.map((reg, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-gray-100, #f3f4f6)' }}>
                <td style={{ padding: '4px 8px' }}>
                  <input
                    type="text"
                    value={formatHex(reg.address)}
                    onChange={e => {
                      const parsed = parseInt(e.target.value, 16)
                      if (!isNaN(parsed)) updateRow(i, { address: parsed })
                    }}
                    style={{ ...smallInput, width: '72px', fontFamily: 'monospace' }}
                  />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input type="text" value={reg.name} onChange={e => updateRow(i, { name: e.target.value })} style={{ ...smallInput, minWidth: '100px' }} />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <select value={reg.register_type} onChange={e => updateRow(i, { register_type: e.target.value as ModbusRegisterEntry['register_type'] })} style={{ ...smallSelect, minWidth: '80px' }}>
                    <option value="input">Input</option>
                    <option value="holding">Holding</option>
                    <option value="coil">Coil</option>
                    <option value="discrete">Discrete</option>
                  </select>
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <select value={reg.data_type} onChange={e => updateRow(i, { data_type: e.target.value as ModbusRegisterEntry['data_type'] })} style={{ ...smallSelect, minWidth: '80px' }}>
                    <option value="uint16">uint16</option>
                    <option value="int16">int16</option>
                    <option value="float32">float32</option>
                    <option value="uint32">uint32</option>
                    <option value="int32">int32</option>
                    <option value="bool">bool</option>
                  </select>
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <select value={reg.byte_order} onChange={e => updateRow(i, { byte_order: e.target.value })} style={{ ...smallSelect, minWidth: '70px' }}>
                    <option value="AB">AB</option>
                    <option value="BA">BA</option>
                    <option value="ABCD">ABCD</option>
                    <option value="DCBA">DCBA</option>
                    <option value="BADC">BADC</option>
                    <option value="CDAB">CDAB</option>
                  </select>
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input type="number" value={reg.scale_factor} onChange={e => updateRow(i, { scale_factor: Number(e.target.value) })} step="0.1" style={{ ...smallInput, width: '60px' }} />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input type="number" value={reg.offset} onChange={e => updateRow(i, { offset: Number(e.target.value) })} step="0.1" style={{ ...smallInput, width: '60px' }} />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input type="text" value={reg.unit} onChange={e => updateRow(i, { unit: e.target.value })} style={{ ...smallInput, width: '50px' }} />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                  <input type="checkbox" checked={reg.writable} onChange={e => updateRow(i, { writable: e.target.checked })} />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '2px 6px',
                    }}
                    title="Remove register"
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {registers.length === 0 && (
        <p className="text-xs text-gray-400" style={{ textAlign: 'center', padding: '16px 0' }}>
          No registers configured. Load a default map or add entries manually.
        </p>
      )}
      <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={addRow}
          style={{
            padding: '6px 12px',
            border: '1px solid var(--color-gray-300, #d1d5db)',
            borderRadius: '6px',
            backgroundColor: 'var(--color-white, #fff)',
            color: 'var(--color-gray-700, #374151)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          + Add Register
        </button>
      </div>
    </div>
  )
}

function Step3Configuration({ formData, onUpdate }: {
  formData: WizardFormData
  onUpdate: (updates: Partial<WizardFormData>) => void
}) {
  const cfg = formData.config
  const modbusEnabled = formData.connections.modbus_tcp.enabled

  const updateConfig = (updates: Partial<DeviceConfigData>) => {
    onUpdate({ config: { ...cfg, ...updates } })
  }

  const handleLoadDefaultMap = () => {
    if (formData.register_map.length > 0) {
      if (!window.confirm('This will replace the current register map. Continue?')) return
    }
    onUpdate({ register_map: DEFAULT_REGISTER_MAP.map(r => ({ ...r })) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Control Defaults */}
      <CollapsibleSection title="Control Defaults">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '8px' }}>
              Default Control Mode
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                <input
                  type="radio"
                  name="control_mode"
                  value="manual"
                  checked={cfg.control_mode === 'manual'}
                  onChange={() => updateConfig({ control_mode: 'manual' })}
                />
                Manual
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                <input
                  type="radio"
                  name="control_mode"
                  value="auto"
                  checked={cfg.control_mode === 'auto'}
                  onChange={() => updateConfig({ control_mode: 'auto' })}
                />
                Auto (PID)
              </label>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Default Setpoint (&deg;C)
            </label>
            <input
              type="number"
              value={cfg.default_setpoint}
              onChange={e => updateConfig({ default_setpoint: Number(e.target.value) })}
              min={0}
              max={300}
              style={inputStyle}
            />
            <p className="text-xs text-gray-400" style={{ margin: '4px 0 0' }}>0&ndash;300&deg;C</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Default Fan PWM
            </label>
            <input
              type="number"
              value={cfg.default_fan_pwm}
              onChange={e => updateConfig({ default_fan_pwm: Number(e.target.value) })}
              min={0}
              max={255}
              style={inputStyle}
            />
            <p className="text-xs text-gray-400" style={{ margin: '4px 0 0' }}>0&ndash;255</p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Safety Limits */}
      <CollapsibleSection title="Safety Limits">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Maximum Temperature (&deg;C)
            </label>
            <input
              type="number"
              value={cfg.max_temp}
              onChange={e => updateConfig({ max_temp: Number(e.target.value) })}
              min={100}
              max={350}
              style={inputStyle}
            />
            <p className="text-xs text-gray-400" style={{ margin: '4px 0 0' }}>
              Heater will be disabled above this temperature (default: 240&deg;C)
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Minimum Fan PWM for Heater
            </label>
            <input
              type="number"
              value={cfg.min_fan_pwm}
              onChange={e => updateConfig({ min_fan_pwm: Number(e.target.value) })}
              min={0}
              max={255}
              style={inputStyle}
            />
            <p className="text-xs text-gray-400" style={{ margin: '4px 0 0' }}>
              Fan must be at or above this value for the heater to operate (default: 100)
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* PID Parameters */}
      <CollapsibleSection title="PID Parameters" defaultOpen={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Kp (Proportional)
            </label>
            <input
              type="number"
              value={cfg.kp}
              onChange={e => updateConfig({ kp: Number(e.target.value) })}
              min={0}
              max={100}
              step={0.1}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Ki (Integral)
            </label>
            <input
              type="number"
              value={cfg.ki}
              onChange={e => updateConfig({ ki: Number(e.target.value) })}
              min={0}
              max={100}
              step={0.01}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>
              Kd (Derivative)
            </label>
            <input
              type="number"
              value={cfg.kd}
              onChange={e => updateConfig({ kd: Number(e.target.value) })}
              min={0}
              max={200}
              step={0.1}
              style={inputStyle}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400" style={{ margin: '12px 0 0' }}>
          PID parameters control the automatic temperature regulation. Defaults: Kp=15.0, Ki=1.0, Kd=25.0.
        </p>
      </CollapsibleSection>

      {/* Modbus Register Map (conditional) */}
      {modbusEnabled && (
        <CollapsibleSection title="Modbus Register Map">
          <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleLoadDefaultMap}
              style={{
                padding: '6px 14px',
                border: '1px solid #3b82f6',
                borderRadius: '6px',
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                color: '#3b82f6',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Load Default Map
            </button>
          </div>
          <RegisterMapEditor
            registers={formData.register_map}
            onChange={regs => onUpdate({ register_map: regs })}
          />
        </CollapsibleSection>
      )}
    </div>
  )
}

function hasAnyEnabledAndTested(
  conn: ConnectionConfig,
  testStates: Record<ConnectionProtocol, ConnectionTestState>,
): boolean {
  return (
    (conn.mqtt.enabled && testStates.mqtt.status === 'success') ||
    (conn.websocket.enabled && testStates.websocket.status === 'success') ||
    (conn.modbus_tcp.enabled && testStates.modbus_tcp.status === 'success')
  )
}

export function DeviceWizard({ initialDeviceId, onNavigate }: {
  initialDeviceId?: string
  onNavigate: (path: string) => void
}) {
  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState<WizardFormData>({
    device_id: initialDeviceId || '',
    name: '',
    description: '',
    location: '',
    profile_id: '',
    connections: {
      mqtt: { enabled: !!initialDeviceId, topic_prefix: initialDeviceId ? `roaster/${initialDeviceId}` : '', qos: 0 },
      websocket: { enabled: false, url: '', reconnect_interval_ms: 5000 },
      modbus_tcp: { enabled: false, host: '', port: 502, unit_id: 1, poll_interval_ms: 1000 },
    },
    config: {
      control_mode: 'manual',
      default_setpoint: 200,
      default_fan_pwm: 180,
      max_temp: 240,
      min_fan_pwm: 100,
      kp: 15.0,
      ki: 1.0,
      kd: 25.0,
    },
    register_map: [],
  })

  // Track connection test results (lifted to parent so canAdvanceStep2 works)
  const [connTestStates, setConnTestStates] = useState<Record<ConnectionProtocol, ConnectionTestState>>({
    mqtt: { status: 'idle' },
    websocket: { status: 'idle' },
    modbus_tcp: { status: 'idle' },
  })

  const handleTestConnection = async (protocol: ConnectionProtocol) => {
    setConnTestStates(prev => ({
      ...prev,
      [protocol]: { status: 'testing' as const },
    }))

    const conn = formData.connections
    let config: Record<string, unknown>
    if (protocol === 'mqtt') {
      config = { topic_prefix: conn.mqtt.topic_prefix, qos: conn.mqtt.qos }
    } else if (protocol === 'websocket') {
      config = { url: conn.websocket.url, reconnect_interval_ms: conn.websocket.reconnect_interval_ms }
    } else {
      config = { host: conn.modbus_tcp.host, port: conn.modbus_tcp.port, unit_id: conn.modbus_tcp.unit_id, poll_interval_ms: conn.modbus_tcp.poll_interval_ms }
    }

    try {
      const result = await api.testConnection({
        protocol,
        config,
        device_id: formData.device_id || undefined,
      })
      setConnTestStates(prev => ({
        ...prev,
        [protocol]: {
          status: result.success ? 'success' as const : 'failure' as const,
          message: result.message,
          latency_ms: result.latency_ms,
        },
      }))
    } catch (err) {
      setConnTestStates(prev => ({
        ...prev,
        [protocol]: {
          status: 'failure' as const,
          message: err instanceof Error ? err.message : 'Test request failed',
        },
      }))
    }
  }

  const { data: discoveredDevices = [] } = useQuery({
    queryKey: ['discovered-devices'],
    queryFn: () => api.getDiscoveredDevices(),
    refetchInterval: 10000,
  })

  const { data: registryData } = useQuery({
    queryKey: ['registry-devices'],
    queryFn: () => api.devices(),
  })
  const registryDevices = registryData?.devices || []

  const { data: profiles = [] } = useQuery({
    queryKey: ['device-profiles'],
    queryFn: () => api.listDeviceProfiles(),
  })

  const updateFormData = (updates: Partial<WizardFormData>) => {
    setFormData(prev => {
      const next = { ...prev, ...updates }
      // Keep MQTT topic_prefix in sync when device_id changes
      if (updates.device_id && !updates.connections) {
        next.connections = {
          ...prev.connections,
          mqtt: { ...prev.connections.mqtt, topic_prefix: `roaster/${updates.device_id}` },
        }
      }
      return next
    })
  }

  const canAdvanceStep1 = formData.device_id.trim() !== '' && formData.name.trim() !== ''
  const canAdvanceStep2 = hasAnyEnabledAndTested(formData.connections, connTestStates)

  return (
    <div className="p-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={() => onNavigate('devices')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: '#6b7280',
            padding: '4px',
          }}
          title="Back to devices"
        >
          &larr;
        </button>
        <h1 className="m-0 text-2xl font-bold text-gray-900">Add New Device</h1>
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} />

      {/* Step Content */}
      {step === 0 && (
        <Step1Device
          formData={formData}
          onUpdate={updateFormData}
          discoveredDevices={discoveredDevices}
          registryDevices={registryDevices}
          profiles={profiles}
        />
      )}

      {step === 1 && (
        <Step2Connections
          formData={formData}
          onUpdate={updateFormData}
          testStates={connTestStates}
          onTestConnection={handleTestConnection}
        />
      )}

      {step === 2 && (
        <Step3Configuration
          formData={formData}
          onUpdate={updateFormData}
        />
      )}

      {step === 3 && (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <p className="text-gray-500">Review &amp; save (Step 4) — coming soon</p>
        </div>
      )}

      {/* Navigation Buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '24px',
        paddingTop: '16px',
        borderTop: '1px solid var(--color-gray-200, #e5e7eb)',
      }}>
        <button
          onClick={() => {
            if (step === 0) {
              onNavigate('devices')
            } else {
              setStep(s => s - 1)
            }
          }}
          style={{
            padding: '10px 20px',
            border: '1px solid var(--color-gray-300, #d1d5db)',
            borderRadius: '8px',
            backgroundColor: 'var(--color-white, #fff)',
            color: 'var(--color-gray-700, #374151)',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </button>

        <button
          onClick={() => setStep(s => s + 1)}
          disabled={(step === 0 && !canAdvanceStep1) || (step === 1 && !canAdvanceStep2)}
          className="btn-primary"
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 500,
            opacity: ((step === 0 && !canAdvanceStep1) || (step === 1 && !canAdvanceStep2)) ? 0.5 : 1,
            cursor: ((step === 0 && !canAdvanceStep1) || (step === 1 && !canAdvanceStep2)) ? 'not-allowed' : 'pointer',
          }}
        >
          {step === STEPS.length - 1 ? 'Save Device' : 'Next'}
        </button>
      </div>
    </div>
  )
}
