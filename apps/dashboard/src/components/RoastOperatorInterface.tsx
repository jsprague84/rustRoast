import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ProfileWithPoints, RoastSession, RoastProfile } from '../api/client'
import { useTelemetryWS, useWsStore } from '../ws/useTelemetryWS'
import { useTelemetryData, useLatestTelemetry } from '../hooks/useTelemetryData'
import { TelemetryChart } from './TelemetryChart'
import { ProfileManager } from './ProfileManager'
import { ProfileImporter } from './ProfileImporter'
import { parseArtisanProfile, ParsedProfile, getTargetTemperature } from '../utils/ArtisanProfileParser'

type Props = {
  deviceId: string
  session?: RoastSession
  onSessionChange?: (sessionId?: string) => void
}

type ControlMode = 'auto' | 'manual'

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Use the new optimized telemetry hooks instead of custom downsampling
function useOptimizedTelemetry(deviceId: string) {
  return useTelemetryData({
    deviceId,
    windowSeconds: 1800, // 30 minutes
    maxPoints: 800,
    changeThreshold: 0.1
  })
}

// Improved downsampling with better data retention
function downsampleData(points: any[], maxPoints = 800) {
  if (points.length <= maxPoints) return points

  // Use smarter downsampling that preserves important data points
  const step = points.length / maxPoints
  const result = []

  for (let i = 0; i < maxPoints; i++) {
    const index = Math.floor(i * step)
    if (index < points.length) {
      result.push(points[index])
    }
  }

  return result
}

