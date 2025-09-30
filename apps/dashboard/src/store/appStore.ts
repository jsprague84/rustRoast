import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  Device,
  UIState,
  AppConfig,
  ChartSettings,
  AppError,
  TelemetryPoint,
  RoastSession
} from '../types'

interface AppState {
  // Device Management
  devices: Device[]
  selectedDeviceId: string | null
  deviceConfig: Record<string, any>

  // UI State
  ui: UIState

  // Configuration
  config: Partial<AppConfig>
  chartSettings: ChartSettings

  // Real-time Data
  telemetryData: Record<string, TelemetryPoint[]>
  connectionStatus: Record<string, boolean>

  // Session Management
  activeSessions: Record<string, RoastSession>

  // Error Handling
  errors: AppError[]
  notifications: Array<{
    id: string
    type: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
    timestamp: number
    read: boolean
  }>
}

interface AppActions {
  // Device Actions
  setDevices: (devices: Device[]) => void
  selectDevice: (deviceId: string | null) => void
  updateDeviceConfig: (deviceId: string, config: any) => void

  // UI Actions
  setTheme: (theme: 'light' | 'dark') => void
  setActiveTab: (tab: string) => void
  setLoading: (isLoading: boolean) => void

  // Configuration Actions
  updateConfig: (config: Partial<AppConfig>) => void
  updateChartSettings: (settings: Partial<ChartSettings>) => void

  // Real-time Data Actions
  addTelemetryPoint: (deviceId: string, point: TelemetryPoint) => void
  setConnectionStatus: (deviceId: string, connected: boolean) => void
  clearTelemetryData: (deviceId: string) => void

  // Session Actions
  setActiveSession: (deviceId: string, session: RoastSession | null) => void

  // Error Handling Actions
  addError: (error: AppError) => void
  clearError: (errorId: string) => void
  clearAllErrors: () => void

  // Notification Actions
  addNotification: (notification: {
    type: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
  }) => void
  markNotificationRead: (id: string) => void
  clearNotification: (id: string) => void
  clearAllNotifications: () => void

  // Utility Actions
  reset: () => void
}

const initialState: AppState = {
  devices: [],
  selectedDeviceId: null,
  deviceConfig: {},

  ui: {
    theme: 'light',
    selectedDevice: null,
    activeTab: 'roast',
    isLoading: false,
    error: null
  },

  config: {
    ui: {
      default_theme: 'light',
      chart_refresh_rate: 1000,
      telemetry_buffer_size: 1000,
      enable_debug_mode: false
    },
    features: {
      enable_autotune: true,
      enable_profiles: true,
      enable_multi_device: true,
      enable_export: true,
      enable_advanced_charts: true
    }
  },

  chartSettings: {
    ror_filter: {
      smoothingWindow: 5,
      filterType: 'simple',
      exponentialAlpha: 0.3
    },
    display_options: {
      show_grid: true,
      show_legend: true,
      show_crosshair: true,
      auto_scale: true,
      time_format: '24h'
    },
    color_scheme: {
      background: '#ffffff',
      grid: '#f0f0f0',
      bean_temp: '#1f77b4',
      env_temp: '#ff7f0e',
      setpoint: '#2ca02c',
      ror: '#e377c2',
      fan_pwm: '#17becf',
      heater_pwm: '#d62728'
    }
  },

  telemetryData: {},
  connectionStatus: {},
  activeSessions: {},
  errors: [],
  notifications: []
}

