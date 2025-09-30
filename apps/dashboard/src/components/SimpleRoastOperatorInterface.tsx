import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, RoastSession } from '../api/client'
import { useTelemetryWS, useWsStore } from '../ws/useTelemetryWS'

type Props = {
  deviceId: string
  session?: RoastSession
  onSessionChange?: (sessionId?: string) => void
}

export function SimpleRoastOperatorInterface({ deviceId, session }: Props) {
  useTelemetryWS() // Initialize WebSocket connection
  
  const { connected, connecting, lastError } = useWsStore(state => ({
    connected: state.connected,
    connecting: state.connecting,
    lastError: state.lastError
  }))
  
  // Get latest telemetry from store  
  const telemetryData = useWsStore(state => state.data[deviceId] || [])
  const latest = telemetryData[telemetryData.length - 1]
  
  const [manualControls, setManualControls] = useState({
    setpoint: 200,
    heaterPwm: 0,
    fanPwm: 100,
  })

  // Current readings
  const currentReadings = latest?.telemetry || {}

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', fontWeight: '700' }}>
          Coffee Roaster Control
        </h1>
        
        {/* Connection Status */}
        <div style={{ 
          fontSize: '12px', 
          padding: '6px 12px', 
          borderRadius: '6px',
          backgroundColor: connected ? '#10b981' : connecting ? '#f59e0b' : '#ef4444',
          color: 'white',
          fontWeight: '500',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          {connected ? (
            <>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white' }}></span>
              WebSocket Connected
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
            marginTop: '10px',
            maxWidth: '400px'
          }}>
            {lastError}
          </div>
        )}
      </div>

      {/* Session Info */}
      {session && (
        <div style={{ 
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '30px'
        }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
            Active Session
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '14px' }}>
            <div><strong>Name:</strong> {session.name}</div>
            <div><strong>Status:</strong> {session.status}</div>
            <div><strong>Bean:</strong> {session.bean_origin} {session.bean_variety}</div>
          </div>
        </div>
      )}

      {/* Current Readings */}
      <div style={{ 
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '30px'
      }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
          Current Readings
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Bean Temperature</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#ef4444' }}>
              {currentReadings.beanTemp ? `${currentReadings.beanTemp.toFixed(1)}°C` : '--'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Environment Temperature</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>
              {currentReadings.envTemp ? `${currentReadings.envTemp.toFixed(1)}°C` : '--'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Rate of Rise</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#10b981' }}>
              {currentReadings.rateOfRise ? `${currentReadings.rateOfRise.toFixed(1)}°C/min` : '--'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Fan PWM</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#2ca02c' }}>
              {currentReadings.fanPWM ? `${Math.round(currentReadings.fanPWM * 100 / 255)}%` : '--'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Heater PWM</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#d62728' }}>
              {currentReadings.heaterPWM ? `${currentReadings.heaterPWM}%` : '--'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Setpoint</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>
              {currentReadings.setpoint ? `${currentReadings.setpoint.toFixed(1)}°C` : '--'}
            </div>
          </div>
        </div>
      </div>

      {/* Basic Controls */}
      <div style={{ 
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '20px'
      }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
          Basic Controls
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
              Target Temperature: {manualControls.setpoint}°C
            </label>
            <input
              type="range"
              min="0"
              max="250"
              value={manualControls.setpoint}
              onChange={e => setManualControls(prev => ({ ...prev, setpoint: parseInt(e.target.value) }))}
              style={{ width: '100%' }}
            />
            <button
              onClick={() => api.setSetpoint(deviceId, manualControls.setpoint)}
              style={{
                marginTop: '8px',
                padding: '6px 12px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Set Target
            </button>
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
              Fan PWM: {manualControls.fanPwm}
            </label>
            <input
              type="range"
              min="0"
              max="255"
              value={manualControls.fanPwm}
              onChange={e => setManualControls(prev => ({ ...prev, fanPwm: parseInt(e.target.value) }))}
              style={{ width: '100%' }}
            />
            <button
              onClick={() => api.setFanPwm(deviceId, manualControls.fanPwm)}
              style={{
                marginTop: '8px',
                padding: '6px 12px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Set Fan
            </button>
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
              Heater PWM: {manualControls.heaterPwm}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={manualControls.heaterPwm}
              onChange={e => setManualControls(prev => ({ ...prev, heaterPwm: parseInt(e.target.value) }))}
              style={{ width: '100%' }}
            />
            <button
              onClick={() => api.setHeaterPwm(deviceId, manualControls.heaterPwm)}
              style={{
                marginTop: '8px',
                padding: '6px 12px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Set Heater
            </button>
          </div>
        </div>
        
        {/* Emergency Stop */}
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button
            onClick={() => api.emergencyStop(deviceId)}
            style={{
              padding: '12px 24px',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            🛑 Emergency Stop
          </button>
        </div>
      </div>

      {/* Note about full interface */}
      <div style={{
        backgroundColor: '#fef3c7',
        border: '1px solid #fbbf24',
        borderRadius: '6px',
        padding: '12px',
        marginTop: '20px',
        fontSize: '14px',
        color: '#92400e'
      }}>
        <strong>Note:</strong> This is a simplified interface. The full RoastOperatorInterface with charts and advanced controls 
        was causing system crashes due to resource usage. This version provides basic monitoring and control functionality.
      </div>
    </div>
  )
}