import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ConfiguredDevice, DeviceInfo, DeviceProfile } from '../api/client'

const STEPS = ['Device', 'Connections', 'Configuration', 'Review'] as const

export type WizardFormData = {
  // Step 1: Device identification
  device_id: string
  name: string
  description: string
  location: string
  profile_id: string
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
  })

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
    setFormData(prev => ({ ...prev, ...updates }))
  }

  const canAdvanceStep1 = formData.device_id.trim() !== '' && formData.name.trim() !== ''

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
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <p className="text-gray-500">Connection configuration (Step 2) — coming soon</p>
        </div>
      )}

      {step === 2 && (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <p className="text-gray-500">Device configuration (Step 3) — coming soon</p>
        </div>
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
          disabled={step === 0 && !canAdvanceStep1}
          className="btn-primary"
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 500,
            opacity: (step === 0 && !canAdvanceStep1) ? 0.5 : 1,
            cursor: (step === 0 && !canAdvanceStep1) ? 'not-allowed' : 'pointer',
          }}
        >
          {step === STEPS.length - 1 ? 'Save Device' : 'Next'}
        </button>
      </div>
    </div>
  )
}
