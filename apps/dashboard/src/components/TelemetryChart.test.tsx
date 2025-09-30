import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TelemetryChart } from './TelemetryChart'
import { TelemetryPoint } from '../utils/dataCompression'
import { ProfileWithPoints } from '../api/client'
import { ChartSettingsProvider } from '../context/ChartSettingsContext'

// Mock ECharts component since it requires canvas
vi.mock('echarts-for-react', () => ({
  default: ({ option, ...props }: any) => (
    <div data-testid="echarts-mock" {...props}>
      <pre data-testid="chart-option">{JSON.stringify(option, null, 2)}</pre>
    </div>
  )
}))

// Mock RoR calculations
vi.mock('../utils/rorCalculations', () => ({
  calculateRoR: vi.fn((points) => points.map((p: any, i: number) => ({
    time: p.time,
    temperature: p.temperature,
    ror: 5 + Math.sin(i * 0.1) * 2
  }))),
  DEFAULT_ROR_CONFIG: {
    polyDegree: 4,
    dataWindow: 30
  },
  calculateRoastPhaseStats: vi.fn(() => ({
    overallRoR: 6.5,
    maxRoR: 12.3,
    minRoR: -1.2
  }))
}))

// Mock chart settings context
vi.mock('../context/ChartSettingsContext', () => ({
  useChartSettings: () => ({
    settings: {
      rorSmoothing: 0.3,
      temperatureSmoothing: 0.2
    }
  }),
  ChartSettingsProvider: ({ children }: any) => <div>{children}</div>
}))

const mockTelemetryPoints: TelemetryPoint[] = [
  {
    ts: 1000,
    beanTemp: 150,
    envTemp: 120,
    setpoint: 200,
    fanPWM: 128,
    heaterPWM: 75,
    controlMode: 'auto',
    heaterEnable: true,
    rateOfRise: 5.2,
    Kp: 10,
    Ki: 0.5,
    Kd: 2
  },
  {
    ts: 1060,
    beanTemp: 165,
    envTemp: 135,
    setpoint: 200,
    fanPWM: 130,
    heaterPWM: 80,
    controlMode: 'auto',
    heaterEnable: true,
    rateOfRise: 6.1,
    Kp: 10,
    Ki: 0.5,
    Kd: 2
  },
  {
    ts: 1120,
    beanTemp: 180,
    envTemp: 150,
    setpoint: 200,
    fanPWM: 135,
    heaterPWM: 85,
    controlMode: 'auto',
    heaterEnable: true,
    rateOfRise: 4.8,
    Kp: 10,
    Ki: 0.5,
    Kd: 2
  }
]

const mockProfile: ProfileWithPoints = {
  id: 'test-profile',
  name: 'Test Profile',
  created_at: '2023-01-01T00:00:00Z',
  points: [
    { time_seconds: 0, target_temp: 150 },
    { time_seconds: 60, target_temp: 165 },
    { time_seconds: 120, target_temp: 180 },
    { time_seconds: 180, target_temp: 200 }
  ]
}

