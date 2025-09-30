import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useState, useEffect } from 'react'

export function Controls({ deviceId }: { deviceId: string }) {
  const [setpoint, setSetpoint] = useState(200)
  const [fan, setFan] = useState(180)
  const [heater, setHeater] = useState(0)
  const [mode, setMode] = useState<'auto'|'manual'>('auto')
  const [enabled, setEnabled] = useState(false)
  const [kp, setKp] = useState(15)
  const [ki, setKi] = useState(1)
  const [kd, setKd] = useState(25)

  // Fetch current telemetry to sync form values
  const { data: latest } = useQuery({ 
    queryKey: ['latest', deviceId], 
    queryFn: () => api.latestTelemetry(deviceId), 
    refetchInterval: 5000 
  })

  // Sync form state only on initial load or device change (not continuous)
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

  // Reset initialization when device changes
  useEffect(() => {
    setInitialized(false)
  }, [deviceId])

  const mut = useMutation({ mutationFn: (f: () => Promise<void>) => f() })

  return (
    <div>
      <h2>Controls: {deviceId}</h2>
      {latest && <div style={{marginBottom:12, padding:8, backgroundColor:'#f3f4f6', borderRadius:4, fontSize:14}}>
        Current: BT {latest.telemetry?.beanTemp}°C | Setpoint {latest.telemetry?.setpoint}°C | Fan {latest.telemetry?.fanPWM} PWM | Heater {latest.telemetry?.heaterPWM}% | Mode {latest.telemetry?.controlMode === 0 ? 'Manual' : 'Auto'} | Enable {latest.telemetry?.heaterEnable === 1 ? '✓' : '✗'}
      </div>}
      <div style={{display:'grid', gap:12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))'}}>
        <div style={{border:'1px solid #e5e7eb', borderRadius:8, padding:12}}>
          <h3>Setpoint</h3>
          <input type="number" value={setpoint} onChange={e => setSetpoint(parseFloat(e.target.value))} />
          <button onClick={() => mut.mutate(() => api.setSetpoint(deviceId, setpoint))}>Apply</button>
        </div>
        <div style={{border:'1px solid #e5e7eb', borderRadius:8, padding:12}}>
          <h3>Fan PWM</h3>
          <input type="number" value={fan} onChange={e => setFan(parseInt(e.target.value))} />
          <button onClick={() => mut.mutate(() => api.setFanPwm(deviceId, fan))}>Apply</button>
        </div>
        <div style={{border:'1px solid #e5e7eb', borderRadius:8, padding:12}}>
          <h3>Heater PWM</h3>
          <input type="number" value={heater} onChange={e => setHeater(parseInt(e.target.value))} />
          <button onClick={() => mut.mutate(() => api.setHeaterPwm(deviceId, heater))}>Apply</button>
        </div>
        <div style={{border:'1px solid #e5e7eb', borderRadius:8, padding:12}}>
          <h3>Mode</h3>
          <select value={mode} onChange={e => setMode(e.target.value as any)}>
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
          <button onClick={() => mut.mutate(() => api.setMode(deviceId, mode))}>Apply</button>
        </div>
        <div style={{border:'1px solid #e5e7eb', borderRadius:8, padding:12}}>
          <h3>Heater Enable</h3>
          <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enabled</label>
          <button onClick={() => mut.mutate(() => api.setHeaterEnable(deviceId, enabled))}>Apply</button>
        </div>
        <div style={{border:'1px solid #e5e7eb', borderRadius:8, padding:12}}>
          <h3>PID</h3>
          <div style={{display:'flex', gap:8}}>
            <label>Kp <input type="number" value={kp} step={0.1} onChange={e => setKp(parseFloat(e.target.value))} /></label>
            <label>Ki <input type="number" value={ki} step={0.1} onChange={e => setKi(parseFloat(e.target.value))} /></label>
            <label>Kd <input type="number" value={kd} step={0.1} onChange={e => setKd(parseFloat(e.target.value))} /></label>
          </div>
          <button onClick={() => mut.mutate(() => api.setPid(deviceId, kp, ki, kd))}>Apply</button>
        </div>
      </div>
      {mut.isPending && <p>Sending…</p>}
      {mut.isError && <p style={{color:'crimson'}}>Error performing action</p>}
      {mut.isSuccess && <p style={{color:'#059669'}}>OK</p>}
    </div>
  )
}

