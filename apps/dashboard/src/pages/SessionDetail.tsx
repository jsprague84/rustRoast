import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, RoastSession, SessionWithTelemetry, ProfileWithPoints, SessionStatus } from '../api/client'
import { useState, useEffect, useMemo } from 'react'
import { useTelemetryWS, useWsStore } from '../ws/useTelemetryWS'
import { TelemetryChart } from '../components/TelemetryChart'

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
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatElapsed(startTime?: string): string {
  if (!startTime) return '0:00'
  const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
  return formatDuration(elapsed)
}

function SessionHeader({ session, onAction }: { session: RoastSession | undefined, onAction: (action: string) => void }) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    if (!session) return
    
    const updateElapsed = () => {
      setElapsed(formatElapsed(session.start_time))
    }
    
    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [session?.start_time])

  if (!session) {
    return (
      <div style={{
        padding: '24px',
        backgroundColor: '#f9fafb',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        marginBottom: '24px'
      }}>
        Loading session...
      </div>
    )
  }

  const canStart = session.status === 'planning'
  const canPause = session.status === 'active'
  const canResume = session.status === 'paused'
  const canComplete = session.status === 'active' || session.status === 'paused'

  return (
    <div style={{
      padding: '24px',
      backgroundColor: 'white',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      marginBottom: '24px'
    }}>
      {/* Title Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>{getStatusIcon(session.status)}</span>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>{session.name}</h1>
          <div style={{
            padding: '6px 12px',
            borderRadius: '16px',
            backgroundColor: getStatusColor(session.status),
            color: 'white',
            fontSize: '12px',
            fontWeight: '500',
            textTransform: 'capitalize'
          }}>
            {session.status}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          {canStart && (
            <button 
              onClick={() => onAction('start')}
              style={{
                padding: '12px 24px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
              ▶️ Start Roast
            </button>
          )}
          {canPause && (
            <button 
              onClick={() => onAction('pause')}
              style={{
                padding: '12px 24px',
                backgroundColor: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
              ⏸️ Pause
            </button>
          )}
          {canResume && (
            <button 
              onClick={() => onAction('resume')}
              style={{
                padding: '12px 24px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
              ▶️ Resume
            </button>
          )}
          {canComplete && (
            <button 
              onClick={() => onAction('complete')}
              style={{
                padding: '12px 24px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
              ✅ Complete
            </button>
          )}
          <button 
            onClick={() => onAction('back')}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
            ← Back
          </button>
        </div>
      </div>

      {/* Info Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
        {/* Bean Info */}
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>Coffee Details</h3>
          <div style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>
            <div><strong>Origin:</strong> {session.bean_origin || 'Not specified'}</div>
            <div><strong>Variety:</strong> {session.bean_variety || 'Not specified'}</div>
            <div><strong>Green Weight:</strong> {session.green_weight ? `${session.green_weight}g` : 'Not specified'}</div>
            <div><strong>Target Level:</strong> {session.target_roast_level || 'Not specified'}</div>
          </div>
        </div>

        {/* Timing Info */}
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>Timing</h3>
          <div style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>
            <div><strong>Started:</strong> {formatDate(session.start_time)}</div>
            <div><strong>Elapsed:</strong> <span style={{ fontFamily: 'monospace', fontSize: '16px', color: '#10b981' }}>{elapsed}</span></div>
            <div><strong>First Crack:</strong> {session.first_crack_time ? formatDuration(session.first_crack_time) : 'Not recorded'}</div>
            <div><strong>Target Time:</strong> {session.total_time_seconds ? formatDuration(session.total_time_seconds) : 'Not set'}</div>
          </div>
        </div>

        {/* Temperature Info */}
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>Temperature</h3>
          <div style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>
            <div><strong>Max Temp:</strong> {session.max_temp ? `${session.max_temp.toFixed(1)}°C` : 'Not recorded'}</div>
            <div><strong>Environment:</strong> {session.ambient_temp ? `${session.ambient_temp}°C` : 'Not recorded'}</div>
            <div><strong>Humidity:</strong> {session.humidity ? `${session.humidity}%` : 'Not recorded'}</div>
            <div><strong>Roasted Weight:</strong> {session.roasted_weight ? `${session.roasted_weight}g` : 'Not weighed'}</div>
          </div>
        </div>

        {/* Profile Info */}
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>Profile</h3>
          <div style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>
            <div><strong>Profile:</strong> {session.profile_id ? 'Attached' : 'Manual roast'}</div>
            <div><strong>Development:</strong> {session.development_time_ratio ? `${(session.development_time_ratio * 100).toFixed(1)}%` : 'Not calculated'}</div>
            <div><strong>Created:</strong> {formatDate(session.created_at)}</div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {session.notes && (
        <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600' }}>Notes</h3>
          <div style={{ fontSize: '14px', color: '#374151', whiteSpace: 'pre-wrap' }}>{session.notes}</div>
        </div>
      )}
    </div>
  )
}

