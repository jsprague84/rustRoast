import { useState, useMemo } from 'react'
import { useDebugWS, useDebugWsStore } from '../ws/useDebugWS'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function Debug({ deviceId, onDeviceChange }: { deviceId?: string, onDeviceChange?: (deviceId: string) => void } = {}) {
  useDebugWS()
  const { connected, messages, clear } = useDebugWsStore()
  const [filter, setFilter] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const [showDirection, setShowDirection] = useState<'all' | 'incoming' | 'outgoing'>('all')
  const [autoScroll, setAutoScroll] = useState(true)

  const mqttResetMutation = useMutation({
    mutationFn: api.mqttReset,
    onSuccess: () => {
      console.log('MQTT reset initiated successfully')
    },
    onError: (error) => {
      console.error('Failed to reset MQTT:', error)
    }
  })

  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      if (filter && !msg.payload.toLowerCase().includes(filter.toLowerCase())) return false
      if (topicFilter && !msg.topic.toLowerCase().includes(topicFilter.toLowerCase())) return false
      if (showDirection !== 'all' && msg.direction !== showDirection) return false
      return true
    })
  }, [messages, filter, topicFilter, showDirection])

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString() + '.' + String(date.getMilliseconds()).padStart(3, '0')
  }

  const getTopicColor = (topic: string) => {
    if (topic.includes('telemetry')) return '#10b981' // green
    if (topic.includes('control')) return '#3b82f6' // blue  
    if (topic.includes('autotune')) return '#f59e0b' // yellow
    if (topic.includes('status')) return '#8b5cf6' // purple
    return '#6b7280' // gray
  }

  const getDirectionIcon = (direction: string) => {
    return direction === 'incoming' ? '📥' : '📤'
  }

  // Device selection functionality
  const { data: devicesData, isLoading: devicesLoading, error: devicesError, refetch: refetchDevices } = useQuery({
    queryKey: ['devices'],
    queryFn: api.devices,
    refetchInterval: 5000
  })

  return (
    <div>
      {/* Device Selection Section */}
      {onDeviceChange && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <h2 style={{ margin: 0 }}>Device Selection</h2>
            <button
              onClick={() => refetchDevices()}
              style={{
                padding: '6px 12px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer'
              }}
            >
              🔄 Refresh
            </button>
          </div>

          <div className="card" style={{ padding: '1rem' }}>
            {devicesLoading && <p>Loading devices…</p>}
            {devicesError && <p style={{ color: '#dc2626' }}>Failed to load devices</p>}

            {devicesData?.devices && (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {devicesData.devices.map(d => (
                  <button
                    key={d.device_id}
                    onClick={() => onDeviceChange(d.device_id)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      background: d.device_id === deviceId ? '#dbeafe' : '#ffffff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                        {d.device_id}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Last seen: {d.last_seen}
                      </div>
                    </div>
                    {d.device_id === deviceId && (
                      <div style={{ color: '#2563eb', fontSize: '1.2rem' }}>✓</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <h2>MQTT Debug Console</h2>
      
      {/* Connection Status */}
      <div style={{
        padding: 8, 
        backgroundColor: connected ? '#dcfce7' : '#fef2f2', 
        color: connected ? '#166534' : '#dc2626',
        borderRadius: 4,
        marginBottom: 16,
        fontSize: 14,
        fontWeight: 600
      }}>
        WebSocket: {connected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', 
        gap: 12, 
        marginBottom: 16, 
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <input 
          type="text" 
          placeholder="Filter payload content..." 
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            padding: 6, 
            border: '1px solid #d1d5db', 
            borderRadius: 4,
            minWidth: 200
          }}
        />
        <input 
          type="text" 
          placeholder="Filter topic..." 
          value={topicFilter}
          onChange={e => setTopicFilter(e.target.value)}
          style={{
            padding: 6, 
            border: '1px solid #d1d5db', 
            borderRadius: 4,
            minWidth: 150
          }}
        />
        <select 
          value={showDirection} 
          onChange={e => setShowDirection(e.target.value as any)}
          style={{padding: 6, border: '1px solid #d1d5db', borderRadius: 4}}
        >
          <option value="all">All Messages</option>
          <option value="incoming">Incoming Only</option>
          <option value="outgoing">Outgoing Only</option>
        </select>
        <label style={{display: 'flex', alignItems: 'center', gap: 4, fontSize: 14}}>
          <input 
            type="checkbox" 
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
          />
          Auto-scroll
        </label>
        <button 
          onClick={clear}
          style={{
            padding: '6px 12px', 
            backgroundColor: '#dc2626', 
            color: 'white', 
            border: 'none', 
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          Clear ({messages.length})
        </button>
        <button 
          onClick={() => mqttResetMutation.mutate()}
          disabled={mqttResetMutation.isPending}
          style={{
            padding: '6px 12px', 
            backgroundColor: mqttResetMutation.isPending ? '#9ca3af' : '#f59e0b', 
            color: 'white', 
            border: 'none', 
            borderRadius: 4,
            cursor: mqttResetMutation.isPending ? 'not-allowed' : 'pointer'
          }}
        >
          {mqttResetMutation.isPending ? 'Resetting MQTT...' : '🔄 Reset MQTT'}
        </button>
      </div>

      {/* Message Statistics */}
      <div style={{
        display: 'flex', 
        gap: 16, 
        marginBottom: 16, 
        fontSize: 12, 
        color: '#6b7280'
      }}>
        <span>Total: {messages.length}</span>
        <span>Filtered: {filteredMessages.length}</span>
        <span>Topics: {Array.from(new Set(messages.map(m => m.topic))).length}</span>
      </div>

      {/* Messages */}
      <div 
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          backgroundColor: '#1f2937',
          color: '#f9fafb',
          fontFamily: 'monospace',
          fontSize: 13,
          height: '600px',
          overflow: 'auto'
        }}
        ref={el => {
          if (autoScroll && el) {
            el.scrollTop = 0 // Since we're showing newest first
          }
        }}
      >
        {filteredMessages.length === 0 ? (
          <div style={{padding: 20, textAlign: 'center', color: '#9ca3af'}}>
            {messages.length === 0 ? 'No messages yet...' : 'No messages match current filters'}
          </div>
        ) : (
          filteredMessages.map(msg => (
            <div 
              key={msg.id}
              style={{
                borderBottom: '1px solid #374151',
                padding: '8px 12px'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center', 
                gap: 8,
                marginBottom: 4,
                fontSize: 11,
                color: '#9ca3af'
              }}>
                <span>{getDirectionIcon(msg.direction)}</span>
                <span>{formatTime(msg.timestamp)}</span>
                <span 
                  style={{
                    color: getTopicColor(msg.topic),
                    fontWeight: 600
                  }}
                >
                  {msg.topic}
                </span>
                {msg.deviceId && (
                  <span style={{
                    backgroundColor: '#374151',
                    padding: '2px 6px',
                    borderRadius: 3,
                    fontSize: 10
                  }}>
                    {msg.deviceId}
                  </span>
                )}
              </div>
              <pre style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                backgroundColor: msg.direction === 'incoming' ? '#1e293b' : '#0f172a',
                padding: 8,
                borderRadius: 4,
                fontSize: 12
              }}>
{msg.payload}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  )
}