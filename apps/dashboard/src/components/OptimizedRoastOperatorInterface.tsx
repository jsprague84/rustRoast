import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ProfileWithPoints, RoastSession } from '../api/client'
import { useTelemetryWS, useWsStore } from '../ws/useTelemetryWS'
import { RoastEventControls } from './RoastEventControls'
import { ProfileManager } from './ProfileManager'

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

// Throttle function for performance optimization
function useThrottledValue<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value)
  const lastExecuted = useRef<number>(Date.now())

  useEffect(() => {
    const handler = () => {
      const now = Date.now()
      if (now >= lastExecuted.current + delay) {
        setThrottledValue(value)
        lastExecuted.current = now
      }
    }

    const timer = setTimeout(handler, delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return throttledValue
}

function RoastControls({ 
  deviceId, 
  session, 
  onSessionChange 
}: { 
  deviceId: string
  session?: RoastSession 
  onSessionChange?: (sessionId?: string) => void
}) {
  const queryClient = useQueryClient()
  const [controlMode, setControlMode] = useState<ControlMode>('auto')
  const [manualControls, setManualControls] = useState({
    setpoint: 200,
    heaterPwm: 0,
    fanPwm: 100,
    heaterEnable: false
  })

  // Control mutations
  const setpointMutation = useMutation({
    mutationFn: (value: number) => api.setSetpoint(deviceId, value),
  })
  
  const fanMutation = useMutation({
    mutationFn: (value: number) => api.setFanPwm(deviceId, value),
  })
  
  const heaterMutation = useMutation({
    mutationFn: (value: number) => api.setHeaterPwm(deviceId, value),
  })
  
  const modeMutation = useMutation({
    mutationFn: (mode: ControlMode) => api.setMode(deviceId, mode),
  })
  
  const heaterEnableMutation = useMutation({
    mutationFn: (enabled: boolean) => api.setHeaterEnable(deviceId, enabled),
  })

  // Session mutations
  const startMutation = useMutation({
    mutationFn: api.startSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      onSessionChange?.(session?.id)
    }
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
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '20px',
      padding: '20px',
      backgroundColor: '#f8fafc',
      borderRadius: '12px',
      border: '1px solid #e5e7eb'
    }}>
      {/* Session Controls */}
      <div>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
          Session Control
        </h3>
        
        {session && (
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'white', borderRadius: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
              {session.name}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Status: <span style={{ 
                color: session.status === 'active' ? '#10b981' : session.status === 'paused' ? '#f59e0b' : '#6b7280',
                fontWeight: '500',
                textTransform: 'capitalize'
              }}>
                {session.status}
              </span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {session?.status === 'planning' && (
            <button
              onClick={() => session && startMutation.mutate(session.id)}
              disabled={startMutation.isPending}
              style={{
                padding: '8px 16px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer'
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
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                ⏸️ Pause
              </button>
              <button
                onClick={() => session && completeMutation.mutate(session.id)}
                disabled={completeMutation.isPending}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer'
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
              style={{
                padding: '8px 16px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              ▶️ Resume
            </button>
          )}
        </div>
      </div>

      {/* Roaster Controls */}
      <div>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
          Roaster Control
        </h3>
        
        {/* Control Mode */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
            Control Mode
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['auto', 'manual'] as ControlMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => handleControlChange('mode', mode)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: controlMode === mode ? '#3b82f6' : '#f3f4f6',
                  color: controlMode === mode ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Setpoint (Auto mode) */}
        {controlMode === 'auto' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
              Target Temperature: {manualControls.setpoint}°C
            </label>
            <input
              type="range"
              min="0"
              max="250"
              value={manualControls.setpoint}
              onChange={e => {
                const value = parseInt(e.target.value)
                setManualControls(prev => ({ ...prev, setpoint: value }))
                handleControlChange('setpoint', value)
              }}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Manual Controls */}
        {controlMode === 'manual' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                Heater PWM: {manualControls.heaterPwm}%
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
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                Fan PWM: {manualControls.fanPwm}
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
          </div>
        )}

        {/* Heater Enable */}
        <div style={{ marginTop: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={manualControls.heaterEnable}
              onChange={e => {
                setManualControls(prev => ({ ...prev, heaterEnable: e.target.checked }))
                handleControlChange('heaterEnable', e.target.checked)
              }}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
              Heater Enable
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}

export function OptimizedRoastOperatorInterface({ deviceId, session, onSessionChange }: Props) {
  useTelemetryWS()
  
  // Use throttled values to reduce chart re-renders
  const rawPoints = useWsStore(s => s.data[deviceId] ?? [])
  const throttledPoints = useThrottledValue(rawPoints, 1000) // Update max every 1 second
  
  const connected = useWsStore(s => s.connected)
  const connecting = useWsStore(s => s.connecting)
  const lastError = useWsStore(s => s.lastError)
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null)
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null)
  const [showProfileManager, setShowProfileManager] = useState(false)

  // Optimize queries with longer intervals and better caching
  const { data: latest } = useQuery({ 
    queryKey: ['latest', deviceId], 
    queryFn: () => api.latestTelemetry(deviceId), 
    refetchInterval: 5000, // Reduced from 2000ms
    staleTime: 3000 // Cache for 3 seconds
  })

  // Get profile data if session has one
  const { data: profileData } = useQuery({
    queryKey: ['profile', session?.profile_id],
    queryFn: () => session?.profile_id ? api.getProfile(session.profile_id) : null,
    enabled: !!session?.profile_id,
    staleTime: 5 * 60 * 1000 // Cache for 5 minutes (profiles don't change often)
  })

  // Get available profiles for selection (cached for longer)
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.listProfiles(false),
    staleTime: 2 * 60 * 1000 // Cache for 2 minutes
  })

  // Get roast events if session is active
  const { data: events = [] } = useQuery({
    queryKey: ['roast-events', session?.id],
    queryFn: () => session?.id ? api.getRoastEvents(session.id) : [],
    enabled: !!session?.id,
    refetchInterval: 10000 // Reduced frequency - events don't change that often
  })

  // Calculate session start time (memoized)
  useEffect(() => {
    if (session?.start_time) {
      setSessionStartTime(new Date(session.start_time).getTime() / 1000)
    } else {
      setSessionStartTime(null)
    }
  }, [session?.start_time])

  // Optimize data filtering with better memoization
  const filteredPoints = useMemo(() => {
    if (!throttledPoints.length) return []
    
    const now = Date.now() / 1000
    let windowStart: number
    
    if (sessionStartTime && session?.status === 'active') {
      windowStart = sessionStartTime
    } else {
      windowStart = now - 900 // 15 minutes
    }
    
    // Use more efficient filtering and limit data points
    const filtered = throttledPoints.filter(p => p.ts >= windowStart)
    
    // Limit to last 1000 points to prevent performance issues
    if (filtered.length > 1000) {
      const step = Math.ceil(filtered.length / 1000)
      return filtered.filter((_, index) => index % step === 0)
    }
    
    return filtered
  }, [throttledPoints, sessionStartTime, session?.status])

  // Optimize chart configuration with fewer re-calculations
  const chartOption = useMemo(() => {
    if (filteredPoints.length === 0) {
      return {
        animation: false,
        grid: { left: 60, right: 80, top: 40, bottom: 30 },
        xAxis: { type: 'time' },
        yAxis: [
          { type: 'value', name: 'Temperature (°C)', min: 0, max: 250, position: 'left' },
          { type: 'value', name: 'RoR (°C/min)', position: 'right' },
          { type: 'value', name: 'PWM %', position: 'right', offset: 60, min: 0, max: 100 }
        ],
        series: []
      } as echarts.EChartsOption
    }

    const t = filteredPoints
    const ts = t.map(p => p.ts * 1000)
    const bt = t.map(p => p.telemetry?.beanTemp ?? null)
    const et = t.map(p => p.telemetry?.envTemp ?? null)
    const ror = t.map(p => p.telemetry?.rateOfRise ?? null)
    const setpoint = t.map(p => p.telemetry?.setpoint ?? null)
    const fanPWM = t.map(p => p.telemetry?.fanPWM ?? null)
    const heaterPWM = t.map(p => p.telemetry?.heaterPWM ?? null)
    
    const series: any[] = [
      { name: 'Bean Temp', type: 'line', showSymbol: false, data: ts.map((x, i) => [x, bt[i]]), yAxisIndex: 0, smooth: true, lineStyle: { width: 3, color: '#ef4444' } },
      { name: 'Env Temp', type: 'line', showSymbol: false, data: ts.map((x, i) => [x, et[i]]), yAxisIndex: 0, smooth: true, lineStyle: { width: 2, color: '#3b82f6' } },
      { name: 'Target', type: 'line', showSymbol: false, data: ts.map((x, i) => [x, setpoint[i]]), yAxisIndex: 0, smooth: false, lineStyle: { type: 'dashed', width: 2, color: '#f59e0b' } },
      { name: 'RoR', type: 'line', showSymbol: false, data: ts.map((x, i) => [x, ror[i]]), yAxisIndex: 1, smooth: true, lineStyle: { width: 1, color: '#10b981' } },
      { name: 'Fan %', type: 'line', showSymbol: false, data: ts.map((x, i) => [x, fanPWM[i] ? fanPWM[i] * 100 / 255 : null]), yAxisIndex: 2, smooth: true, lineStyle: { width: 1, color: '#2ca02c' } },
      { name: 'Heater %', type: 'line', showSymbol: false, data: ts.map((x, i) => [x, heaterPWM[i]]), yAxisIndex: 2, smooth: true, lineStyle: { width: 1, color: '#d62728' } }
    ]
    
    // Add event markers (optimized - only if we have events)
    if (sessionStartTime && events.length > 0 && events.length < 50) { // Limit event markers for performance
      const eventTypes = {
        'drop': { color: '#8b5cf6', label: '☕ Drop' },
        'drying_end': { color: '#06b6d4', label: '💨 Drying End' },
        'first_crack_start': { color: '#f59e0b', label: '🔥 1st Crack Start' },
        'first_crack_end': { color: '#f97316', label: '⭐ 1st Crack End' },
        'second_crack_start': { color: '#ef4444', label: '🎆 2nd Crack Start' },
        'second_crack_end': { color: '#dc2626', label: '🔴 2nd Crack End' },
        'development_start': { color: '#10b981', label: '📈 Development Start' },
        'drop_out': { color: '#6b7280', label: '🏁 Drop Out' },
        'custom': { color: '#3b82f6', label: '📝 Custom' }
      }
      
      const markLines = events.map(event => {
        const eventTime = sessionStartTime * 1000 + event.elapsed_seconds * 1000
        const eventConfig = eventTypes[event.event_type as keyof typeof eventTypes] || eventTypes.custom
        
        return {
          name: eventConfig.label,
          xAxis: eventTime,
          lineStyle: {
            color: eventConfig.color,
            width: 2,
            type: 'solid'
          },
          label: {
            formatter: event.notes ? `${eventConfig.label}\n${event.notes}` : eventConfig.label,
            position: 'insideEndTop',
            fontSize: 10,
            fontWeight: 'bold',
            color: eventConfig.color
          }
        }
      })
      
      // Add markLine to the bean temp series
      series[0].markLine = {
        symbol: 'none',
        data: markLines
      }
    }
    
    const legendData = ['Bean Temp', 'Env Temp', 'Target', 'RoR', 'Fan %', 'Heater %']
    
    // Add profile overlay if available
    if (profileData && sessionStartTime) {
      const profileSeries = profileData.points
        .sort((a, b) => a.time_seconds - b.time_seconds)
        .map(point => [
          sessionStartTime * 1000 + point.time_seconds * 1000,
          point.target_temp
        ])
      
      series.push({
        name: 'Profile Target',
        type: 'line',
        showSymbol: true,
        symbolSize: 4,
        data: profileSeries,
        yAxisIndex: 0,
        smooth: true,
        lineStyle: { type: 'solid', width: 2, color: '#9333ea' },
        itemStyle: { color: '#9333ea' }
      })
      
      legendData.push('Profile Target')
    }
    
    return {
      animation: false, // Disable animations for better performance
      tooltip: { 
        trigger: 'axis',
        formatter: (params: any[]) => {
          const time = new Date(params[0].value[0])
          let tooltip = `<div style="font-weight: bold">${time.toLocaleTimeString()}</div>`
          
          params.forEach(param => {
            if (param.value[1] !== null) {
              const value = typeof param.value[1] === 'number' ? param.value[1].toFixed(1) : param.value[1]
              const unit = param.seriesName.includes('Temp') || param.seriesName.includes('Target') ? '°C' : 
                          param.seriesName.includes('RoR') ? '°C/min' :
                          param.seriesName.includes('%') ? '%' : ''
              tooltip += `<div><span style="color: ${param.color}">●</span> ${param.seriesName}: ${value}${unit}</div>`
            }
          })
          
          return tooltip
        }
      },
      legend: { data: legendData, top: 0 },
      grid: { left: 60, right: 80, top: 40, bottom: 30 },
      xAxis: { 
        type: 'time',
        axisLabel: {
          formatter: (value: number) => {
            if (sessionStartTime) {
              const elapsed = Math.floor((value / 1000 - sessionStartTime) / 60)
              return `${elapsed}m`
            }
            return new Date(value).toLocaleTimeString('en-US', { 
              hour12: false, 
              hour: '2-digit', 
              minute: '2-digit' 
            })
          }
        }
      },
      yAxis: [
        { type: 'value', name: 'Temperature (°C)', min: 0, max: 250, position: 'left' },
        { type: 'value', name: 'RoR (°C/min)', position: 'right' },
        { type: 'value', name: 'PWM %', position: 'right', offset: 60, min: 0, max: 100 }
      ],
      series
    } as echarts.EChartsOption
  }, [filteredPoints, profileData, sessionStartTime, events])

  // Current readings
  const currentReadings = latest?.telemetry || {}

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>
          Coffee Roaster Control
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
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
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white', animation: 'pulse 2s infinite' }}></span>
                WebSocket Connected
              </>
            ) : connecting ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
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
            border: '1px solid #e5e7eb'
          }}>
            Device: {deviceId}
          </div>
          
          {/* Data flow indicator */}
          {connected && filteredPoints.length > 0 && (
            <div style={{ 
              fontSize: '11px', 
              color: '#059669',
              backgroundColor: '#ecfdf5',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #a7f3d0'
            }}>
              📊 Data flowing ({filteredPoints.length} points)
            </div>
          )}
        </div>
      </div>

      {/* Current Readings */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Bean Temp</div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#ef4444' }}>
            {currentReadings.beanTemp?.toFixed(1) || '--'}°C
          </div>
        </div>
        <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Env Temp</div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#3b82f6' }}>
            {currentReadings.envTemp?.toFixed(1) || '--'}°C
          </div>
        </div>
        <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Rate of Rise</div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#10b981' }}>
            {currentReadings.rateOfRise?.toFixed(1) || '--'}°C/min
          </div>
        </div>
        <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Heater</div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#d62728' }}>
            {currentReadings.heaterPWM || 0}%
          </div>
        </div>
        <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Fan</div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#2ca02c' }}>
            {currentReadings.fanPWM ? Math.round(currentReadings.fanPWM * 100 / 255) : 0}%
          </div>
        </div>
        {session?.status === 'active' && sessionStartTime && (
          <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Elapsed</div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
              {formatTime(Math.floor(Date.now() / 1000 - sessionStartTime))}
            </div>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <RoastControls
          deviceId={deviceId}
          session={session}
          onSessionChange={onSessionChange}
        />
        
        {/* Profile Manager */}
        <div style={{
          padding: '16px',
          backgroundColor: '#f8fafc',
          borderRadius: '12px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
              Roast Profiles
            </h3>
            <button
              onClick={() => setShowProfileManager(!showProfileManager)}
              style={{
                padding: '6px 12px',
                backgroundColor: showProfileManager ? '#3b82f6' : '#f3f4f6',
                color: showProfileManager ? 'white' : '#374151',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              {showProfileManager ? 'Hide Manager' : 'Manage Profiles'}
            </button>
          </div>
          
          {showProfileManager ? (
            <ProfileManager />
          ) : (
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                Available Profiles: {profiles.length}
              </div>
              {session?.profile_id && profileData && (
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
                    Active: {profileData.profile.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    {profileData.points.length} profile points
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Roast Event Controls */}
      {session && (
        <div style={{ marginBottom: '20px' }}>
          <RoastEventControls
            sessionId={session.id}
            sessionStartTime={sessionStartTime}
            currentTemp={currentReadings.beanTemp}
            disabled={session.status !== 'active'}
          />
        </div>
      )}

      {/* Chart */}
      <div style={{ 
        marginTop: '20px', 
        backgroundColor: 'white', 
        borderRadius: '12px', 
        border: '1px solid #e5e7eb',
        padding: '20px'
      }}>
        <ReactECharts 
          option={chartOption} 
          style={{ height: 500 }} 
          notMerge={false} // Enable merging for better performance
          lazyUpdate={true}
          shouldNotUpdate={(prevProps, props) => {
            // Prevent unnecessary updates if data hasn't significantly changed
            return prevProps.option === props.option
          }}
        />
      </div>
    </div>
  )
}