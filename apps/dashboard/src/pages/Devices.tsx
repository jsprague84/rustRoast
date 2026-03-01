import { useQuery } from '@tanstack/react-query'
import { api, ConfiguredDevice, ConfiguredDeviceStatus } from '../api/client'

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

function DeviceCard({ device, onNavigate }: {
  device: ConfiguredDevice
  onNavigate: (path: string) => void
}) {
  const badge = getStatusBadge(device.status)

  return (
    <div
      className="card cursor-pointer"
      onClick={() => onNavigate(`device/${device.id}`)}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 m-0">{device.name}</h3>
          <p className="text-sm text-gray-500 m-0 mt-1">{device.device_id}</p>
        </div>
        <span className={badge.className}>{badge.label}</span>
      </div>

      {device.description && (
        <p className="text-sm text-gray-600 mb-3 m-0">{device.description}</p>
      )}

      <div className="flex justify-between items-center mt-4">
        <div className="text-xs text-gray-400">
          Last seen: {formatRelativeTime(device.last_seen_at)}
        </div>
        {device.location && (
          <div className="text-xs text-gray-400">
            {device.location}
          </div>
        )}
      </div>
    </div>
  )
}

function PendingDeviceRow({ device, onNavigate }: {
  device: ConfiguredDevice
  onNavigate: (path: string) => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: '1px solid var(--color-gray-200, #e5e7eb)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: '#f59e0b',
          flexShrink: 0,
        }} />
        <div>
          <div className="text-sm font-medium text-gray-900">{device.name || device.device_id}</div>
          <div className="text-xs text-gray-500">{device.device_id}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="text-xs text-gray-400">
          {formatRelativeTime(device.last_seen_at)}
        </span>
        <button
          onClick={() => onNavigate(`devices/new?device_id=${encodeURIComponent(device.device_id)}`)}
          className="px-3 py-1.5 bg-blue-600 text-white border-0 rounded text-xs font-medium cursor-pointer hover:bg-blue-700"
        >
          Configure
        </button>
      </div>
    </div>
  )
}

export function Devices({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { data: allDevices = [], isLoading, error } = useQuery({
    queryKey: ['configured-devices'],
    queryFn: () => api.listConfiguredDevices(),
    refetchInterval: 10000,
  })

  const pendingDevices = allDevices.filter(d => d.status === 'pending')
  const configuredDevices = allDevices.filter(d => d.status !== 'pending')

  if (isLoading) {
    return (
      <div className="p-10 text-center">
        <div className="loading-text">
          <div className="loading"></div>
          Loading devices...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-10 text-center">
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>!</div>
        <div className="text-lg text-gray-700 mb-2">Failed to load devices</div>
        <div className="text-sm text-gray-500">{(error as Error).message}</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="m-0 text-3xl font-bold text-gray-900">Devices</h1>
        <button
          onClick={() => onNavigate('devices/new')}
          className="btn-primary flex items-center gap-2"
        >
          <span style={{ fontSize: '16px' }}>+</span>
          Add Device
        </button>
      </div>

      {/* Pending / Discovered Devices */}
      {pendingDevices.length > 0 && (
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
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span className="text-sm font-semibold text-yellow-800">
              Discovered Devices ({pendingDevices.length})
            </span>
            <span className="text-xs text-yellow-600">
              New devices detected — configure to start using
            </span>
          </div>
          {pendingDevices.map(device => (
            <PendingDeviceRow
              key={device.id}
              device={device}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      {/* Configured Devices Grid */}
      {configuredDevices.length === 0 && pendingDevices.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#6b7280',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#x1F50C;</div>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>No devices configured</div>
          <div style={{ fontSize: '14px' }}>
            Add a device to get started, or power on an MQTT-enabled device to auto-discover it.
          </div>
        </div>
      ) : configuredDevices.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px',
        }}>
          {configuredDevices.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
