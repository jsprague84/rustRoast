import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useTelemetryWS } from '../ws/useTelemetryWS'
import { useTelemetryData, useLatestTelemetry, useTelemetryStats } from '../hooks/useTelemetryData'
import { useState, useCallback } from 'react'
import { TelemetryChart } from '../components/TelemetryChart'
import { ChartAnnotations, ChartAnnotation } from '../components/ChartAnnotations'

export function Live({ deviceId }: { deviceId: string }) {
  useTelemetryWS()
  const [windowSecs, setWindowSecs] = useState(900)
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([])
  const [showAnnotations, setShowAnnotations] = useState(false)

  // Use new optimized telemetry hooks
  const telemetryData = useTelemetryData({
    deviceId,
    windowSeconds: windowSecs,
    maxPoints: 1000,
    changeThreshold: 0.5
  })

  const latestFromWS = useLatestTelemetry(deviceId)
  const stats = useTelemetryStats(deviceId)

  // Fallback to API data if no WebSocket data
  const { data: latestFromAPI } = useQuery({
    queryKey: ['latest', deviceId],
    queryFn: () => api.latestTelemetry(deviceId),
    refetchInterval: 5000,
    enabled: !latestFromWS // Only fetch from API if no WebSocket data
  })

  const latest = latestFromWS || latestFromAPI

  // Annotation management
  const handleAddAnnotation = useCallback((annotation: Omit<ChartAnnotation, 'id'>) => {
    const newAnnotation: ChartAnnotation = {
      ...annotation,
      id: `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
    setAnnotations(prev => [...prev, newAnnotation])
  }, [])

  const handleRemoveAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id))
  }, [])

  const handleEditAnnotation = useCallback((id: string, updatedAnnotation: Omit<ChartAnnotation, 'id'>) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...updatedAnnotation, id } : a))
  }, [])

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Live Telemetry: {deviceId}</h1>

        {/* Controls Row */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Time Window:</label>
            <select
              value={windowSecs}
              onChange={e => setWindowSecs(parseInt(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            >
              <option value={300}>5 minutes</option>
              <option value={900}>15 minutes</option>
              <option value={1800}>30 minutes</option>
              <option value={3600}>1 hour</option>
            </select>
          </div>

          <button
            onClick={() => setShowAnnotations(!showAnnotations)}
            className={`px-3 py-1 text-sm rounded ${
              showAnnotations ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {showAnnotations ? 'Hide' : 'Show'} Annotations
          </button>

          {latest && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Latest:</span> BT {latest.beanTemp?.toFixed(1) || latest.telemetry?.beanTemp}°C,
              ET {latest.envTemp?.toFixed(1) || latest.telemetry?.envTemp}°C
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="text-sm text-gray-500">
          <span>Displaying {telemetryData.points.length} of {stats.totalPoints} data points</span>
          {telemetryData.compressionRatio < 1 && (
            <span> ({(telemetryData.compressionRatio * 100).toFixed(1)}% compression)</span>
          )}
          {stats.memoryUsage > 0 && (
            <span> • Memory: {(stats.memoryUsage / 1024).toFixed(1)}KB</span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className={`grid gap-6 ${
        showAnnotations ? 'lg:grid-cols-4' : 'grid-cols-1'
      }`}>
        {/* Chart */}
        <div className={showAnnotations ? 'lg:col-span-3' : 'col-span-1'}>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <TelemetryChart
              points={telemetryData.points}
              annotations={annotations}
              showExportControls={true}
            />
          </div>
        </div>

        {/* Annotations Panel */}
        {showAnnotations && (
          <div className="lg:col-span-1">
            <ChartAnnotations
              annotations={annotations}
              onAdd={handleAddAnnotation}
              onRemove={handleRemoveAnnotation}
              onEdit={handleEditAnnotation}
              readonly={false}
            />
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div className="mt-6 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            latest ? 'bg-green-500' : 'bg-red-500'
          }`} />
          <span>
            {latest ? 'Receiving live data' : 'No recent data'}
            {latest && (
              <span className="ml-2">
                (last update: {new Date((latest.ts || latest.telemetry?.timestamp / 1000 || 0) * 1000).toLocaleTimeString()})
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

