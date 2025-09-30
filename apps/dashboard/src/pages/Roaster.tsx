import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, RoastSession } from '../api/client'
import { RoastOperatorInterface } from '../components/RoastOperatorInterface'

type Props = {
  deviceId: string
}

export function Roaster({ deviceId }: Props) {
  const [activeSession, setActiveSession] = useState<RoastSession | null>(null)

  // Get sessions to find active session
  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions', deviceId],
    queryFn: () => api.listSessions(deviceId, 10),
    refetchInterval: 3000
  })

  // Find active session
  useEffect(() => {
    const active = sessions.find(s => s.status === 'active' || s.status === 'paused')
    setActiveSession(active || null)
  }, [sessions])

  return (
    <div>
      <RoastOperatorInterface
        deviceId={deviceId}
        session={activeSession}
        onSessionChange={(sessionId) => {
          if (sessionId) {
            const session = sessions.find(s => s.id === sessionId)
            setActiveSession(session || null)
          }
        }}
      />
    </div>
  )
}