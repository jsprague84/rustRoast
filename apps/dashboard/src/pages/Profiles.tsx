import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, RoastProfile, ProfileWithPoints, CreateProfileRequest, CreateProfilePointRequest } from '../api/client'
import { useState } from 'react'
import { ProfileDetailModal } from '../components/ProfileDetailModal'
import { LandmarkProfileDesigner } from '../components/LandmarkProfileDesigner'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function ProfileCard({ profile, onAction }: { profile: RoastProfile, onAction: (action: string, profile: RoastProfile) => void }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '20px',
      backgroundColor: 'white',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      transition: 'all 0.2s ease',
      cursor: 'pointer'
    }}
    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'}
    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'}
    onClick={() => onAction('view', profile)}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>📈</span>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>{profile.name}</h3>
        </div>
        <div style={{
          padding: '4px 8px',
          borderRadius: '12px',
          backgroundColor: profile.is_public ? '#10b981' : '#6b7280',
          color: 'white',
          fontSize: '11px',
          fontWeight: '500'
        }}>
          {profile.is_public ? 'Public' : 'Private'}
        </div>
      </div>

      {/* Description */}
      {profile.description && (
        <div style={{ 
          fontSize: '14px', 
          color: '#6b7280', 
          marginBottom: '16px',
          lineHeight: '1.4'
        }}>
          {profile.description}
        </div>
      )}

      {/* Profile Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Target Time</div>
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            {profile.target_total_time ? formatTime(profile.target_total_time) : '-'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>End Temp</div>
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            {profile.target_end_temp ? `${profile.target_end_temp}°C` : '-'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>First Crack</div>
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            {profile.target_first_crack ? formatTime(profile.target_first_crack) : '-'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Charge Temp</div>
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            {profile.charge_temp ? `${profile.charge_temp}°C` : '-'}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div style={{ 
        fontSize: '12px', 
        color: '#9ca3af', 
        marginBottom: '16px',
        paddingTop: '12px',
        borderTop: '1px solid #f3f4f6'
      }}>
        Created {formatDate(profile.created_at)}
        {profile.created_by && ` by ${profile.created_by}`}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button 
          onClick={e => { e.stopPropagation(); onAction('use', profile) }}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer'
          }}>
          Use Profile
        </button>
        <button 
          onClick={e => { e.stopPropagation(); onAction('duplicate', profile) }}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer'
          }}>
          Duplicate
        </button>
        {!profile.is_public && (
          <button 
            onClick={e => { e.stopPropagation(); onAction('delete', profile) }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              marginLeft: 'auto'
            }}>
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

function CreateProfileForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState<'basic' | 'points'>('basic')
  const [formData, setFormData] = useState<CreateProfileRequest>({
    name: '',
    description: '',
    target_total_time: undefined,
    target_first_crack: undefined,
    target_end_temp: undefined,
    preheat_temp: undefined,
    charge_temp: undefined,
    points: []
  })

  const [newPoint, setNewPoint] = useState<CreateProfilePointRequest>({
    time_seconds: 0,
    target_temp: 0,
    fan_speed: undefined,
    notes: ''
  })

  const createMutation = useMutation({
    mutationFn: api.createProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      onClose()
    }
  })

  const handleAddPoint = () => {
    if (newPoint.time_seconds < 0 || newPoint.target_temp <= 0) return
    
    setFormData({
      ...formData,
      points: [...formData.points, { ...newPoint }].sort((a, b) => a.time_seconds - b.time_seconds)
    })
    
    setNewPoint({
      time_seconds: 0,
      target_temp: 0,
      fan_speed: undefined,
      notes: ''
    })
  }

  const handleRemovePoint = (index: number) => {
    setFormData({
      ...formData,
      points: formData.points.filter((_, i) => i !== index)
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || formData.points.length === 0) return
    createMutation.mutate(formData)
  }

  const canProceed = formData.name.trim() && 
                    (formData.target_total_time || 0) > 0 && 
                    (formData.target_end_temp || 0) > 0

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
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto'
      }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>
          Create Roast Profile
        </h2>

        <div style={{ display: 'flex', marginBottom: '24px' }}>
          <button
            type="button"
            onClick={() => setCurrentStep('basic')}
            style={{
              flex: 1,
              padding: '8px 16px',
              backgroundColor: currentStep === 'basic' ? '#3b82f6' : '#f3f4f6',
              color: currentStep === 'basic' ? 'white' : '#6b7280',
              border: 'none',
              borderRadius: '6px 0 0 6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            1. Basic Info
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep('points')}
            disabled={!canProceed}
            style={{
              flex: 1,
              padding: '8px 16px',
              backgroundColor: currentStep === 'points' ? '#3b82f6' : '#f3f4f6',
              color: currentStep === 'points' ? 'white' : !canProceed ? '#9ca3af' : '#6b7280',
              border: 'none',
              borderRadius: '0 6px 6px 0',
              fontSize: '14px',
              fontWeight: '500',
              cursor: !canProceed ? 'not-allowed' : 'pointer'
            }}
          >
            2. Temperature Curve
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          {currentStep === 'basic' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                  Profile Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Ethiopian Light Roast"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                  Description
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value || undefined })}
                  placeholder="Describe this roasting profile..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                    Target Total Time (min) *
                  </label>
                  <input
                    type="number"
                    value={formData.target_total_time ? Math.floor(formData.target_total_time / 60) : ''}
                    onChange={e => setFormData({ 
                      ...formData, 
                      target_total_time: e.target.value ? parseInt(e.target.value) * 60 : undefined 
                    })}
                    placeholder="e.g., 12"
                    min="1"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                    Target End Temp (°C) *
                  </label>
                  <input
                    type="number"
                    value={formData.target_end_temp || ''}
                    onChange={e => setFormData({ 
                      ...formData, 
                      target_end_temp: e.target.value ? parseFloat(e.target.value) : undefined 
                    })}
                    placeholder="e.g., 210"
                    min="150"
                    max="250"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                    First Crack (min)
                  </label>
                  <input
                    type="number"
                    value={formData.target_first_crack ? Math.floor(formData.target_first_crack / 60) : ''}
                    onChange={e => setFormData({ 
                      ...formData, 
                      target_first_crack: e.target.value ? parseInt(e.target.value) * 60 : undefined 
                    })}
                    placeholder="e.g., 8"
                    min="1"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                    Preheat Temp (°C)
                  </label>
                  <input
                    type="number"
                    value={formData.preheat_temp || ''}
                    onChange={e => setFormData({ 
                      ...formData, 
                      preheat_temp: e.target.value ? parseFloat(e.target.value) : undefined 
                    })}
                    placeholder="e.g., 200"
                    min="100"
                    max="300"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                    Charge Temp (°C)
                  </label>
                  <input
                    type="number"
                    value={formData.charge_temp || ''}
                    onChange={e => setFormData({ 
                      ...formData, 
                      charge_temp: e.target.value ? parseFloat(e.target.value) : undefined 
                    })}
                    placeholder="e.g., 95"
                    min="50"
                    max="150"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep('points')}
                  disabled={!canProceed}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: !canProceed ? '#9ca3af' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: !canProceed ? 'not-allowed' : 'pointer'
                  }}
                >
                  Next: Temperature Curve
                </button>
              </div>
            </div>
          )}

          {currentStep === 'points' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>
                  Temperature Curve Points
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                  Add temperature points to define your roasting curve. Points will be sorted by time automatically.
                </p>
              </div>

              {/* Add Point Form */}
              <div style={{
                padding: '16px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                      Time (min)
                    </label>
                    <input
                      type="number"
                      value={Math.floor(newPoint.time_seconds / 60)}
                      onChange={e => setNewPoint({ 
                        ...newPoint, 
                        time_seconds: e.target.value ? parseInt(e.target.value) * 60 : 0 
                      })}
                      min="0"
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                      Temp (°C)
                    </label>
                    <input
                      type="number"
                      value={newPoint.target_temp || ''}
                      onChange={e => setNewPoint({ 
                        ...newPoint, 
                        target_temp: e.target.value ? parseFloat(e.target.value) : 0 
                      })}
                      min="0"
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                      Fan Speed
                    </label>
                    <input
                      type="number"
                      value={newPoint.fan_speed || ''}
                      onChange={e => setNewPoint({ 
                        ...newPoint, 
                        fan_speed: e.target.value ? parseInt(e.target.value) : undefined 
                      })}
                      min="0"
                      max="100"
                      placeholder="0-100"
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPoint}
                    disabled={newPoint.time_seconds < 0 || newPoint.target_temp <= 0}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: newPoint.time_seconds < 0 || newPoint.target_temp <= 0 ? '#9ca3af' : '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: newPoint.time_seconds < 0 || newPoint.target_temp <= 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Points List */}
              {formData.points.length > 0 ? (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 80px 80px 1fr auto',
                    gap: '8px',
                    padding: '8px 12px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    marginBottom: '8px'
                  }}>
                    <div>Time</div>
                    <div>Temp</div>
                    <div>Fan</div>
                    <div>Notes</div>
                    <div></div>
                  </div>
                  {formData.points.map((point, index) => (
                    <div key={index} style={{
                      display: 'grid',
                      gridTemplateColumns: '80px 80px 80px 1fr auto',
                      gap: '8px',
                      padding: '8px 12px',
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      fontSize: '13px',
                      marginBottom: '4px',
                      alignItems: 'center'
                    }}>
                      <div>{formatTime(point.time_seconds)}</div>
                      <div>{point.target_temp}°C</div>
                      <div>{point.fan_speed || '-'}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {point.notes || '-'}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePoint(index)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  color: '#6b7280'
                }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>📈</div>
                  <div>No temperature points added yet</div>
                  <div style={{ fontSize: '12px' }}>Add at least one point to create your profile</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setCurrentStep('basic')}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || formData.points.length === 0}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: createMutation.isPending || formData.points.length === 0 ? '#9ca3af' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: createMutation.isPending || formData.points.length === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Profile'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

export function Profiles() {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showLandmarkDesigner, setShowLandmarkDesigner] = useState(false)
  const [showPrivate, setShowPrivate] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)

  // Queries
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['profiles', showPrivate],
    queryFn: () => api.listProfiles(showPrivate)
  })

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: api.deleteProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] })
  })

  const createLandmarkMutation = useMutation({
    mutationFn: (profile: CreateProfileRequest) => {
      console.log('createLandmarkMutation - Starting profile creation...')
      console.log('Profile data being sent:', JSON.stringify(profile, null, 2))
      return api.createProfile(profile)
    },
    onSuccess: (result) => {
      console.log('createLandmarkMutation - SUCCESS! Profile created:', result)
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      setShowLandmarkDesigner(false)
      // Automatically show private profiles so user can see their newly created profile
      setShowPrivate(true)
    },
    onError: (error) => {
      console.error('createLandmarkMutation - ERROR occurred:', error)
      console.error('Error details:', error.message || 'Unknown error')
      alert(`Error saving profile: ${error.message || 'Unknown error'}`)
    }
  })

  const createSessionMutation = useMutation({
    mutationFn: (data: { profile: ProfileWithPoints }) => {
      console.log('createSessionMutation called with profile:', data.profile.profile.name)
      return api.createSession({
        device_id: 'esp32_roaster_01', // TODO: Make this configurable
        name: `${data.profile.profile.name} - ${new Date().toLocaleString()}`,
        start_time: null,
        end_time: null,
        status: 'planning' as const,
        profile_id: data.profile.profile.id
      })
    },
    onSuccess: (result) => {
      console.log('Session created successfully:', result)
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      alert('Session created successfully! Navigate to the Dashboard to start roasting.')
    },
    onError: (error) => {
      console.error('Error creating session:', error)
      alert(`Error creating session: ${error.message || 'Unknown error'}`)
    }
  })

  const handleAction = (action: string, profile: RoastProfile) => {
    switch (action) {
      case 'view':
        setSelectedProfileId(profile.id)
        break
      case 'use':
        setSelectedProfileId(profile.id)
        break
      case 'duplicate':
        // TODO: Duplicate profile
        console.log('Duplicate profile:', profile.id)
        break
      case 'delete':
        if (confirm(`Delete profile "${profile.name}"? This action cannot be undone.`)) {
          deleteMutation.mutate(profile.id)
        }
        break
    }
  }

  const handleUseProfile = (profile: ProfileWithPoints) => {
    console.log('handleUseProfile called with profile:', profile.profile.name)
    console.log('Mutation state - isIdle:', createSessionMutation.isIdle, 'isPending:', createSessionMutation.isPending)
    try {
      createSessionMutation.mutate({ profile })
      console.log('Mutation triggered successfully')
    } catch (error) {
      console.error('Error triggering mutation:', error)
    }
    setSelectedProfileId(null)
  }

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading profiles...</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700' }}>Roast Profiles</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: '12px 24px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ fontSize: '16px' }}>+</span>
            Basic Profile
          </button>
          <button
            onClick={() => setShowLandmarkDesigner(true)}
            style={{
              padding: '12px 24px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ fontSize: '16px' }}>📍</span>
            Landmark Designer
          </button>
        </div>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showPrivate}
            onChange={e => setShowPrivate(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontSize: '14px', color: '#374151' }}>Show private profiles</span>
        </label>
      </div>

      {/* Profiles Grid */}
      {profiles.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#6b7280'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📈</div>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>No roast profiles found</div>
          <div style={{ fontSize: '14px' }}>
            Create your first roast profile to get started!
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px'
        }}>
          {profiles.map(profile => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {showCreateForm && (
        <CreateProfileForm onClose={() => setShowCreateForm(false)} />
      )}

      {showLandmarkDesigner && (
        <LandmarkProfileDesigner
          onSave={(profile) => createLandmarkMutation.mutate(profile)}
          onCancel={() => setShowLandmarkDesigner(false)}
        />
      )}

      {selectedProfileId && (
        <ProfileDetailModal
          profileId={selectedProfileId}
          onClose={() => setSelectedProfileId(null)}
          onUseProfile={handleUseProfile}
        />
      )}
    </div>
  )
}