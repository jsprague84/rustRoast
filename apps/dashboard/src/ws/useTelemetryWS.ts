import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TelemetryRingBuffer, compressTelemetryData, decompressTelemetryData, TelemetryPoint, CompressionState } from '../utils/dataCompression'

type WSState = {
  connected: boolean
  connecting: boolean
  lastError?: string
  // per-device ring buffers with compression
  ringBuffers: Record<string, TelemetryRingBuffer>
  compressionStates: Record<string, CompressionState>
  push: (deviceId: string, point: TelemetryPoint) => void
  getDeviceData: (deviceId: string, startTime?: number, endTime?: number) => TelemetryPoint[]
  clearDeviceData: (deviceId: string) => void
}

const MAX_POINTS = 3000
const COMPRESSION_PRECISION = 10 // 0.1 degree precision

export const useWsStore = create<WSState>()(
  persist(
    (set, get) => ({
      connected: false,
      connecting: false,
      ringBuffers: {},
      compressionStates: {},
      push: (deviceId, point) => {
        const state = get()

        // Initialize ring buffer for device if not exists or corrupted
        if (!state.ringBuffers[deviceId] || typeof state.ringBuffers[deviceId].push !== 'function') {
          console.log(`[WS Store] Initializing ring buffer for device ${deviceId}`)
          const ringBuffer = new TelemetryRingBuffer(MAX_POINTS)
          set(s => ({
            ringBuffers: { ...s.ringBuffers, [deviceId]: ringBuffer },
            compressionStates: { ...s.compressionStates, [deviceId]: { lastPoint: null, baseTimestamp: point.ts } }
          }))
        }

        // Add point to ring buffer - re-get state to ensure we have the fresh buffer
        const updatedState = get()
        const buffer = updatedState.ringBuffers[deviceId]
        if (buffer && typeof buffer.push === 'function') {
          buffer.push(point)
        } else {
          console.error(`[WS Store] Ring buffer for device ${deviceId} is still not valid after initialization`, buffer)
        }
      },
      getDeviceData: (deviceId, startTime, endTime) => {
        const state = get()
        let buffer = state.ringBuffers[deviceId]

        // If buffer doesn't exist or isn't a proper TelemetryRingBuffer instance, return empty
        if (!buffer || typeof buffer.getPoints !== 'function') {
          console.warn(`[WS Store] Ring buffer for device ${deviceId} is not initialized or corrupted`, buffer)
          return []
        }

        if (startTime !== undefined && endTime !== undefined) {
          return buffer.getPointsInRange(startTime, endTime)
        }
        return buffer.getPoints()
      },
      clearDeviceData: (deviceId) => {
        const state = get()
        const buffer = state.ringBuffers[deviceId]
        if (buffer) {
          buffer.clear()
        }
      }
    }),
    {
      name: 'roast-telemetry',
      partialize: (state) => ({
        // Only persist compressed telemetry data, not connection state or ring buffers
        compressionStates: state.compressionStates
      }),
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name)
            if (!str) return null
            const parsed = JSON.parse(str)

            // Clean old compression states (keep only last 2 hours)
            const cutoff = Date.now() / 1000 - 7200
            const cleanedStates: Record<string, CompressionState> = {}

            for (const [deviceId, compressionState] of Object.entries(parsed.state?.compressionStates || {})) {
              const state = compressionState as CompressionState
              if (state.baseTimestamp > cutoff) {
                cleanedStates[deviceId] = state
              }
            }

            return JSON.stringify({
              ...parsed,
              state: {
                ...parsed.state,
                compressionStates: cleanedStates,
                // Initialize empty ring buffers on load
                ringBuffers: {}
              }
            })
          } catch {
            return null
          }
        },
        setItem: (name, value) => {
          try {
            // Parse the value if it's a string, otherwise use as-is
            const data = typeof value === 'string' ? JSON.parse(value) : value
            if (data.state?.ringBuffers) {
              const compressedStates: Record<string, CompressionState> = {}

              for (const [deviceId, buffer] of Object.entries(data.state.ringBuffers)) {
                if (buffer instanceof TelemetryRingBuffer) {
                  const points = buffer.getPoints()
                  if (points.length > 0) {
                    const { state: compressionState } = compressTelemetryData(points, COMPRESSION_PRECISION)
                    compressedStates[deviceId] = compressionState
                  }
                }
              }

              // Store only compression states, not the full ring buffers
              const compressedData = {
                ...data,
                state: {
                  ...data.state,
                  compressionStates: compressedStates,
                  ringBuffers: {} // Don't persist ring buffers themselves
                }
              }

              localStorage.setItem(name, JSON.stringify(compressedData))
            } else {
              localStorage.setItem(name, value)
            }
          } catch (error) {
            console.warn('Failed to persist telemetry data:', error)
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name)
          } catch (error) {
            console.warn('Failed to remove persisted telemetry data:', error)
          }
        }
      }
    }
  )
)

// Global singleton WebSocket instance
let globalWS: {
  ws?: WebSocket
  refCount: number
  cleanup?: () => void
  isConnecting: boolean
} = {
  refCount: 0,
  isConnecting: false
}

