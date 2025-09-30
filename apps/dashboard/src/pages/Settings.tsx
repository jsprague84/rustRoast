import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { Debug } from './Debug'
import { ChartSettings } from '../components/ChartSettings'
import { useChartSettings } from '../context/ChartSettingsContext'

type Props = {
  deviceId: string
  onDeviceChange: (deviceId: string) => void
}

type SettingsTab = 'debug' | 'config'

export function Settings({ deviceId, onDeviceChange }: Props) {
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('config')
  const { settings: chartSettings, updateSettings: setChartSettings } = useChartSettings()

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: '700' }}>
        Settings
      </h1>

      {/* Settings Navigation */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '16px'
      }}>
        {[
          { key: 'config', label: '⚙️ Config' },
          { key: 'debug', label: '🐛 Debug' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSettingsTab(key as SettingsTab)}
            style={{
              padding: '8px 16px',
              backgroundColor: settingsTab === key ? '#3b82f6' : 'transparent',
              color: settingsTab === key ? 'white' : '#374151',
              border: settingsTab === key ? 'none' : '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Settings Content */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        padding: '20px'
      }}>
        {settingsTab === 'config' && (
          <ChartSettings
            settings={chartSettings}
            onSettingsChange={setChartSettings}
          />
        )}

        {settingsTab === 'debug' && (
          <Debug deviceId={deviceId} onDeviceChange={onDeviceChange} />
        )}
      </div>
    </div>
  )
}