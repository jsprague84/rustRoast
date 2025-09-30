import { useState, useEffect } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { useNotify } from '../system/NotificationProvider'
import { DeviceType, DeviceCapabilities, AppConfig } from '../../types'

interface DeviceConfigurationProps {
  deviceId: string
  onConfigChange?: (config: AppConfig) => void
}

export function DeviceConfiguration({ deviceId, onConfigChange }: DeviceConfigurationProps) {
  const [config, setConfig] = useState<AppConfig>({
    devices: {},
    defaultDeviceId: deviceId,
    theme: 'light',
    notifications: { enabled: true, sound: false },
    chart: {
      temperatureUnit: 'celsius',
      timeFormat: '24h',
      gridLines: true,
      smoothing: false
    }
  })
  const [loading, setLoading] = useState(false)
  const notify = useNotify()

  // Load configuration from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('rustroast-config')
      if (saved) {
        const parsed = JSON.parse(saved)
        setConfig(prev => ({ ...prev, ...parsed }))
      }
    } catch (error) {
      console.error('Failed to load configuration:', error)
      notify({
        type: 'error',
        title: 'Configuration Error',
        message: 'Failed to load saved configuration'
      })
    }
  }, [notify])

  const handleDeviceTypeChange = (type: DeviceType) => {
    const capabilities = getDefaultCapabilities(type)
    const updatedConfig = {
      ...config,
      devices: {
        ...config.devices,
        [deviceId]: {
          type,
          capabilities,
          name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${deviceId}`,
          settings: getDefaultSettings(type)
        }
      }
    }

    setConfig(updatedConfig)
    saveConfiguration(updatedConfig)
  }

  const handleCapabilityToggle = (capability: keyof DeviceCapabilities) => {
    if (!config.devices[deviceId]) return

    const updatedConfig = {
      ...config,
      devices: {
        ...config.devices,
        [deviceId]: {
          ...config.devices[deviceId],
          capabilities: {
            ...config.devices[deviceId].capabilities,
            [capability]: !config.devices[deviceId].capabilities?.[capability]
          }
        }
      }
    }

    setConfig(updatedConfig)
    saveConfiguration(updatedConfig)
  }

  const saveConfiguration = async (newConfig: AppConfig) => {
    setLoading(true)
    try {
      localStorage.setItem('rustroast-config', JSON.stringify(newConfig))
      onConfigChange?.(newConfig)
      notify({
        type: 'success',
        title: 'Configuration Saved',
        message: 'Device configuration has been updated'
      })
    } catch (error) {
      console.error('Failed to save configuration:', error)
      notify({
        type: 'error',
        title: 'Save Error',
        message: 'Failed to save configuration'
      })
    } finally {
      setLoading(false)
    }
  }

  const deviceConfig = config.devices[deviceId]
  const deviceType = deviceConfig?.type || 'coffee_roaster'
  const capabilities = deviceConfig?.capabilities || getDefaultCapabilities('coffee_roaster')

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Device Configuration</h3>
          {loading && <LoadingSpinner size="sm" />}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Device Type
          </label>
          <select
            value={deviceType}
            onChange={e => handleDeviceTypeChange(e.target.value as DeviceType)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="coffee_roaster">Coffee Roaster</option>
            <option value="smoker">Smoker</option>
            <option value="oven">Oven</option>
            <option value="generic">Generic Controller</option>
          </select>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Device Capabilities</h4>
          <div className="space-y-2">
            {Object.entries(capabilities).map(([key, enabled]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => handleCapabilityToggle(key as keyof DeviceCapabilities)}
                  className="rounded"
                />
                <span className="text-sm text-gray-600">
                  {getCapabilityLabel(key as keyof DeviceCapabilities)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-500">
            <p><strong>Device ID:</strong> {deviceId}</p>
            <p><strong>Type:</strong> {deviceType}</p>
            <p><strong>Configured Capabilities:</strong> {Object.values(capabilities).filter(Boolean).length}</p>
          </div>
        </div>
      </div>
    </Card>
  )
}

function getDefaultCapabilities(type: DeviceType): DeviceCapabilities {
  switch (type) {
    case 'coffee_roaster':
      return {
        temperatureControl: true,
        fanControl: true,
        heaterControl: true,
        pidControl: true,
        profileSupport: true,
        autoTune: true,
        emergencyStop: true,
        dataLogging: true
      }
    case 'smoker':
      return {
        temperatureControl: true,
        fanControl: false,
        heaterControl: true,
        pidControl: true,
        profileSupport: true,
        autoTune: false,
        emergencyStop: true,
        dataLogging: true
      }
    case 'oven':
      return {
        temperatureControl: true,
        fanControl: true,
        heaterControl: true,
        pidControl: false,
        profileSupport: false,
        autoTune: false,
        emergencyStop: true,
        dataLogging: true
      }
    case 'generic':
    default:
      return {
        temperatureControl: false,
        fanControl: false,
        heaterControl: false,
        pidControl: false,
        profileSupport: false,
        autoTune: false,
        emergencyStop: false,
        dataLogging: true
      }
  }
}

function getDefaultSettings(type: DeviceType) {
  switch (type) {
    case 'coffee_roaster':
      return {
        maxTemperature: 250,
        minTemperature: 20,
        temperatureStep: 1,
        fanSpeedMax: 255,
        heaterPowerMax: 100
      }
    case 'smoker':
      return {
        maxTemperature: 150,
        minTemperature: 20,
        temperatureStep: 1,
        fanSpeedMax: 100,
        heaterPowerMax: 100
      }
    case 'oven':
      return {
        maxTemperature: 300,
        minTemperature: 20,
        temperatureStep: 5,
        fanSpeedMax: 100,
        heaterPowerMax: 100
      }
    default:
      return {
        maxTemperature: 100,
        minTemperature: 0,
        temperatureStep: 1,
        fanSpeedMax: 100,
        heaterPowerMax: 100
      }
  }
}

function getCapabilityLabel(capability: keyof DeviceCapabilities): string {
  const labels: Record<keyof DeviceCapabilities, string> = {
    temperatureControl: 'Temperature Control',
    fanControl: 'Fan Control',
    heaterControl: 'Heater Control',
    pidControl: 'PID Control',
    profileSupport: 'Profile Support',
    autoTune: 'Auto-Tune',
    emergencyStop: 'Emergency Stop',
    dataLogging: 'Data Logging'
  }
  return labels[capability] || capability
}