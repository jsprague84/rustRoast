import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, RoastSession, CreateSessionRequest, SessionStatus } from '../api/client'
import { useState } from 'react'

function getStatusColor(status: SessionStatus): string {
  switch (status) {
    case 'planning': return '#6b7280'
    case 'active': return '#10b981'
    case 'paused': return '#f59e0b'
    case 'completed': return '#3b82f6'
    case 'failed': return '#ef4444'
    case 'cancelled': return '#9ca3af'
    default: return '#6b7280'
  }
}

function getStatusIcon(status: SessionStatus): string {
  switch (status) {
    case 'planning': return '📝'
    case 'active': return '🔥'
    case 'paused': return '⏸️'
    case 'completed': return '✅'
    case 'failed': return '❌'
    case 'cancelled': return '⏹️'
    default: return '❓'
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '-'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function SessionCard({ session, onAction }: { session: RoastSession, onAction: (action: string, session: RoastSession) => void }) {
  const canStart = session.status === 'planning'
  const canPause = session.status === 'active'
  const canResume = session.status === 'paused'
  const canComplete = session.status === 'active' || session.status === 'paused'

  const getStatusBadgeClass = (status: SessionStatus): string => {
    const baseClasses = "px-3 py-1 rounded-full text-xs font-medium"
    switch (status) {
      case 'active': return `${baseClasses} status-online`
      case 'paused': return `${baseClasses} status-warning`
      case 'completed': return `${baseClasses} bg-blue-100 text-blue-800 border border-blue-200`
      case 'failed': return `${baseClasses} status-offline`
      default: return `${baseClasses} bg-gray-100 text-gray-700 border border-gray-200`
    }
  }

  return (
    <div className="card cursor-pointer" onClick={() => onAction('view', session)}>

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '20px' }}>{getStatusIcon(session.status)}</span>
          <h3 className="text-lg font-semibold text-gray-900 m-0">{session.name}</h3>
        </div>
        <div className={getStatusBadgeClass(session.status)} style={{ textTransform: 'capitalize' }}>
          {session.status}
        </div>
      </div>

      {/* Bean Info */}
      <div className="mb-4">
        <div className="text-sm text-gray-600 mb-1">
          {session.bean_origin && session.bean_variety ?
            `${session.bean_origin} ${session.bean_variety}` :
            session.bean_origin || session.bean_variety || 'No bean info'
          }
        </div>
        <div className="flex gap-4 text-xs text-gray-400">
          {session.green_weight && <span>Green: {session.green_weight}g</span>}
          {session.roasted_weight && <span>Roasted: {session.roasted_weight}g</span>}
          {session.target_roast_level && <span>Target: {session.target_roast_level}</span>}
        </div>
      </div>

      {/* Session Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className="text-xs text-gray-600 mb-1">Duration</div>
          <div className="text-sm font-medium">
            {formatDuration(session.total_time_seconds)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-600 mb-1">Max Temp</div>
          <div className="text-sm font-medium">
            {session.max_temp ? `${session.max_temp.toFixed(1)}°C` : '-'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-600 mb-1">Started</div>
          <div className="text-sm font-medium">
            {formatDate(session.start_time)}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {canStart && (
          <button
            onClick={e => { e.stopPropagation(); onAction('start', session) }}
            className="px-4 py-2 bg-green-600 text-white border-0 rounded text-xs font-medium cursor-pointer hover:bg-green-700">
            Start Roast
          </button>
        )}
        {canPause && (
          <button
            onClick={e => { e.stopPropagation(); onAction('pause', session) }}
            className="px-4 py-2 bg-yellow-600 text-white border-0 rounded text-xs font-medium cursor-pointer hover:bg-yellow-700">
            Pause
          </button>
        )}
        {canResume && (
          <button
            onClick={e => { e.stopPropagation(); onAction('resume', session) }}
            className="px-4 py-2 bg-green-600 text-white border-0 rounded text-xs font-medium cursor-pointer hover:bg-green-700">
            Resume
          </button>
        )}
        {canComplete && (
          <button
            onClick={e => { e.stopPropagation(); onAction('complete', session) }}
            className="px-4 py-2 bg-blue-600 text-white border-0 rounded text-xs font-medium cursor-pointer hover:bg-blue-700">
            Complete
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onAction('delete', session) }}
          className="px-4 py-2 bg-red-600 text-white border-0 rounded text-xs font-medium cursor-pointer hover:bg-red-700 ml-auto">
          Delete
        </button>
      </div>
    </div>
  )
}

function CreateSessionForm({ deviceId, onClose }: { deviceId: string, onClose: () => void }) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<CreateSessionRequest>({
    name: '',
    device_id: deviceId,
    profile_id: '',
    bean_origin: '',
    bean_variety: '',
    green_weight: undefined,
    target_roast_level: '',
    notes: '',
    ambient_temp: undefined,
    humidity: undefined
  })

  // Get available profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.listProfiles(false)
  })

  const createMutation = useMutation({
    mutationFn: api.createSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      onClose()
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return
    createMutation.mutate(formData)
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
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto'
      }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>New Roast Session</h2>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
              Session Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Morning Ethiopian Light Roast"
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
              Roast Profile
            </label>
            <select
              value={formData.profile_id || ''}
              onChange={e => setFormData({ ...formData, profile_id: e.target.value || undefined })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            >
              <option value="">No profile (manual roast)</option>
              {profiles.map(profile => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} - {profile.target_end_temp}°C, {Math.floor((profile.target_total_time || 0) / 60)}min
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                Bean Origin
              </label>
              <input
                type="text"
                value={formData.bean_origin || ''}
                onChange={e => setFormData({ ...formData, bean_origin: e.target.value || undefined })}
                placeholder="e.g., Ethiopia"
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
                Bean Variety
              </label>
              <input
                type="text"
                value={formData.bean_variety || ''}
                onChange={e => setFormData({ ...formData, bean_variety: e.target.value || undefined })}
                placeholder="e.g., Yirgacheffe"
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                Green Weight (g)
              </label>
              <input
                type="number"
                value={formData.green_weight || ''}
                onChange={e => setFormData({ ...formData, green_weight: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="e.g., 100"
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
                Target Roast Level
              </label>
              <select
                value={formData.target_roast_level || ''}
                onChange={e => setFormData({ ...formData, target_roast_level: e.target.value || undefined })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="">Select...</option>
                <option value="Light">Light</option>
                <option value="Medium-Light">Medium-Light</option>
                <option value="Medium">Medium</option>
                <option value="Medium-Dark">Medium-Dark</option>
                <option value="Dark">Dark</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
              Notes
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={e => setFormData({ ...formData, notes: e.target.value || undefined })}
              placeholder="Any notes about this roast session..."
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
              type="submit"
              disabled={createMutation.isPending || !formData.name.trim()}
              style={{
                padding: '10px 20px',
                backgroundColor: createMutation.isPending || !formData.name.trim() ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: createMutation.isPending || !formData.name.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function Sessions({ deviceId, onNavigate }: { deviceId: string, onNavigate: (path: string, sessionId?: string) => void }) {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState<SessionStatus | 'all'>('all')

  // Queries
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions', deviceId],
    queryFn: () => api.listSessions(deviceId, 50)
  })

  // Mutations
  const startMutation = useMutation({
    mutationFn: api.startSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] })
  })
  
  const pauseMutation = useMutation({
    mutationFn: api.pauseSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] })
  })
  
  const resumeMutation = useMutation({
    mutationFn: api.resumeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] })
  })
  
  const completeMutation = useMutation({
    mutationFn: api.completeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] })
  })
  
  const deleteMutation = useMutation({
    mutationFn: api.deleteSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] })
  })

  const handleAction = (action: string, session: RoastSession) => {
    switch (action) {
      case 'start':
        if (confirm(`Start roast session "${session.name}"?`)) {
          startMutation.mutate(session.id)
        }
        break
      case 'pause':
        if (confirm(`Pause roast session "${session.name}"?`)) {
          pauseMutation.mutate(session.id)
        }
        break
      case 'resume':
        if (confirm(`Resume roast session "${session.name}"?`)) {
          resumeMutation.mutate(session.id)
        }
        break
      case 'complete':
        if (confirm(`Complete roast session "${session.name}"?`)) {
          completeMutation.mutate(session.id)
        }
        break
      case 'delete':
        if (confirm(`Delete roast session "${session.name}"? This action cannot be undone.`)) {
          deleteMutation.mutate(session.id)
        }
        break
      case 'view':
        onNavigate('session/' + session.id, session.id)
        break
    }
  }

  const filteredSessions = sessions.filter(session => 
    filterStatus === 'all' || session.status === filterStatus
  )

  const statusCounts = sessions.reduce((acc, session) => {
    acc[session.status] = (acc[session.status] || 0) + 1
    return acc
  }, {} as Record<SessionStatus, number>)

  if (isLoading) {
    return (
      <div className="p-10 text-center">
        <div className="loading-text">
          <div className="loading"></div>
          Loading sessions...
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="m-0 text-3xl font-bold text-gray-900">Roast Sessions</h1>
        <button
          onClick={() => setShowCreateForm(true)}
          className="btn-primary flex items-center gap-2"
        >
          <span style={{ fontSize: '16px' }}>+</span>
          New Session
        </button>
      </div>

      {/* Status Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilterStatus('all')}
          style={{
            padding: '8px 16px',
            backgroundColor: filterStatus === 'all' ? '#3b82f6' : '#f3f4f6',
            color: filterStatus === 'all' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          All ({sessions.length})
        </button>
        {(['planning', 'active', 'paused', 'completed'] as SessionStatus[]).map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            style={{
              padding: '8px 16px',
              backgroundColor: filterStatus === status ? '#3b82f6' : '#f3f4f6',
              color: filterStatus === status ? 'white' : '#374151',
              border: 'none',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {getStatusIcon(status)} {status} ({statusCounts[status] || 0})
          </button>
        ))}
      </div>

      {/* Sessions Grid */}
      {filteredSessions.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#6b7280'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>☕</div>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>
            {filterStatus === 'all' ? 'No roast sessions yet' : `No ${filterStatus} sessions`}
          </div>
          <div style={{ fontSize: '14px' }}>
            {filterStatus === 'all' ? 'Create your first roast session to get started!' : `Try a different filter or create a new session.`}
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: '20px'
        }}>
          {filteredSessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {showCreateForm && (
        <CreateSessionForm
          deviceId={deviceId}
          onClose={() => setShowCreateForm(false)}
        />
      )}
    </div>
  )
}