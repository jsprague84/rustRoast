import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { TelemetryChart } from '../components/TelemetryChart'

export function AutoTune({ deviceId }: { deviceId: string }) {
  const [target, setTarget] = useState(200)
  const [fanPWM, setFanPWM] = useState(150)
  const [pidKp, setPidKp] = useState(2.0)
  const [pidKi, setPidKi] = useState(5.0)
  const [pidKd, setPidKd] = useState(1.0)
  const queryClient = useQueryClient()
  
  const mut = useMutation({ 
    mutationFn: (fn: () => Promise<void>) => fn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto_status', deviceId] })
      queryClient.invalidateQueries({ queryKey: ['auto_results', deviceId] })
    }
  })
  const fanMut = useMutation({ 
    mutationFn: (fn: () => Promise<void>) => fn(),
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
  const pidMutation = useMutation({
    mutationFn: () => api.setPid(deviceId, pidKp, pidKi, pidKd),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telemetry_latest', deviceId] })
    }
  })
  const { data: statusLatest, refetch: refStatus } = useQuery({ 
    queryKey: ['auto_status', deviceId], 
    queryFn: () => api.autotuneStatusLatest(deviceId), 
    refetchInterval: 1000, // Faster refresh for status updates
    staleTime: 0 // Don't cache for real-time status
  })
  const { data: resultsLatest, refetch: refResults } = useQuery({ 
    queryKey: ['auto_results', deviceId], 
    queryFn: () => api.autotuneResultsLatest(deviceId), 
    refetchInterval: 2000, // Faster refresh for results
    staleTime: 0 // Don't cache for real-time results
  })

  const isAutotuneRunning = statusLatest?.state === 'running'
  const hasResults = resultsLatest?.results

  // Optimize telemetry history query - use WebSocket data when possible
  const { data: statusHistory } = useQuery({
    queryKey: ['telemetry_history', deviceId],
    queryFn: () => api.telemetryHistory(deviceId, 3600, 300),
    refetchInterval: isAutotuneRunning ? 2000 : 10000, // Less aggressive polling
    staleTime: 1000, // Cache for 1 second to reduce requests
    enabled: true
  })

  const { data: latestTelemetry } = useQuery({
    queryKey: ['telemetry_latest', deviceId],
    queryFn: () => api.latestTelemetry(deviceId),
    refetchInterval: 1000,
    staleTime: 500 // Cache for 500ms to reduce unnecessary updates
  })

  // Fix heater enable checkbox - handle multiple possible values
  const currentHeaterEnabled = useMemo(() => {
    const heaterEnable = latestTelemetry?.telemetry?.heaterEnable
    // Handle various formats: 1, "1", true, "true"
    return heaterEnable === 1 || heaterEnable === "1" || heaterEnable === true || heaterEnable === "true"
  }, [latestTelemetry?.telemetry?.heaterEnable])

  // Auto-populate PID values when autotune results become available
  useEffect(() => {
    if (hasResults && resultsLatest?.results) {
      const results = resultsLatest.results
      if (results.recommended_kp !== undefined) setPidKp(parseFloat(results.recommended_kp))
      if (results.recommended_ki !== undefined) setPidKi(parseFloat(results.recommended_ki))
      if (results.recommended_kd !== undefined) setPidKd(parseFloat(results.recommended_kd))
    }
  }, [hasResults, resultsLatest?.results])

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
          🎛️ PID AutoTune
        </h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
            Automatically tune PID parameters for device: <strong>{deviceId}</strong>
          </p>
          <button
            onClick={useCallback(() => {
              refStatus()
              refResults()
              queryClient.invalidateQueries({ queryKey: ['telemetry_history', deviceId] })
              queryClient.invalidateQueries({ queryKey: ['telemetry_latest', deviceId] })
            }, [refStatus, refResults, queryClient, deviceId])}
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

      {/* Control Section */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
          AutoTune Controls
        </h2>
        
        <div style={{ 
          display: 'flex', 
          gap: '16px', 
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              value={target} 
              onChange={e => setTarget(parseFloat(e.target.value))}
              min="50"
              max="300"
              step="5"
              disabled={isAutotuneRunning || mut.isPending}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                width: '80px',
                backgroundColor: (isAutotuneRunning || mut.isPending) ? '#f9fafb' : 'white'
              }}
            />
            <span style={{ fontSize: '14px', color: '#6b7280' }}>°C</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              disabled={fanMut.isPending}
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
              disabled={fanMut.isPending}
              style={{
                padding: '4px 8px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '12px',
                width: '60px',
                backgroundColor: fanMut.isPending ? '#f9fafb' : 'white'
              }}
            />
            <button 
              onClick={() => fanMut.mutate(() => api.setFanPwm(deviceId, fanPWM))}
              disabled={fanMut.isPending}
              style={{
                padding: '6px 12px',
                backgroundColor: fanMut.isPending ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: fanMut.isPending ? 'not-allowed' : 'pointer',
                opacity: fanMut.isPending ? 0.6 : 1
              }}
            >
              {fanMut.isPending ? '⏳' : '🌪️ Set'}
            </button>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              ({Math.round(fanPWM * 100 / 255)}%)
            </span>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={currentHeaterEnabled}
                onChange={e => heaterEnableMutation.mutate(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                Heater Enable
              </span>
            </label>
          </div>
        </div>

        {/* PID Parameter Controls */}
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <h3 style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            fontWeight: '600',
            color: '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            ⚙️ PID Parameters
            {hasResults && (
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                backgroundColor: '#10b981',
                color: 'white',
                borderRadius: '8px',
                fontWeight: '500'
              }}>
                AUTO-FILLED
              </span>
            )}
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

        <div style={{
          display: 'flex',
          gap: '12px',
          marginTop: '16px'
        }}>
          <button
            onClick={() => mut.mutate(() => api.autotuneStart(deviceId, target))}
            disabled={isAutotuneRunning || mut.isPending}
            style={{
              padding: '8px 16px',
              backgroundColor: isAutotuneRunning ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: (isAutotuneRunning || mut.isPending) ? 'not-allowed' : 'pointer',
              opacity: (isAutotuneRunning || mut.isPending) ? 0.6 : 1
            }}
          >
            {isAutotuneRunning ? '🔄 Running...' : '🚀 Start AutoTune'}
          </button>

          <button
            onClick={() => mut.mutate(() => api.autotuneStop(deviceId))}
            disabled={mut.isPending}
            style={{
              padding: '8px 16px',
              backgroundColor: isAutotuneRunning ? '#ef4444' : statusLatest?.state === 'complete' ? '#f59e0b' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: mut.isPending ? 'not-allowed' : 'pointer',
              opacity: mut.isPending ? 0.6 : 1
            }}
          >
            {isAutotuneRunning ? '🛑 Stop' : statusLatest?.state === 'complete' ? '🔄 Reset' : '🛑 Stop'}
          </button>

          <button
            onClick={() => mut.mutate(() => api.autotuneApply(deviceId))}
            disabled={!hasResults || isAutotuneRunning || mut.isPending}
            style={{
              padding: '8px 16px',
              backgroundColor: (!hasResults || isAutotuneRunning) ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: (!hasResults || isAutotuneRunning || mut.isPending) ? 'not-allowed' : 'pointer',
              opacity: (!hasResults || isAutotuneRunning || mut.isPending) ? 0.6 : 1
            }}
          >
            ✅ Apply PID Values
          </button>
        </div>

        {/* Status Messages */}
        {mut.isPending && (
          <div style={{ 
            marginTop: '12px', 
            padding: '8px 12px', 
            backgroundColor: '#fef3c7', 
            border: '1px solid #f59e0b',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#92400e'
          }}>
            ⏳ Sending autotune command...
          </div>
        )}
        {mut.isError && (
          <div style={{ 
            marginTop: '12px', 
            padding: '8px 12px', 
            backgroundColor: '#fef2f2', 
            border: '1px solid #ef4444',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#dc2626'
          }}>
            ❌ Autotune command failed
          </div>
        )}
        {mut.isSuccess && (
          <div style={{ 
            marginTop: '12px', 
            padding: '8px 12px', 
            backgroundColor: '#f0fdf4', 
            border: '1px solid #10b981',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#059669'
          }}>
            ✅ Autotune command sent successfully
          </div>
        )}
        {fanMut.isPending && (
          <div style={{ 
            marginTop: '12px', 
            padding: '8px 12px', 
            backgroundColor: '#fef3c7', 
            border: '1px solid #f59e0b',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#92400e'
          }}>
            ⏳ Setting fan speed...
          </div>
        )}
        {fanMut.isError && (
          <div style={{ 
            marginTop: '12px', 
            padding: '8px 12px', 
            backgroundColor: '#fef2f2', 
            border: '1px solid #ef4444',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#dc2626'
          }}>
            ❌ Fan command failed
          </div>
        )}
        {fanMut.isSuccess && (
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #10b981',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#059669'
          }}>
            ✅ Fan speed set successfully
          </div>
        )}
        {pidMutation.isPending && (
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#92400e'
          }}>
            ⏳ Applying PID parameters...
          </div>
        )}
        {pidMutation.isError && (
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#dc2626'
          }}>
            ❌ PID parameter update failed
          </div>
        )}
        {pidMutation.isSuccess && (
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #10b981',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#059669'
          }}>
            ✅ PID parameters applied successfully
          </div>
        )}
      </div>

      {/* Real-time Chart */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ 
          margin: '0 0 16px 0', 
          fontSize: '16px', 
          fontWeight: '600', 
          color: '#1f2937'
        }}>
          📈 Real-time AutoTune Progress
        </h3>
        
        <TelemetryChart
          points={statusHistory?.items || []}
          key={`${deviceId}-autotune-chart`} // Stable key for better performance
        />
      </div>

      {/* Status and Results Display */}
      <div style={{
        display: 'grid', 
        gap: '20px', 
        gridTemplateColumns: '1fr 1fr'
      }}>
        {/* Current Status */}
        <div style={{
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0', 
            fontSize: '16px', 
            fontWeight: '600', 
            color: '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            📊 Current Status
            {isAutotuneRunning && (
              <span style={{
                fontSize: '12px',
                padding: '2px 8px',
                backgroundColor: '#10b981',
                color: 'white',
                borderRadius: '12px',
                fontWeight: '500'
              }}>
                RUNNING
              </span>
            )}
            {statusLatest?.state === 'complete' && (
              <span style={{
                fontSize: '12px',
                padding: '2px 8px',
                backgroundColor: '#f59e0b',
                color: 'white',
                borderRadius: '12px',
                fontWeight: '500'
              }}>
                ⚠️ STUCK - POWER CYCLE NEEDED
              </span>
            )}
          </h3>
          
          {statusLatest ? (
            <div style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              overflowX: 'auto'
            }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(statusLatest, null, 2)}
              </pre>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              color: '#6b7280',
              fontSize: '14px',
              padding: '20px'
            }}>
              No status data available
            </div>
          )}
        </div>

        {/* Tuning Results */}
        <div style={{
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0', 
            fontSize: '16px', 
            fontWeight: '600', 
            color: '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            🎯 Tuning Results
            {hasResults && (
              <span style={{
                fontSize: '12px',
                padding: '2px 8px',
                backgroundColor: '#3b82f6',
                color: 'white',
                borderRadius: '12px',
                fontWeight: '500'
              }}>
                READY
              </span>
            )}
          </h3>
          
          {resultsLatest ? (
            <div style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              overflowX: 'auto'
            }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(resultsLatest, null, 2)}
              </pre>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              color: '#6b7280',
              fontSize: '14px',
              padding: '20px'
            }}>
              No results yet - run AutoTune to generate PID values
            </div>
          )}
        </div>
      </div>

      {/* Help Section */}
      <div style={{
        marginTop: '24px',
        padding: '16px',
        backgroundColor: '#f0f9ff',
        borderRadius: '8px',
        border: '1px solid #0ea5e9'
      }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#0c4a6e' }}>
          💡 AutoTune Instructions
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#0c4a6e' }}>
          <li>Set your desired target temperature (typically 200-250°C for coffee roasting)</li>
          <li>Click "Start AutoTune" - the system will automatically heat up and perform tuning cycles</li>
          <li>Wait for the process to complete (can take 10-20 minutes)</li>
          <li>Once complete, review the results and click "Apply PID Values" to save them</li>
          <li>⚠️ Do not run AutoTune during active roasting sessions</li>
        </ul>
      </div>
    </div>
  )
}