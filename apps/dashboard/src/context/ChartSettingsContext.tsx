import { createContext, useContext, useState, useEffect } from 'react'
import { RoRFilterSettings } from '../components/ChartSettings'

const STORAGE_KEY = 'rustroast-chart-settings'

const DEFAULT_SETTINGS: RoRFilterSettings = {
  smoothingWindow: 5,
  filterType: 'simple',
  exponentialAlpha: 0.3
}

type ChartSettingsContextType = {
  settings: RoRFilterSettings
  updateSettings: (settings: RoRFilterSettings) => void
}

const ChartSettingsContext = createContext<ChartSettingsContextType | null>(null)

export function ChartSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<RoRFilterSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  const updateSettings = (newSettings: RoRFilterSettings) => {
    setSettings(newSettings)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings))
  }

  return (
    <ChartSettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </ChartSettingsContext.Provider>
  )
}

export function useChartSettings() {
  const context = useContext(ChartSettingsContext)
  if (!context) {
    throw new Error('useChartSettings must be used within a ChartSettingsProvider')
  }
  return context
}