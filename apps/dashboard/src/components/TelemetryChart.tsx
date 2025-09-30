import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import { useMemo, useState, useRef } from 'react'
import { ProfileWithPoints } from '../api/client'
import {
  calculateRoR,
  DEFAULT_ROR_CONFIG,
  calculateRoastPhaseStats,
  type TemperaturePoint
} from '../utils/rorCalculations'
import { useChartSettings } from '../context/ChartSettingsContext'
import { RoRFilter } from './ChartSettings'
import { TelemetryPoint } from '../utils/dataCompression'
import { ChartAnnotation } from './ChartAnnotations'

// Support both legacy and new telemetry point formats
type LegacyTelemetryPoint = { ts: number; telemetry: any }
type SupportedTelemetryPoint = TelemetryPoint | LegacyTelemetryPoint

type Props = {
  points: SupportedTelemetryPoint[]
  profile?: ProfileWithPoints
  sessionStartTime?: number
  showExportControls?: boolean
  annotations?: ChartAnnotation[]
}


export function TelemetryChart({
  points,
  profile,
  sessionStartTime,
  showExportControls = true,
  annotations = []
}: Props) {
  const [showAdvancedRoR, setShowAdvancedRoR] = useState(true)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const chartRef = useRef<ReactECharts>(null)
  const { settings } = useChartSettings()
  
  const { calculatedRoR, phaseStats } = useMemo(() => {
    if (points.length < 3) {
      return { calculatedRoR: [], phaseStats: null }
    }

    // Helper function to get bean temperature from either format
    const getBeanTemp = (point: SupportedTelemetryPoint): number | null => {
      if ('beanTemp' in point) {
        return point.beanTemp ?? null // New TelemetryPoint format
      }
      return point.telemetry?.beanTemp ?? null // Legacy format
    }

    // Convert telemetry points to temperature points for RoR calculation
    const temperaturePoints: TemperaturePoint[] = points
      .filter(p => getBeanTemp(p) != null)
      .map(p => ({
        time: p.ts, // Use actual timestamp
        temperature: getBeanTemp(p)!
      }))

    if (temperaturePoints.length < 3) {
      return { calculatedRoR: [], phaseStats: null }
    }

    // Calculate advanced RoR using Artisan algorithms
    const rorPoints = calculateRoR(temperaturePoints, DEFAULT_ROR_CONFIG)

    // Apply RoR filtering based on user settings
    const filter = new RoRFilter(settings)
    const filteredRorPoints = rorPoints.map(p => ({
      ...p,
      ror: filter.filter(p.ror)
    }))

    const stats = calculateRoastPhaseStats(filteredRorPoints)

    return {
      calculatedRoR: filteredRorPoints.map(p => [p.time * 1000, p.ror]), // Convert to milliseconds for chart
      phaseStats: stats
    }
  }, [points, settings])

  const option = useMemo(() => {
    const t = points
    const ts = t.map(p => p.ts * 1000)

    // Helper functions to extract data from either format
    const getValue = (point: SupportedTelemetryPoint, field: keyof TelemetryPoint): number | null => {
      if (field in point) {
        return (point as TelemetryPoint)[field] ?? null // New TelemetryPoint format
      }
      // Legacy format - map field names
      const legacyFieldMap: Record<string, string> = {
        beanTemp: 'beanTemp',
        envTemp: 'envTemp',
        setpoint: 'setpoint',
        fanPWM: 'fanPWM',
        heaterPWM: 'heaterPWM',
        rateOfRise: 'rateOfRise'
      }
      const legacyField = legacyFieldMap[field]
      return (point as LegacyTelemetryPoint).telemetry?.[legacyField] ?? null
    }

    const bt = t.map(p => getValue(p, 'beanTemp'))
    const et = t.map(p => getValue(p, 'envTemp'))
    const basicRor = t.map(p => getValue(p, 'rateOfRise'))
    const setpoint = t.map(p => getValue(p, 'setpoint'))
    const fanPWM = t.map(p => getValue(p, 'fanPWM'))
    const heaterPWM = t.map(p => getValue(p, 'heaterPWM'))
    
    const series: any[] = [
      { 
        name: 'BT', 
        type: 'line', 
        showSymbol: false, 
        data: ts.map((x, i) => [x, bt[i]]), 
        yAxisIndex: 0, 
        smooth: 0.3, // Light smoothing for balance of performance and visuals 
        lineStyle: { width: 2, color: '#1f77b4' },
        itemStyle: { color: '#1f77b4' }
      },
      { 
        name: 'ET', 
        type: 'line', 
        showSymbol: false, 
        data: ts.map((x, i) => [x, et[i]]), 
        yAxisIndex: 0, 
        smooth: 0.3, // Light smoothing for balance of performance and visuals 
        lineStyle: { width: 2, color: '#ff7f0e' },
        itemStyle: { color: '#ff7f0e' }
      },
      { 
        name: 'Target', 
        type: 'line', 
        showSymbol: false, 
        data: ts.map((x, i) => [x, setpoint[i]]), 
        yAxisIndex: 0, 
        smooth: false, 
        lineStyle: { type: 'dashed', width: 1, color: '#2ca02c' }, 
        itemStyle: { color: '#2ca02c' } 
      },
      { 
        name: 'Fan %', 
        type: 'line', 
        showSymbol: false, 
        data: ts.map((x, i) => [x, fanPWM[i] ? fanPWM[i] * 100 / 255 : null]), 
        yAxisIndex: 2, 
        smooth: 0.3, // Light smoothing for balance of performance and visuals 
        lineStyle: { width: 1, color: '#17becf' }, 
        itemStyle: { color: '#17becf' } 
      },
      { 
        name: 'Heater %', 
        type: 'line', 
        showSymbol: false, 
        data: ts.map((x, i) => [x, heaterPWM[i]]), 
        yAxisIndex: 2, 
        smooth: 0.3, // Light smoothing for balance of performance and visuals 
        lineStyle: { width: 1, color: '#d62728' }, 
        itemStyle: { color: '#d62728' } 
      }
    ]
    
    // Build legend data dynamically based on available series
    let legendData: string[] = series.map(s => s.name)

    // Add RoR series based on mode
    if (showAdvancedRoR && calculatedRoR.length > 0) {
      series.push({
        name: 'RoR (Artisan)',
        type: 'line',
        showSymbol: false,
        data: calculatedRoR,
        yAxisIndex: 1,
        smooth: 0.3, // Light smoothing for balance of performance and visuals
        lineStyle: { width: 2, color: '#e377c2' },
        itemStyle: { color: '#e377c2' }
      })
      legendData.push('RoR (Artisan)')
    } else if (!showAdvancedRoR) {
      series.push({
        name: 'RoR (Basic)',
        type: 'line',
        showSymbol: false,
        data: ts.map((x, i) => [x, basicRor[i]]),
        yAxisIndex: 1,
        smooth: 0.3, // Light smoothing for balance of performance and visuals
        lineStyle: { width: 1, color: '#bcbd22' },
        itemStyle: { color: '#bcbd22' }
      })
      legendData.push('RoR (Basic)')
    }
    
    // Add profile overlay if available
    if (profile) {
      const profileData = profile.points
        .sort((a, b) => a.time_seconds - b.time_seconds)
        .map(point => [
          sessionStartTime ? (sessionStartTime * 1000 + point.time_seconds * 1000) : (point.time_seconds * 1000),
          point.target_temp
        ])
      
      series.push({
        name: 'Profile',
        type: 'line',
        showSymbol: false,
        data: profileData,
        yAxisIndex: 0,
        smooth: 0.3, // Light smoothing for balance of performance and visuals
        lineStyle: { type: 'dash', width: 2, color: '#9467bd' },
        itemStyle: { color: '#9467bd' }
      })
      
      legendData.push('Profile')
    }

    // Calculate RoR axis range
    const rorMin = phaseStats ? Math.min(-2, phaseStats.minRoR - 1) : -10
    const rorMax = phaseStats ? Math.max(20, phaseStats.maxRoR + 1) : 30
    
    // Add annotations as markLine data
    const annotationMarkLines = annotations.map(annotation => ({
      xAxis: annotation.time * 1000,
      label: {
        formatter: annotation.label,
        position: 'insideStartTop' as const,
        color: annotation.color || '#666',
        fontSize: 10
      },
      lineStyle: {
        color: annotation.color || '#666',
        type: annotation.type === 'event' ? 'solid' : 'dashed' as const,
        width: annotation.type === 'milestone' ? 2 : 1
      }
    }))

    // Add markLines to temperature series if annotations exist
    if (series.length > 0 && annotations.length > 0) {
      series[0].markLine = {
        symbol: 'none',
        data: annotationMarkLines,
        silent: false
      }
    }

    return {
      animation: false,
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return ''

          const firstParam = params[0]
          const timeStr = new Date(firstParam.value[0]).toLocaleTimeString()
          const relativeTime = sessionStartTime
            ? Math.floor((firstParam.value[0] - sessionStartTime * 1000) / 1000)
            : null

          let tooltip = `Time: ${timeStr}`
          if (relativeTime !== null) {
            const minutes = Math.floor(relativeTime / 60)
            const seconds = relativeTime % 60
            tooltip += ` (+${minutes}:${seconds.toString().padStart(2, '0')})`
          }
          tooltip += '<br/>'

          for (const param of params) {
            const value = param.value[1]

            if (value !== null && value !== undefined) {
              if (param.seriesName.includes('RoR')) {
                tooltip += `${param.seriesName}: ${value.toFixed(1)}°C/min<br/>`
              } else if (param.seriesName.includes('%')) {
                tooltip += `${param.seriesName}: ${value.toFixed(0)}%<br/>`
              } else {
                tooltip += `${param.seriesName}: ${value.toFixed(1)}°C<br/>`
              }
            }
          }
          return tooltip
        },
        axisPointer: {
          animation: false,
          type: 'cross',
          lineStyle: {
            color: '#376df4',
            width: 1,
            opacity: 1
          }
        }
      },
      toolbox: {
        feature: {
          dataZoom: {
            yAxisIndex: 'none'
          },
          restore: {},
          saveAsImage: {
            name: `roast_chart_${new Date().toISOString().split('T')[0]}`
          }
        }
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none'
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          filterMode: 'none',
          bottom: 0
        }
      ],
      brush: {
        toolbox: ['lineX', 'clear'],
        xAxisIndex: 0
      },
      legend: {
        data: legendData,
        type: 'scroll',
        orient: 'horizontal',
        top: 10
      },
      grid: { left: 60, right: 80, top: 60, bottom: 80 },
      xAxis: {
        type: 'time',
        // Add time buffer to show trend progression
        min: ts.length > 0 ? Math.min(...ts) : undefined,
        max: ts.length > 0 ? Math.max(...ts) + (2 * 60 * 1000) : undefined // Add 2 minutes ahead
      },
      yAxis: [
        { type: 'value', name: 'Temperature (°C)', min: 0, max: 250, position: 'left' },
        { type: 'value', name: 'RoR (°C/min)', position: 'right', min: rorMin, max: rorMax },
        { type: 'value', name: 'PWM %', position: 'right', offset: 60, min: 0, max: 100 }
      ],
      series
    } as echarts.EChartsOption
  }, [points, profile, sessionStartTime, showAdvancedRoR, calculatedRoR, phaseStats, annotations])

  // Export functions
  const exportData = (format: 'csv' | 'json') => {
    const exportData = points.map((point, index) => {
      const getValue = (point: SupportedTelemetryPoint, field: keyof TelemetryPoint): number | null => {
        if (field in point) {
          return (point as TelemetryPoint)[field] ?? null
        }
        const legacyFieldMap: Record<string, string> = {
          beanTemp: 'beanTemp',
          envTemp: 'envTemp',
          setpoint: 'setpoint',
          fanPWM: 'fanPWM',
          heaterPWM: 'heaterPWM',
          rateOfRise: 'rateOfRise'
        }
        const legacyField = legacyFieldMap[field]
        return (point as LegacyTelemetryPoint).telemetry?.[legacyField] ?? null
      }

      const timestamp = new Date(point.ts * 1000)
      const relativeTimeSeconds = sessionStartTime ? point.ts - sessionStartTime : null

      return {
        timestamp: timestamp.toISOString(),
        relativeTimeSeconds,
        beanTemp: getValue(point, 'beanTemp'),
        envTemp: getValue(point, 'envTemp'),
        setpoint: getValue(point, 'setpoint'),
        fanPWM: getValue(point, 'fanPWM'),
        heaterPWM: getValue(point, 'heaterPWM'),
        rateOfRise: getValue(point, 'rateOfRise'),
        artisanRoR: showAdvancedRoR && calculatedRoR[index] ? calculatedRoR[index][1] : null
      }
    })

    if (format === 'csv') {
      const headers = [
        'Timestamp',
        'Relative Time (s)',
        'Bean Temp (°C)',
        'Env Temp (°C)',
        'Setpoint (°C)',
        'Fan PWM',
        'Heater PWM (%)',
        'Rate of Rise (°C/min)',
        'Artisan RoR (°C/min)'
      ]

      const csvContent = [
        headers.join(','),
        ...exportData.map(row => [
          row.timestamp,
          row.relativeTimeSeconds ?? '',
          row.beanTemp ?? '',
          row.envTemp ?? '',
          row.setpoint ?? '',
          row.fanPWM ?? '',
          row.heaterPWM ?? '',
          row.rateOfRise ?? '',
          row.artisanRoR ?? ''
        ].join(','))
      ].join('\n')

      downloadFile(csvContent, `roast_data_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv')
    } else {
      const jsonContent = JSON.stringify({
        metadata: {
          exportDate: new Date().toISOString(),
          sessionStartTime: sessionStartTime ? new Date(sessionStartTime * 1000).toISOString() : null,
          totalPoints: exportData.length,
          roRCalculationMethod: showAdvancedRoR ? 'artisan' : 'basic',
          annotations
        },
        data: exportData
      }, null, 2)

      downloadFile(jsonContent, `roast_data_${new Date().toISOString().split('T')[0]}.json`, 'application/json')
    }
  }

  const exportChart = (format: 'png' | 'svg') => {
    if (chartRef.current) {
      const chartInstance = chartRef.current.getEchartsInstance()
      const dataURL = chartInstance.getDataURL({
        type: format,
        pixelRatio: 2,
        backgroundColor: '#fff'
      })

      const link = document.createElement('a')
      link.download = `roast_chart_${new Date().toISOString().split('T')[0]}.${format}`
      link.href = dataURL
      link.click()
    }
  }

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Chart Controls */}
      <div className="mb-3 flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => setShowAdvancedRoR(!showAdvancedRoR)}
            className={`px-3 py-1 text-sm rounded ${
              showAdvancedRoR
                ? 'bg-purple-500 text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            {showAdvancedRoR ? 'Artisan RoR' : 'Basic RoR'}
          </button>

          {phaseStats && showAdvancedRoR && (
            <div className="text-sm text-gray-600 hidden sm:block">
              Avg: {phaseStats.overallRoR.toFixed(1)}°C/min |
              Max: {phaseStats.maxRoR.toFixed(1)}°C/min |
              Min: {phaseStats.minRoR.toFixed(1)}°C/min
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {showAdvancedRoR && (
            <div className="text-xs text-gray-500 hidden md:block">
              Using Artisan polynomial least squares RoR calculation
            </div>
          )}

          {showExportControls && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Export ▼
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-10">
                  <div className="py-1">
                    <div className="px-3 py-1 text-xs font-semibold text-gray-500 border-b">Data</div>
                    <button
                      onClick={() => { exportData('csv'); setShowExportMenu(false) }}
                      className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100"
                    >
                      Export CSV
                    </button>
                    <button
                      onClick={() => { exportData('json'); setShowExportMenu(false) }}
                      className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100"
                    >
                      Export JSON
                    </button>
                    <div className="px-3 py-1 text-xs font-semibold text-gray-500 border-b border-t">Chart</div>
                    <button
                      onClick={() => { exportChart('png'); setShowExportMenu(false) }}
                      className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100"
                    >
                      Save as PNG
                    </button>
                    <button
                      onClick={() => { exportChart('svg'); setShowExportMenu(false) }}
                      className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100"
                    >
                      Save as SVG
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Responsive Statistics */}
      {phaseStats && showAdvancedRoR && (
        <div className="mb-3 text-sm text-gray-600 sm:hidden">
          <div className="flex justify-between">
            <span>Avg: {phaseStats.overallRoR.toFixed(1)}°C/min</span>
            <span>Max: {phaseStats.maxRoR.toFixed(1)}°C/min</span>
            <span>Min: {phaseStats.minRoR.toFixed(1)}°C/min</span>
          </div>
        </div>
      )}

      {/* Annotations Info */}
      {annotations.length > 0 && (
        <div className="mb-3 text-xs text-gray-500">
          {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} on chart
        </div>
      )}

      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: 400 }}
        notMerge={false}
        lazyUpdate={true}
        opts={{ renderer: 'canvas' }}
      />

      {/* Chart Instructions */}
      <div className="mt-2 text-xs text-gray-500">
        <div className="hidden sm:block">
          Use mouse wheel to zoom, drag to pan. Click toolbox icons for data zoom, restore, and save options.
        </div>
        <div className="sm:hidden">
          Touch to pan and pinch to zoom. Use export menu for save options.
        </div>
      </div>
    </div>
  )
}

