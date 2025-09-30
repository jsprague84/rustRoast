import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, RoastProfile, CreateProfileRequest, CreateProfilePointRequest } from '../api/client'

type Props = {
  deviceId: string
  onProfileSelected?: (profileId: string) => void
  selectedProfileId?: string
}

type ProfileImportFormat = {
  name: string
  description?: string
  points: Array<{
    time_seconds: number
    target_temp: number
    fan_speed?: number
    notes?: string
  }>
}

export function ProfileManager({ deviceId, onProfileSelected, selectedProfileId }: Props) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newProfile, setNewProfile] = useState<CreateProfileRequest>({
    name: '',
    description: '',
    points: []
  })
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadData, setUploadData] = useState('')

  // Get profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.listProfiles(true)
  })

  // Create profile mutation
  const createMutation = useMutation({
    mutationFn: (req: CreateProfileRequest) => api.createProfile(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      setShowCreateForm(false)
      setNewProfile({ name: '', description: '', points: [] })
    }
  })

  // Delete profile mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProfile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    }
  })

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        let profileData: ProfileImportFormat

        if (file.name.endsWith('.json')) {
          // JSON format
          profileData = JSON.parse(content)
        } else if (file.name.endsWith('.csv')) {
          // CSV format (time_seconds, target_temp, fan_speed)
          const lines = content.split('\n').filter(line => line.trim())
          const header = lines[0].toLowerCase()
          
          if (!header.includes('time') || !header.includes('temp')) {
            throw new Error('CSV must have time and temperature columns')
          }

          const points = lines.slice(1).map(line => {
            const [time, temp, fan] = line.split(',').map(s => s.trim())
            return {
              time_seconds: parseInt(time),
              target_temp: parseFloat(temp),
              fan_speed: fan ? parseInt(fan) : undefined
            }
          }).filter(p => !isNaN(p.time_seconds) && !isNaN(p.target_temp))

          profileData = {
            name: file.name.replace(/\.[^/.]+$/, ''),
            description: `Imported from ${file.name}`,
            points
          }
        } else {
          throw new Error('Unsupported file format. Use JSON or CSV.')
        }

        setNewProfile({
          name: profileData.name,
          description: profileData.description || '',
          points: profileData.points
        })
        setShowCreateForm(true)
        setShowUploadModal(false)
      } catch (error) {
        alert(`Error importing file: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
    reader.readAsText(file)
  }

  // Handle manual profile creation
  const handleCreateProfile = () => {
    if (!newProfile.name.trim()) {
      alert('Profile name is required')
      return
    }

    if (newProfile.points.length === 0) {
      alert('Profile must have at least one point')
      return
    }

    createMutation.mutate(newProfile)
  }

  // Add point to new profile
  const addPoint = () => {
    const lastPoint = newProfile.points[newProfile.points.length - 1]
    const newTime = lastPoint ? lastPoint.time_seconds + 60 : 0
    const newTemp = lastPoint ? lastPoint.target_temp + 10 : 100

    setNewProfile(prev => ({
      ...prev,
      points: [...prev.points, {
        time_seconds: newTime,
        target_temp: newTemp
      }]
    }))
  }

  // Update point
  const updatePoint = (index: number, field: keyof CreateProfilePointRequest, value: number) => {
    setNewProfile(prev => ({
      ...prev,
      points: prev.points.map((point, i) => 
        i === index ? { ...point, [field]: value } : point
      )
    }))
  }

  // Remove point
  const removePoint = (index: number) => {
    setNewProfile(prev => ({
      ...prev,
      points: prev.points.filter((_, i) => i !== index)
    }))
  }

  // Parse text data for quick import
  const handleTextImport = () => {
    try {
      const data = JSON.parse(uploadData) as ProfileImportFormat
      setNewProfile({
        name: data.name,
        description: data.description || '',
        points: data.points
      })
      setShowCreateForm(true)
      setShowUploadModal(false)
      setUploadData('')
    } catch (error) {
      alert('Invalid JSON format. Please check your data.')
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div style={{
      padding: '16px',
      backgroundColor: '#f8fafc',
      borderRadius: '12px',
      border: '1px solid #e5e7eb'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
          Roast Profiles
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowUploadModal(true)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            📁 Import
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            ➕ Create
          </button>
        </div>
      </div>

      {/* Profile List */}
      <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '16px' }}>
        {profiles.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: '#6b7280', 
            fontSize: '14px',
            padding: '20px'
          }}>
            No profiles available. Create or import one to get started.
          </div>
        ) : (
          profiles.map(profile => (
            <div
              key={profile.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                backgroundColor: selectedProfileId === profile.id ? '#e0f2fe' : 'white',
                borderRadius: '6px',
                border: selectedProfileId === profile.id ? '1px solid #0891b2' : '1px solid #e5e7eb',
                marginBottom: '4px',
                cursor: 'pointer'
              }}
              onClick={() => onProfileSelected?.(profile.id)}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>
                  {profile.name}
                </div>
                {profile.description && (
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {profile.description}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {selectedProfileId === profile.id && (
                  <span style={{ fontSize: '12px', color: '#0891b2', fontWeight: '500' }}>
                    ✓ Selected
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete profile "${profile.name}"?`)) {
                      deleteMutation.mutate(profile.id)
                    }
                  }}
                  style={{
                    padding: '2px 6px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    fontSize: '10px',
                    cursor: 'pointer'
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
              Import Profile
            </h3>
            
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                Upload File
              </h4>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                onChange={handleFileUpload}
                style={{ marginBottom: '8px' }}
              />
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Supports JSON and CSV formats. CSV should have columns: time_seconds, target_temp, fan_speed
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                Or Paste JSON Data
              </h4>
              <textarea
                value={uploadData}
                onChange={e => setUploadData(e.target.value)}
                placeholder={'{\n  "name": "Profile Name",\n  "description": "Profile description",\n  "points": [\n    {"time_seconds": 0, "target_temp": 100},\n    {"time_seconds": 300, "target_temp": 150}\n  ]\n}'}
                style={{
                  width: '100%',
                  height: '120px',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setUploadData('')
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleTextImport}
                disabled={!uploadData.trim()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: uploadData.trim() ? '#3b82f6' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: uploadData.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                Import JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Profile Form */}
      {showCreateForm && (
        <div style={{
          padding: '16px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>
            Create Profile
          </h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                Name *
              </label>
              <input
                type="text"
                value={newProfile.name}
                onChange={e => setNewProfile(prev => ({ ...prev, name: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                Description
              </label>
              <input
                type="text"
                value={newProfile.description}
                onChange={e => setNewProfile(prev => ({ ...prev, description: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              />
            </div>
          </div>

          {/* Profile Points */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: '500' }}>
                Profile Points ({newProfile.points.length})
              </label>
              <button
                onClick={addPoint}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                Add Point
              </button>
            </div>
            
            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {newProfile.points.map((point, index) => (
                <div
                  key={index}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 80px 80px 1fr 30px',
                    gap: '8px',
                    alignItems: 'center',
                    marginBottom: '4px',
                    padding: '4px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '4px'
                  }}
                >
                  <input
                    type="number"
                    value={point.time_seconds}
                    onChange={e => updatePoint(index, 'time_seconds', parseInt(e.target.value) || 0)}
                    placeholder="Time (s)"
                    style={{
                      padding: '4px 6px',
                      border: '1px solid #d1d5db',
                      borderRadius: '3px',
                      fontSize: '11px'
                    }}
                  />
                  <input
                    type="number"
                    value={point.target_temp}
                    onChange={e => updatePoint(index, 'target_temp', parseFloat(e.target.value) || 0)}
                    placeholder="Temp (°C)"
                    style={{
                      padding: '4px 6px',
                      border: '1px solid #d1d5db',
                      borderRadius: '3px',
                      fontSize: '11px'
                    }}
                  />
                  <input
                    type="number"
                    value={point.fan_speed || ''}
                    onChange={e => updatePoint(index, 'fan_speed', parseInt(e.target.value) || undefined)}
                    placeholder="Fan (0-255)"
                    style={{
                      padding: '4px 6px',
                      border: '1px solid #d1d5db',
                      borderRadius: '3px',
                      fontSize: '11px'
                    }}
                  />
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    {formatTime(point.time_seconds)} - {point.target_temp}°C
                  </div>
                  <button
                    onClick={() => removePoint(index)}
                    style={{
                      padding: '2px 4px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      fontSize: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCreateProfile}
              disabled={createMutation.isPending || !newProfile.name.trim() || newProfile.points.length === 0}
              style={{
                padding: '8px 16px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Profile'}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setNewProfile({ name: '', description: '', points: [] })
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />
    </div>
  )
}