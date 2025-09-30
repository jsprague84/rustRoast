import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { TelemetryChart } from './TelemetryChart'

export function RoastControl({ deviceId }: { deviceId: string }) {
  const [setpoint, setSetpoint] = useState(200)
  const [fanPWM, setFanPWM] = useState(150)
  const [heaterPWM, setHeaterPWM] = useState(50)
  const [pidKp, setPidKp] = useState(2.0)
  const [pidKi, setPidKi] = useState(5.0)
  const [pidKd, setPidKd] = useState(1.0)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [profileFollowMode, setProfileFollowMode] = useState(false)
  const [roastStartTime, setRoastStartTime] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const queryClient = useQueryClient()

  // Update current time every second to keep timer advancing
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Query for real-time telemetry data using the same pattern as AutoTune
  const { data: latestTelemetry } = useQuery({
    queryKey: ['telemetry_latest', deviceId],
    queryFn: () => api.latestTelemetry(deviceId),
    refetchInterval: 1000,
    staleTime: 500
  })

  // Query for profiles list (include both public and private)
  const { data: profiles } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.listProfiles(true), // Include private profiles
    staleTime: 30000 // Cache for 30 seconds
  })

  // Query for selected profile details
  const { data: selectedProfile } = useQuery({
    queryKey: ['profile', selectedProfileId],
    queryFn: () => selectedProfileId ? api.getProfile(selectedProfileId) : null,
    enabled: !!selectedProfileId,
    staleTime: 300000 // Cache for 5 minutes
  })

  // Calculate optimal time window based on profile duration
  const chartTimeWindow = useMemo(() => {
    if (selectedProfile) {
      // Get profile duration and add 20% buffer for better visualization
      const profileDuration = selectedProfile.points.length > 0
        ? Math.max(...selectedProfile.points.map(p => p.time_seconds))
        : 1800 // Default 30 min
      const bufferTime = Math.max(600, profileDuration * 0.2) // At least 10 min buffer
      return Math.ceil(profileDuration + bufferTime)
    }
    return 3600 // Default 1 hour when no profile selected
  }, [selectedProfile])

  // Query for telemetry history for charting - adaptive time window
  const { data: telemetryHistory } = useQuery({
    queryKey: ['telemetry_history', deviceId, chartTimeWindow],
    queryFn: () => api.telemetryHistory(deviceId, chartTimeWindow, 500), // Adaptive window, more points for profiles
    refetchInterval: 2000, // Slower refresh for history
    staleTime: 1000
  })

  // Mutations for control commands - following exact AutoTune pattern
  const setpointMutation = useMutation({
    mutationFn: (value: number) => api.setSetpoint(deviceId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telemetry_latest', deviceId] })
    }
  })

  const fanMutation = useMutation({
    mutationFn: (value: number) => api.setFanPwm(deviceId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telemetry_latest', deviceId] })
    }
  })

  const heaterPwmMutation = useMutation({
    mutationFn: (value: number) => api.setHeaterPwm(deviceId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telemetry_latest', deviceId] })
    }
  })

  const heaterEnableMutation = useMutation({
    mutationFn: (enabled: boolean) => api.setHeaterEnable(deviceId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telemetry_latest', deviceId] })
    }
  })

  const modeMutation = useMutation({
    mutationFn: (mode: 'auto' | 'manual') => api.setMode(deviceId, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telemetry_latest', deviceId] })
    }
  })

  const pidMutation = useMutation({
    mutationFn: () => api.setPid(deviceId, pidKp, pidKi, pidKd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telemetry_latest', deviceId] })
    }
  })

  // Auto-hide success indicators after 3 seconds
  useEffect(() => {
    if (setpointMutation.isSuccess) {
      const timer = setTimeout(() => setpointMutation.reset(), 3000)
      return () => clearTimeout(timer)
    }
  }, [setpointMutation.isSuccess])

  useEffect(() => {
    if (fanMutation.isSuccess) {
      const timer = setTimeout(() => fanMutation.reset(), 3000)
      return () => clearTimeout(timer)
    }
  }, [fanMutation.isSuccess])

  useEffect(() => {
    if (heaterPwmMutation.isSuccess) {
      const timer = setTimeout(() => heaterPwmMutation.reset(), 3000)
      return () => clearTimeout(timer)
    }
  }, [heaterPwmMutation.isSuccess])

  useEffect(() => {
    if (heaterEnableMutation.isSuccess) {
      const timer = setTimeout(() => heaterEnableMutation.reset(), 3000)
      return () => clearTimeout(timer)
    }
  }, [heaterEnableMutation.isSuccess])

  useEffect(() => {
    if (modeMutation.isSuccess) {
      const timer = setTimeout(() => modeMutation.reset(), 3000)
      return () => clearTimeout(timer)
    }
  }, [modeMutation.isSuccess])

  useEffect(() => {
    if (pidMutation.isSuccess) {
      const timer = setTimeout(() => pidMutation.reset(), 3000)
      return () => clearTimeout(timer)
    }
  }, [pidMutation.isSuccess])

  // Extract current readings from telemetry - clean and simple
  const currentReadings = useMemo(() => {
    const telemetry = latestTelemetry?.telemetry
    if (!telemetry) {
      return {
        beanTemp: 0,
        envTemp: 0,
        fanPWM: 0,
        heaterPWM: 0,
        setpoint: 0,
        heaterEnable: false,
        controlMode: 'manual' as const,
        rateOfRise: 0,
        Kp: 0,
        Ki: 0,
        Kd: 0
      }
    }

    return {
      beanTemp: telemetry.beanTemp || 0,
      envTemp: telemetry.envTemp || 0,
      fanPWM: telemetry.fanPWM || 0,
      heaterPWM: telemetry.heaterPWM || 0,
      setpoint: telemetry.setpoint || 0,
      heaterEnable: telemetry.heaterEnable === 1 || telemetry.heaterEnable === "1" || telemetry.heaterEnable === true || telemetry.heaterEnable === "true",
      controlMode: (() => {
        const mode = telemetry.controlMode
        if (mode === 1 || mode === "1" || mode === "auto" || mode === "AUTO") return 'auto'
        return 'manual'
      })(),
      rateOfRise: telemetry.rateOfRise || 0,
      Kp: telemetry.Kp || 0,
      Ki: telemetry.Ki || 0,
      Kd: telemetry.Kd || 0
    }
  }, [latestTelemetry?.telemetry])

  // Calculate elapsed time and profile-based setpoint
  const roastingStatus = useMemo(() => {
    const elapsedSeconds = roastStartTime ? Math.floor((currentTime - roastStartTime) / 1000) : 0

    let targetTempFromProfile = null
    let nextProfilePoint = null

    if (selectedProfile && profileFollowMode && roastStartTime) {
      const points = selectedProfile.points.sort((a, b) => a.time_seconds - b.time_seconds)

      // Find target temperature based on elapsed time
      if (elapsedSeconds <= 0) {
        targetTempFromProfile = points[0]?.target_temp || null
      } else {
        // Find the current profile segment
        let currentPoint = null
        let nextPoint = null

        for (let i = 0; i < points.length; i++) {
          if (points[i].time_seconds <= elapsedSeconds) {
            currentPoint = points[i]
            nextPoint = points[i + 1] || null
          } else {
            break
          }
        }

        if (currentPoint && nextPoint) {
          // Interpolate between current and next point
          const timeDiff = nextPoint.time_seconds - currentPoint.time_seconds
          const tempDiff = nextPoint.target_temp - currentPoint.target_temp
          const timeProgress = elapsedSeconds - currentPoint.time_seconds
          const tempProgress = (timeProgress / timeDiff) * tempDiff
          targetTempFromProfile = currentPoint.target_temp + tempProgress
          nextProfilePoint = nextPoint
        } else if (currentPoint) {
          // Use current point if we're past the last point or between segments
          targetTempFromProfile = currentPoint.target_temp
        }
      }
    }

    return {
      elapsedSeconds,
      targetTempFromProfile,
      nextProfilePoint,
      isRoastActive: !!roastStartTime
    }
  }, [roastStartTime, selectedProfile, profileFollowMode, currentTime])

  // Auto-update setpoint when following profile
  useEffect(() => {
    if (roastingStatus.targetTempFromProfile && profileFollowMode && currentReadings.controlMode === 'auto') {
      const roundedTarget = Math.round(roastingStatus.targetTempFromProfile)
      if (Math.abs(setpoint - roundedTarget) > 1) { // Only update if difference > 1°C to avoid constant updates
        setSetpoint(roundedTarget)
        setpointMutation.mutate(roundedTarget)
      }
    }
  }, [roastingStatus.targetTempFromProfile, profileFollowMode, currentReadings.controlMode, setpoint])

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['telemetry_latest', deviceId] })
  }, [queryClient, deviceId])

  // Helper function to format time
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [])

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#f8fafc',
        borderRadius: '12px',
        border: '1px solid #e5e7eb'
      }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '700', color: '#1f2937' }}>
          ☕ Coffee Roaster Control
        </h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
            Real-time control for device: <strong>{deviceId}</strong>
          </p>
          <button
            onClick={refreshData}
            style={{
              padding: '6px 12px',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#374151',
              cursor: 'pointer'
            }}
          >
            🔄 Refresh Data
          </button>
        </div>
      </div>

      {/* Real-time Readings Display */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
          📊 Current Readings
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px'
        }}>
          <div style={{
            padding: '12px',
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '12px', color: '#92400e', fontWeight: '500' }}>Bean Temperature</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#92400e' }}>
              {currentReadings.beanTemp.toFixed(1)}°C
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: '#dbeafe',
            border: '1px solid #3b82f6',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: '500' }}>Environment Temperature</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e40af' }}>
              {currentReadings.envTemp.toFixed(1)}°C
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #0ea5e9',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '12px', color: '#0c4a6e', fontWeight: '500' }}>Fan Speed</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#0c4a6e' }}>
              {currentReadings.fanPWM} ({Math.round(currentReadings.fanPWM * 100 / 255)}%)
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #ef4444',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '500' }}>Heater Power</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#dc2626' }}>
              {currentReadings.heaterPWM}%
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #10b981',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '12px', color: '#059669', fontWeight: '500' }}>Rate of Rise</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#059669' }}>
              {currentReadings.rateOfRise.toFixed(1)}°C/min
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: '#faf5ff',
            border: '1px solid #8b5cf6',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '12px', color: '#7c3aed', fontWeight: '500' }}>Setpoint</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#7c3aed' }}>
              {currentReadings.setpoint.toFixed(1)}°C
            </div>
          </div>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{
            padding: '8px 12px',
            backgroundColor: currentReadings.heaterEnable ? '#10b981' : '#6b7280',
            color: 'white',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500'
          }}>
            Heater: {currentReadings.heaterEnable ? 'ENABLED' : 'DISABLED'}
          </div>
          <div style={{
            padding: '8px 12px',
            backgroundColor: currentReadings.controlMode === 'auto' ? '#3b82f6' : '#f59e0b',
            color: 'white',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500'
          }}>
            Mode: {String(currentReadings.controlMode).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Control Modes */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
          🎛️ Control Mode
        </h2>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => modeMutation.mutate('auto')}
            disabled={modeMutation.isPending || currentReadings.controlMode === 'auto'}
            style={{
              padding: '8px 16px',
              backgroundColor: currentReadings.controlMode === 'auto' ? '#3b82f6' : '#e5e7eb',
              color: currentReadings.controlMode === 'auto' ? 'white' : '#6b7280',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: modeMutation.isPending ? 'not-allowed' : 'pointer',
              opacity: modeMutation.isPending ? 0.6 : 1
            }}
          >
            🤖 Auto Mode (PID)
          </button>

          <button
            onClick={() => modeMutation.mutate('manual')}
            disabled={modeMutation.isPending || currentReadings.controlMode === 'manual'}
            style={{
              padding: '8px 16px',
              backgroundColor: currentReadings.controlMode === 'manual' ? '#f59e0b' : '#e5e7eb',
              color: currentReadings.controlMode === 'manual' ? 'white' : '#6b7280',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: modeMutation.isPending ? 'not-allowed' : 'pointer',
              opacity: modeMutation.isPending ? 0.6 : 1
            }}
          >
            ✋ Manual Mode
          </button>

          <div style={{
            marginLeft: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={currentReadings.heaterEnable}
                onChange={e => heaterEnableMutation.mutate(e.target.checked)}
                disabled={heaterEnableMutation.isPending}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                Heater Enable
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Auto Mode Controls */}
      {currentReadings.controlMode === 'auto' && (
        <div style={{
          marginBottom: '24px',
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
            🤖 Auto Mode (PID) Controls
          </h2>

          {/* Setpoint Control */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
              <label style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                minWidth: '120px'
              }}>
                Target Temperature:
              </label>
              <input
                type="number"
                value={setpoint}
                onChange={e => setSetpoint(parseFloat(e.target.value))}
                min="50"
                max="300"
                step="5"
                disabled={setpointMutation.isPending}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  width: '80px',
                  backgroundColor: setpointMutation.isPending ? '#f9fafb' : 'white'
                }}
              />
              <span style={{ fontSize: '14px', color: '#6b7280' }}>°C</span>
              <button
                onClick={() => setpointMutation.mutate(setpoint)}
                disabled={setpointMutation.isPending}
                style={{
                  padding: '6px 12px',
                  backgroundColor: setpointMutation.isPending ? '#9ca3af' : '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: setpointMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: setpointMutation.isPending ? 0.6 : 1
                }}
              >
                {setpointMutation.isPending ? '⏳' : '🎯 Set'}
              </button>
            </div>
          </div>

          {/* PID Parameters */}
          <div style={{
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6'
          }}>
            <h3 style={{
              margin: '0 0 12px 0',
              fontSize: '16px',
              fontWeight: '600',
              color: '#1f2937'
            }}>
              ⚙️ PID Parameters (Current: Kp={currentReadings.Kp.toFixed(1)}, Ki={currentReadings.Ki.toFixed(1)}, Kd={currentReadings.Kd.toFixed(1)})
            </h3>

            <div style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'end',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  minWidth: '30px'
                }}>
                  Kp:
                </label>
                <input
                  type="number"
                  value={pidKp}
                  onChange={e => setPidKp(parseFloat(e.target.value) || 0)}
                  min="0"
                  max="100"
                  step="0.1"
                  disabled={pidMutation.isPending}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    width: '80px',
                    backgroundColor: pidMutation.isPending ? '#f9fafb' : 'white'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  minWidth: '30px'
                }}>
                  Ki:
                </label>
                <input
                  type="number"
                  value={pidKi}
                  onChange={e => setPidKi(parseFloat(e.target.value) || 0)}
                  min="0"
                  max="100"
                  step="0.1"
                  disabled={pidMutation.isPending}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    width: '80px',
                    backgroundColor: pidMutation.isPending ? '#f9fafb' : 'white'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  minWidth: '30px'
                }}>
                  Kd:
                </label>
                <input
                  type="number"
                  value={pidKd}
                  onChange={e => setPidKd(parseFloat(e.target.value) || 0)}
                  min="0"
                  max="100"
                  step="0.1"
                  disabled={pidMutation.isPending}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    width: '80px',
                    backgroundColor: pidMutation.isPending ? '#f9fafb' : 'white'
                  }}
                />
              </div>

              <button
                onClick={() => pidMutation.mutate()}
                disabled={pidMutation.isPending}
                style={{
                  padding: '8px 16px',
                  backgroundColor: pidMutation.isPending ? '#9ca3af' : '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: pidMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: pidMutation.isPending ? 0.6 : 1
                }}
              >
                {pidMutation.isPending ? '⏳ Applying...' : '⚙️ Apply PID Values'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Mode Controls */}
      {currentReadings.controlMode === 'manual' && (
        <div style={{
          marginBottom: '24px',
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
            ✋ Manual Mode Controls
          </h2>

          {/* Heater PWM Control */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <label style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                minWidth: '120px'
              }}>
                Heater Power:
              </label>
              <input
                type="range"
                value={heaterPWM}
                onChange={e => setHeaterPWM(parseInt(e.target.value))}
                min="0"
                max="100"
                step="1"
                disabled={heaterPwmMutation.isPending}
                style={{
                  width: '120px',
                  marginRight: '8px'
                }}
              />
              <input
                type="number"
                value={heaterPWM}
                onChange={e => setHeaterPWM(parseInt(e.target.value))}
                min="0"
                max="100"
                step="1"
                disabled={heaterPwmMutation.isPending}
                style={{
                  padding: '4px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px',
                  width: '60px',
                  backgroundColor: heaterPwmMutation.isPending ? '#f9fafb' : 'white'
                }}
              />
              <span style={{ fontSize: '12px', color: '#6b7280' }}>%</span>
              <button
                onClick={() => heaterPwmMutation.mutate(heaterPWM)}
                disabled={heaterPwmMutation.isPending}
                style={{
                  padding: '6px 12px',
                  backgroundColor: heaterPwmMutation.isPending ? '#9ca3af' : '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: heaterPwmMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: heaterPwmMutation.isPending ? 0.6 : 1
                }}
              >
                {heaterPwmMutation.isPending ? '⏳' : '🔥 Set'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fan Control (available in both modes) */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
          🌪️ Fan Control
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <label style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            minWidth: '120px'
          }}>
            Fan Speed:
          </label>
          <input
            type="range"
            value={fanPWM}
            onChange={e => setFanPWM(parseInt(e.target.value))}
            min="0"
            max="255"
            step="5"
            disabled={fanMutation.isPending}
            style={{
              width: '120px',
              marginRight: '8px'
            }}
          />
          <input
            type="number"
            value={fanPWM}
            onChange={e => setFanPWM(parseInt(e.target.value))}
            min="0"
            max="255"
            step="5"
            disabled={fanMutation.isPending}
            style={{
              padding: '4px 8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '12px',
              width: '60px',
              backgroundColor: fanMutation.isPending ? '#f9fafb' : 'white'
            }}
          />
          <button
            onClick={() => fanMutation.mutate(fanPWM)}
            disabled={fanMutation.isPending}
            style={{
              padding: '6px 12px',
              backgroundColor: fanMutation.isPending ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: fanMutation.isPending ? 'not-allowed' : 'pointer',
              opacity: fanMutation.isPending ? 0.6 : 1
            }}
          >
            {fanMutation.isPending ? '⏳' : '🌪️ Set'}
          </button>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            ({Math.round(fanPWM * 100 / 255)}%)
          </span>
        </div>
      </div>

      {/* Real-time Chart and Profile Management */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
          📈 Real-time Chart & Profile Management
        </h2>

        {/* Profile Selection */}
        <div style={{ marginBottom: '16px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              minWidth: '80px'
            }}>
              Profile:
            </label>
            <select
              value={selectedProfileId || ''}
              onChange={e => setSelectedProfileId(e.target.value || null)}
              style={{
                padding: '6px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                minWidth: '200px',
                backgroundColor: 'white'
              }}
            >
              <option value="">No profile selected</option>
              {profiles?.map(profile => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>

          {selectedProfile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={profileFollowMode}
                  onChange={e => setProfileFollowMode(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  Follow Profile
                </span>
              </label>
            </div>
          )}

          {selectedProfile && (
            <div style={{
              padding: '6px 12px',
              backgroundColor: '#f0f9ff',
              border: '1px solid #0ea5e9',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#0c4a6e'
            }}>
              {selectedProfile.points.length} points • Target: {selectedProfile.profile.target_end_temp}°C
            </div>
          )}
        </div>

        {/* Chart */}
        <div style={{
          height: '400px',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <TelemetryChart
            points={telemetryHistory?.items || []}
            profile={selectedProfile}
            sessionStartTime={roastStartTime ? roastStartTime / 1000 : undefined}
            showExportControls={false}
            annotations={roastingStatus.isRoastActive && profileFollowMode && roastingStatus.targetTempFromProfile ? [{
              id: 'current-profile-position',
              type: 'vertical' as const,
              time: roastingStatus.elapsedSeconds,
              color: '#ef4444',
              label: `${Math.round(roastingStatus.targetTempFromProfile)}°C target`,
              showLabel: true
            }] : []}
            key={`${deviceId}-roast-chart-${selectedProfileId}-${roastStartTime}`}
          />
        </div>
      </div>

      {/* Roast Timer and Profile Following Controls */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
          ⏱️ Roast Timer & Profile Following
        </h2>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Timer Display */}
          <div style={{
            padding: '12px 16px',
            backgroundColor: roastingStatus.isRoastActive ? '#fef3c7' : '#f9fafb',
            border: `1px solid ${roastingStatus.isRoastActive ? '#f59e0b' : '#e5e7eb'}`,
            borderRadius: '8px',
            minWidth: '120px'
          }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
              Roast Time
            </div>
            <div style={{
              fontSize: '20px',
              fontWeight: '700',
              color: roastingStatus.isRoastActive ? '#92400e' : '#6b7280'
            }}>
              {formatTime(roastingStatus.elapsedSeconds)}
            </div>
          </div>

          {/* Start/Stop Controls */}
          <div style={{ display: 'flex', gap: '12px' }}>
            {!roastingStatus.isRoastActive ? (
              <button
                onClick={() => setRoastStartTime(Date.now())}
                style={{
                  padding: '10px 20px',
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
                }}
              >
                ▶️ Start Roast
              </button>
            ) : (
              <button
                onClick={() => setRoastStartTime(null)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                ⏹️ Stop Roast
              </button>
            )}
          </div>

          {/* Profile Following Status */}
          {profileFollowMode && selectedProfile && roastingStatus.isRoastActive && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#f0f9ff',
              border: '1px solid #0ea5e9',
              borderRadius: '8px',
              flex: '1',
              minWidth: '300px'
            }}>
              <div style={{ fontSize: '12px', color: '#0c4a6e', marginBottom: '8px' }}>
                Following Profile: <strong>{selectedProfile.name}</strong>
              </div>

              {roastingStatus.targetTempFromProfile && (
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#0c4a6e' }}>Target: </span>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: '#0c4a6e' }}>
                      {Math.round(roastingStatus.targetTempFromProfile)}°C
                    </span>
                  </div>

                  <div>
                    <span style={{ fontSize: '12px', color: '#0c4a6e' }}>Current: </span>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: '#0c4a6e' }}>
                      {Math.round(currentReadings.beanTemp)}°C
                    </span>
                  </div>

                  <div>
                    <span style={{ fontSize: '12px', color: '#0c4a6e' }}>Diff: </span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: Math.abs(currentReadings.beanTemp - roastingStatus.targetTempFromProfile) > 10 ? '#dc2626' : '#059669'
                    }}>
                      {Math.round(currentReadings.beanTemp - roastingStatus.targetTempFromProfile) > 0 ? '+' : ''}
                      {Math.round(currentReadings.beanTemp - roastingStatus.targetTempFromProfile)}°C
                    </span>
                  </div>
                </div>
              )}

              {roastingStatus.nextProfilePoint && (
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                  Next: {Math.round(roastingStatus.nextProfilePoint.target_temp)}°C at {formatTime(roastingStatus.nextProfilePoint.time_seconds)}
                </div>
              )}
            </div>
          )}

          {/* Profile Selection Hint */}
          {!selectedProfile && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#92400e'
            }}>
              💡 Select a profile above to enable automatic temperature following
            </div>
          )}
        </div>
      </div>

      {/* Status Messages - exactly like AutoTune */}
      {(setpointMutation.isPending || setpointMutation.isError || setpointMutation.isSuccess) && (
        <div style={{
          marginBottom: '12px',
          padding: '8px 12px',
          backgroundColor: setpointMutation.isPending ? '#fef3c7' : setpointMutation.isError ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${setpointMutation.isPending ? '#f59e0b' : setpointMutation.isError ? '#ef4444' : '#10b981'}`,
          borderRadius: '6px',
          fontSize: '14px',
          color: setpointMutation.isPending ? '#92400e' : setpointMutation.isError ? '#dc2626' : '#059669'
        }}>
          {setpointMutation.isPending ? '⏳ Setting setpoint...' :
           setpointMutation.isError ? '❌ Setpoint command failed' :
           '✅ Setpoint set successfully'}
        </div>
      )}

      {(fanMutation.isPending || fanMutation.isError || fanMutation.isSuccess) && (
        <div style={{
          marginBottom: '12px',
          padding: '8px 12px',
          backgroundColor: fanMutation.isPending ? '#fef3c7' : fanMutation.isError ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${fanMutation.isPending ? '#f59e0b' : fanMutation.isError ? '#ef4444' : '#10b981'}`,
          borderRadius: '6px',
          fontSize: '14px',
          color: fanMutation.isPending ? '#92400e' : fanMutation.isError ? '#dc2626' : '#059669'
        }}>
          {fanMutation.isPending ? '⏳ Setting fan speed...' :
           fanMutation.isError ? '❌ Fan command failed' :
           '✅ Fan speed set successfully'}
        </div>
      )}

      {(heaterPwmMutation.isPending || heaterPwmMutation.isError || heaterPwmMutation.isSuccess) && (
        <div style={{
          marginBottom: '12px',
          padding: '8px 12px',
          backgroundColor: heaterPwmMutation.isPending ? '#fef3c7' : heaterPwmMutation.isError ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${heaterPwmMutation.isPending ? '#f59e0b' : heaterPwmMutation.isError ? '#ef4444' : '#10b981'}`,
          borderRadius: '6px',
          fontSize: '14px',
          color: heaterPwmMutation.isPending ? '#92400e' : heaterPwmMutation.isError ? '#dc2626' : '#059669'
        }}>
          {heaterPwmMutation.isPending ? '⏳ Setting heater power...' :
           heaterPwmMutation.isError ? '❌ Heater command failed' :
           '✅ Heater power set successfully'}
        </div>
      )}

      {(heaterEnableMutation.isPending || heaterEnableMutation.isError || heaterEnableMutation.isSuccess) && (
        <div style={{
          marginBottom: '12px',
          padding: '8px 12px',
          backgroundColor: heaterEnableMutation.isPending ? '#fef3c7' : heaterEnableMutation.isError ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${heaterEnableMutation.isPending ? '#f59e0b' : heaterEnableMutation.isError ? '#ef4444' : '#10b981'}`,
          borderRadius: '6px',
          fontSize: '14px',
          color: heaterEnableMutation.isPending ? '#92400e' : heaterEnableMutation.isError ? '#dc2626' : '#059669'
        }}>
          {heaterEnableMutation.isPending ? '⏳ Setting heater enable...' :
           heaterEnableMutation.isError ? '❌ Heater enable command failed' :
           '✅ Heater enable set successfully'}
        </div>
      )}

      {(modeMutation.isPending || modeMutation.isError || modeMutation.isSuccess) && (
        <div style={{
          marginBottom: '12px',
          padding: '8px 12px',
          backgroundColor: modeMutation.isPending ? '#fef3c7' : modeMutation.isError ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${modeMutation.isPending ? '#f59e0b' : modeMutation.isError ? '#ef4444' : '#10b981'}`,
          borderRadius: '6px',
          fontSize: '14px',
          color: modeMutation.isPending ? '#92400e' : modeMutation.isError ? '#dc2626' : '#059669'
        }}>
          {modeMutation.isPending ? '⏳ Setting control mode...' :
           modeMutation.isError ? '❌ Mode command failed' :
           '✅ Control mode set successfully'}
        </div>
      )}

      {(pidMutation.isPending || pidMutation.isError || pidMutation.isSuccess) && (
        <div style={{
          marginBottom: '12px',
          padding: '8px 12px',
          backgroundColor: pidMutation.isPending ? '#fef3c7' : pidMutation.isError ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${pidMutation.isPending ? '#f59e0b' : pidMutation.isError ? '#ef4444' : '#10b981'}`,
          borderRadius: '6px',
          fontSize: '14px',
          color: pidMutation.isPending ? '#92400e' : pidMutation.isError ? '#dc2626' : '#059669'
        }}>
          {pidMutation.isPending ? '⏳ Applying PID parameters...' :
           pidMutation.isError ? '❌ PID parameter update failed' :
           '✅ PID parameters applied successfully'}
        </div>
      )}
    </div>
  )
}