function RoastControls({ 
  deviceId, 
  session, 
  onSessionChange,
  loadedProfile,
  profileFollowMode,
  onProfileFollowModeChange,
  sessionStartTime,
  startMutation
}: { 
  deviceId: string
  session?: RoastSession 
  onSessionChange?: (sessionId?: string) => void
  loadedProfile?: ParsedProfile | null
  profileFollowMode?: boolean
  onProfileFollowModeChange?: (enabled: boolean) => void
  sessionStartTime?: number | null
  startMutation: any
}) {
  const queryClient = useQueryClient()
  const [controlMode, setControlMode] = useState<ControlMode>('auto')
  const [manualControls, setManualControls] = useState({
    setpoint: 200,
    heaterPwm: 0,
    fanPwm: 100,
    heaterEnable: false
  })
  
  // Get current telemetry to sync controls with device state - optimized for performance
  const { data: latest } = useQuery({ 
    queryKey: ['latest', deviceId], 
    queryFn: () => api.latestTelemetry(deviceId), 
    refetchInterval: 750, // High frequency for real-time control
    staleTime: 300 // Very short cache for latest data
  })
  
  // Sync control state with device telemetry
  useEffect(() => {
    if (latest?.telemetry) {
      const t = latest.telemetry
      setControlMode(t.controlMode === 0 ? 'manual' : 'auto')
      setManualControls({
        setpoint: t.setpoint ?? 200,
        heaterPwm: t.heaterPWM ?? 0,
        fanPwm: t.fanPWM ?? 100,
        heaterEnable: t.heaterEnable === 1
      })
    }
  }, [latest])
  
  // Control mutations
  const setpointMutation = useMutation({
    mutationFn: (value: number) => api.setSetpoint(deviceId, value),
    onError: (error) => console.error('Setpoint mutation error:', error),
    onSuccess: () => console.log('Setpoint updated successfully')
  })

  // Automated profile following
  useEffect(() => {
    if (!profileFollowMode || !loadedProfile || !sessionStartTime || !session || session.status !== 'active' || !latest?.telemetry) {
      return
    }

    const currentTime = Date.now() / 1000
    const elapsedSeconds = currentTime - sessionStartTime

    if (elapsedSeconds >= 0) {
      const targetTemp = getTargetTemperature(loadedProfile, elapsedSeconds)

      // Only update setpoint if we're in auto mode and target is different
      if (controlMode === 'auto' && targetTemp > 0 && Math.abs(targetTemp - manualControls.setpoint) > 1) {
        console.log(`Profile following: Setting target to ${targetTemp.toFixed(1)}°C at ${elapsedSeconds.toFixed(0)}s`)
        setpointMutation.mutate(targetTemp)
      }
    }
  }, [profileFollowMode, loadedProfile, sessionStartTime, session, latest?.telemetry?.timestamp, controlMode, manualControls.setpoint])

  const fanMutation = useMutation({
    mutationFn: (value: number) => api.setFanPwm(deviceId, value),
    onError: (error) => console.error('Fan PWM mutation error:', error),
    onSuccess: () => console.log('Fan PWM updated successfully')
  })

  const heaterMutation = useMutation({
    mutationFn: (value: number) => api.setHeaterPwm(deviceId, value),
    onError: (error) => console.error('Heater PWM mutation error:', error),
    onSuccess: () => console.log('Heater PWM updated successfully')
  })

  const modeMutation = useMutation({
    mutationFn: (mode: ControlMode) => api.setMode(deviceId, mode),
    onError: (error) => console.error('Mode mutation error:', error),
    onSuccess: () => console.log('Mode updated successfully')
  })

  const heaterEnableMutation = useMutation({
    mutationFn: (enabled: boolean) => api.setHeaterEnable(deviceId, enabled),
    onError: (error) => console.error('Heater enable mutation error:', error),
    onSuccess: () => console.log('Heater enable updated successfully')
  })

  
  const pauseMutation = useMutation({
    mutationFn: api.pauseSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      // Disable heater when session is paused for safety
      heaterEnableMutation.mutate(false)
    }
  })
  
  const resumeMutation = useMutation({
    mutationFn: api.resumeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      // Re-enable heater when session is resumed
      heaterEnableMutation.mutate(true)
    }
  })
  
  const completeMutation = useMutation({
    mutationFn: api.completeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      // Disable heater when session is completed for safety
      heaterEnableMutation.mutate(false)
    }
  })

  const handleControlChange = useCallback((type: string, value: any) => {
    switch (type) {
      case 'setpoint':
        setpointMutation.mutate(value)
        break
      case 'fan':
        fanMutation.mutate(value)
        break
      case 'heater':
        heaterMutation.mutate(value)
        break
      case 'mode':
        modeMutation.mutate(value)
        setControlMode(value)
        break
      case 'heaterEnable':
        heaterEnableMutation.mutate(value)
        break
    }
  }, [setpointMutation, fanMutation, heaterMutation, modeMutation, heaterEnableMutation])

  return (
    <div className="card grid-responsive" style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '1.25rem'
    }}>
      {/* Session Controls */}
      <div>
        <h3 style={{
          margin: '0 0 1rem 0',
          fontSize: '1rem',
          fontWeight: '600',
          color: 'var(--color-gray-900)'
        }}>
          Session Control
        </h3>
        
        {session && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            backgroundColor: 'var(--color-white)',
            borderRadius: '0.5rem',
            border: '1px solid var(--color-gray-200)'
          }}>
            <div className="text-sm font-medium" style={{
              marginBottom: '0.25rem',
              color: 'var(--color-gray-900)'
            }}>
              {session.name}
            </div>
            <div className="text-xs" style={{ color: 'var(--color-gray-500)' }}>
              Status: <span className="font-medium" style={{
                color: session.status === 'active' ? 'var(--color-green-600)' :
                       session.status === 'paused' ? '#f59e0b' : 'var(--color-gray-500)',
                textTransform: 'capitalize'
              }}>
                {session.status}
              </span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {session?.status === 'planning' && (
            <button
              onClick={() => session && startMutation.mutate(session.id)}
              disabled={startMutation.isPending}
              className="btn-primary text-xs"
              style={{
                padding: '0.5rem 1rem',
                fontWeight: '500'
              }}
            >
              🔥 Start Roast
            </button>
          )}
          
          {session?.status === 'active' && (
            <>
              <button
                onClick={() => session && pauseMutation.mutate(session.id)}
                disabled={pauseMutation.isPending}
                className="btn-secondary text-xs"
                style={{
                  padding: '0.5rem 1rem',
                  fontWeight: '500',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none'
                }}
              >
                ⏸️ Pause
              </button>
              <button
                onClick={() => session && completeMutation.mutate(session.id)}
                disabled={completeMutation.isPending}
                className="text-xs"
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--color-primary-600)',
                  color: 'var(--color-white)',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                ✅ Complete
              </button>
            </>
          )}
          
          {session?.status === 'paused' && (
            <button
              onClick={() => session && resumeMutation.mutate(session.id)}
              disabled={resumeMutation.isPending}
              className="btn-primary text-xs"
              style={{
                padding: '0.5rem 1rem',
                fontWeight: '500'
              }}
            >
              ▶️ Resume
            </button>
          )}
        </div>
      </div>

      {/* Device Controls */}
      <div>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
          Device Control
        </h3>

        {/* Mode Toggle */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
            Control Mode
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['auto', 'manual'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => handleControlChange('mode', mode)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  backgroundColor: controlMode === mode ? '#3b82f6' : 'white',
                  color: controlMode === mode ? 'white' : '#374151'
                }}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Temperature Setpoint */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
            Target Temperature (°C)
          </label>
          <input
            type="number"
            min="20"
            max="250"
            step="0.1"
            value={manualControls.setpoint}
            onChange={e => {
              const value = parseFloat(e.target.value)
              setManualControls(prev => ({ ...prev, setpoint: value }))
              handleControlChange('setpoint', value)
            }}
            style={{ 
              width: '100%', 
              padding: '6px 8px', 
              border: '1px solid #d1d5db', 
              borderRadius: '4px', 
              fontSize: '14px' 
            }}
          />
        </div>

        {/* Fan Speed */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
            Fan Speed: {Math.round(manualControls.fanPwm * 100 / 255)}%
          </label>
          <input
            type="range"
            min="0"
            max="255"
            value={manualControls.fanPwm}
            onChange={e => {
              const value = parseInt(e.target.value)
              setManualControls(prev => ({ ...prev, fanPwm: value }))
              handleControlChange('fan', value)
            }}
            style={{ width: '100%' }}
          />
        </div>

        {/* Heater PWM (Manual Mode Only) */}
        {controlMode === 'manual' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '6px' }}>
              Heater Power: {manualControls.heaterPwm}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={manualControls.heaterPwm}
              onChange={e => {
                const value = parseInt(e.target.value)
                setManualControls(prev => ({ ...prev, heaterPwm: value }))
                handleControlChange('heater', value)
              }}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Heater Enable Toggle */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={manualControls.heaterEnable}
              onChange={e => {
                const checked = e.target.checked
                setManualControls(prev => ({ ...prev, heaterEnable: checked }))
                handleControlChange('heaterEnable', checked)
              }}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
              Heater Enable
            </span>
          </label>
        </div>
        
        {/* Profile Following Controls */}
        {loadedProfile && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#faf5ff',
            border: '1px solid #e9d5ff',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#7c3aed' }}>
                📊 Profile: {loadedProfile.title}
              </span>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>
                {Math.floor(loadedProfile.totalTime / 60)}:{(loadedProfile.totalTime % 60).toString().padStart(2, '0')}
              </span>
            </div>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={profileFollowMode || false}
                onChange={e => onProfileFollowModeChange?.(e.target.checked)}
                disabled={!session || session.status !== 'active' || controlMode !== 'auto'}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
                Auto-Follow Profile {controlMode !== 'auto' ? '(Requires Auto Mode)' : ''}
              </span>
            </label>
            
            {profileFollowMode && sessionStartTime && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
                Following profile curve automatically...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function RoastOperatorInterface({ deviceId, session, onSessionChange }: Props) {
  useTelemetryWS()

  // Use optimized telemetry data for better performance and responsiveness
  const telemetryData = useOptimizedTelemetry(deviceId)
  const connected = useWsStore(s => s.connected)
  const connecting = useWsStore(s => s.connecting)
  const lastError = useWsStore(s => s.lastError)

  // Fallback to API data when WebSocket fails (like AutoTune page does)
  const { data: apiTelemetryData } = useQuery({
    queryKey: ['telemetry_history_fallback', deviceId],
    queryFn: () => api.telemetryHistory(deviceId, 1800, 300), // 30 minutes, 300 max points
    refetchInterval: connected ? 10000 : 2000, // More frequent when WebSocket is down
    staleTime: 1000,
    enabled: true // Always enabled as fallback
  })

  // Use WebSocket data if available and has points, otherwise fall back to API data
  const effectiveTelemetryData = useMemo(() => {
    if (connected && telemetryData?.points?.length > 0) {
      return telemetryData
    }
    // Fallback to API data with same structure as telemetryData
    return {
      points: apiTelemetryData?.items || [],
      latest: apiTelemetryData?.items?.[apiTelemetryData.items.length - 1] || null,
      isEmpty: !apiTelemetryData?.items?.length,
      totalPoints: apiTelemetryData?.items?.length || 0,
      compressionRatio: 1
    }
  }, [connected, telemetryData, apiTelemetryData])

  // Query for latest telemetry for current readings display
  const { data: latest } = useQuery({
    queryKey: ['latest', deviceId],
    queryFn: () => api.latestTelemetry(deviceId),
    refetchInterval: 750, // High frequency for real-time control
    staleTime: 300 // Very short cache for latest data
  })

  // Debug logging to help diagnose chart data issue
  useEffect(() => {
    console.log('[RoastOperatorInterface] Debug Info:', {
      deviceId,
      wsConnected: connected,
      wsConnecting: connecting,
      wsError: lastError,
      wsTelemetryPoints: telemetryData?.points?.length || 0,
      apiTelemetryPoints: apiTelemetryData?.items?.length || 0,
      effectivePoints: effectiveTelemetryData?.points?.length || 0,
      usingWebSocket: connected && telemetryData?.points?.length > 0,
      latestApiData: latest?.telemetry ? 'available' : 'missing'
    })
  }, [deviceId, connected, connecting, lastError, telemetryData, apiTelemetryData, effectiveTelemetryData, latest])
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null)
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null)
  const [showProfileManager, setShowProfileManager] = useState(false)
  const [showProfileImporter, setShowProfileImporter] = useState(false)
  const [loadedProfile, setLoadedProfile] = useState<ParsedProfile | null>(null)
  const [profileFollowMode, setProfileFollowMode] = useState(false)
  
  // Session creation state
  const [newSessionName, setNewSessionName] = useState('')
  const [selectedProfileForSession, setSelectedProfileForSession] = useState<string | null>(null)
  const [showNewSessionForm, setShowNewSessionForm] = useState(!session)
  
  // Roast event tracking state
  const [roastEvents, setRoastEvents] = useState<{
    dryEnd?: number
    firstCrack?: number
    secondCrack?: number
    drop?: number
  }>({})

  // Get available profiles for session creation
  const { data: availableProfiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.listProfiles(true),
    staleTime: 30000
  })

  // Session creation mutation
  const createSessionMutation = useMutation({
    mutationFn: (params: { name: string; profileId?: string }) => 
      api.createSession({
        device_id: deviceId,
        name: params.name,
        start_time: null,
        end_time: null,
        status: 'planning' as const,
        profile_id: params.profileId || null
      }),
    onSuccess: (newSession, variables) => {
      queryClient.invalidateQueries({ queryKey: ['session'] })
      onSessionChange?.(newSession.id)
      setShowNewSessionForm(false)
      setNewSessionName('')
      setSelectedProfileForSession(null)
      
      // Auto-start session if a profile was selected
      if (variables.profileId) {
        startMutation.mutate(newSession.id)
      }
    }
  })

  // Chart click handler for marking roast events
  const handleChartClick = useCallback((params: any) => {
    if (!session || session.status !== 'active' || !sessionStartTime) return
    
    const clickedTime = Math.round(params.value[0])
    console.log(`Chart clicked at time: ${clickedTime}s`)
    
    const eventType = prompt(`Mark roast event at ${Math.floor(clickedTime/60)}:${(clickedTime%60).toString().padStart(2,'0')}?\n\nChoose:\n- dry (Dry End)\n- fc (First Crack)\n- sc (Second Crack)\n- drop (Drop/End)`)
    
    if (eventType) {
      switch (eventType.toLowerCase()) {
        case 'dry':
          setRoastEvents(prev => ({ ...prev, dryEnd: clickedTime }))
          break
        case 'fc':
          setRoastEvents(prev => ({ ...prev, firstCrack: clickedTime }))
          break
        case 'sc':
          setRoastEvents(prev => ({ ...prev, secondCrack: clickedTime }))
          break
        case 'drop':
          setRoastEvents(prev => ({ ...prev, drop: clickedTime }))
          break
      }
    }
  }, [session, sessionStartTime])
  // Add missing queryClient and heaterEnableMutation
  const queryClient = useQueryClient()
  const heaterEnableMutation = useMutation({
    mutationFn: (enabled: boolean) => api.setHeaterEnable(deviceId, enabled),
    onError: (error) => console.error('Heater enable mutation error:', error)
  })

  // Session mutations
  const startMutation = useMutation({
    mutationFn: api.startSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      onSessionChange?.(session?.id)
      // Automatically enable heater when session starts
      heaterEnableMutation.mutate(true)
    }
  })
  
  // Roast event button handler
  const handleRoastEventClick = useCallback((eventType: 'dryEnd' | 'firstCrack' | 'secondCrack' | 'drop') => {
    // Handle Drop button - can start session if needed
    if (eventType === 'drop') {
      if (!session && !createSessionMutation.isPending) {
        // Create a new session if none exists
        const timestamp = new Date().toLocaleString()
        createSessionMutation.mutate({ 
          name: `Quick Roast ${timestamp}`,
          profileId: undefined 
        })
        return
      }
      
      if (session?.status === 'planning' && !startMutation.isPending) {
        // Start the session if it's in planning and enable profile following if profile is loaded
        if (loadedProfile) {
          setProfileFollowMode(true)
        }
        startMutation.mutate(session.id)
        return
      }
    }
    
    // Mark roast event if session is active
    if (session?.status === 'active' && sessionStartTime) {
      const currentTime = Date.now() / 1000
      const elapsedTime = Math.round(currentTime - sessionStartTime)
      
      if (elapsedTime >= 0) {
        setRoastEvents(prev => ({ ...prev, [eventType]: elapsedTime }))
      }
    }
  }, [session, sessionStartTime, createSessionMutation, startMutation, loadedProfile, setProfileFollowMode])
  
  // Hide session form when session becomes available
  useEffect(() => {
    if (session && showNewSessionForm) {
      setShowNewSessionForm(false)
    }
  }, [session, showNewSessionForm])

  // Using optimized telemetry data instead of separate API call

  // Get profile data if session has one
  const { data: profileData } = useQuery({
    queryKey: ['profile', session?.profile_id],
    queryFn: () => session?.profile_id ? api.getProfile(session.profile_id) : null,
    enabled: !!session?.profile_id,
    staleTime: 300000 // Cache for 5 minutes - profiles don't change often
  })
  
  // Debug logging
  console.log('Session data:', session)
  console.log('Profile data:', profileData)
  console.log('Loaded profile:', loadedProfile)
  console.log('Profile follow mode:', profileFollowMode)

  // Get available profiles for selection
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.listProfiles(false),
    staleTime: 300000 // Cache for 5 minutes
  })

  // Get roast events if session is active - reduced frequency
  const { data: events = [] } = useQuery({
    queryKey: ['roast-events', session?.id],
    queryFn: () => session?.id ? api.getRoastEvents(session.id) : [],
    enabled: !!session?.id,
    refetchInterval: 2000, // More responsive event updates
    staleTime: 1000 // Shorter cache
  })

  // Calculate session start time
  useEffect(() => {
    if (session?.start_time) {
      setSessionStartTime(new Date(session.start_time).getTime() / 1000)
    } else {
      setSessionStartTime(null)
    }
  }, [session?.start_time])

  // Determine when roast event buttons should be enabled
  const roastEventButtonsEnabled = !session || 
    session.status === 'planning' || 
    session.status === 'active'

  // Convert database profile to loadedProfile for following
  useEffect(() => {
    if (profileData) {
      // Convert ProfileWithPoints to ParsedProfile format
      const parsedProfile: ParsedProfile = {
        title: profileData.profile.name,
        roastDate: '',
        totalTime: profileData.profile.target_total_time || 720, // Default 12 minutes
        points: profileData.points
          .sort((a, b) => a.time_seconds - b.time_seconds)
          .map(point => ({
            time: point.time_seconds,
            beanTemp: point.target_temp,
            envTemp: point.target_temp // Use same temp for both for now
          })),
        events: [],
        metadata: {
          operator: '',
          roasterType: '',
          beans: '',
          weight: 0,
          totalRor: 0,
          dryPhaseRor: 0,
          midPhaseRor: 0,
          finishPhaseRor: 0
        }
      }
      
      setLoadedProfile(parsedProfile)
      // Automatically enable profile following when a session has a profile
      setProfileFollowMode(true)
      
      console.log(`Loaded profile: ${parsedProfile.title} with ${parsedProfile.points?.length || 0} points`)
    } else {
      setLoadedProfile(null)
      setProfileFollowMode(false)
    }
  }, [profileData])

  // Get direct access to WebSocket store for additional fallback
  const wsRingBuffers = useWsStore(s => s.ringBuffers)
  const wsDeviceBuffer = wsRingBuffers[deviceId]
  const wsLatestPoint = useLatestTelemetry(deviceId)

  // Debug WebSocket store state
  console.log('[WSStore] Debug full store state:', {
    allRingBuffers: Object.keys(wsRingBuffers),
    deviceId,
    hasDeviceBuffer: !!wsDeviceBuffer,
    bufferLength: wsDeviceBuffer?.length,
    allPoints: wsDeviceBuffer?.getPoints(),
    latestPoint: wsLatestPoint
  })

  // Current readings - use latest from multiple sources for robustness
  const currentReadings = useMemo(() => {
    console.log('[CurrentReadings] Debug data sources:', {
      telemetryDataLatest: telemetryData?.latest,
      effectiveTelemetryDataLatest: effectiveTelemetryData?.latest,
      latestTelemetry: latest?.telemetry,
      wsLatestPoint: wsLatestPoint,
      wsConnected: connected
    })

    // Try WebSocket data first
    if (telemetryData?.latest) {
      console.log('[CurrentReadings] Using telemetryData.latest')
      return {
        beanTemp: telemetryData.latest.beanTemp,
        envTemp: telemetryData.latest.envTemp,
        setpoint: telemetryData.latest.setpoint,
        fanPWM: telemetryData.latest.fanPWM,
        heaterPWM: telemetryData.latest.heaterPWM,
        rateOfRise: telemetryData.latest.rateOfRise
      }
    }

    // Fallback to API data's latest point
    if (effectiveTelemetryData?.latest) {
      console.log('[CurrentReadings] Using effectiveTelemetryData.latest')
      return {
        beanTemp: effectiveTelemetryData.latest.beanTemp,
        envTemp: effectiveTelemetryData.latest.envTemp,
        setpoint: effectiveTelemetryData.latest.setpoint,
        fanPWM: effectiveTelemetryData.latest.fanPWM,
        heaterPWM: effectiveTelemetryData.latest.heaterPWM,
        rateOfRise: effectiveTelemetryData.latest.rateOfRise
      }
    }

    // Third fallback to the API query's latest telemetry
    if (latest?.telemetry) {
      console.log('[CurrentReadings] Using latest.telemetry')
      const t = latest.telemetry
      return {
        beanTemp: t.beanTemp,
        envTemp: t.envTemp,
        setpoint: t.setpoint,
        fanPWM: t.fanPWM,
        heaterPWM: t.heaterPWM,
        rateOfRise: t.rateOfRise
      }
    }

    // Fourth fallback: Direct WebSocket ring buffer access
    if (wsLatestPoint) {
      console.log('[CurrentReadings] Using wsLatestPoint:', wsLatestPoint)
      return {
        beanTemp: wsLatestPoint.beanTemp,
        envTemp: wsLatestPoint.envTemp,
        setpoint: wsLatestPoint.setpoint,
        fanPWM: wsLatestPoint.fanPWM,
        heaterPWM: wsLatestPoint.heaterPWM,
        rateOfRise: wsLatestPoint.rateOfRise
      }
    }

    console.log('[CurrentReadings] No data source available, returning empty')
    return {}
  }, [telemetryData?.latest, effectiveTelemetryData?.latest, latest?.telemetry, wsLatestPoint, wsDeviceBuffer, connected])

  return (
    <div style={{ padding: '20px' }}>
      {/* Session Creation Form - shown when no active session */}
      {(!session || showNewSessionForm) && (
        <div style={{
          marginBottom: '20px',
          padding: '20px',
          backgroundColor: '#f0f9ff',
          borderRadius: '12px',
          border: '2px solid #0ea5e9'
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#0c4a6e' }}>
            🚀 Start New Roast Session
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 120px', gap: '16px', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                Session Name
              </label>
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder={`Roast ${new Date().toLocaleDateString()}`}
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
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                Profile (Optional)
              </label>
              <select
                value={selectedProfileForSession || ''}
                onChange={(e) => setSelectedProfileForSession(e.target.value || null)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="">No Profile</option>
                {availableProfiles.map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>
            
            <button
              onClick={() => {
                const name = newSessionName.trim() || `Roast ${new Date().toLocaleDateString()}`
                createSessionMutation.mutate({ 
                  name, 
                  profileId: selectedProfileForSession || undefined 
                })
              }}
              disabled={createSessionMutation.isPending}
              style={{
                padding: '10px 16px',
                backgroundColor: '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                height: '40px'
              }}
            >
{createSessionMutation.isPending ? '⏳' : selectedProfileForSession ? '🚀 Start Profile Roast' : '🎯 Create Session'}
            </button>
          </div>
          
          {session && (
            <button
              onClick={() => setShowNewSessionForm(false)}
              style={{
                marginTop: '12px',
                padding: '6px 12px',
                backgroundColor: 'transparent',
                color: '#6b7280',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>
          Coffee Roaster Control
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* Profile Status */}
          {loadedProfile && (
            <div style={{
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '6px',
              backgroundColor: profileFollowMode ? '#8b5cf6' : '#6b7280',
              color: 'white',
              fontWeight: '500'
            }}>
              📊 {loadedProfile.title} {profileFollowMode ? '(Following)' : '(Loaded)'}
            </div>
          )}
          
          <div style={{ 
            fontSize: '12px', 
            padding: '6px 12px', 
            borderRadius: '6px',
            backgroundColor: connected ? '#10b981' : connecting ? '#f59e0b' : '#ef4444',
            color: 'white',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: '120px',
            justifyContent: 'center'
          }}>
            {connected ? (
              <>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white' }}></span>
                Connected
              </>
            ) : connecting ? (
              <>
                <span>⟳</span>
                Connecting...
              </>
            ) : (
              <>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white' }}></span>
                Disconnected
              </>
            )}
          </div>
          
          {lastError && (
            <div style={{ 
              fontSize: '11px', 
              color: '#dc2626',
              backgroundColor: '#fef2f2',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #fecaca',
              maxWidth: '200px'
            }}>
              {lastError}
            </div>
          )}
          
          <div style={{ 
            fontSize: '12px', 
            color: '#6b7280',
            backgroundColor: '#f9fafb',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #f3f4f6'
          }}>
            {telemetryData?.points?.length || 0} points
          </div>
        </div>
      </div>

      {/* Current Readings */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '16px',
        marginBottom: '20px',
        padding: '16px',
        backgroundColor: '#1f2937',
        borderRadius: '8px',
        color: 'white'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>
            {currentReadings.beanTemp?.toFixed(1) ?? '--'}°C
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Bean Temp</div>
        </div>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>
            {currentReadings.envTemp?.toFixed(1) ?? '--'}°C
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Env Temp</div>
        </div>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f59e0b' }}>
            {currentReadings.setpoint?.toFixed(0) ?? '--'}°C
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Target</div>
        </div>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981' }}>
            {currentReadings.fanPWM ? Math.round(currentReadings.fanPWM * 100 / 255) : '--'}%
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Fan</div>
        </div>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f97316' }}>
            {currentReadings.heaterPWM?.toFixed(0) ?? '--'}%
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Heater</div>
        </div>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981' }}>
            {currentReadings.rateOfRise?.toFixed(1) ?? '--'}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>RoR (°C/min)</div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ marginBottom: '20px' }}>
        <TelemetryChart
          points={effectiveTelemetryData?.points || []}
          profile={loadedProfile?.profile?.points ? {
            points: loadedProfile.profile.points.map(p => ({
              time_seconds: p.time_seconds,
              target_temp: p.target_temp
            }))
          } : undefined}
          sessionStartTime={sessionStartTime}
        />
      </div>

      {/* Roast Events Panel */}
      {session && (session.status === 'active' || session.status === 'planning') && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '16px', 
          backgroundColor: '#fefce8', 
          borderRadius: '8px', 
          border: '1px solid #eab308' 
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#92400e' }}>
            📝 Roast Events (Click buttons to mark)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            <button
              onClick={() => handleRoastEventClick('dryEnd')}
              disabled={!roastEventButtonsEnabled}
              style={{
                padding: '12px',
                textAlign: 'center',
                backgroundColor: roastEvents.dryEnd ? '#dcfce7' : (roastEventButtonsEnabled ? '#f9fafb' : '#f3f4f6'),
                border: `2px solid ${roastEvents.dryEnd ? '#22c55e' : (roastEventButtonsEnabled ? '#d1d5db' : '#e5e7eb')}`,
                borderRadius: '8px',
                cursor: roastEventButtonsEnabled ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Dry End</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: roastEvents.dryEnd ? '#22c55e' : '#9ca3af' }}>
                {roastEvents.dryEnd ? `${Math.floor(roastEvents.dryEnd/60)}:${(roastEvents.dryEnd%60).toString().padStart(2,'0')}` : '—'}
              </div>
            </button>
            
            <button
              onClick={() => handleRoastEventClick('firstCrack')}
              disabled={!roastEventButtonsEnabled}
              style={{
                padding: '12px',
                textAlign: 'center',
                backgroundColor: roastEvents.firstCrack ? '#dcfce7' : (roastEventButtonsEnabled ? '#f9fafb' : '#f3f4f6'),
                border: `2px solid ${roastEvents.firstCrack ? '#22c55e' : (roastEventButtonsEnabled ? '#d1d5db' : '#e5e7eb')}`,
                borderRadius: '8px',
                cursor: roastEventButtonsEnabled ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>First Crack</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: roastEvents.firstCrack ? '#22c55e' : '#9ca3af' }}>
                {roastEvents.firstCrack ? `${Math.floor(roastEvents.firstCrack/60)}:${(roastEvents.firstCrack%60).toString().padStart(2,'0')}` : '—'}
              </div>
            </button>
            
            <button
              onClick={() => handleRoastEventClick('secondCrack')}
              disabled={!roastEventButtonsEnabled}
              style={{
                padding: '12px',
                textAlign: 'center',
                backgroundColor: roastEvents.secondCrack ? '#dcfce7' : (roastEventButtonsEnabled ? '#f9fafb' : '#f3f4f6'),
                border: `2px solid ${roastEvents.secondCrack ? '#22c55e' : (roastEventButtonsEnabled ? '#d1d5db' : '#e5e7eb')}`,
                borderRadius: '8px',
                cursor: roastEventButtonsEnabled ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Second Crack</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: roastEvents.secondCrack ? '#22c55e' : '#9ca3af' }}>
                {roastEvents.secondCrack ? `${Math.floor(roastEvents.secondCrack/60)}:${(roastEvents.secondCrack%60).toString().padStart(2,'0')}` : '—'}
              </div>
            </button>
            
            <button
              onClick={() => handleRoastEventClick('drop')}
              style={{
                padding: '12px',
                textAlign: 'center',
                backgroundColor: roastEvents.drop ? '#dcfce7' : (!session ? '#fef3c7' : '#f9fafb'),
                border: `2px solid ${roastEvents.drop ? '#22c55e' : (!session ? '#f59e0b' : '#d1d5db')}`,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>
                {!session ? 'Drop (Start Roast)' : 'Drop'}
              </div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: roastEvents.drop ? '#22c55e' : (!session ? '#f59e0b' : '#9ca3af') }}>
                {roastEvents.drop ? `${Math.floor(roastEvents.drop/60)}:${(roastEvents.drop%60).toString().padStart(2,'0')}` : (!session ? '▶️' : '—')}
              </div>
            </button>
          </div>
          {Object.keys(roastEvents).length > 0 && (
            <button
              onClick={() => setRoastEvents({})}
              style={{
                marginTop: '12px',
                padding: '6px 12px',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Clear All Events
            </button>
          )}
        </div>
      )}

      {/* Controls */}
      <RoastControls
        deviceId={deviceId}
        session={session}
        onSessionChange={onSessionChange}
        loadedProfile={loadedProfile}
        profileFollowMode={profileFollowMode}
        onProfileFollowModeChange={setProfileFollowMode}
        sessionStartTime={sessionStartTime}
        startMutation={startMutation}
      />


      <div style={{ marginTop: '20px', textAlign: 'center', display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button
          onClick={() => setShowProfileManager(!showProfileManager)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          {showProfileManager ? 'Hide' : 'Manage'} Profiles
        </button>
        <button
          onClick={() => setShowProfileImporter(true)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#8b5cf6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          📊 Import Artisan Profile
        </button>
      </div>

      {/* Profile Manager Modal */}
      {showProfileManager && (
        <ProfileManager
          profiles={profiles}
          selectedProfile={selectedProfile}
          onProfileSelect={setSelectedProfile}
          onClose={() => setShowProfileManager(false)}
        />
      )}

      {/* Profile Importer Modal */}
      {showProfileImporter && (
        <ProfileImporter
          onProfileLoaded={(profile) => {
            setLoadedProfile(profile)
            setShowProfileImporter(false)
          }}
          onClose={() => setShowProfileImporter(false)}
        />
      )}
    </div>
  )
}