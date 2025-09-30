import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Live } from '../pages/Live'
import { Roaster } from '../pages/Roaster'
import { ChartSettingsProvider } from '../context/ChartSettingsContext'
import { TelemetryRingBuffer, type TelemetryPoint } from '../utils/dataCompression'
import { useWsStore } from '../ws/useTelemetryWS'

// Mock API client
vi.mock('../api/client', () => ({
  api: {
    latestTelemetry: vi.fn(),
    listSessions: vi.fn(() => Promise.resolve([]))
  }
}))

// Mock WebSocket store
vi.mock('../ws/useTelemetryWS', () => ({
  useTelemetryWS: vi.fn(),
  useWsStore: vi.fn()
}))

// Mock chart components
vi.mock('../components/TelemetryChart', () => ({
  TelemetryChart: ({ points }: { points: any[] }) => (
    <div data-testid="telemetry-chart">
      Chart with {points.length} points
    </div>
  )
}))

vi.mock('../components/RoastOperatorInterface', () => ({
  RoastOperatorInterface: ({ deviceId, session }: any) => (
    <div data-testid="roast-operator-interface">
      Roaster Interface for {deviceId} {session ? `with session ${session.id}` : 'no session'}
    </div>
  )
}))

describe('Integration Tests', () => {
  let queryClient: QueryClient
  let mockStore: any
  let mockBuffer: TelemetryRingBuffer

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })

    mockBuffer = new TelemetryRingBuffer(1000)
    mockStore = {
      connected: true,
      connecting: false,
      ringBuffers: { 'test-device': mockBuffer },
      compressionStates: {},
      push: vi.fn(),
      getDeviceData: vi.fn(() => []),
      clearDeviceData: vi.fn()
    }

    vi.mocked(useWsStore).mockReturnValue(mockStore)
    vi.mocked(require('../ws/useTelemetryWS').useTelemetryWS).mockReturnValue(undefined)
  })

  afterEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ChartSettingsProvider>
        {children}
      </ChartSettingsProvider>
    </QueryClientProvider>
  )

  describe('Live Page Integration', () => {
    it('should render live page with telemetry data', async () => {
      const mockTelemetryData: TelemetryPoint[] = [
        {
          ts: Date.now() / 1000 - 100,
          beanTemp: 200,
          envTemp: 180,
          setpoint: 210,
          fanPWM: 128,
          heaterPWM: 85,
          controlMode: 'auto',
          heaterEnable: true,
          rateOfRise: 5.2,
          Kp: 10,
          Ki: 0.5,
          Kd: 2
        },
        {
          ts: Date.now() / 1000 - 50,
          beanTemp: 205,
          envTemp: 185,
          setpoint: 210,
          fanPWM: 130,
          heaterPWM: 90,
          controlMode: 'auto',
          heaterEnable: true,
          rateOfRise: 6.1,
          Kp: 10,
          Ki: 0.5,
          Kd: 2
        }
      ]

      // Populate mock buffer with data
      mockTelemetryData.forEach(point => mockBuffer.push(point))
      mockStore.getDeviceData.mockReturnValue(mockTelemetryData)

      render(
        <TestWrapper>
          <Live deviceId="test-device" />
        </TestWrapper>
      )

      expect(screen.getByText('Live: test-device')).toBeInTheDocument()
      expect(screen.getByTestId('telemetry-chart')).toBeInTheDocument()

      // Check that latest data is displayed
      await waitFor(() => {
        expect(screen.getByText(/Last: BT 205/)).toBeInTheDocument()
        expect(screen.getByText(/ET 185/)).toBeInTheDocument()
      })

      // Check points count
      expect(screen.getByText(/Points: 2\/2/)).toBeInTheDocument()
    })

    it('should handle empty telemetry data gracefully', () => {
      mockStore.getDeviceData.mockReturnValue([])

      render(
        <TestWrapper>
          <Live deviceId="test-device" />
        </TestWrapper>
      )

      expect(screen.getByText('Live: test-device')).toBeInTheDocument()
      expect(screen.getByText('Chart with 0 points')).toBeInTheDocument()
      expect(screen.getByText(/Points: 0\/0/)).toBeInTheDocument()
    })

    it('should allow window size selection', () => {
      render(
        <TestWrapper>
          <Live deviceId="test-device" />
        </TestWrapper>
      )

      const windowSelect = screen.getByDisplayValue('15m')
      expect(windowSelect).toBeInTheDocument()

      // Check all window options are available
      expect(screen.getByText('5m')).toBeInTheDocument()
      expect(screen.getByText('30m')).toBeInTheDocument()
      expect(screen.getByText('1h')).toBeInTheDocument()
    })
  })

  describe('Roaster Page Integration', () => {
    it('should render roaster page with no active session', () => {
      render(
        <TestWrapper>
          <Roaster deviceId="test-device" />
        </TestWrapper>
      )

      expect(screen.getByTestId('roast-operator-interface')).toBeInTheDocument()
      expect(screen.getByText(/Roaster Interface for test-device no session/)).toBeInTheDocument()
    })

    it('should display active session when available', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          status: 'completed',
          device_id: 'test-device',
          start_time: '2023-01-01T00:00:00Z',
          end_time: '2023-01-01T01:00:00Z'
        },
        {
          id: 'session-2',
          status: 'active',
          device_id: 'test-device',
          start_time: '2023-01-01T02:00:00Z',
          end_time: null
        }
      ]

      const { api } = await vi.importActual('../api/client') as any
      api.listSessions = vi.fn().mockResolvedValue(mockSessions)

      render(
        <TestWrapper>
          <Roaster deviceId="test-device" />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText(/with session session-2/)).toBeInTheDocument()
      })
    })
  })

  describe('Data Flow Integration', () => {
    it('should handle complete data flow from WebSocket to chart', async () => {
      // Simulate WebSocket data flow
      const telemetryData: TelemetryPoint[] = []

      // Generate realistic time series data
      const startTime = Date.now() / 1000
      for (let i = 0; i < 50; i++) {
        const point: TelemetryPoint = {
          ts: startTime + i * 10, // Every 10 seconds
          beanTemp: 150 + i * 1.5 + Math.sin(i * 0.1) * 3,
          envTemp: 120 + i * 0.8 + Math.cos(i * 0.1) * 2,
          setpoint: 200,
          fanPWM: 128 + (i % 20),
          heaterPWM: 70 + (i % 30),
          controlMode: i % 10 === 0 ? 'manual' : 'auto',
          heaterEnable: i % 5 !== 0,
          rateOfRise: 2 + Math.random() * 6,
          Kp: 10,
          Ki: 0.5,
          Kd: 2
        }
        telemetryData.push(point)
        mockBuffer.push(point)
      }

      mockStore.getDeviceData.mockReturnValue(telemetryData)

      render(
        <TestWrapper>
          <Live deviceId="test-device" />
        </TestWrapper>
      )

      // Check that data is properly displayed
      await waitFor(() => {
        const chartElement = screen.getByTestId('telemetry-chart')
        expect(chartElement.textContent).toContain('50 points')
      })

      // Check latest values
      const lastPoint = telemetryData[telemetryData.length - 1]
      expect(screen.getByText(new RegExp(`BT ${lastPoint.beanTemp?.toFixed(1)}`))).toBeInTheDocument()
      expect(screen.getByText(new RegExp(`ET ${lastPoint.envTemp?.toFixed(1)}`))).toBeInTheDocument()
    })

    it('should handle data compression and memory management', () => {
      // Simulate large dataset that triggers compression
      const largeDataset: TelemetryPoint[] = []
      const startTime = Date.now() / 1000

      for (let i = 0; i < 2000; i++) {
        const point: TelemetryPoint = {
          ts: startTime + i,
          beanTemp: 150 + i * 0.05,
          envTemp: 120 + i * 0.03,
          setpoint: 200,
          fanPWM: 128,
          heaterPWM: 75,
          controlMode: 'auto',
          heaterEnable: true,
          rateOfRise: 5.0,
          Kp: 10,
          Ki: 0.5,
          Kd: 2
        }
        largeDataset.push(point)
      }

      // Ring buffer should only keep last 1000 points
      largeDataset.forEach(point => mockBuffer.push(point))
      expect(mockBuffer.size()).toBe(1000)

      const bufferedData = mockBuffer.getPoints()
      mockStore.getDeviceData.mockReturnValue(bufferedData)

      render(
        <TestWrapper>
          <Live deviceId="test-device" />
        </TestWrapper>
      )

      // Should show compressed data
      expect(screen.getByText(/Points: 1000\/1000/)).toBeInTheDocument()
    })

    it('should handle real-time updates', async () => {
      // Start with some initial data
      const initialData: TelemetryPoint[] = [{
        ts: Date.now() / 1000 - 60,
        beanTemp: 180,
        envTemp: 150,
        setpoint: 200,
        fanPWM: 128,
        heaterPWM: 75,
        controlMode: 'auto',
        heaterEnable: true,
        rateOfRise: 5.0,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      }]

      initialData.forEach(point => mockBuffer.push(point))
      mockStore.getDeviceData.mockReturnValue(initialData)

      const { rerender } = render(
        <TestWrapper>
          <Live deviceId="test-device" />
        </TestWrapper>
      )

      expect(screen.getByText('Chart with 1 points')).toBeInTheDocument()

      // Simulate new data arriving
      const newPoint: TelemetryPoint = {
        ts: Date.now() / 1000,
        beanTemp: 185,
        envTemp: 155,
        setpoint: 200,
        fanPWM: 130,
        heaterPWM: 80,
        controlMode: 'auto',
        heaterEnable: true,
        rateOfRise: 5.5,
        Kp: 10,
        Ki: 0.5,
        Kd: 2
      }

      mockBuffer.push(newPoint)
      const updatedData = mockBuffer.getPoints()
      mockStore.getDeviceData.mockReturnValue(updatedData)

      rerender(
        <TestWrapper>
          <Live deviceId="test-device" />
        </TestWrapper>
      )

      expect(screen.getByText('Chart with 2 points')).toBeInTheDocument()
      expect(screen.getByText(/BT 185/)).toBeInTheDocument()
    })
  })

  describe('Error Handling Integration', () => {
    it('should handle WebSocket connection errors gracefully', () => {
      mockStore.connected = false
      mockStore.connecting = false
      mockStore.lastError = 'Connection failed'

      render(
        <TestWrapper>
          <Live deviceId="test-device" />
        </TestWrapper>
      )

      // Should still render the page without crashing
      expect(screen.getByText('Live: test-device')).toBeInTheDocument()
      expect(screen.getByTestId('telemetry-chart')).toBeInTheDocument()
    })

    it('should handle missing device data', () => {
      mockStore.ringBuffers = {}
      mockStore.getDeviceData.mockReturnValue([])

      render(
        <TestWrapper>
          <Live deviceId="nonexistent-device" />
        </TestWrapper>
      )

      expect(screen.getByText('Live: nonexistent-device')).toBeInTheDocument()
      expect(screen.getByText('Chart with 0 points')).toBeInTheDocument()
    })
  })
})