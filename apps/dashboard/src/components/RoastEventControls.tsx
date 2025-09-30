import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, RoastEvent, RoastEventType, CreateRoastEventRequest } from '../api/client'

const EVENT_TYPES: Array<{ type: RoastEventType; label: string; color: string; description: string }> = [
  { type: 'drop', label: '☕ Drop', color: '#8b5cf6', description: 'Beans dropped into roaster' },
  { type: 'drying_end', label: '💨 Drying End', color: '#06b6d4', description: 'End of drying phase' },
  { type: 'first_crack_start', label: '🔥 1st Crack Start', color: '#f59e0b', description: 'First crack begins' },
  { type: 'first_crack_end', label: '⭐ 1st Crack End', color: '#f97316', description: 'First crack ends' },
  { type: 'second_crack_start', label: '🎆 2nd Crack Start', color: '#ef4444', description: 'Second crack begins' },
  { type: 'second_crack_end', label: '🔴 2nd Crack End', color: '#dc2626', description: 'Second crack ends' },
  { type: 'development_start', label: '📈 Development Start', color: '#10b981', description: 'Development phase begins' },
  { type: 'drop_out', label: '🏁 Drop Out', color: '#6b7280', description: 'Beans dropped from roaster' },
  { type: 'custom', label: '📝 Custom', color: '#3b82f6', description: 'Custom event' }
]

type Props = {
  sessionId: string
  sessionStartTime?: number
  currentTemp?: number
  disabled?: boolean
}

export function RoastEventControls({ sessionId, sessionStartTime, currentTemp, disabled }: Props) {
  const queryClient = useQueryClient()
  const [selectedEventType, setSelectedEventType] = useState<RoastEventType>('drop')
  const [customNotes, setCustomNotes] = useState('')
  const [showEventForm, setShowEventForm] = useState(false)

  // Get existing events
  const { data: events = [] } = useQuery({
    queryKey: ['roast-events', sessionId],
    queryFn: () => api.getRoastEvents(sessionId),
    enabled: !!sessionId
  })

  // Add event mutation
  const addEventMutation = useMutation({
    mutationFn: (req: CreateRoastEventRequest) => api.addRoastEvent(sessionId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roast-events', sessionId] })
      setCustomNotes('')
      setShowEventForm(false)
    }
  })

  const handleAddEvent = (eventType: RoastEventType) => {
    if (!sessionStartTime) return
    
    const elapsedSeconds = Math.floor(Date.now() / 1000 - sessionStartTime)
    
    const req: CreateRoastEventRequest = {
      event_type: eventType,
      elapsed_seconds: elapsedSeconds,
      temperature: currentTemp,
      notes: eventType === 'custom' ? customNotes : undefined
    }

    addEventMutation.mutate(req)
  }

  // Quick action buttons for common events
  const quickEvents = EVENT_TYPES.filter(e => 
    ['drop', 'drying_end', 'first_crack_start', 'first_crack_end', 'drop_out'].includes(e.type)
  )

  const elapsedTime = sessionStartTime ? Math.floor(Date.now() / 1000 - sessionStartTime) : 0
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div style={{
      padding: '16px',
      backgroundColor: '#f8fafc',
      borderRadius: '12px',
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
          Roast Events
        </h3>
        {sessionStartTime && (
          <div style={{ 
            fontSize: '14px', 
            color: '#6b7280',
            fontFamily: 'monospace',
            backgroundColor: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #e5e7eb'
          }}>
            {formatTime(elapsedTime)}
          </div>
        )}
      </div>

      {/* Quick Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {quickEvents.map(eventType => {
          const hasEvent = events.some(e => e.event_type === eventType.type)
          return (
            <button
              key={eventType.type}
              onClick={() => handleAddEvent(eventType.type)}
              disabled={disabled || !sessionStartTime || addEventMutation.isPending || hasEvent}
              title={`${eventType.description}${hasEvent ? ' (already marked)' : ''}`}
              style={{
                padding: '6px 12px',
                backgroundColor: hasEvent ? '#e5e7eb' : eventType.color,
                color: hasEvent ? '#6b7280' : 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: disabled || !sessionStartTime || hasEvent ? 'not-allowed' : 'pointer',
                opacity: disabled || !sessionStartTime ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
            >
              {eventType.label}
            </button>
          )
        })}
        
        <button
          onClick={() => setShowEventForm(!showEventForm)}
          disabled={disabled || !sessionStartTime}
          style={{
            padding: '6px 12px',
            backgroundColor: showEventForm ? '#3b82f6' : '#f3f4f6',
            color: showEventForm ? 'white' : '#374151',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: disabled || !sessionStartTime ? 'not-allowed' : 'pointer',
            opacity: disabled || !sessionStartTime ? 0.5 : 1
          }}
        >
          + More
        </button>
      </div>

      {/* Extended Event Form */}
      {showEventForm && (
        <div style={{
          padding: '12px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          marginBottom: '12px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                Event Type
              </label>
              <select
                value={selectedEventType}
                onChange={e => setSelectedEventType(e.target.value as RoastEventType)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              >
                {EVENT_TYPES.map(et => (
                  <option key={et.type} value={et.type}>{et.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                Temperature
              </label>
              <input
                type="text"
                value={currentTemp?.toFixed(1) || '--'}
                readOnly
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: '#f9fafb'
                }}
              />
            </div>
          </div>
          
          {selectedEventType === 'custom' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                Notes
              </label>
              <input
                type="text"
                value={customNotes}
                onChange={e => setCustomNotes(e.target.value)}
                placeholder="Enter custom event description..."
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              />
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handleAddEvent(selectedEventType)}
              disabled={addEventMutation.isPending || (selectedEventType === 'custom' && !customNotes.trim())}
              style={{
                padding: '6px 16px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              {addEventMutation.isPending ? 'Adding...' : 'Add Event'}
            </button>
            <button
              onClick={() => {
                setShowEventForm(false)
                setCustomNotes('')
              }}
              style={{
                padding: '6px 16px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Event Timeline */}
      {events.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', marginBottom: '8px' }}>
            Event Timeline
          </div>
          <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
            {events
              .sort((a, b) => a.elapsed_seconds - b.elapsed_seconds)
              .map(event => {
                const eventType = EVENT_TYPES.find(et => et.type === event.event_type)
                return (
                  <div
                    key={event.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 8px',
                      backgroundColor: 'white',
                      borderRadius: '4px',
                      border: '1px solid #f3f4f6',
                      marginBottom: '4px'
                    }}
                  >
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: eventType?.color || '#6b7280',
                        flexShrink: 0
                      }}
                    />
                    <div style={{ fontSize: '11px', color: '#374151', minWidth: '40px' }}>
                      {formatTime(event.elapsed_seconds)}
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: '500', color: '#1f2937' }}>
                      {eventType?.label || event.event_type}
                    </div>
                    {event.temperature && (
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        {event.temperature.toFixed(1)}°C
                      </div>
                    )}
                    {event.notes && (
                      <div style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic' }}>
                        {event.notes}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}