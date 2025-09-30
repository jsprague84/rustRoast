import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { CreateProfileRequest, CreateProfilePointRequest, api, ProfileWithPoints } from '../api/client'
import { 
  calculateRoR, 
  DEFAULT_ROR_CONFIG,
  calculateRoastPhaseStats,
  type TemperaturePoint 
} from '../utils/rorCalculations'

type RoastLandmark = {
  name: string
  abbreviation: string
  timeSeconds: number | null
  temperature: number | null
  enabled: boolean
  required: boolean
  description: string
}

type SplineConfig = {
  degree: number // 1-5, like Artisan
  tension: number // 0-1, curve smoothness
}

type Props = {
  onSave: (profile: CreateProfileRequest) => void
  onCancel: () => void
  initialProfile?: CreateProfileRequest
}

const DEFAULT_LANDMARKS: RoastLandmark[] = [
  {
    name: 'CHARGE',
    abbreviation: 'CHARGE',
    timeSeconds: 0,
    temperature: 100,
    enabled: true,
    required: true,
    description: 'Coffee beans loaded into roaster'
  },
  {
    name: 'DRY END',
    abbreviation: 'DRY',
    timeSeconds: null,
    temperature: null,
    enabled: false,
    required: false,
    description: 'End of drying phase, yellowing begins'
  },
  {
    name: 'FIRST CRACK START',
    abbreviation: 'FC_START',
    timeSeconds: null,
    temperature: null,
    enabled: false,
    required: false,
    description: 'First audible cracks begin'
  },
  {
    name: 'FIRST CRACK END',
    abbreviation: 'FC_END',
    timeSeconds: null,
    temperature: null,
    enabled: false,
    required: false,
    description: 'First crack phase ends'
  },
  {
    name: 'SECOND CRACK START',
    abbreviation: 'SC_START',
    timeSeconds: null,
    temperature: null,
    enabled: false,
    required: false,
    description: 'Second crack begins (darker roasts)'
  },
  {
    name: 'SECOND CRACK END',
    abbreviation: 'SC_END',
    timeSeconds: null,
    temperature: null,
    enabled: false,
    required: false,
    description: 'Second crack phase ends'
  },
  {
    name: 'DROP',
    abbreviation: 'DROP',
    timeSeconds: 720, // 12 minutes default
    temperature: 210,
    enabled: true,
    required: true,
    description: 'Coffee beans dropped from roaster'
  }
]

