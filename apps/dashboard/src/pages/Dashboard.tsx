import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTelemetryWS, useWsStore } from '../ws/useTelemetryWS'
import { LazyTelemetryChart, usePreloadChart } from '../components/charts/LazyTelemetryChart'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'

export function Dashboard({ deviceId }: { deviceId: string }) {
  // WebSocket telemetry for chart
  useTelemetryWS()
  const points = useWsStore(s => s.data[deviceId] ?? [])
  const [windowSecs, setWindowSecs] = useState(900)

  const filtered = useMemo(() => {
    const cutoff = (Date.now()/1000|0) - windowSecs
    return points.filter(p => p.ts >= cutoff)
  }, [points, windowSecs])

  // Memoized control handlers
  const handleSetpoint = useCallback(() => {
    mut.mutate(() => api.setSetpoint(deviceId, setpoint))
  }, [deviceId, setpoint, mut])

  const handleFanPwm = useCallback(() => {
    mut.mutate(() => api.setFanPwm(deviceId, fan))
  }, [deviceId, fan, mut])

  const handleHeaterPwm = useCallback(() => {
    mut.mutate(() => api.setHeaterPwm(deviceId, heater))
  }, [deviceId, heater, mut])

  const handleMode = useCallback(() => {
    mut.mutate(() => api.setMode(deviceId, mode))
  }, [deviceId, mode, mut])

  const handleHeaterEnable = useCallback(() => {
    mut.mutate(() => api.setHeaterEnable(deviceId, enabled))
  }, [deviceId, enabled, mut])

  const handlePidUpdate = useCallback(() => {
    mut.mutate(() => api.setPid(deviceId, kp, ki, kd))
  }, [deviceId, kp, ki, kd, mut])

  const handleAutotuneStart = useCallback(() => {
    mut.mutate(() => api.autotuneStart(deviceId, autotuneTarget))
  }, [deviceId, autotuneTarget, mut])

  const handleAutotuneStop = useCallback(() => {
    mut.mutate(() => api.autotuneStop(deviceId))
  }, [deviceId, mut])

  const handleAutotuneApply = useCallback(() => {
    mut.mutate(() => api.autotuneApply(deviceId))
  }, [deviceId, mut])

  const handleEmergencyStop = useCallback(() => {
    mut.mutate(() => fetch(`/api/roaster/${deviceId}/control/emergency_stop`, {method: 'POST'}))
  }, [deviceId, mut])

  // Preload chart when component mounts
  const { preloadChart } = usePreloadChart()
  useEffect(() => {
    preloadChart()
  }, [])

  // Device info and current telemetry
  const { data: devices } = useQuery({ queryKey: ['devices'], queryFn: () => api.devices() })
  const { data: latest, refetch } = useQuery({
    queryKey: ['latest', deviceId],
    queryFn: () => api.latestTelemetry(deviceId),
    refetchInterval: 5000
  })

  // Auto-tune queries
  const { data: autotuneStatus } = useQuery({
    queryKey: ['autotune_status', deviceId],
    queryFn: () => api.autotuneStatusLatest(deviceId),
    refetchInterval: 2000
  })
  const { data: autotuneResults } = useQuery({
    queryKey: ['autotune_results', deviceId],
    queryFn: () => api.autotuneResultsLatest(deviceId),
    refetchInterval: 4000
  })

  // Control form state
  const [setpoint, setSetpoint] = useState(200)
  const [fan, setFan] = useState(180)
  const [heater, setHeater] = useState(0)
  const [mode, setMode] = useState<'auto'|'manual'>('auto')
  const [enabled, setEnabled] = useState(false)
  const [kp, setKp] = useState(15)
  const [ki, setKi] = useState(1)
  const [kd, setKd] = useState(25)

  // Auto-tune state
  const [autotuneTarget, setAutotuneTarget] = useState(200)

  // Sync form state only on initial load
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (latest?.telemetry && !initialized) {
      const t = latest.telemetry
      setSetpoint(t.setpoint ?? 200)
      setFan(t.fanPWM ?? 180)
      setHeater(t.heaterPWM ?? 0)
      setMode(t.controlMode === 0 ? 'manual' : 'auto')
      setEnabled(t.heaterEnable === 1)
      setKp(t.Kp ?? 15)
      setKi(t.Ki ?? 1)
      setKd(t.Kd ?? 25)
      setInitialized(true)
    }
  }, [latest, initialized])

  useEffect(() => {
    setInitialized(false)
    refetch()
  }, [deviceId, refetch])

  const mut = useMutation({ mutationFn: (f: () => Promise<void>) => f() })

  const currentDevice = devices?.devices?.find(d => d.device_id === deviceId)

  if (!deviceId) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Coffee Roaster Dashboard</h1>

      {/* Device Status */}
      <Card className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Device: {deviceId}</h2>
          <div className="text-sm text-gray-500">
            {currentDevice && (
              <>RSSI: {currentDevice.rssi}dBm | IP: {currentDevice.ip}</>
            )}
          </div>
        </div>
        {latest && (
          <div className="text-sm text-gray-700 font-mono bg-gray-50 p-3 rounded">
            <strong>Current:</strong> BT {latest.telemetry?.beanTemp}°C | ET {latest.telemetry?.envTemp}°C |
            Setpoint {latest.telemetry?.setpoint}°C | Fan {latest.telemetry?.fanPWM} PWM |
            Heater {latest.telemetry?.heaterPWM}% | Mode {latest.telemetry?.controlMode === 0 ? 'Manual' : 'Auto'} |
            Enable {latest.telemetry?.heaterEnable === 1 ? '✓' : '✗'}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Chart */}
        <Card className="lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Live Telemetry</h3>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">
                Window:
                <select
                  value={windowSecs}
                  onChange={e => setWindowSecs(parseInt(e.target.value))}
                  className="ml-2 px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value={300}>5m</option>
                  <option value={900}>15m</option>
                  <option value={1800}>30m</option>
                  <option value={3600}>1h</option>
                </select>
              </label>
            </div>
          </div>
          <LazyTelemetryChart points={filtered} />
        </Card>

        {/* Controls */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Controls</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Setpoint (°C)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={setpoint}
                  onChange={e => setSetpoint(parseFloat(e.target.value))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <Button onClick={handleSetpoint} loading={mut.isPending}>
                  Apply
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fan PWM (0-255)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={fan}
                  onChange={e => setFan(parseInt(e.target.value))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <Button onClick={handleFanPwm} variant="secondary" loading={mut.isPending}>
                  Apply
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heater PWM (%)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={heater}
                  onChange={e => setHeater(parseInt(e.target.value))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <Button onClick={handleHeaterPwm} variant="danger" loading={mut.isPending}>
                  Apply
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
                <select
                  value={mode}
                  onChange={e => setMode(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
                >
                  <option value="auto">Auto</option>
                  <option value="manual">Manual</option>
                </select>
                <Button onClick={handleMode} fullWidth size="sm" loading={mut.isPending}>
                  Apply
                </Button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heater Enable</label>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => setEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Enabled</span>
                </label>
                <Button onClick={handleHeaterEnable} fullWidth size="sm" loading={mut.isPending}>
                  Apply
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">PID Parameters</label>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <label className="text-xs text-gray-500">Kp</label>
                  <input
                    type="number"
                    value={kp}
                    step={0.1}
                    onChange={e => setKp(parseFloat(e.target.value))}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Ki</label>
                  <input
                    type="number"
                    value={ki}
                    step={0.1}
                    onChange={e => setKi(parseFloat(e.target.value))}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Kd</label>
                  <input
                    type="number"
                    value={kd}
                    step={0.1}
                    onChange={e => setKd(parseFloat(e.target.value))}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
              <Button onClick={handlePidUpdate} fullWidth loading={mut.isPending}>
                Apply PID
              </Button>
            </div>

            {/* Auto-Tune Controls */}
            <Card variant="outlined" className="bg-blue-50 border-blue-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">🤖 Auto-Tune PID</h4>
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">Target Temp (°C)</label>
                <input
                  type="number"
                  value={autotuneTarget}
                  onChange={e => setAutotuneTarget(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div className="flex gap-2 mb-3">
                <Button
                  onClick={handleAutotuneStart}
                  disabled={autotuneStatus?.status?.state !== 'idle'}
                  variant="secondary"
                  size="sm"
                  loading={mut.isPending}
                >
                  Start
                </Button>
                <Button
                  onClick={handleAutotuneStop}
                  disabled={autotuneStatus?.status?.state === 'idle'}
                  variant="danger"
                  size="sm"
                  loading={mut.isPending}
                >
                  Stop
                </Button>
                <Button
                  onClick={handleAutotuneApply}
                  disabled={!autotuneResults}
                  size="sm"
                  loading={mut.isPending}
                >
                  Apply
                </Button>
              </div>
              <div className="text-xs text-gray-700 bg-white p-2 rounded">
                <div><strong>Status:</strong> {autotuneStatus?.status?.state || 'idle'} - {autotuneStatus?.status?.message || 'Ready'}</div>
                {autotuneStatus?.status?.state !== 'idle' && (
                  <div><strong>Progress:</strong> {autotuneStatus?.status?.current_step || 0}/{autotuneStatus?.status?.total_steps || 8}</div>
                )}
                {autotuneResults && (
                  <div className="mt-1 text-green-600">
                    <strong>Results:</strong> Kp: {autotuneResults?.results?.recommended_kp?.toFixed(2)} |
                    Ki: {autotuneResults?.results?.recommended_ki?.toFixed(2)} |
                    Kd: {autotuneResults?.results?.recommended_kd?.toFixed(2)}
                  </div>
                )}
              </div>
            </Card>

            {/* Emergency Stop */}
            <Button
              onClick={handleEmergencyStop}
              variant="danger"
              fullWidth
              size="lg"
              loading={mut.isPending}
              className="text-base font-semibold"
            >
              🛑 EMERGENCY STOP
            </Button>
          </div>

          {/* Status indicators */}
          {(mut.isPending || mut.isError || mut.isSuccess) && (
            <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
              {mut.isPending && <div className="text-yellow-600">⏳ Sending command...</div>}
              {mut.isError && <div className="text-red-600">❌ Command failed</div>}
              {mut.isSuccess && <div className="text-green-600">✅ Command sent</div>}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}