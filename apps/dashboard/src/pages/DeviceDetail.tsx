import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  api,
  ConfiguredDeviceWithConnections,
  ConfiguredDeviceStatus,
  ConnectionProtocol,
  DeviceConnection,
  DeviceProfile,
  CreateConnectionRequest,
  CreateRegisterMapEntry,
  ModbusRegisterMapEntry,
} from '../api/client'
import type { ModbusRegisterEntry } from './DeviceWizard'

// ============================================================================
// Constants & Helpers
// ============================================================================

type DetailTab = 'overview' | 'connections' | 'configuration' | 'register-map'

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

function getStatusBadge(status: ConfiguredDeviceStatus) {
  const base = 'px-3 py-1 rounded-full text-xs font-medium'
  switch (status) {
    case 'active':
      return { className: `${base} status-online`, label: 'Active' }
    case 'pending':
      return { className: `${base} status-warning`, label: 'Pending' }
    case 'disabled':
      return { className: `${base} bg-gray-100 text-gray-600 border border-gray-200`, label: 'Disabled' }
    case 'error':
      return { className: `${base} status-offline`, label: 'Error' }
    default:
      return { className: `${base} bg-gray-100 text-gray-600 border border-gray-200`, label: status }
  }
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = Date.now()
  const diffMs = now - date.getTime()
  if (diffMs < 0) return 'Just now'
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}

function protocolLabel(p: ConnectionProtocol): string {
  switch (p) {
    case 'mqtt': return 'MQTT'
    case 'websocket': return 'WebSocket'
    case 'modbus_tcp': return 'Modbus TCP'
  }
}

function protocolIcon(p: ConnectionProtocol): string {
  switch (p) {
    case 'mqtt': return '\u{1F4E1}'
    case 'websocket': return '\u{1F50C}'
    case 'modbus_tcp': return '\u{1F3ED}'
  }
}

function formatHex(val: number): string {
  return '0x' + val.toString(16).toUpperCase().padStart(4, '0')
}

// ============================================================================
// CollapsibleSection
// ============================================================================

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

// ============================================================================
// SaveButton — reusable button with success/error feedback
// ============================================================================

function SaveButton({ onClick, label = 'Save' }: {
  onClick: () => Promise<void>
  label?: string
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleClick = async () => {
    setState('saving')
    try {
      await onClick()
      setState('saved')
      setTimeout(() => setState('idle'), 2000)
    } catch (e) {
      setErrorMsg((e as Error).message)
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button
        onClick={handleClick}
        disabled={state === 'saving'}
        className="btn-primary"
        style={{ fontSize: '13px', padding: '6px 16px', opacity: state === 'saving' ? 0.7 : 1 }}
      >
        {state === 'saving' ? 'Saving...' : label}
      </button>
      {state === 'saved' && (
        <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 500 }}>&#10003; Saved</span>
      )}
      {state === 'error' && (
        <span style={{ color: '#dc2626', fontSize: '13px' }}>{errorMsg}</span>
      )}
    </div>
  )
}

// ============================================================================
// Overview Tab
// ============================================================================