describe('TelemetryChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render chart with telemetry data', () => {
    render(
      <ChartSettingsProvider>
        <TelemetryChart points={mockTelemetryPoints} />
      </ChartSettingsProvider>
    )

    expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()

    const chartOption = JSON.parse(
      screen.getByTestId('chart-option').textContent || '{}'
    )

    expect(chartOption.series).toBeDefined()
    expect(chartOption.series.length).toBeGreaterThan(0)

    // Check for expected series
    const seriesNames = chartOption.series.map((s: any) => s.name)
    expect(seriesNames).toContain('BT')
    expect(seriesNames).toContain('ET')
    expect(seriesNames).toContain('Target')
    expect(seriesNames).toContain('Fan %')
    expect(seriesNames).toContain('Heater %')

    // Check for new chart features
    expect(chartOption.toolbox).toBeDefined()
    expect(chartOption.dataZoom).toBeDefined()
    expect(chartOption.brush).toBeDefined()
  })

  it('should handle empty points array', () => {
    render(
      <ChartSettingsProvider>
        <TelemetryChart points={[]} />
      </ChartSettingsProvider>
    )

    expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()

    const chartOption = JSON.parse(
      screen.getByTestId('chart-option').textContent || '{}'
    )

    expect(chartOption.series).toBeDefined()
    // Should still have series but with empty data
    chartOption.series.forEach((series: any) => {
      if (series.data) {
        expect(series.data.every((point: any) => point[1] === null || point[1] === undefined)).toBe(true)
      }
    })
  })

  it('should toggle between Artisan RoR and Basic RoR', () => {
    render(
      <ChartSettingsProvider>
        <TelemetryChart points={mockTelemetryPoints} />
      </ChartSettingsProvider>
    )

    // Should start with Artisan RoR
    expect(screen.getByText('Artisan RoR')).toBeInTheDocument()

    // Click to toggle to Basic RoR
    fireEvent.click(screen.getByText('Artisan RoR'))

    expect(screen.getByText('Basic RoR')).toBeInTheDocument()

    // Check that chart option includes Basic RoR series
    const chartOption = JSON.parse(
      screen.getByTestId('chart-option').textContent || '{}'
    )
    const seriesNames = chartOption.series.map((s: any) => s.name)
    expect(seriesNames).toContain('RoR (Basic)')
  })

  it('should display RoR statistics when available', () => {
    render(
      <ChartSettingsProvider>
        <TelemetryChart points={mockTelemetryPoints} />
      </ChartSettingsProvider>
    )

    expect(screen.getByText(/Avg: 6.5°C\/min/)).toBeInTheDocument()
    expect(screen.getByText(/Max: 12.3°C\/min/)).toBeInTheDocument()
    expect(screen.getByText(/Min: -1.2°C\/min/)).toBeInTheDocument()
  })

  it('should render profile overlay when provided', () => {
    const sessionStartTime = 1000

    render(
      <ChartSettingsProvider>
        <TelemetryChart
          points={mockTelemetryPoints}
          profile={mockProfile}
          sessionStartTime={sessionStartTime}
        />
      </ChartSettingsProvider>
    )

    const chartOption = JSON.parse(
      screen.getByTestId('chart-option').textContent || '{}'
    )

    const seriesNames = chartOption.series.map((s: any) => s.name)
    expect(seriesNames).toContain('Profile')

    // Check that profile series has correct data
    const profileSeries = chartOption.series.find((s: any) => s.name === 'Profile')
    expect(profileSeries.data).toBeDefined()
    expect(profileSeries.data.length).toBe(mockProfile.points.length)
  })

  it('should handle legacy telemetry point format', () => {
    const legacyPoints = [
      {
        ts: 1000,
        telemetry: {
          beanTemp: 150,
          envTemp: 120,
          setpoint: 200,
          fanPWM: 128,
          heaterPWM: 75,
          rateOfRise: 5.2
        }
      }
    ]

    render(
      <ChartSettingsProvider>
        <TelemetryChart points={legacyPoints as any} />
      </ChartSettingsProvider>
    )

    expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()

    const chartOption = JSON.parse(
      screen.getByTestId('chart-option').textContent || '{}'
    )

    // Check that data is properly extracted from legacy format
    const btSeries = chartOption.series.find((s: any) => s.name === 'BT')
    expect(btSeries.data[0][1]).toBe(150)
  })

  it('should handle null values in telemetry data', () => {
    const pointsWithNulls: TelemetryPoint[] = [
      {
        ts: 1000,
        beanTemp: null,
        envTemp: 120,
        setpoint: 200,
        fanPWM: null,
        heaterPWM: 75,
        controlMode: 'auto',
        heaterEnable: true,
        rateOfRise: null,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      }
    ]

    render(
      <ChartSettingsProvider>
        <TelemetryChart points={pointsWithNulls} />
      </ChartSettingsProvider>
    )

    expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()

    const chartOption = JSON.parse(
      screen.getByTestId('chart-option').textContent || '{}'
    )

    // Check that null values are handled properly
    const btSeries = chartOption.series.find((s: any) => s.name === 'BT')
    expect(btSeries.data[0][1]).toBeNull()

    const etSeries = chartOption.series.find((s: any) => s.name === 'ET')
    expect(etSeries.data[0][1]).toBe(120)
  })

  it('should apply correct smoothing and styling', () => {
    render(
      <ChartSettingsProvider>
        <TelemetryChart points={mockTelemetryPoints} />
      </ChartSettingsProvider>
    )

    const chartOption = JSON.parse(
      screen.getByTestId('chart-option').textContent || '{}'
    )

    // Check that series have correct smoothing applied
    const btSeries = chartOption.series.find((s: any) => s.name === 'BT')
    expect(btSeries.smooth).toBe(0.3)
    expect(btSeries.lineStyle.color).toBe('#1f77b4')

    const etSeries = chartOption.series.find((s: any) => s.name === 'ET')
    expect(etSeries.smooth).toBe(0.3)
    expect(etSeries.lineStyle.color).toBe('#ff7f0e')
  })

  it('should configure axes correctly', () => {
    render(
      <ChartSettingsProvider>
        <TelemetryChart points={mockTelemetryPoints} />
      </ChartSettingsProvider>
    )

    const chartOption = JSON.parse(
      screen.getByTestId('chart-option').textContent || '{}'
    )

    expect(chartOption.yAxis).toHaveLength(3)

    // Temperature axis
    expect(chartOption.yAxis[0].name).toBe('Temperature (°C)')
    expect(chartOption.yAxis[0].min).toBe(0)
    expect(chartOption.yAxis[0].max).toBe(250)

    // RoR axis
    expect(chartOption.yAxis[1].name).toBe('RoR (°C/min)')
    expect(chartOption.yAxis[1].position).toBe('right')

    // PWM axis
    expect(chartOption.yAxis[2].name).toBe('PWM %')
    expect(chartOption.yAxis[2].min).toBe(0)
    expect(chartOption.yAxis[2].max).toBe(100)
  })

  it('should show appropriate description for Artisan RoR', () => {
    render(
      <ChartSettingsProvider>
        <TelemetryChart points={mockTelemetryPoints} />
      </ChartSettingsProvider>
    )

    expect(screen.getByText('Using Artisan polynomial least squares RoR calculation')).toBeInTheDocument()
  })

  it('should render export controls when enabled', () => {
    render(
      <ChartSettingsProvider>
        <TelemetryChart points={mockTelemetryPoints} showExportControls={true} />
      </ChartSettingsProvider>
    )

    expect(screen.getByText('Export ▼')).toBeInTheDocument()
  })

  it('should handle annotations', () => {
    const annotations = [
      {
        id: 'test-1',
        time: 1000,
        label: 'Test Annotation',
        color: '#ff0000',
        type: 'event' as const
      }
    ]

    render(
      <ChartSettingsProvider>
        <TelemetryChart points={mockTelemetryPoints} annotations={annotations} />
      </ChartSettingsProvider>
    )

    const chartOption = JSON.parse(
      screen.getByTestId('chart-option').textContent || '{}'
    )

    // Check that markLine is added to the first series
    expect(chartOption.series[0].markLine).toBeDefined()
    expect(chartOption.series[0].markLine.data).toHaveLength(1)
  })

  it('should display annotations info when annotations exist', () => {
    const annotations = [
      {
        id: 'test-1',
        time: 1000,
        label: 'Test Annotation',
        color: '#ff0000',
        type: 'event' as const
      },
      {
        id: 'test-2',
        time: 1060,
        label: 'Another Annotation',
        color: '#00ff00',
        type: 'milestone' as const
      }
    ]

    render(
      <ChartSettingsProvider>
        <TelemetryChart points={mockTelemetryPoints} annotations={annotations} />
      </ChartSettingsProvider>
    )

    expect(screen.getByText('2 annotations on chart')).toBeInTheDocument()
  })
})