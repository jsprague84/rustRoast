import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, RoastSession } from '../api/client'
import { RoastControl } from '../components/RoastControl'

type Props = {
  deviceId: string
}

export function UnifiedDashboard({ deviceId }: Props) {
  const queryClient = useQueryClient()

  // Get sessions to find active session - optimized intervals
  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions', deviceId],
    queryFn: () => api.listSessions(deviceId, 10),
    refetchInterval: 2000, // Balanced refresh interval
    staleTime: 1000, // Balanced cache time
    refetchOnWindowFocus: false, // Prevent excessive refetches
    retry: 1, // Limit retries for better performance
    retryDelay: 1000 // Quick retry on failure
  })

  // Find active session - memoized for performance
  const activeSession = useMemo(() => {
    return sessions.find(s => s.status === 'active' || s.status === 'paused' || s.status === 'planning') || null
  }, [sessions])

  // Quick session creation
  const createSessionMutation = useMutation({
    mutationFn: (name: string) => api.createSession({
      device_id: deviceId,
      name,
      start_time: null,
      end_time: null,
      status: 'planning' as const,
      profile_id: null
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    }
  })

  const handleCreateQuickSession = useCallback(() => {
    const timestamp = new Date().toLocaleString()
    createSessionMutation.mutate(`Quick Roast ${timestamp}`)
  }, [createSessionMutation])

  // Memoized stats calculations for performance
  const stats = useMemo(() => ({
    completedRoasts: sessions.filter(s => s.status === 'completed').length,
    activeSessions: sessions.filter(s => s.status === 'active').length,
    totalSessions: sessions.length
  }), [sessions])

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header with unified controls */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{
              margin: '0 0 0.5rem 0',
              fontSize: '1.75rem',
              fontWeight: '700',
              color: 'var(--color-gray-900)'
            }}>
              rustRoast Dashboard
            </h1>
            <p className="text-sm" style={{
              margin: 0,
              color: 'var(--color-gray-600)'
            }}>
              Unified control center with real-time monitoring and session management
            </p>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {/* Session Status */}
            {activeSession ? (
              <div style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--color-white)',
                borderRadius: '0.5rem',
                border: '1px solid var(--color-gray-200)',
                textAlign: 'center'
              }}>
                <div className="text-xs" style={{
                  color: 'var(--color-gray-500)',
                  marginBottom: '0.25rem'
                }}>
                  Active Session
                </div>
                <div className="font-medium text-sm" style={{
                  color: activeSession.status === 'active' ? 'var(--color-green-600)' : 'var(--color-yellow-600)',
                  marginBottom: '0.125rem'
                }}>
                  {activeSession.name}
                </div>
                <div className={`text-xs ${
                  activeSession.status === 'active' ? 'status-online' : 'status-warning'
                }`} style={{ textTransform: 'capitalize' }}>
                  {activeSession.status}
                </div>
            </div>
          ) : (
            <button
              onClick={handleCreateQuickSession}
              disabled={createSessionMutation.isPending}
              className="btn-primary"
              style={{
                fontSize: '14px',
                fontWeight: '600',
                padding: '12px 20px'
              }}
            >
              {createSessionMutation.isPending ? '⏳ Creating...' : '🚀 Start New Roast'}
            </button>
          )}
          </div>
        </div>
      </div>

      {/* Recent Sessions Overview */}
      {sessions.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1rem',
            fontWeight: '600',
            color: 'var(--color-gray-900)'
          }}>
            Recent Sessions
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '0.75rem'
          }}>
            {sessions.slice(0, 6).map(session => (
              <div
                key={session.id}
                style={{
                  padding: '0.75rem',
                  backgroundColor: session.id === activeSession?.id ? 'var(--color-primary-50)' : 'var(--color-gray-50)',
                  borderRadius: '0.375rem',
                  border: session.id === activeSession?.id ? '1px solid var(--color-primary-500)' : '1px solid var(--color-gray-200)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => {
                  // Session selection handled by activeSession memoization
                  // No manual state updates needed
                }}
              >
                <div className="text-sm font-medium" style={{
                  marginBottom: '0.25rem',
                  color: 'var(--color-gray-900)'
                }}>
                  {session.name}
                </div>
                <div className="text-xs font-medium" style={{
                  color: session.status === 'active' ? 'var(--color-green-600)' :
                         session.status === 'completed' ? 'var(--color-gray-500)' :
                         session.status === 'paused' ? '#f59e0b' : 'var(--color-primary-600)',
                  textTransform: 'capitalize'
                }}>
                  {session.status}
                </div>
                {session.start_time && (
                  <div className="text-xs" style={{
                    color: 'var(--color-gray-400)',
                    marginTop: '0.25rem'
                  }}>
                    {new Date(session.start_time).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Roasting Interface */}
      <RoastControl deviceId={deviceId} />

      {/* Quick Stats Footer */}
      <div style={{
        marginTop: '1.25rem',
        padding: '1rem',
        backgroundColor: 'var(--color-gray-800)',
        color: 'var(--color-white)',
        borderRadius: '0.5rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '1rem',
        textAlign: 'center'
      }}>
        <div>
          <div className="font-bold" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            {stats.completedRoasts}
          </div>
          <div className="text-xs" style={{ opacity: 0.8 }}>Completed Roasts</div>
        </div>

        <div>
          <div className="font-bold" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            {stats.activeSessions}
          </div>
          <div className="text-xs" style={{ opacity: 0.8 }}>Active Sessions</div>
        </div>

        <div>
          <div className="font-bold" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            {deviceId}
          </div>
          <div className="text-xs" style={{ opacity: 0.8 }}>Device ID</div>
        </div>

        <div>
          <div className="font-bold" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            {stats.totalSessions}
          </div>
          <div className="text-xs" style={{ opacity: 0.8 }}>Total Sessions</div>
        </div>
      </div>
    </div>
  )
}