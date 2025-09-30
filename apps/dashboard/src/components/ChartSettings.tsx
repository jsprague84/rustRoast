import { useState, useEffect } from 'react'

export interface RoRFilterSettings {
  smoothingWindow: number
  filterType: 'none' | 'simple' | 'exponential'
  exponentialAlpha: number
}

interface Props {
  settings: RoRFilterSettings
  onSettingsChange: (settings: RoRFilterSettings) => void
}

const DEFAULT_SETTINGS: RoRFilterSettings = {
  smoothingWindow: 5,
  filterType: 'simple',
  exponentialAlpha: 0.3
}

export function ChartSettings({ settings, onSettingsChange }: Props) {
  const [localSettings, setLocalSettings] = useState<RoRFilterSettings>(settings)

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  const handleSettingChange = (key: keyof RoRFilterSettings, value: any) => {
    const newSettings = { ...localSettings, [key]: value }
    setLocalSettings(newSettings)
    onSettingsChange(newSettings)
  }

  return (
    <div>
      <h2 style={{
        fontSize: '1.25rem',
        fontWeight: '600',
        marginBottom: '1rem',
        color: 'var(--color-gray-900)'
      }}>
        📊 Chart Settings
      </h2>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{
          fontSize: '1rem',
          fontWeight: '600',
          marginBottom: '1rem',
          color: 'var(--color-gray-800)'
        }}>
          Rate of Rise (RoR) Filtering
        </h3>

        <div style={{ display: 'grid', gap: '1rem' }}>
          {/* Filter Type Selection */}
          <div>
            <label className="form-label">
              Filter Type
            </label>
            <select
              className="form-input"
              value={localSettings.filterType}
              onChange={(e) => handleSettingChange('filterType', e.target.value as RoRFilterSettings['filterType'])}
              style={{ width: '100%' }}
            >
              <option value="none">No Filtering (Raw Data)</option>
              <option value="simple">Simple Moving Average</option>
              <option value="exponential">Exponential Moving Average</option>
            </select>
            <p style={{
              fontSize: '0.75rem',
              color: 'var(--color-gray-500)',
              marginTop: '0.25rem',
              margin: '0.25rem 0 0 0'
            }}>
              Choose how to smooth the Rate of Rise data for better readability
            </p>
          </div>

          {/* Smoothing Window (for Simple Moving Average) */}
          {localSettings.filterType === 'simple' && (
            <div>
              <label className="form-label">
                Smoothing Window (data points)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input
                  type="range"
                  min="2"
                  max="20"
                  step="1"
                  value={localSettings.smoothingWindow}
                  onChange={(e) => handleSettingChange('smoothingWindow', parseInt(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{
                  minWidth: '3rem',
                  fontWeight: '500',
                  color: 'var(--color-gray-700)'
                }}>
                  {localSettings.smoothingWindow}
                </span>
              </div>
              <p style={{
                fontSize: '0.75rem',
                color: 'var(--color-gray-500)',
                marginTop: '0.25rem',
                margin: '0.25rem 0 0 0'
              }}>
                Number of recent data points to average. Higher values = smoother but more delayed.
              </p>
            </div>
          )}

          {/* Exponential Alpha (for Exponential Moving Average) */}
          {localSettings.filterType === 'exponential' && (
            <div>
              <label className="form-label">
                Smoothing Factor (α)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={localSettings.exponentialAlpha}
                  onChange={(e) => handleSettingChange('exponentialAlpha', parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{
                  minWidth: '3rem',
                  fontWeight: '500',
                  color: 'var(--color-gray-700)'
                }}>
                  {localSettings.exponentialAlpha.toFixed(1)}
                </span>
              </div>
              <p style={{
                fontSize: '0.75rem',
                color: 'var(--color-gray-500)',
                marginTop: '0.25rem',
                margin: '0.25rem 0 0 0'
              }}>
                Lower values (0.1-0.3) = more smoothing, Higher values (0.7-1.0) = more responsive
              </p>
            </div>
          )}

          {/* Filter Preview/Info */}
          <div style={{
            padding: '0.75rem',
            backgroundColor: 'var(--color-blue-50)',
            border: '1px solid var(--color-blue-200)',
            borderRadius: '0.5rem'
          }}>
            <div style={{
              fontSize: '0.875rem',
              fontWeight: '500',
              color: 'var(--color-blue-800)',
              marginBottom: '0.25rem'
            }}>
              Current Filter Configuration:
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-blue-700)' }}>
              {localSettings.filterType === 'none' && 'Raw, unfiltered Rate of Rise data'}
              {localSettings.filterType === 'simple' &&
                `Simple moving average over ${localSettings.smoothingWindow} data points`}
              {localSettings.filterType === 'exponential' &&
                `Exponential moving average with α=${localSettings.exponentialAlpha}`}
            </div>
          </div>

          {/* Reset to Defaults */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button
              onClick={() => {
                setLocalSettings(DEFAULT_SETTINGS)
                onSettingsChange(DEFAULT_SETTINGS)
              }}
              className="btn-secondary"
              style={{ fontSize: '0.875rem' }}
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Utility functions for RoR filtering
export class RoRFilter {
  private simpleBuffer: number[] = []
  private exponentialValue: number | null = null

  constructor(private settings: RoRFilterSettings) {}

  updateSettings(settings: RoRFilterSettings) {
    this.settings = settings
    // Reset buffers when settings change
    if (settings.filterType !== 'simple') {
      this.simpleBuffer = []
    }
    if (settings.filterType !== 'exponential') {
      this.exponentialValue = null
    }
  }

  filter(newValue: number): number {
    switch (this.settings.filterType) {
      case 'none':
        return newValue

      case 'simple':
        this.simpleBuffer.push(newValue)
        if (this.simpleBuffer.length > this.settings.smoothingWindow) {
          this.simpleBuffer.shift()
        }
        return this.simpleBuffer.reduce((sum, val) => sum + val, 0) / this.simpleBuffer.length

      case 'exponential':
        if (this.exponentialValue === null) {
          this.exponentialValue = newValue
          return newValue
        }
        this.exponentialValue = (this.settings.exponentialAlpha * newValue) +
                               ((1 - this.settings.exponentialAlpha) * this.exponentialValue)
        return this.exponentialValue

      default:
        return newValue
    }
  }

  reset() {
    this.simpleBuffer = []
    this.exponentialValue = null
  }
}