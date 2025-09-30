import { useState, useMemo, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { CreateProfileRequest, CreateProfilePointRequest } from '../api/client'
import { 
  calculateRoR, 
  profilePointsToTemperaturePoints, 
  DEFAULT_ROR_CONFIG,
  calculateRoastPhaseStats,
  type TemperaturePoint 
} from '../utils/rorCalculations'

type Props = {
  onSave: (profile: CreateProfileRequest) => void
  onCancel: () => void
  initialProfile?: CreateProfileRequest
}

export function ProfileDesigner({ onSave, onCancel, initialProfile }: Props) {
  const [profile, setProfile] = useState<CreateProfileRequest>(
    initialProfile || {
      name: '',
      description: '',
      points: [
        { time_seconds: 0, target_temp: 100 },
        { time_seconds: 300, target_temp: 150 },
        { time_seconds: 600, target_temp: 200 },
        { time_seconds: 900, target_temp: 220 }
      ]
    }
  )

  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null)
  const [showRoR, setShowRoR] = useState(true)
  const [dragMode, setDragMode] = useState(false)

  // Calculate RoR data for current profile
  const { rorData, phaseStats } = useMemo(() => {
    if (profile.points.length < 2) {
      return { rorData: [], phaseStats: null }
    }

    const temperaturePoints: TemperaturePoint[] = profile.points
      .sort((a, b) => a.time_seconds - b.time_seconds)
      .map(point => ({
        time: point.time_seconds,
        temperature: point.target_temp
      }))

    const rorPoints = calculateRoR(temperaturePoints, DEFAULT_ROR_CONFIG)
    const stats = calculateRoastPhaseStats(rorPoints)

    return { rorData: rorPoints, phaseStats: stats }
  }, [profile.points])

  // Chart click handler for adding/editing points
  const handleChartClick = useCallback((params: any) => {
    if (!params || params.componentType !== 'grid') return

    const [timeSeconds, temperature] = params.value || [params.dataIndex * 60, 150]
    
    if (dragMode) {
      // Add new point at clicked location
      const newPoint: CreateProfilePointRequest = {
        time_seconds: Math.round(timeSeconds),
        target_temp: Math.round(temperature)
      }

      setProfile(prev => ({
        ...prev,
        points: [...prev.points, newPoint].sort((a, b) => a.time_seconds - b.time_seconds)
      }))
    }
  }, [dragMode])

  // Update point values
  const updatePoint = (index: number, field: keyof CreateProfilePointRequest, value: number) => {
    setProfile(prev => ({
      ...prev,
      points: prev.points.map((point, i) => 
        i === index ? { ...point, [field]: value } : point
      )
    }))
  }

  // Remove point
  const removePoint = (index: number) => {
    if (profile.points.length <= 2) {
      alert('Profile must have at least 2 points')
      return
    }
    
    setProfile(prev => ({
      ...prev,
      points: prev.points.filter((_, i) => i !== index)
    }))
  }

  // Add point at specific time
  const addPointAtTime = (timeSeconds: number) => {
    // Find appropriate temperature by interpolating between existing points
    const sortedPoints = [...profile.points].sort((a, b) => a.time_seconds - b.time_seconds)
    let targetTemp = 150

    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const p1 = sortedPoints[i]
      const p2 = sortedPoints[i + 1]
      
      if (timeSeconds >= p1.time_seconds && timeSeconds <= p2.time_seconds) {
        const ratio = (timeSeconds - p1.time_seconds) / (p2.time_seconds - p1.time_seconds)
        targetTemp = p1.target_temp + ratio * (p2.target_temp - p1.target_temp)
        break
      }
    }

    const newPoint: CreateProfilePointRequest = {
      time_seconds: timeSeconds,
      target_temp: Math.round(targetTemp)
    }

    setProfile(prev => ({
      ...prev,
      points: [...prev.points, newPoint].sort((a, b) => a.time_seconds - b.time_seconds)
    }))
  }

  // Generate roast phase templates
  const applyTemplate = (templateType: 'light' | 'medium' | 'dark') => {
    const templates = {
      light: [
        { time_seconds: 0, target_temp: 100 },
        { time_seconds: 120, target_temp: 140 },
        { time_seconds: 300, target_temp: 170 },
        { time_seconds: 480, target_temp: 195 },
        { time_seconds: 600, target_temp: 205 },
        { time_seconds: 720, target_temp: 210 }
      ],
      medium: [
        { time_seconds: 0, target_temp: 100 },
        { time_seconds: 150, target_temp: 145 },
        { time_seconds: 360, target_temp: 175 },
        { time_seconds: 540, target_temp: 200 },
        { time_seconds: 720, target_temp: 215 },
        { time_seconds: 840, target_temp: 220 }
      ],
      dark: [
        { time_seconds: 0, target_temp: 100 },
        { time_seconds: 180, target_temp: 150 },
        { time_seconds: 420, target_temp: 180 },
        { time_seconds: 600, target_temp: 205 },
        { time_seconds: 780, target_temp: 220 },
        { time_seconds: 900, target_temp: 230 }
      ]
    }

    setProfile(prev => ({
      ...prev,
      points: templates[templateType]
    }))
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Export profile to JSON file
  const exportToJSON = () => {
    const exportData = {
      name: profile.name,
      description: profile.description,
      points: profile.points.sort((a, b) => a.time_seconds - b.time_seconds)
    }
    
    const dataStr = JSON.stringify(exportData, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
    
    const exportFileDefaultName = `${profile.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_profile.json`
    
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  // Export profile to CSV file
  const exportToCSV = () => {
    const csvHeader = 'time_seconds,target_temp,fan_speed\n'
    const csvData = profile.points
      .sort((a, b) => a.time_seconds - b.time_seconds)
      .map(point => `${point.time_seconds},${point.target_temp},${point.fan_speed || ''}`)
      .join('\n')
    
    const csvContent = csvHeader + csvData
    const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent)
    
    const exportFileDefaultName = `${profile.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_profile.csv`
    
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  const maxTime = Math.max(...profile.points.map(p => p.time_seconds), 1200)
  const maxTemp = Math.max(...profile.points.map(p => p.target_temp), 250)

  const chartOptions = {
    title: {
      text: profile.name || 'Profile Designer',
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        let tooltip = ''
        for (const param of params) {
          const time = Math.floor(param.value[0] / 60)
          const timeStr = `${time}:${(param.value[0] % 60).toString().padStart(2, '0')}`
          
          if (param.seriesName === 'Temperature Profile') {
            tooltip += `Time: ${timeStr}<br/>Temperature: ${param.value[1].toFixed(1)}°C<br/>`
          } else if (param.seriesName === 'Rate of Rise') {
            tooltip += `RoR: ${param.value[1].toFixed(1)}°C/min<br/>`
          }
        }
        return tooltip
      }
    },
    legend: {
      data: showRoR ? ['Temperature Profile', 'Rate of Rise'] : ['Temperature Profile'],
      top: '40px'
    },
    grid: {
      left: '60px',
      right: '60px',
      bottom: '60px',
      top: '100px'
    },
    xAxis: {
      type: 'value',
      name: 'Time (minutes)',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: {
        formatter: (value: number) => {
          const mins = Math.floor(value / 60)
          return `${mins}:${(value % 60).toString().padStart(2, '0')}`
        }
      },
      min: 0,
      max: maxTime
    },
    yAxis: [
      {
        type: 'value',
        name: 'Temperature (°C)',
        nameLocation: 'middle',
        nameGap: 40,
        min: 50,
        max: maxTemp + 20,
        position: 'left'
      },
      ...(showRoR && phaseStats ? [{
        type: 'value',
        name: 'RoR (°C/min)',
        nameLocation: 'middle',
        nameGap: 40,
        min: phaseStats.minRoR - 2,
        max: phaseStats.maxRoR + 2,
        position: 'right'
      }] : [])
    ],
    series: [
      {
        name: 'Temperature Profile',
        type: 'line',
        yAxisIndex: 0,
        data: profile.points
          .sort((a, b) => a.time_seconds - b.time_seconds)
          .map(point => [point.time_seconds, point.target_temp]),
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#3b82f6' },
        lineStyle: { color: '#3b82f6', width: 3 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.1)' }
            ]
          }
        }
      },
      ...(showRoR && rorData.length > 0 ? [{
        name: 'Rate of Rise',
        type: 'line',
        yAxisIndex: 1,
        data: rorData.map(point => [point.time, point.ror]),
        smooth: true,
        symbol: 'none',
        itemStyle: { color: '#ef4444' },
        lineStyle: { color: '#ef4444', width: 2 }
      }] : [])
    ]
  }

  const isValidProfile = profile.name.trim() && profile.points.length >= 2

  return (
    <div className="p-6 bg-white rounded-lg border border-gray-200">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">Profile Designer</h2>
        
        {/* Profile metadata */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Profile Name *</label>
            <input
              type="text"
              value={profile.name}
              onChange={e => setProfile(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Enter profile name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={profile.description}
              onChange={e => setProfile(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Optional description"
            />
          </div>
        </div>

        {/* Template buttons */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => applyTemplate('light')}
            className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
          >
            Light Roast Template
          </button>
          <button
            onClick={() => applyTemplate('medium')}
            className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600"
          >
            Medium Roast Template
          </button>
          <button
            onClick={() => applyTemplate('dark')}
            className="px-3 py-1 bg-red-800 text-white rounded text-sm hover:bg-red-900"
          >
            Dark Roast Template
          </button>
        </div>

        {/* Chart controls */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showRoR}
                onChange={e => setShowRoR(e.target.checked)}
              />
              <span className="text-sm">Show Rate of Rise</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={dragMode}
                onChange={e => setDragMode(e.target.checked)}
              />
              <span className="text-sm">Click to Add Points</span>
            </label>
          </div>
          
          {phaseStats && showRoR && (
            <div className="text-sm text-gray-600">
              Avg RoR: {phaseStats.overallRoR.toFixed(1)}°C/min | 
              Max: {phaseStats.maxRoR.toFixed(1)}°C/min
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="mb-6">
        <ReactECharts 
          option={chartOptions}
          style={{ width: '100%', height: '400px' }}
          opts={{ renderer: 'canvas' }}
          onEvents={{ click: handleChartClick }}
        />
      </div>

      {/* Point editor */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Profile Points ({profile.points.length})</h3>
          <button
            onClick={() => addPointAtTime(Math.max(...profile.points.map(p => p.time_seconds)) + 120)}
            className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
          >
            Add Point
          </button>
        </div>
        
        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Time (s)</th>
                <th className="px-3 py-2 text-left">Temperature (°C)</th>
                <th className="px-3 py-2 text-left">Fan Speed</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profile.points
                .sort((a, b) => a.time_seconds - b.time_seconds)
                .map((point, index) => (
                  <tr key={index} className={selectedPointIndex === index ? 'bg-blue-50' : ''}>
                    <td className="px-3 py-2 font-mono">{formatTime(point.time_seconds)}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={point.time_seconds}
                        onChange={e => updatePoint(index, 'time_seconds', parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={point.target_temp}
                        onChange={e => updatePoint(index, 'target_temp', parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={point.fan_speed || ''}
                        onChange={e => updatePoint(index, 'fan_speed', parseInt(e.target.value) || undefined)}
                        placeholder="0-255"
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removePoint(index)}
                        disabled={profile.points.length <= 2}
                        className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:bg-gray-300"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => onSave(profile)}
          disabled={!isValidProfile}
          className={`px-6 py-2 rounded text-sm font-medium ${
            isValidProfile 
              ? 'bg-blue-500 text-white hover:bg-blue-600' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Save Profile
        </button>
        
        <button
          onClick={exportToJSON}
          disabled={!isValidProfile}
          className={`px-4 py-2 rounded text-sm font-medium ${
            isValidProfile 
              ? 'bg-green-500 text-white hover:bg-green-600' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Export JSON
        </button>
        
        <button
          onClick={exportToCSV}
          disabled={!isValidProfile}
          className={`px-4 py-2 rounded text-sm font-medium ${
            isValidProfile 
              ? 'bg-teal-500 text-white hover:bg-teal-600' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Export CSV
        </button>
        
        <button
          onClick={onCancel}
          className="px-6 py-2 bg-gray-500 text-white rounded text-sm font-medium hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}