function OverviewTab({ device, onNavigate }: {
  device: ConfiguredDeviceWithConnections
  onNavigate: (path: string) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(device.name)
  const [description, setDescription] = useState(device.description || '')
  const [location, setLocation] = useState(device.location || '')
  const [profileId, setProfileId] = useState(device.profile_id || '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const { data: profiles = [] } = useQuery({
    queryKey: ['device-profiles'],
    queryFn: () => api.listDeviceProfiles(),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteConfiguredDevice(device.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configured-devices'] })
      onNavigate('devices')
    },
  })

  const badge = getStatusBadge(device.status)

  const handleSaveInfo = async () => {
    await api.updateDevice(device.id, {
      name: name || undefined,
      description: description || undefined,
      location: location || undefined,
      profile_id: profileId || undefined,
    })
    queryClient.invalidateQueries({ queryKey: ['device-detail', device.id] })
  }

  const handleToggleStatus = async () => {
    const newStatus: ConfiguredDeviceStatus = device.status === 'disabled' ? 'active' : 'disabled'
    await api.updateDevice(device.id, { status: newStatus })
    queryClient.invalidateQueries({ queryKey: ['device-detail', device.id] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Status & Quick Actions */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px',
        border: '1px solid var(--color-gray-200, #e5e7eb)',
        borderRadius: '8px',
        backgroundColor: 'rgba(0,0,0,0.01)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span className={badge.className}>{badge.label}</span>
          <span className="text-sm text-gray-500">
            Device ID: <code className="text-xs" style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: '4px' }}>{device.device_id}</code>
          </span>
          <span className="text-sm text-gray-400">
            Last seen: {formatRelativeTime(device.last_seen_at)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleToggleStatus}
            style={{
              padding: '6px 14px',
              border: '1px solid var(--color-gray-300, #d1d5db)',
              borderRadius: '6px',
              backgroundColor: 'var(--color-white, #fff)',
              color: 'var(--color-gray-700, #374151)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {device.status === 'disabled' ? 'Enable' : 'Disable'}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              padding: '6px 14px',
              border: '1px solid #fca5a5',
              borderRadius: '6px',
              backgroundColor: '#fff',
              color: '#dc2626',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div style={{
          padding: '16px',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          backgroundColor: '#fef2f2',
        }}>
          <p className="text-sm" style={{ margin: '0 0 12px', color: '#991b1b' }}>
            Are you sure you want to delete <strong>{device.name}</strong>? This will remove all connections and register maps. This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              style={{
                padding: '6px 14px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: '#dc2626',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                opacity: deleteMutation.isPending ? 0.7 : 1,
              }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              style={{
                padding: '6px 14px',
                border: '1px solid var(--color-gray-300, #d1d5db)',
                borderRadius: '6px',
                backgroundColor: '#fff',
                color: 'var(--color-gray-700, #374151)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Editable Device Info */}
      <CollapsibleSection title="Device Information">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Location</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g., Kitchen, Workshop" style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional device description"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Device Profile</label>
            <select value={profileId} onChange={e => setProfileId(e.target.value)} style={inputStyle}>
              <option value="">None</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: '16px' }}>
          <SaveButton onClick={handleSaveInfo} />
        </div>
      </CollapsibleSection>
    </div>
  )
}

// ============================================================================
// Connections Tab
// ============================================================================

type ConnectionTestState = {
  status: 'idle' | 'testing' | 'success' | 'failure'
  message?: string
  latency_ms?: number
}

function ConnectionRow({ conn, deviceId }: {
  conn: DeviceConnection
  deviceId: string
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [config, setConfig] = useState<Record<string, unknown>>(conn.config)
  const [enabled, setEnabled] = useState(conn.enabled)
  const [testState, setTestState] = useState<ConnectionTestState>({ status: 'idle' })

  const handleTest = async () => {
    setTestState({ status: 'testing' })
    try {
      const result = await api.testConnection({
        protocol: conn.protocol,
        config,
        device_id: conn.protocol === 'mqtt' ? deviceId : undefined,
      })
      setTestState({
        status: result.success ? 'success' : 'failure',
        message: result.message,
        latency_ms: result.latency_ms,
      })
    } catch (e) {
      setTestState({ status: 'failure', message: (e as Error).message })
    }
  }

  const handleSave = async () => {
    await api.updateConnection(deviceId, conn.id, { config, enabled })
    queryClient.invalidateQueries({ queryKey: ['device-detail', deviceId] })
    setEditing(false)
  }

  const handleRemove = async () => {
    if (!window.confirm(`Remove ${protocolLabel(conn.protocol)} connection?`)) return
    await api.removeConnection(deviceId, conn.id)
    queryClient.invalidateQueries({ queryKey: ['device-detail', deviceId] })
  }

  const configFields = Object.entries(config).filter(([k]) => k !== 'protocol')

  return (
    <div style={{
      border: '1px solid var(--color-gray-200, #e5e7eb)',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        backgroundColor: 'rgba(0,0,0,0.02)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>{protocolIcon(conn.protocol)}</span>
          <span className="text-sm font-semibold" style={{ color: '#111827' }}>{protocolLabel(conn.protocol)}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${enabled ? 'status-online' : 'bg-gray-100 text-gray-500'}`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={handleTest} disabled={testState.status === 'testing'}
            style={{ padding: '4px 10px', border: '1px solid var(--color-gray-300, #d1d5db)', borderRadius: '4px', backgroundColor: '#fff', fontSize: '12px', cursor: 'pointer' }}>
            {testState.status === 'testing' ? 'Testing...' : 'Test'}
          </button>
          <button onClick={() => setEditing(!editing)}
            style={{ padding: '4px 10px', border: '1px solid var(--color-gray-300, #d1d5db)', borderRadius: '4px', backgroundColor: '#fff', fontSize: '12px', cursor: 'pointer' }}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={handleRemove}
            style={{ padding: '4px 10px', border: '1px solid #fca5a5', borderRadius: '4px', backgroundColor: '#fff', color: '#dc2626', fontSize: '12px', cursor: 'pointer' }}>
            Remove
          </button>
        </div>
      </div>

      {/* Test result */}
      {testState.status !== 'idle' && testState.status !== 'testing' && (
        <div style={{ padding: '8px 16px', fontSize: '13px' }}>
          {testState.status === 'success' ? (
            <span style={{ color: '#16a34a' }}>&#10003; Connected{testState.latency_ms != null ? ` (${testState.latency_ms}ms)` : ''}</span>
          ) : (
            <span style={{ color: '#dc2626' }}>&#10007; {testState.message || 'Failed'}</span>
          )}
        </div>
      )}

      {/* Config display / edit */}
      <div style={{ padding: '12px 16px' }}>
        {!editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
            {configFields.map(([key, value]) => (
              <div key={key}>
                <span className="text-xs text-gray-400">{key}</span>
                <div className="text-sm text-gray-900" style={{ fontFamily: 'monospace' }}>{String(value)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '12px' }}>
              <label className="text-sm font-medium text-gray-700" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                Enabled
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {configFields.map(([key, value]) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-600" style={{ display: 'block', marginBottom: '2px' }}>{key}</label>
                  <input
                    type={typeof value === 'number' ? 'number' : 'text'}
                    value={String(config[key] ?? '')}
                    onChange={e => {
                      const val = typeof value === 'number' ? Number(e.target.value) : e.target.value
                      setConfig({ ...config, [key]: val })
                    }}
                    style={{ ...inputStyle, fontSize: '13px', padding: '6px 10px' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ marginTop: '12px' }}>
              <SaveButton onClick={handleSave} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AddConnectionForm({ deviceId, existingProtocols }: {
  deviceId: string
  existingProtocols: ConnectionProtocol[]
}) {
  const queryClient = useQueryClient()
  const [show, setShow] = useState(false)
  const [protocol, setProtocol] = useState<ConnectionProtocol>('mqtt')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Config fields per protocol
  const [mqttConfig, setMqttConfig] = useState({ topic_prefix: '', qos: 1 })
  const [wsConfig, setWsConfig] = useState({ url: '', reconnect_interval_ms: 5000 })
  const [modbusConfig, setModbusConfig] = useState({ host: '', port: 502, unit_id: 1, poll_interval_ms: 1000 })

  const availableProtocols = (['mqtt', 'websocket', 'modbus_tcp'] as ConnectionProtocol[]).filter(
    p => !existingProtocols.includes(p)
  )

  if (!show) {
    if (availableProtocols.length === 0) return null
    return (
      <button
        onClick={() => { setProtocol(availableProtocols[0]); setShow(true) }}
        style={{
          padding: '8px 16px',
          border: '1px dashed var(--color-gray-300, #d1d5db)',
          borderRadius: '8px',
          backgroundColor: 'transparent',
          color: 'var(--color-gray-600, #4b5563)',
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          width: '100%',
        }}
      >
        + Add Connection
      </button>
    )
  }

  const handleAdd = async () => {
    setSaving(true)
    setError('')
    try {
      let config: Record<string, unknown> = {}
      if (protocol === 'mqtt') config = mqttConfig
      else if (protocol === 'websocket') config = wsConfig
      else config = modbusConfig

      const req: CreateConnectionRequest = { protocol, enabled: true, config }
      await api.addConnection(deviceId, req)
      queryClient.invalidateQueries({ queryKey: ['device-detail', deviceId] })
      setShow(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      border: '1px solid var(--color-gray-200, #e5e7eb)',
      borderRadius: '8px',
      padding: '16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span className="text-sm font-semibold" style={{ color: '#111827' }}>Add Connection</span>
        <button onClick={() => setShow(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '16px' }}>&times;</button>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Protocol</label>
        <select value={protocol} onChange={e => setProtocol(e.target.value as ConnectionProtocol)} style={inputStyle}>
          {availableProtocols.map(p => (
            <option key={p} value={p}>{protocolLabel(p)}</option>
          ))}
        </select>
      </div>
      {protocol === 'mqtt' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <div>
            <label className="text-xs font-medium text-gray-600" style={{ display: 'block', marginBottom: '2px' }}>Topic Prefix</label>
            <input type="text" value={mqttConfig.topic_prefix} onChange={e => setMqttConfig({ ...mqttConfig, topic_prefix: e.target.value })} placeholder="roaster/device-id" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600" style={{ display: 'block', marginBottom: '2px' }}>QoS</label>
            <select value={mqttConfig.qos} onChange={e => setMqttConfig({ ...mqttConfig, qos: Number(e.target.value) })} style={inputStyle}>
              <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option>
            </select>
          </div>
        </div>
      )}
      {protocol === 'websocket' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <div>
            <label className="text-xs font-medium text-gray-600" style={{ display: 'block', marginBottom: '2px' }}>URL</label>
            <input type="text" value={wsConfig.url} onChange={e => setWsConfig({ ...wsConfig, url: e.target.value })} placeholder="ws://device-ip:port/ws" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600" style={{ display: 'block', marginBottom: '2px' }}>Reconnect (ms)</label>
            <input type="number" value={wsConfig.reconnect_interval_ms} onChange={e => setWsConfig({ ...wsConfig, reconnect_interval_ms: Number(e.target.value) })} min={100} style={inputStyle} />
          </div>
        </div>
      )}
      {protocol === 'modbus_tcp' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label className="text-xs font-medium text-gray-600" style={{ display: 'block', marginBottom: '2px' }}>Host</label>
            <input type="text" value={modbusConfig.host} onChange={e => setModbusConfig({ ...modbusConfig, host: e.target.value })} placeholder="192.168.1.100" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600" style={{ display: 'block', marginBottom: '2px' }}>Port</label>
            <input type="number" value={modbusConfig.port} onChange={e => setModbusConfig({ ...modbusConfig, port: Number(e.target.value) })} min={1} max={65535} style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600" style={{ display: 'block', marginBottom: '2px' }}>Unit ID</label>
            <input type="number" value={modbusConfig.unit_id} onChange={e => setModbusConfig({ ...modbusConfig, unit_id: Number(e.target.value) })} min={1} max={247} style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600" style={{ display: 'block', marginBottom: '2px' }}>Poll Interval (ms)</label>
            <input type="number" value={modbusConfig.poll_interval_ms} onChange={e => setModbusConfig({ ...modbusConfig, poll_interval_ms: Number(e.target.value) })} min={100} style={inputStyle} />
          </div>
        </div>
      )}
      {error && <p className="text-xs" style={{ color: '#dc2626', marginTop: '8px' }}>{error}</p>}
      <div style={{ marginTop: '12px' }}>
        <button
          onClick={handleAdd}
          disabled={saving}
          className="btn-primary"
          style={{ fontSize: '13px', padding: '6px 16px', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Adding...' : 'Add Connection'}
        </button>
      </div>
    </div>
  )
}

function ConnectionsTab({ device }: {
  device: ConfiguredDeviceWithConnections
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {device.connections.length === 0 && (
        <p className="text-sm text-gray-400" style={{ textAlign: 'center', padding: '20px' }}>
          No connections configured.
        </p>
      )}
      {device.connections.map(conn => (
        <ConnectionRow key={conn.id} conn={conn} deviceId={device.id} />
      ))}
      <AddConnectionForm
        deviceId={device.id}
        existingProtocols={device.connections.map(c => c.protocol)}
      />
    </div>
  )
}

// ============================================================================
// Configuration Tab
// ============================================================================

function ConfigurationTab({ device }: {
  device: ConfiguredDeviceWithConnections
}) {
  const queryClient = useQueryClient()
  const { data: profile } = useQuery({
    queryKey: ['device-profile', device.profile_id],
    queryFn: () => device.profile_id ? api.listDeviceProfiles().then(ps => ps.find(p => p.id === device.profile_id)) : Promise.resolve(undefined),
    enabled: !!device.profile_id,
  })

  // Control defaults from profile or sensible defaults
  const [controlMode, setControlMode] = useState<'manual' | 'auto'>(
    (profile?.default_control_mode as 'manual' | 'auto') || 'manual'
  )
  const [setpoint, setSetpoint] = useState(profile?.default_setpoint ?? 200)
  const [fanPwm, setFanPwm] = useState(profile?.default_fan_pwm ?? 180)

  // Safety limits
  const [maxTemp, setMaxTemp] = useState(profile?.max_temp ?? 240)
  const [minFanPwm, setMinFanPwm] = useState(profile?.min_fan_pwm ?? 100)

  // PID
  const [kp, setKp] = useState(profile?.default_kp ?? 15.0)
  const [ki, setKi] = useState(profile?.default_ki ?? 1.0)
  const [kd, setKd] = useState(profile?.default_kd ?? 25.0)

  const handleSaveControlDefaults = async () => {
    if (!device.profile_id) return
    // Configuration is stored on the profile; for devices without profiles, these are informational
    // We'll update the profile if one is linked
    // For now just invalidate to reflect any profile changes
    queryClient.invalidateQueries({ queryKey: ['device-detail', device.id] })
  }

  const handleApplyPid = async () => {
    await api.setPid(device.device_id, kp, ki, kd)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <CollapsibleSection title="Control Defaults">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Control Mode</label>
            <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
              <label className="text-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="radio" checked={controlMode === 'manual'} onChange={() => setControlMode('manual')} /> Manual
              </label>
              <label className="text-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="radio" checked={controlMode === 'auto'} onChange={() => setControlMode('auto')} /> Auto
              </label>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Default Setpoint (&deg;C)</label>
            <input type="number" value={setpoint} onChange={e => setSetpoint(Number(e.target.value))} min={0} max={300} style={inputStyle} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Default Fan PWM</label>
            <input type="number" value={fanPwm} onChange={e => setFanPwm(Number(e.target.value))} min={0} max={255} style={inputStyle} />
          </div>
        </div>
        <div style={{ marginTop: '16px' }}>
          <SaveButton onClick={handleSaveControlDefaults} label="Save Defaults" />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Safety Limits">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Max Temperature (&deg;C)</label>
            <input type="number" value={maxTemp} onChange={e => setMaxTemp(Number(e.target.value))} min={100} max={350} style={inputStyle} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Min Fan PWM for Heater</label>
            <input type="number" value={minFanPwm} onChange={e => setMinFanPwm(Number(e.target.value))} min={0} max={255} style={inputStyle} />
          </div>
        </div>
        <div style={{ marginTop: '16px' }}>
          <SaveButton onClick={handleSaveControlDefaults} label="Save Limits" />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="PID Parameters" defaultOpen={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Kp</label>
            <input type="number" value={kp} onChange={e => setKp(Number(e.target.value))} step={0.1} style={inputStyle} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Ki</label>
            <input type="number" value={ki} onChange={e => setKi(Number(e.target.value))} step={0.1} style={inputStyle} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700" style={{ display: 'block', marginBottom: '4px' }}>Kd</label>
            <input type="number" value={kd} onChange={e => setKd(Number(e.target.value))} step={0.1} style={inputStyle} />
          </div>
        </div>
        <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
          <SaveButton onClick={handleSaveControlDefaults} label="Save PID" />
          <SaveButton onClick={handleApplyPid} label="Apply to Device" />
        </div>
      </CollapsibleSection>
    </div>
  )
}

// ============================================================================
// Register Map Tab
// ============================================================================

const DEFAULT_REGISTER_MAP: ModbusRegisterEntry[] = [
  { address: 0x0000, name: 'bean_temp', register_type: 'input', data_type: 'float32', byte_order: 'ABCD', scale_factor: 1.0, offset: 0.0, unit: '\u00B0C', writable: false, description: 'Bean temperature' },
  { address: 0x0002, name: 'env_temp', register_type: 'input', data_type: 'float32', byte_order: 'ABCD', scale_factor: 1.0, offset: 0.0, unit: '\u00B0C', writable: false, description: 'Environment temperature' },
  { address: 0x0004, name: 'rate_of_rise', register_type: 'input', data_type: 'float32', byte_order: 'ABCD', scale_factor: 1.0, offset: 0.0, unit: '\u00B0C/min', writable: false, description: 'Rate of rise' },
  { address: 0x0006, name: 'heater_pwm', register_type: 'input', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '%', writable: false, description: 'Heater PWM' },
  { address: 0x0007, name: 'fan_pwm', register_type: 'input', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '', writable: false, description: 'Fan PWM' },
  { address: 0x0000, name: 'setpoint', register_type: 'holding', data_type: 'float32', byte_order: 'ABCD', scale_factor: 1.0, offset: 0.0, unit: '\u00B0C', writable: true, description: 'Target bean temperature' },
  { address: 0x0002, name: 'fan_pwm_setpoint', register_type: 'holding', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '', writable: true, description: 'Fan PWM setpoint' },
  { address: 0x0003, name: 'heater_pwm_setpoint', register_type: 'holding', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '%', writable: true, description: 'Heater PWM setpoint' },
  { address: 0x0004, name: 'control_mode', register_type: 'holding', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '', writable: true, description: 'Control mode: 0=manual, 1=auto' },
  { address: 0x0005, name: 'heater_enable', register_type: 'holding', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '', writable: true, description: 'Heater enable: 0=off, 1=on' },
  { address: 0x000C, name: 'emergency_stop', register_type: 'holding', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '', writable: true, description: 'Emergency stop: write 1 to trigger' },
]

function apiMapToEditorEntry(e: ModbusRegisterMapEntry): ModbusRegisterEntry {
  return {
    address: e.address,
    name: e.name,
    register_type: e.register_type as ModbusRegisterEntry['register_type'],
    data_type: e.data_type as ModbusRegisterEntry['data_type'],
    byte_order: e.byte_order,
    scale_factor: e.scale_factor,
    offset: e.offset,
    unit: e.unit || '',
    writable: e.writable,
    description: e.description || '',
  }
}

function editorEntryToApi(e: ModbusRegisterEntry): CreateRegisterMapEntry {
  return {
    register_type: e.register_type,
    address: e.address,
    name: e.name,
    data_type: e.data_type,
    byte_order: e.byte_order,
    scale_factor: e.scale_factor,
    offset: e.offset,
    unit: e.unit || undefined,
    description: e.description || undefined,
    writable: e.writable,
  }
}

function RegisterMapTab({ device }: {
  device: ConfiguredDeviceWithConnections
}) {
  const queryClient = useQueryClient()
  const hasModbus = device.connections.some(c => c.protocol === 'modbus_tcp')

  const { data: apiRegisters = [], isLoading } = useQuery({
    queryKey: ['register-map', device.id],
    queryFn: () => api.getRegisterMap(device.id),
    enabled: hasModbus,
  })

  const [registers, setRegisters] = useState<ModbusRegisterEntry[]>([])
  const [initialized, setInitialized] = useState(false)

  // Sync from API data only once
  if (!initialized && apiRegisters.length > 0) {
    setRegisters(apiRegisters.map(apiMapToEditorEntry))
    setInitialized(true)
  }

  if (!hasModbus) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
        <p className="text-sm">No Modbus TCP connection configured. Add one in the Connections tab to manage register maps.</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="loading-text"><div className="loading"></div>Loading register map...</div>
  }

  const handleSave = async () => {
    await api.setRegisterMap(device.id, registers.map(editorEntryToApi))
    queryClient.invalidateQueries({ queryKey: ['register-map', device.id] })
  }

  const handleLoadDefault = () => {
    if (registers.length > 0 && !window.confirm('Replace current register map with default?')) return
    setRegisters([...DEFAULT_REGISTER_MAP])
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
  const smallInput: React.CSSProperties = { ...smallSelect }

  const updateRow = (idx: number, updates: Partial<ModbusRegisterEntry>) => {
    const next = [...registers]
    next[idx] = { ...next[idx], ...updates }
    setRegisters(next)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <button
          onClick={handleLoadDefault}
          style={{ padding: '6px 12px', border: '1px solid var(--color-gray-300, #d1d5db)', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
        >
          Load Default Map
        </button>
        <SaveButton onClick={handleSave} label="Save Map" />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-gray-200, #e5e7eb)' }}>
              {['Address', 'Name', 'Type', 'Data Type', 'Byte Order', 'Scale', 'Offset', 'Unit', 'Writable', ''].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Writable' ? 'center' : 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registers.map((reg, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-gray-100, #f3f4f6)' }}>
                <td style={{ padding: '4px 8px' }}>
                  <input type="text" value={formatHex(reg.address)} onChange={e => { const p = parseInt(e.target.value, 16); if (!isNaN(p)) updateRow(i, { address: p }) }} style={{ ...smallInput, width: '72px', fontFamily: 'monospace' }} />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input type="text" value={reg.name} onChange={e => updateRow(i, { name: e.target.value })} style={{ ...smallInput, minWidth: '100px' }} />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <select value={reg.register_type} onChange={e => updateRow(i, { register_type: e.target.value as ModbusRegisterEntry['register_type'] })} style={{ ...smallSelect, minWidth: '80px' }}>
                    <option value="input">Input</option><option value="holding">Holding</option><option value="coil">Coil</option><option value="discrete">Discrete</option>
                  </select>
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <select value={reg.data_type} onChange={e => updateRow(i, { data_type: e.target.value as ModbusRegisterEntry['data_type'] })} style={{ ...smallSelect, minWidth: '80px' }}>
                    <option value="uint16">uint16</option><option value="int16">int16</option><option value="float32">float32</option><option value="uint32">uint32</option><option value="int32">int32</option><option value="bool">bool</option>
                  </select>
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <select value={reg.byte_order} onChange={e => updateRow(i, { byte_order: e.target.value })} style={{ ...smallSelect, minWidth: '70px' }}>
                    <option value="AB">AB</option><option value="BA">BA</option><option value="ABCD">ABCD</option><option value="DCBA">DCBA</option><option value="BADC">BADC</option><option value="CDAB">CDAB</option>
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
                  <button type="button" onClick={() => setRegisters(registers.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '2px 6px' }} title="Remove">&times;</button>
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
      <div style={{ marginTop: '8px' }}>
        <button
          type="button"
          onClick={() => setRegisters([...registers, { address: 0, name: '', register_type: 'input', data_type: 'uint16', byte_order: 'AB', scale_factor: 1.0, offset: 0.0, unit: '', writable: false, description: '' }])}
          style={{ padding: '6px 12px', border: '1px solid var(--color-gray-300, #d1d5db)', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
        >
          + Add Register
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Main DeviceDetail Component
// ============================================================================

export function DeviceDetail({ deviceId, onNavigate }: {
  deviceId: string
  onNavigate: (path: string) => void
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')

  const { data: device, isLoading, error } = useQuery({
    queryKey: ['device-detail', deviceId],
    queryFn: () => api.getConfiguredDevice(deviceId),
    refetchInterval: 15000,
  })

  if (isLoading) {
    return (
      <div className="p-10 text-center">
        <div className="loading-text">
          <div className="loading"></div>
          Loading device...
        </div>
      </div>
    )
  }

  if (error || !device) {
    return (
      <div className="p-10 text-center">
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>!</div>
        <div className="text-lg text-gray-700 mb-2">Device not found</div>
        <div className="text-sm text-gray-500 mb-4">{(error as Error)?.message || 'The device may have been deleted.'}</div>
        <button onClick={() => onNavigate('devices')} className="btn-primary" style={{ fontSize: '13px' }}>
          Back to Devices
        </button>
      </div>
    )
  }

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'connections', label: 'Connections' },
    { key: 'configuration', label: 'Configuration' },
    { key: 'register-map', label: 'Register Map' },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button
          onClick={() => onNavigate('devices')}
          style={{
            background: 'none',
            border: '1px solid var(--color-gray-300, #d1d5db)',
            borderRadius: '6px',
            padding: '6px 10px',
            cursor: 'pointer',
            color: '#6b7280',
            fontSize: '14px',
          }}
        >
          &larr;
        </button>
        <h1 className="m-0 text-2xl font-bold text-gray-900">{device.name}</h1>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '0',
        borderBottom: '2px solid var(--color-gray-200, #e5e7eb)',
        marginBottom: '24px',
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderBottom: activeTab === t.key ? '2px solid #2563eb' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === t.key ? '#2563eb' : '#6b7280',
              fontSize: '14px',
              fontWeight: activeTab === t.key ? 600 : 400,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: 'all 0.15s ease',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab device={device} onNavigate={onNavigate} />}
      {activeTab === 'connections' && <ConnectionsTab device={device} />}
      {activeTab === 'configuration' && <ConfigurationTab device={device} />}
      {activeTab === 'register-map' && <RegisterMapTab device={device} />}
    </div>
  )
}
