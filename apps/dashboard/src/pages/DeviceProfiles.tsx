import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, DeviceProfile, CreateDeviceProfileRequest } from '../api/client'
import { useState } from 'react'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function ProfileCard({ profile, deviceCount, onEdit, onDelete }: {
  profile: DeviceProfile
  deviceCount: number
  onEdit: (profile: DeviceProfile) => void
  onDelete: (profile: DeviceProfile) => void
}) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '20px',
      backgroundColor: 'white',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      transition: 'all 0.2s ease',
    }}
    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'}
    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>{profile.name}</h3>
          {profile.description && (
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6b7280', lineHeight: '1.4' }}>
              {profile.description}
            </p>
          )}
        </div>
        <div style={{
          padding: '4px 10px',
          borderRadius: '12px',
          backgroundColor: deviceCount > 0 ? '#dbeafe' : '#f3f4f6',
          color: deviceCount > 0 ? '#1d4ed8' : '#6b7280',
          fontSize: '12px',
          fontWeight: '500',
          whiteSpace: 'nowrap',
        }}>
          {deviceCount} device{deviceCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Settings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>Control Mode</div>
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            {profile.default_control_mode || 'manual'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>Setpoint</div>
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            {profile.default_setpoint != null ? `${profile.default_setpoint}\u00B0C` : '-'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>Fan PWM</div>
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            {profile.default_fan_pwm != null ? profile.default_fan_pwm : '-'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>Max Temp</div>
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            {profile.max_temp != null ? `${profile.max_temp}\u00B0C` : '240\u00B0C'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>Min Fan PWM</div>
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            {profile.min_fan_pwm != null ? profile.min_fan_pwm : '100'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>PID</div>
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            {profile.default_kp != null
              ? `${profile.default_kp}/${profile.default_ki ?? 0}/${profile.default_kd ?? 0}`
              : '-'}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: '12px',
        borderTop: '1px solid #f3f4f6',
      }}>
        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
          Created {formatDate(profile.created_at)}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onEdit(profile)}
            style={{
              padding: '6px 14px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(profile)}
            style={{
              padding: '6px 14px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

const EMPTY_FORM: CreateDeviceProfileRequest = {
  name: '',
  description: '',
  default_control_mode: 'manual',
  default_setpoint: undefined,
  default_fan_pwm: undefined,
  default_kp: 15.0,
  default_ki: 1.0,
  default_kd: 25.0,
  max_temp: 240,
  min_fan_pwm: 100,
  telemetry_interval_ms: 1000,
}

function ProfileForm({ initial, onSave, onCancel, saving }: {
  initial: CreateDeviceProfileRequest
  onSave: (data: CreateDeviceProfileRequest) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<CreateDeviceProfileRequest>({ ...initial })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave(form)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '4px',
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '85vh',
        overflow: 'auto',
      }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>
          {initial.name ? 'Edit Device Profile' : 'Create Device Profile'}
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Name & Description */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Profile Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Standard Roaster"
              style={inputStyle}
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description || ''}
              onChange={e => setForm({ ...form, description: e.target.value || undefined })}
              placeholder="Describe this device profile..."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Control Defaults */}
          <h3 style={{ margin: '20px 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#374151' }}>
            Control Defaults
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Control Mode</label>
              <select
                value={form.default_control_mode || 'manual'}
                onChange={e => setForm({ ...form, default_control_mode: e.target.value })}
                style={inputStyle}
              >
                <option value="manual">Manual</option>
                <option value="auto">Auto (PID)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Default Setpoint (&deg;C)</label>
              <input
                type="number"
                value={form.default_setpoint ?? ''}
                onChange={e => setForm({ ...form, default_setpoint: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="e.g., 200"
                min="0"
                max="300"
                step="1"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Default Fan PWM</label>
              <input
                type="number"
                value={form.default_fan_pwm ?? ''}
                onChange={e => setForm({ ...form, default_fan_pwm: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="e.g., 180"
                min="0"
                max="255"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Safety Limits */}
          <h3 style={{ margin: '20px 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#374151' }}>
            Safety Limits
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Max Temperature (&deg;C)</label>
              <input
                type="number"
                value={form.max_temp ?? ''}
                onChange={e => setForm({ ...form, max_temp: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="240"
                min="100"
                max="350"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Min Fan PWM</label>
              <input
                type="number"
                value={form.min_fan_pwm ?? ''}
                onChange={e => setForm({ ...form, min_fan_pwm: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="100"
                min="0"
                max="255"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Telemetry Interval (ms)</label>
              <input
                type="number"
                value={form.telemetry_interval_ms ?? ''}
                onChange={e => setForm({ ...form, telemetry_interval_ms: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="1000"
                min="100"
                max="10000"
                step="100"
                style={inputStyle}
              />
            </div>
          </div>

          {/* PID Parameters */}
          <h3 style={{ margin: '20px 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#374151' }}>
            PID Parameters
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div>
              <label style={labelStyle}>Kp</label>
              <input
                type="number"
                value={form.default_kp ?? ''}
                onChange={e => setForm({ ...form, default_kp: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="15.0"
                min="0"
                step="0.1"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Ki</label>
              <input
                type="number"
                value={form.default_ki ?? ''}
                onChange={e => setForm({ ...form, default_ki: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="1.0"
                min="0"
                step="0.1"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Kd</label>
              <input
                type="number"
                value={form.default_kd ?? ''}
                onChange={e => setForm({ ...form, default_kd: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="25.0"
                min="0"
                step="0.1"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '10px 20px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              style={{
                padding: '10px 20px',
                backgroundColor: saving || !form.name.trim() ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : initial.name ? 'Save Changes' : 'Create Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function DeviceProfiles({ onNavigate }: { onNavigate: (path: string) => void }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingProfile, setEditingProfile] = useState<DeviceProfile | null>(null)

  const { data: profiles = [], isLoading, error } = useQuery({
    queryKey: ['device-profiles'],
    queryFn: () => api.listDeviceProfiles(),
  })

  const { data: allDevices = [] } = useQuery({
    queryKey: ['configured-devices'],
    queryFn: () => api.listConfiguredDevices(),
  })

  // Count devices per profile
  const deviceCountByProfile: Record<string, number> = {}
  for (const device of allDevices) {
    if (device.profile_id) {
      deviceCountByProfile[device.profile_id] = (deviceCountByProfile[device.profile_id] || 0) + 1
    }
  }

  const createMutation = useMutation({
    mutationFn: (req: CreateDeviceProfileRequest) => api.createDeviceProfile(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-profiles'] })
      setShowForm(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDeviceProfile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-profiles'] })
    },
  })

  const handleDelete = (profile: DeviceProfile) => {
    const count = deviceCountByProfile[profile.id] || 0
    const warning = count > 0
      ? `This profile is used by ${count} device${count !== 1 ? 's' : ''}. Deleting it will unset their profile. `
      : ''
    if (confirm(`${warning}Delete profile "${profile.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(profile.id)
    }
  }

  const handleEdit = (profile: DeviceProfile) => {
    setEditingProfile(profile)
    setShowForm(true)
  }

  const handleSave = (data: CreateDeviceProfileRequest) => {
    // For now, create-only (backend doesn't have update endpoint for device profiles)
    // When editing, we delete and re-create
    if (editingProfile) {
      deleteMutation.mutate(editingProfile.id, {
        onSuccess: () => {
          createMutation.mutate(data)
          setEditingProfile(null)
        }
      })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingProfile(null)
  }

  if (isLoading) {
    return (
      <div className="p-10 text-center">
        <div className="loading-text">
          <div className="loading"></div>
          Loading device profiles...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-10 text-center">
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>!</div>
        <div className="text-lg text-gray-700 mb-2">Failed to load device profiles</div>
        <div className="text-sm text-gray-500">{(error as Error).message}</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <button
              onClick={() => onNavigate('devices')}
              style={{
                padding: '4px 8px',
                backgroundColor: 'transparent',
                color: '#6b7280',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              &larr; Devices
            </button>
            <h1 className="m-0 text-3xl font-bold text-gray-900">Device Profiles</h1>
          </div>
          <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
            Templates for device configuration defaults, safety limits, and PID parameters.
          </p>
        </div>
        <button
          onClick={() => { setEditingProfile(null); setShowForm(true) }}
          className="btn-primary flex items-center gap-2"
        >
          <span style={{ fontSize: '16px' }}>+</span>
          Create Profile
        </button>
      </div>

      {/* Profiles Grid */}
      {profiles.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#6b7280',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#x1F4CB;</div>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>No device profiles yet</div>
          <div style={{ fontSize: '14px' }}>
            Create a profile to define default settings for your devices.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '20px',
        }}>
          {profiles.map(profile => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              deviceCount={deviceCountByProfile[profile.id] || 0}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <ProfileForm
          initial={editingProfile ? {
            name: editingProfile.name,
            description: editingProfile.description ?? '',
            default_control_mode: editingProfile.default_control_mode ?? 'manual',
            default_setpoint: editingProfile.default_setpoint ?? undefined,
            default_fan_pwm: editingProfile.default_fan_pwm ?? undefined,
            default_kp: editingProfile.default_kp ?? 15.0,
            default_ki: editingProfile.default_ki ?? 1.0,
            default_kd: editingProfile.default_kd ?? 25.0,
            max_temp: editingProfile.max_temp ?? 240,
            min_fan_pwm: editingProfile.min_fan_pwm ?? 100,
            telemetry_interval_ms: editingProfile.telemetry_interval_ms ?? 1000,
          } : EMPTY_FORM}
          onSave={handleSave}
          onCancel={handleCancelForm}
          saving={createMutation.isPending || deleteMutation.isPending}
        />
      )}
    </div>
  )
}