export function useTelemetryWS() {
  const setConnected = (v: boolean) => useWsStore.setState({ connected: v })
  const setConnecting = (v: boolean) => useWsStore.setState({ connecting: v })
  const setError = (error?: string) => useWsStore.setState({ lastError: error })
  const push = useWsStore(s => s.push)
  
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 10
  const baseDelay = 1000
  const maxDelay = 30000

  useEffect(() => {
    // Increment reference count
    globalWS.refCount++
    console.log(`WebSocket ref count: ${globalWS.refCount}`)
    
    // Only create connection if it doesn't exist and we're not connecting
    if (!globalWS.ws && !globalWS.isConnecting) {
      globalWS.isConnecting = true
      console.log('Creating singleton WebSocket connection')
      
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/telemetry'
      let ws: WebSocket | undefined
      let stop = false
      let reconnectTimeoutId: NodeJS.Timeout | undefined
      let heartbeatTimeoutId: NodeJS.Timeout | undefined

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

      const connect = () => {
        if (stop) return
        
        setConnecting(true)
        setError(undefined)
        
        try {
          ws = new WebSocket(url)
          globalWS.ws = ws
          
          ws.onopen = () => {
            console.log('Singleton WebSocket connected')
            globalWS.isConnecting = false
            setConnected(true)
            setConnecting(false)
            setError(undefined)
            reconnectAttemptsRef.current = 0
            scheduleHeartbeat()

            // Send a test message to verify connection
            try {
              ws.send(JSON.stringify({ type: 'ping' }))
            } catch (error) {
              console.warn('Failed to send initial ping:', error)
            }
          }
          
          ws.onclose = (event) => {
            console.log('Singleton WebSocket disconnected:', event.code, event.reason)
            globalWS.ws = undefined
            globalWS.isConnecting = false
            setConnected(false)
            setConnecting(false)
            clearTimeout(heartbeatTimeoutId)
            
            if (!stop && reconnectAttemptsRef.current < maxReconnectAttempts) {
              const delay = calculateBackoffDelay(reconnectAttemptsRef.current)
              console.log(`Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`)
              setError(`Reconnecting in ${Math.round(delay / 1000)}s...`)
              
              reconnectTimeoutId = setTimeout(() => {
                reconnectAttemptsRef.current++
                connect()
              }, delay)
            } else if (!stop) {
              setError('Connection failed after multiple attempts. Please refresh the page.')
            }
          }
          
          ws.onerror = (error) => {
            console.error('Singleton WebSocket error:', error)
            setError('Connection error occurred')
          }
          
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(ev.data)

              // Handle pong responses
              if (msg.type === 'pong') {
                return
              }

              const device = msg.device_id
              if (!device) {
                console.warn('[WebSocket] No device_id in message:', msg)
                return
              }

              if (msg.telemetry) {
                // Convert telemetry message to TelemetryPoint format
                // Handle both new format (beanTemp) and legacy format (bean_temp)
                const telemetryPoint: TelemetryPoint = {
                  ts: msg.telemetry.timestamp ? msg.telemetry.timestamp / 1000 : Date.now() / 1000,
                  beanTemp: msg.telemetry.beanTemp ?? msg.telemetry.bean_temp,
                  envTemp: msg.telemetry.envTemp ?? msg.telemetry.env_temp,
                  setpoint: msg.telemetry.setpoint,
                  fanPWM: msg.telemetry.fanPWM ?? msg.telemetry.fan_pwm,
                  heaterPWM: msg.telemetry.heaterPWM ?? msg.telemetry.heater_pwm,
                  controlMode: msg.telemetry.controlMode ?? msg.telemetry.control_mode,
                  heaterEnable: msg.telemetry.heaterEnable ?? msg.telemetry.heater_enable,
                  rateOfRise: msg.telemetry.rateOfRise ?? msg.telemetry.rate_of_rise,
                  Kp: msg.telemetry.Kp ?? msg.telemetry.kp,
                  Ki: msg.telemetry.Ki ?? msg.telemetry.ki,
                  Kd: msg.telemetry.Kd ?? msg.telemetry.kd
                }

                console.log('[WebSocket] Storing telemetry for device:', device, 'Point:', telemetryPoint)
                push(device, telemetryPoint)
              } else if (msg.autotune) {
                // Optionally handle auto-tune streaming here if desired
              }
            } catch (parseError) {
              console.warn('Failed to parse WebSocket message:', parseError)
            }
          }
        } catch (error) {
          console.error('Failed to create WebSocket:', error)
          globalWS.isConnecting = false
          setConnecting(false)
          setError('Failed to create connection')
        }
      }

      // Handle page visibility changes (helps with hibernation recovery)
      const handleVisibilityChange = () => {
        if (!document.hidden && (!ws || ws.readyState !== WebSocket.OPEN)) {
          console.log('Page became visible, checking connection...')
          // Reset reconnect attempts when page becomes visible
          reconnectAttemptsRef.current = 0
          if (!stop) {
            connect()
          }
        }
      }

      // Handle online/offline events
      const handleOnline = () => {
        console.log('Network came online, attempting reconnection...')
        reconnectAttemptsRef.current = 0
        if (!stop) {
          connect()
        }
      }

      document.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('online', handleOnline)
      
      connect()
      
      // Store cleanup function in global state
      globalWS.cleanup = () => {
        stop = true
        clearTimeout(reconnectTimeoutId)
        clearTimeout(heartbeatTimeoutId)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('online', handleOnline)
        ws?.close()
        globalWS.ws = undefined
        globalWS.isConnecting = false
      }
    }
    
    return () => {
      // Decrement reference count
      globalWS.refCount--
      console.log(`WebSocket ref count: ${globalWS.refCount}`)

      // Add a delay before cleanup to prevent rapid disconnect/reconnect cycles
      if (globalWS.refCount <= 0) {
        setTimeout(() => {
          // Double-check ref count after delay in case new connections were made
          if (globalWS.refCount <= 0 && globalWS.cleanup) {
            console.log('Cleaning up singleton WebSocket connection after delay')
            globalWS.cleanup()
            globalWS.cleanup = undefined
            globalWS.refCount = 0
          }
        }, 100) // Small delay to handle rapid mount/unmount cycles
      }
    }
  }, [])
}