function LiveRoastingInterface({ session, profile }: { session: RoastSession | undefined, profile?: ProfileWithPoints }) {
  // WebSocket telemetry for live chart
  useTelemetryWS()
  const livePoints = useWsStore(s => session ? s.data[session.device_id] ?? [] : [])
  
  const [windowSecs, setWindowSecs] = useState(900) // 15 minutes default
  const [showProfile, setShowProfile] = useState(true)

  // Filter live points to window
  const filteredLivePoints = useMemo(() => {
    const cutoff = (Date.now()/1000|0) - windowSecs
    return livePoints.filter(p => p.ts >= cutoff)
  }, [livePoints, windowSecs])

  // Device telemetry
  const { data: latest } = useQuery({ 
    queryKey: ['latest', session?.device_id || ''], 
    queryFn: () => session ? api.latestTelemetry(session.device_id) : Promise.resolve(null), 
    refetchInterval: 2000,
    enabled: !!session
  })

  if (!session) {
    return (
      <div style={{
        padding: '24px',
        backgroundColor: '#f9fafb',
        borderRadius: '12px',
        border: '1px solid #e5e7eb'
      }}>
        Loading session data...
      </div>
    )
  }

  const isActive = session.status === 'active'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '2fr 1fr',
      gap: '24px'
    }}>
      {/* Live Chart */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
            {isActive ? '🔥 Live Roasting' : '📊 Roast Data'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {profile && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showProfile}
                  onChange={e => setShowProfile(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px' }}>Show Profile</span>
              </label>
            )}
            <label style={{ fontSize: '14px' }}>
              Window:
              <select 
                value={windowSecs} 
                onChange={e => setWindowSecs(parseInt(e.target.value))} 
                style={{ marginLeft: '8px', padding: '4px', borderRadius: '4px', border: '1px solid #d1d5db' }}
              >
                <option value={300}>5m</option>
                <option value={900}>15m</option>
                <option value={1800}>30m</option>
                <option value={3600}>1h</option>
              </select>
            </label>
          </div>
        </div>

        {/* Enhanced Chart with Profile Overlay */}
        <div style={{ position: 'relative' }}>
          <TelemetryChart 
            points={filteredLivePoints} 
            profile={showProfile ? profile : undefined}
            sessionStartTime={session.start_time ? new Date(session.start_time).getTime() / 1000 : undefined}
          />
          
          {isActive && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              padding: '8px 12px',
              backgroundColor: 'rgba(16, 185, 129, 0.9)',
              color: 'white',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              animation: 'pulse 2s infinite'
            }}>
              ● LIVE
            </div>
          )}
        </div>
      </div>

      {/* Live Stats & Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Current Readings */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>Current Readings</h3>
          
          {latest?.telemetry ? (
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                backgroundColor: '#fef3c7',
                borderRadius: '8px'
              }}>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>Bean Temp</span>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#d97706' }}>
                  {latest.telemetry.beanTemp?.toFixed(1) || '--'}°C
                </span>
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                backgroundColor: '#dbeafe',
                borderRadius: '8px'
              }}>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>Env Temp</span>
                <span style={{ fontSize: '18px', fontWeight: '600', color: '#2563eb' }}>
                  {latest.telemetry.envTemp?.toFixed(1) || '--'}°C
                </span>
              </div>
              
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                backgroundColor: '#dcfce7',
                borderRadius: '8px'
              }}>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>Setpoint</span>
                <span style={{ fontSize: '18px', fontWeight: '600', color: '#16a34a' }}>
                  {latest.telemetry.setpoint?.toFixed(1) || '--'}°C
                </span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#f3f4f6', borderRadius: '6px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Fan</div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>{latest.telemetry.fanPWM || 0}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#f3f4f6', borderRadius: '6px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Heater</div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>{latest.telemetry.heaterPWM || 0}%</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
              No telemetry data available
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button style={{
              padding: '10px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}>
              📝 Add Note
            </button>
            <button style={{
              padding: '10px 16px',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}>
              🎯 Mark First Crack
            </button>
            <button style={{
              padding: '10px 16px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}>
              ⚖️ Record Weight
            </button>
          </div>
        </div>

        {/* Profile Info */}
        {profile && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>Profile: {profile.profile.name}</h3>
            <div style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>
              <div><strong>Target Time:</strong> {profile.profile.target_total_time ? formatDuration(profile.profile.target_total_time) : 'Not set'}</div>
              <div><strong>End Temp:</strong> {profile.profile.target_end_temp ? `${profile.profile.target_end_temp}°C` : 'Not set'}</div>
              <div><strong>First Crack:</strong> {profile.profile.target_first_crack ? formatDuration(profile.profile.target_first_crack) : 'Not set'}</div>
              <div><strong>Points:</strong> {profile.points.length} temperature points</div>
            </div>
            {profile.profile.description && (
              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '13px', color: '#6b7280' }}>
                {profile.profile.description}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function SessionDetail({ sessionId, onNavigate }: { sessionId: string, onNavigate: (path: string) => void }) {
  const queryClient = useQueryClient()

  // Fetch session with telemetry and profile
  const { data: sessionData, isLoading } = useQuery({
    queryKey: ['session_detail', sessionId],
    queryFn: () => api.getSessionWithTelemetry(sessionId),
    refetchInterval: (data) => data?.session?.status === 'active' ? 5000 : 30000 // More frequent for active sessions
  })

  // Mutations for session control
  const startMutation = useMutation({
    mutationFn: api.startSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session_detail', sessionId] })
  })
  
  const pauseMutation = useMutation({
    mutationFn: api.pauseSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session_detail', sessionId] })
  })
  
  const resumeMutation = useMutation({
    mutationFn: api.resumeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session_detail', sessionId] })
  })
  
  const completeMutation = useMutation({
    mutationFn: api.completeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session_detail', sessionId] })
  })

  const handleAction = (action: string) => {
    const session = sessionData?.session
    if (!session) return

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
      case 'back':
        onNavigate('sessions')
        break
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading session...</div>
      </div>
    )
  }

  if (!sessionData) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#ef4444', marginBottom: '16px' }}>Session not found</div>
        <button 
          onClick={() => onNavigate('sessions')}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Back to Sessions
        </button>
      </div>
    )
  }

  return (
    <div>
      <SessionHeader session={sessionData.session} onAction={handleAction} />
      <LiveRoastingInterface session={sessionData.session} profile={sessionData.profile} />
    </div>
  )
}