export function LandmarkProfileDesigner({ onSave, onCancel, initialProfile }: Props) {
  const [profile, setProfile] = useState<CreateProfileRequest>(
    initialProfile || {
      name: '',
      description: '',
      points: []
    }
  )

  const [landmarks, setLandmarks] = useState<RoastLandmark[]>(DEFAULT_LANDMARKS)
  const [splineConfig, setSplineConfig] = useState<SplineConfig>({ degree: 3, tension: 0.5 })
  const [showRoR, setShowRoR] = useState(true)
  const [availableProfiles, setAvailableProfiles] = useState<ProfileWithPoints[]>([])
  const [selectedBackgroundProfile, setSelectedBackgroundProfile] = useState<ProfileWithPoints | null>(null)
  const [showBackgroundProfile, setShowBackgroundProfile] = useState(false)
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.4)
  const [customPoints, setCustomPoints] = useState<CreateProfilePointRequest[]>([])
  const [newPoint, setNewPoint] = useState({ timeMinutes: '', temperature: '' })
  const [selectedLandmark, setSelectedLandmark] = useState<string | null>(null)

  // Simple spline interpolation function
  const interpolateTemperature = (time: number, landmarks: RoastLandmark[], config: SplineConfig): number => {
    const sortedLandmarks = landmarks.sort((a, b) => a.timeSeconds! - b.timeSeconds!)
    
    // Find the two landmarks this time falls between
    let beforeIdx = -1
    let afterIdx = -1
    
    for (let i = 0; i < sortedLandmarks.length - 1; i++) {
      if (time >= sortedLandmarks[i].timeSeconds! && time <= sortedLandmarks[i + 1].timeSeconds!) {
        beforeIdx = i
        afterIdx = i + 1
        break
      }
    }

    if (beforeIdx === -1) {
      // Time is outside the range, extrapolate
      if (time < sortedLandmarks[0].timeSeconds!) {
        return sortedLandmarks[0].temperature!
      } else {
        return sortedLandmarks[sortedLandmarks.length - 1].temperature!
      }
    }

    const landmark1 = sortedLandmarks[beforeIdx]
    const landmark2 = sortedLandmarks[afterIdx]
    
    const t1 = landmark1.timeSeconds!
    const t2 = landmark2.timeSeconds!
    const temp1 = landmark1.temperature!
    const temp2 = landmark2.temperature!

    // Normalize time to 0-1 range between landmarks
    const normalizedTime = (time - t1) / (t2 - t1)
    
    // Apply spline curve based on degree and tension
    let curveTime: number
    
    switch (config.degree) {
      case 1: // Linear
        curveTime = normalizedTime
        break
      case 2: // Quadratic
        curveTime = normalizedTime * normalizedTime
        break
      case 3: // Cubic (default)
        curveTime = normalizedTime * normalizedTime * (3 - 2 * normalizedTime)
        break
      case 4: // Quartic
        curveTime = normalizedTime * normalizedTime * normalizedTime * normalizedTime
        break
      case 5: // Quintic
        const t = normalizedTime
        curveTime = t * t * t * (t * (t * 6 - 15) + 10)
        break
      default:
        curveTime = normalizedTime
    }
    
    // Apply tension (0 = linear, 1 = full curve)
    const finalTime = normalizedTime + (curveTime - normalizedTime) * config.tension
    
    return temp1 + (temp2 - temp1) * finalTime
  }

  // Generate spline-interpolated points between landmarks and custom points
  const generatedPoints = useMemo(() => {
    const enabledLandmarks = landmarks.filter(l => 
      l.enabled && l.timeSeconds !== null && l.temperature !== null
    ).sort((a, b) => a.timeSeconds! - b.timeSeconds!)

    if (enabledLandmarks.length < 2) {
      return customPoints.slice() // Return only custom points if not enough landmarks
    }

    // Combine landmarks and custom points for interpolation
    const allControlPoints = [
      ...enabledLandmarks.map(l => ({ timeSeconds: l.timeSeconds!, temperature: l.temperature! })),
      ...customPoints.map(p => ({ timeSeconds: p.time_seconds, temperature: p.target_temp }))
    ].sort((a, b) => a.timeSeconds - b.timeSeconds)

    const points: CreateProfilePointRequest[] = []
    const totalTime = Math.max(
      enabledLandmarks[enabledLandmarks.length - 1]?.timeSeconds || 0,
      ...customPoints.map(p => p.time_seconds)
    )
    const timeStep = 30 // Generate points every 30 seconds

    // Simple spline interpolation using the configured degree
    for (let time = 0; time <= totalTime; time += timeStep) {
      let temperature = interpolateTemperature(time, 
        allControlPoints.map(p => ({ 
          timeSeconds: p.timeSeconds, 
          temperature: p.temperature, 
          enabled: true, 
          required: false, 
          name: 'Control Point', 
          abbreviation: 'CP',
          description: 'Control Point'
        })), 
        splineConfig)
      
      points.push({
        time_seconds: time,
        target_temp: Math.round(temperature * 10) / 10 // Round to 1 decimal
      })
    }

    // Always include exact landmark and custom points
    allControlPoints.forEach(point => {
      const existingIndex = points.findIndex(p => p.time_seconds === point.timeSeconds)
      if (existingIndex >= 0) {
        points[existingIndex].target_temp = point.temperature
      } else {
        points.push({
          time_seconds: point.timeSeconds,
          target_temp: point.temperature
        })
      }
    })

    return points.sort((a, b) => a.time_seconds - b.time_seconds)
  }, [landmarks, customPoints, splineConfig])

  // Calculate RoR data for generated profile
  const { rorData, phaseStats } = useMemo(() => {
    if (generatedPoints.length < 2) {
      return { rorData: [], phaseStats: null }
    }

    const temperaturePoints: TemperaturePoint[] = generatedPoints.map(point => ({
      time: point.time_seconds,
      temperature: point.target_temp
    }))

    const rorPoints = calculateRoR(temperaturePoints, DEFAULT_ROR_CONFIG)
    const stats = calculateRoastPhaseStats(rorPoints)

    return { rorData: rorPoints, phaseStats: stats }
  }, [generatedPoints])

  // Calculate roasting phase percentages
  const phasePercentages = useMemo(() => {
    const enabledLandmarks = landmarks.filter(l => 
      l.enabled && l.timeSeconds !== null
    ).sort((a, b) => a.timeSeconds! - b.timeSeconds!)

    if (enabledLandmarks.length < 2) {
      return null
    }

    const totalTime = enabledLandmarks[enabledLandmarks.length - 1].timeSeconds!
    const phases: Array<{name: string, duration: number, percentage: number, startTime: number, endTime: number}> = []

    for (let i = 0; i < enabledLandmarks.length - 1; i++) {
      const startLandmark = enabledLandmarks[i]
      const endLandmark = enabledLandmarks[i + 1]
      const duration = endLandmark.timeSeconds! - startLandmark.timeSeconds!
      const percentage = (duration / totalTime) * 100

      let phaseName = ''
      if (startLandmark.abbreviation === 'CHARGE' && endLandmark.abbreviation === 'DRY') {
        phaseName = 'Drying Phase'
      } else if (startLandmark.abbreviation === 'DRY' && endLandmark.abbreviation === 'FC_START') {
        phaseName = 'Maillard Phase'
      } else if (startLandmark.abbreviation === 'FC_START' && endLandmark.abbreviation === 'FC_END') {
        phaseName = 'First Crack'
      } else if (startLandmark.abbreviation === 'FC_END' && endLandmark.abbreviation === 'SC_START') {
        phaseName = 'Development'
      } else if (startLandmark.abbreviation === 'SC_START' && endLandmark.abbreviation === 'SC_END') {
        phaseName = 'Second Crack'
      } else if (endLandmark.abbreviation === 'DROP') {
        phaseName = 'Final Development'
      } else {
        phaseName = `${startLandmark.name} → ${endLandmark.name}`
      }

      phases.push({
        name: phaseName,
        duration,
        percentage,
        startTime: startLandmark.timeSeconds!,
        endTime: endLandmark.timeSeconds!
      })
    }

    return { totalTime, phases }
  }, [landmarks])

  const updateLandmark = (abbreviation: string, field: keyof RoastLandmark, value: any) => {
    setLandmarks(prev => prev.map(landmark => 
      landmark.abbreviation === abbreviation 
        ? { ...landmark, [field]: value }
        : landmark
    ))
  }

  const loadBackgroundProfile = async (profileId: string) => {
    if (!profileId) {
      setSelectedBackgroundProfile(null)
      setShowBackgroundProfile(false)
      return
    }
    
    try {
      const profile = await api.getProfile(profileId)
      setSelectedBackgroundProfile(profile)
      setShowBackgroundProfile(true)
    } catch (error) {
      console.error('Failed to load background profile:', error)
    }
  }

  const applyRoastTemplate = (templateType: 'light' | 'medium' | 'dark') => {
    const templates = {
      light: {
        CHARGE: { time: 0, temp: 100 },
        DRY: { time: 240, temp: 160 },
        FC_START: { time: 480, temp: 196 },
        FC_END: { time: 600, temp: 205 },
        DROP: { time: 720, temp: 210 }
      },
      medium: {
        CHARGE: { time: 0, temp: 100 },
        DRY: { time: 300, temp: 165 },
        FC_START: { time: 540, temp: 200 },
        FC_END: { time: 660, temp: 212 },
        DROP: { time: 840, temp: 220 }
      },
      dark: {
        CHARGE: { time: 0, temp: 100 },
        DRY: { time: 360, temp: 170 },
        FC_START: { time: 600, temp: 205 },
        FC_END: { time: 720, temp: 218 },
        SC_START: { time: 840, temp: 225 },
        DROP: { time: 960, temp: 235 }
      }
    }

    const template = templates[templateType]
    
    setLandmarks(prev => prev.map(landmark => {
      const templateData = template[landmark.abbreviation as keyof typeof template]
      if (templateData) {
        return {
          ...landmark,
          timeSeconds: templateData.time,
          temperature: templateData.temp,
          enabled: true
        }
      }
      return { ...landmark, enabled: false }
    }))
  }

  const handleSaveProfile = () => {
    const profileWithPoints: CreateProfileRequest = {
      ...profile,
      points: generatedPoints
    }
    console.log('Saving profile:', profileWithPoints)
    console.log('Generated points count:', generatedPoints.length)
    console.log('Is valid profile:', isValidProfile)
    onSave(profileWithPoints)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const maxTime = Math.max(...generatedPoints.map(p => p.time_seconds), 1200)
  const maxTemp = Math.max(...generatedPoints.map(p => p.target_temp), 250)

  // Chart ref for accessing the chart instance
  const chartRef = useRef<any>(null)
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    landmark: string | null;
  }>({ isDragging: false, landmark: null })

  // Load available profiles on mount
  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const profiles = await api.listProfiles(true)
        const profilesWithPoints = await Promise.all(
          profiles.map(async (profile) => {
            const fullProfile = await api.getProfile(profile.id)
            return fullProfile
          })
        )
        setAvailableProfiles(profilesWithPoints)
      } catch (error) {
        console.error('Failed to load profiles:', error)
      }
    }
    loadProfiles()
  }, [])

  // Functions for managing custom points
  const addCustomPoint = () => {
    const timeMinutes = parseFloat(newPoint.timeMinutes)
    const temperature = parseFloat(newPoint.temperature)
    
    if (isNaN(timeMinutes) || isNaN(temperature)) {
      alert('Please enter valid numbers for time and temperature')
      return
    }
    
    if (timeMinutes < 0 || timeMinutes > 30) {
      alert('Time must be between 0 and 30 minutes')
      return
    }
    
    if (temperature < 50 || temperature > 300) {
      alert('Temperature must be between 50°C and 300°C')
      return
    }
    
    const timeSeconds = Math.round(timeMinutes * 60)
    const newCustomPoint: CreateProfilePointRequest = {
      time_seconds: timeSeconds,
      target_temp: temperature
    }
    
    setCustomPoints(prev => [...prev, newCustomPoint].sort((a, b) => a.time_seconds - b.time_seconds))
    setNewPoint({ timeMinutes: '', temperature: '' })
  }
  
  const removeCustomPoint = (index: number) => {
    setCustomPoints(prev => prev.filter((_, i) => i !== index))
  }


  const chartOptions = {
    title: {
      text: profile.name || 'Landmark Profile Designer',
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
          } else if (param.seriesName === 'Landmarks') {
            const landmark = landmarks.find(l => l.abbreviation === param.data?.landmarkKey)
            tooltip += `Landmark: ${landmark?.name || 'Unknown'}<br/>Time: ${timeStr}<br/>Temperature: ${param.value[1].toFixed(1)}°C<br/>`
          }
        }
        return tooltip
      }
    },
    legend: {
      data: [
        'Temperature Profile',
        ...(showBackgroundProfile && selectedBackgroundProfile ? ['Background Profile'] : []),
        ...(showRoR ? ['Rate of Rise'] : []),
        'Landmarks'
      ],
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
        data: generatedPoints.map(point => [point.time_seconds, point.target_temp]),
        smooth: splineConfig.degree > 1,
        symbol: 'none',
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
      ...(showBackgroundProfile && selectedBackgroundProfile ? [{
        name: 'Background Profile',
        type: 'line',
        yAxisIndex: 0,
        data: (selectedBackgroundProfile?.points || []).map(point => [point.time_seconds, point.target_temp]),
        smooth: true,
        symbol: 'none',
        itemStyle: { color: `rgba(156, 163, 175, ${backgroundOpacity})` },
        lineStyle: { 
          color: `rgba(156, 163, 175, ${backgroundOpacity})`,
          width: 2,
          type: 'dashed'
        },
        z: 0
      }] : []),
      {
        name: 'Landmarks',
        type: 'scatter',
        yAxisIndex: 0,
        data: landmarks
          .filter(l => l.enabled && l.timeSeconds !== null && l.temperature !== null)
          .map(l => ({
            value: [l.timeSeconds, l.temperature],
            landmarkKey: l.abbreviation
          })),
        symbol: 'pin',
        symbolSize: (params: any) => {
          if (!params || !params.data || !params.data.landmarkKey) {
            return 20
          }
          return params.data.landmarkKey === selectedLandmark ? 30 : 20
        },
        itemStyle: { 
          color: (params: any) => {
            if (!params || !params.data || !params.data.landmarkKey) {
              return '#ef4444'
            }
            return params.data.landmarkKey === selectedLandmark ? '#ff6b6b' : '#ef4444'
          },
          borderColor: '#fff', 
          borderWidth: 2 
        },
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => {
            if (!params || !params.data || !params.data.landmarkKey) {
              return ''
            }
            return params.data.landmarkKey || ''
          },
          textStyle: { fontSize: 10, fontWeight: 'bold' }
        }
      },
      {
        name: 'Custom Points',
        type: 'scatter',
        yAxisIndex: 0,
        data: customPoints.map((point, index) => ({
          value: [point.time_seconds, point.target_temp],
          pointIndex: index
        })),
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { 
          color: '#3b82f6',
          borderColor: '#fff', 
          borderWidth: 1 
        },
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => {
            const timeMin = (params.value[0] / 60).toFixed(1)
            return `${timeMin}m`
          },
          textStyle: { fontSize: 9, color: '#3b82f6' }
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
        lineStyle: { color: '#ef4444', width: 2, type: 'dashed' }
      }] : [])
    ]
  }

  const isValidProfile = profile.name.trim() && generatedPoints.length >= 2

  return (
    <div className="p-6 bg-white rounded-lg border border-gray-200">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">Landmark Profile Designer</h2>
        
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
            onClick={() => applyRoastTemplate('light')}
            className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
          >
            Light Roast Template
          </button>
          <button
            onClick={() => applyRoastTemplate('medium')}
            className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600"
          >
            Medium Roast Template
          </button>
          <button
            onClick={() => applyRoastTemplate('dark')}
            className="px-3 py-1 bg-red-800 text-white rounded text-sm hover:bg-red-900"
          >
            Dark Roast Template
          </button>
        </div>

        {/* Spline configuration */}
        <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded">
          <div>
            <label className="block text-xs font-medium mb-1">Spline Degree</label>
            <select
              value={splineConfig.degree}
              onChange={e => setSplineConfig(prev => ({ ...prev, degree: parseInt(e.target.value) }))}
              className="px-2 py-1 border border-gray-300 rounded text-sm"
            >
              <option value={1}>1 (Linear)</option>
              <option value={2}>2 (Quadratic)</option>
              <option value={3}>3 (Cubic)</option>
              <option value={4}>4 (Quartic)</option>
              <option value={5}>5 (Quintic)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Curve Tension</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={splineConfig.tension}
              onChange={e => setSplineConfig(prev => ({ ...prev, tension: parseFloat(e.target.value) }))}
              className="w-20"
            />
            <span className="text-xs ml-1">{splineConfig.tension.toFixed(1)}</span>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showRoR}
              onChange={e => setShowRoR(e.target.checked)}
            />
            <span className="text-sm">Show Rate of Rise</span>
          </label>
          {phaseStats && showRoR && (
            <div className="text-sm text-gray-600">
              Avg RoR: {phaseStats.overallRoR.toFixed(1)}°C/min | 
              Max: {phaseStats.maxRoR.toFixed(1)}°C/min
            </div>
          )}
        </div>

        {/* Background profile overlay */}
        <div className="flex items-center gap-4 mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div>
            <label className="block text-xs font-medium mb-1">Background Template</label>
            <select
              value={selectedBackgroundProfile?.profile?.id || selectedBackgroundProfile?.id || ''}
              onChange={e => loadBackgroundProfile(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-sm min-w-40"
            >
              <option value="">None</option>
              {availableProfiles.map(profile => (
                <option key={profile?.profile?.id || profile?.id} value={profile?.profile?.id || profile?.id}>
                  {profile?.profile?.name || profile?.name}
                </option>
              ))}
            </select>
          </div>
          {selectedBackgroundProfile && (
            <>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showBackgroundProfile}
                  onChange={e => setShowBackgroundProfile(e.target.checked)}
                />
                <span className="text-sm">Show Background</span>
              </label>
              <div>
                <label className="block text-xs font-medium mb-1">Opacity</label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={backgroundOpacity}
                  onChange={e => setBackgroundOpacity(parseFloat(e.target.value))}
                  className="w-20"
                />
                <span className="text-xs ml-1">{(backgroundOpacity * 100).toFixed(0)}%</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Phase Percentages Display */}
      {phasePercentages && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <h4 className="text-sm font-semibold text-blue-800 mb-2">Roasting Phase Analysis</h4>
          <div className="text-xs text-blue-700 mb-2">
            Total Roast Time: {formatTime(phasePercentages.totalTime)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {phasePercentages.phases.map((phase, index) => (
              <div key={index} className="bg-white p-2 rounded border border-blue-100">
                <div className="text-xs font-medium text-gray-800">{phase.name}</div>
                <div className="text-xs text-gray-600">
                  {formatTime(phase.duration)} ({phase.percentage.toFixed(1)}%)
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Points Editor */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">Custom Profile Points</h3>
        
        {/* Add Point Form */}
        <div className="p-4 border border-gray-200 rounded mb-4 bg-gray-50">
          <h4 className="text-sm font-medium mb-3">Add Custom Point</h4>
          <div className="flex gap-3 items-end">
            <div>
              <label className="block text-xs font-medium mb-1">Time (minutes)</label>
              <input
                type="number"
                value={newPoint.timeMinutes}
                onChange={e => setNewPoint(prev => ({ ...prev, timeMinutes: e.target.value }))}
                className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                placeholder="0-30"
                min="0"
                max="30"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Temperature (°C)</label>
              <input
                type="number"
                value={newPoint.temperature}
                onChange={e => setNewPoint(prev => ({ ...prev, temperature: e.target.value }))}
                className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                placeholder="50-300"
                min="50"
                max="300"
                step="1"
              />
            </div>
            <button
              onClick={addCustomPoint}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              Add Point
            </button>
          </div>
        </div>

        {/* Custom Points List */}
        {customPoints.length > 0 && (
          <div className="border border-gray-200 rounded">
            <div className="bg-gray-100 px-3 py-2 text-sm font-medium">
              Custom Points ({customPoints.length})
            </div>
            <div className="max-h-32 overflow-y-auto">
              {customPoints.map((point, index) => (
                <div key={index} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-b-0">
                  <span className="text-sm">
                    {(point.time_seconds / 60).toFixed(1)}min → {point.target_temp}°C
                  </span>
                  <button
                    onClick={() => removeCustomPoint(index)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="mb-6">
        <div className="text-sm text-gray-600 mb-2">
          💡 Use landmarks and custom points to shape your roast profile
        </div>
        <ReactECharts 
          ref={chartRef}
          option={chartOptions}
          style={{ width: '100%', height: '400px' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>

      {/* Landmark editor */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">Roast Landmarks</h3>
        <div className="grid grid-cols-1 gap-3 max-h-80 overflow-y-auto border border-gray-200 rounded p-3">
          {landmarks.map((landmark) => (
            <div 
              key={landmark.abbreviation} 
              className={`p-3 border rounded transition-colors cursor-pointer ${
                selectedLandmark === landmark.abbreviation ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
              }`}
              onClick={() => setSelectedLandmark(
                selectedLandmark === landmark.abbreviation ? null : landmark.abbreviation
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={landmark.enabled}
                    disabled={landmark.required}
                    onChange={e => updateLandmark(landmark.abbreviation, 'enabled', e.target.checked)}
                    className="w-4 h-4"
                  />
                  <div>
                    <div className="font-medium text-sm">{landmark.name}</div>
                    <div className="text-xs text-gray-500">{landmark.description}</div>
                  </div>
                </div>
                
                {landmark.enabled && (
                  <div className="flex items-center gap-2">
                    <div>
                      <label className="block text-xs">Time (min)</label>
                      <input
                        type="number"
                        value={landmark.timeSeconds ? Math.floor(landmark.timeSeconds / 60) : ''}
                        onChange={e => updateLandmark(
                          landmark.abbreviation, 
                          'timeSeconds', 
                          e.target.value ? parseInt(e.target.value) * 60 : null
                        )}
                        className="w-16 px-1 py-1 border border-gray-300 rounded text-xs"
                        placeholder="min"
                        step="0.5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs">Temp (°C)</label>
                      <input
                        type="number"
                        value={landmark.temperature || ''}
                        onChange={e => updateLandmark(
                          landmark.abbreviation, 
                          'temperature', 
                          e.target.value ? parseFloat(e.target.value) : null
                        )}
                        className="w-16 px-1 py-1 border border-gray-300 rounded text-xs"
                        placeholder="°C"
                        step="0.1"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Generated points summary */}
      {generatedPoints.length > 0 && (
        <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded">
          <div className="text-sm font-medium text-green-800">
            Generated Profile: {generatedPoints.length} points from {formatTime(generatedPoints[0].time_seconds)} to {formatTime(generatedPoints[generatedPoints.length - 1].time_seconds)}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleSaveProfile}
          disabled={!isValidProfile}
          className={`px-6 py-2 rounded text-sm font-medium ${
            isValidProfile 
              ? 'bg-blue-500 text-white hover:bg-blue-600' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Save Landmark Profile
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