import { useEffect } from 'react'
import { create } from 'zustand'

type MqttMessage = {
  id: string
  timestamp: number
  topic: string
  payload: string
  direction: 'incoming' | 'outgoing'
  deviceId?: string
}

type DebugWSState = {
  connected: boolean
  messages: MqttMessage[]
  push: (message: Omit<MqttMessage, 'id' | 'timestamp'>) => void
  clear: () => void
}

const MAX_MESSAGES = 1000

let messageCounter = 0

export const useDebugWsStore = create<DebugWSState>((set, get) => ({
  connected: false,
  messages: [],
  push: (message) => set(s => {
    const newMessage: MqttMessage = {
      ...message,
      id: `msg_${++messageCounter}`,
      timestamp: Date.now()
    }
    const messages = [newMessage, ...s.messages]
    if (messages.length > MAX_MESSAGES) messages.splice(MAX_MESSAGES)
    return { messages }
  }),
  clear: () => set({ messages: [] })
}))

export function useDebugWS() {
  const setConnected = (v: boolean) => useDebugWsStore.setState({ connected: v })
  const push = useDebugWsStore(s => s.push)

  useEffect(() => {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/debug'
    let ws: WebSocket | undefined
    let stop = false
    let reconnectTimeoutId: NodeJS.Timeout | undefined
    let heartbeatTimeoutId: NodeJS.Timeout | undefined
    let reconnectAttempts = 0
    const maxReconnectAttempts = 10
    const baseDelay = 1000
    const maxDelay = 30000

    const calculateBackoffDelay = (attempt: number): number => {
      const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      const jitter = Math.random() * 0.3 * exponentialDelay
      return exponentialDelay + jitter
    }

    const scheduleHeartbeat = () => {
      clearTimeout(heartbeatTimeoutId)
      heartbeatTimeoutId = setTimeout(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
          scheduleHeartbeat()
        }
      }, 30000) // Send ping every 30 seconds
    }

    const open = () => {
      if (stop) return

      console.log(`Attempting to connect to debug WebSocket: ${url} (attempt ${reconnectAttempts + 1})`)
      setConnected(false)

      try {
        ws = new WebSocket(url)

        ws.onopen = () => {
          console.log('Debug WebSocket connected successfully')
          setConnected(true)
          reconnectAttempts = 0
          scheduleHeartbeat()

          // Send a test message to verify connection
          try {
            ws.send(JSON.stringify({ type: 'ping' }))
          } catch (error) {
            console.warn('Failed to send initial ping to debug WebSocket:', error)
          }
        }

        ws.onclose = (event) => {
          console.log(`Debug WebSocket disconnected:`, event.code, event.reason)
          setConnected(false)
          clearTimeout(heartbeatTimeoutId)

          if (!stop && reconnectAttempts < maxReconnectAttempts) {
            const delay = calculateBackoffDelay(reconnectAttempts)
            console.log(`Reconnecting debug WebSocket in ${Math.round(delay)}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`)

            reconnectTimeoutId = setTimeout(() => {
              reconnectAttempts++
              open()
            }, delay)
          } else if (!stop) {
            console.error('Debug WebSocket failed after multiple attempts. Please refresh the page.')
          }
        }

        ws.onerror = (error) => {
          console.error('Debug WebSocket error:', error)
        }

        ws.onmessage = ev => {
          try {
            const msg = JSON.parse(ev.data)

            // Handle pong responses
            if (msg.type === 'pong') {
              return
            }

            if (msg.mqtt) {
              // MQTT message from server
              push({
                topic: msg.mqtt.topic || 'unknown',
                payload: typeof msg.mqtt.payload === 'object' ? JSON.stringify(msg.mqtt.payload, null, 2) : String(msg.mqtt.payload || ''),
                direction: msg.mqtt.direction || 'incoming',
                deviceId: msg.mqtt.device_id
              })
            }
          } catch (e) {
            console.warn('Failed to parse debug WebSocket message:', e)
            // If it's not JSON, treat it as raw message
            push({
              topic: 'raw',
              payload: ev.data,
              direction: 'incoming'
            })
          }
        }
      } catch (error) {
        console.error('Failed to create debug WebSocket:', error)
      }
    }

    // Handle page visibility changes (helps with hibernation recovery)
    const handleVisibilityChange = () => {
      if (!document.hidden && (!ws || ws.readyState !== WebSocket.OPEN)) {
        console.log('Page became visible, checking debug WebSocket connection...')
        // Reset reconnect attempts when page becomes visible
        reconnectAttempts = 0
        if (!stop) {
          open()
        }
      }
    }

    // Handle online/offline events
    const handleOnline = () => {
      console.log('Network came online, attempting debug WebSocket reconnection...')
      reconnectAttempts = 0
      if (!stop) {
        open()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    open()

    return () => {
      stop = true
      clearTimeout(reconnectTimeoutId)
      clearTimeout(heartbeatTimeoutId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      ws?.close()
    }
  }, [])
}