export const useAppStore = create<AppState & AppActions>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          ...initialState,

          // Device Actions
          setDevices: (devices) =>
            set((state) => {
              state.devices = devices
            }),

          selectDevice: (deviceId) =>
            set((state) => {
              state.selectedDeviceId = deviceId
              state.ui.selectedDevice = deviceId
            }),

          updateDeviceConfig: (deviceId, config) =>
            set((state) => {
              state.deviceConfig[deviceId] = { ...state.deviceConfig[deviceId], ...config }
            }),

          // UI Actions
          setTheme: (theme) =>
            set((state) => {
              state.ui.theme = theme
            }),

          setActiveTab: (tab) =>
            set((state) => {
              state.ui.activeTab = tab
            }),

          setLoading: (isLoading) =>
            set((state) => {
              state.ui.isLoading = isLoading
            }),

          // Configuration Actions
          updateConfig: (config) =>
            set((state) => {
              state.config = { ...state.config, ...config }
            }),

          updateChartSettings: (settings) =>
            set((state) => {
              state.chartSettings = { ...state.chartSettings, ...settings }
            }),

          // Real-time Data Actions
          addTelemetryPoint: (deviceId, point) =>
            set((state) => {
              if (!state.telemetryData[deviceId]) {
                state.telemetryData[deviceId] = []
              }

              state.telemetryData[deviceId].push(point)

              // Keep buffer size under control
              const bufferSize = state.config.ui?.telemetry_buffer_size || 1000
              if (state.telemetryData[deviceId].length > bufferSize) {
                state.telemetryData[deviceId] = state.telemetryData[deviceId].slice(-bufferSize)
              }
            }),

          setConnectionStatus: (deviceId, connected) =>
            set((state) => {
              state.connectionStatus[deviceId] = connected
            }),

          clearTelemetryData: (deviceId) =>
            set((state) => {
              state.telemetryData[deviceId] = []
            }),

          // Session Actions
          setActiveSession: (deviceId, session) =>
            set((state) => {
              if (session) {
                state.activeSessions[deviceId] = session
              } else {
                delete state.activeSessions[deviceId]
              }
            }),

          // Error Handling Actions
          addError: (error) =>
            set((state) => {
              state.errors.push(error)
              // Keep only last 50 errors
              if (state.errors.length > 50) {
                state.errors = state.errors.slice(-50)
              }
            }),

          clearError: (errorId) =>
            set((state) => {
              state.errors = state.errors.filter(error => error.code !== errorId)
            }),

          clearAllErrors: () =>
            set((state) => {
              state.errors = []
            }),

          // Notification Actions
          addNotification: (notification) =>
            set((state) => {
              const id = `notification-${Date.now()}-${Math.random()}`
              state.notifications.push({
                ...notification,
                id,
                timestamp: Date.now(),
                read: false
              })

              // Keep only last 20 notifications
              if (state.notifications.length > 20) {
                state.notifications = state.notifications.slice(-20)
              }
            }),

          markNotificationRead: (id) =>
            set((state) => {
              const notification = state.notifications.find(n => n.id === id)
              if (notification) {
                notification.read = true
              }
            }),

          clearNotification: (id) =>
            set((state) => {
              state.notifications = state.notifications.filter(n => n.id !== id)
            }),

          clearAllNotifications: () =>
            set((state) => {
              state.notifications = []
            }),

          // Utility Actions
          reset: () => set(initialState)
        }))
      ),
      {
        name: 'rustroast-app-store',
        partialize: (state) => ({
          ui: state.ui,
          config: state.config,
          chartSettings: state.chartSettings,
          selectedDeviceId: state.selectedDeviceId,
          deviceConfig: state.deviceConfig
        })
      }
    ),
    {
      name: 'rustroast-app-store'
    }
  )
)

// Selectors for better performance
export const useDevices = () => useAppStore((state) => state.devices)
export const useSelectedDevice = () => useAppStore((state) => state.selectedDeviceId)
export const useUIState = () => useAppStore((state) => state.ui)
export const useChartSettings = () => useAppStore((state) => state.chartSettings)
export const useTelemetryData = (deviceId?: string) =>
  useAppStore((state) => deviceId ? state.telemetryData[deviceId] || [] : state.telemetryData)
export const useConnectionStatus = (deviceId?: string) =>
  useAppStore((state) => deviceId ? state.connectionStatus[deviceId] || false : state.connectionStatus)
export const useActiveSession = (deviceId?: string) =>
  useAppStore((state) => deviceId ? state.activeSessions[deviceId] : state.activeSessions)
export const useErrors = () => useAppStore((state) => state.errors)
export const useNotifications = () => useAppStore((state) => state.notifications)

// Action selectors
export const useAppActions = () => useAppStore((state) => ({
  setDevices: state.setDevices,
  selectDevice: state.selectDevice,
  updateDeviceConfig: state.updateDeviceConfig,
  setTheme: state.setTheme,
  setActiveTab: state.setActiveTab,
  setLoading: state.setLoading,
  updateConfig: state.updateConfig,
  updateChartSettings: state.updateChartSettings,
  addTelemetryPoint: state.addTelemetryPoint,
  setConnectionStatus: state.setConnectionStatus,
  clearTelemetryData: state.clearTelemetryData,
  setActiveSession: state.setActiveSession,
  addError: state.addError,
  clearError: state.clearError,
  clearAllErrors: state.clearAllErrors,
  addNotification: state.addNotification,
  markNotificationRead: state.markNotificationRead,
  clearNotification: state.clearNotification,
  clearAllNotifications: state.clearAllNotifications,
  reset: state.reset
}))