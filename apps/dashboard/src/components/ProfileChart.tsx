import ReactECharts from 'echarts-for-react'
import { ProfileWithPoints } from '../api/client'
import { 
  calculateRoR, 
  profilePointsToTemperaturePoints, 
  DEFAULT_ROR_CONFIG,
  calculateRoastPhaseStats 
} from '../utils/rorCalculations'
import { useMemo, useState } from 'react'

type Props = {
  profile: ProfileWithPoints
  width?: string
  height?: string
  showRoR?: boolean
  dryEndTime?: number
  firstCrackTime?: number
  secondCrackTime?: number
}

export function ProfileChart({ 
  profile, 
  width = '100%', 
  height = '300px', 
  showRoR = true,
  dryEndTime,
  firstCrackTime,
  secondCrackTime 
}: Props) {
  const [showRoRToggle, setShowRoRToggle] = useState(showRoR)

  const { rorData, phaseStats } = useMemo(() => {
    const temperaturePoints = profilePointsToTemperaturePoints(profile.points)
    const rorPoints = calculateRoR(temperaturePoints, DEFAULT_ROR_CONFIG)
    const stats = calculateRoastPhaseStats(
      rorPoints, 
      dryEndTime, 
      firstCrackTime, 
      profile.profile.target_total_time
    )
    
    return {
      rorData: rorPoints,
      phaseStats: stats
    }
  }, [profile.points, dryEndTime, firstCrackTime, profile.profile.target_total_time])

  const chartOptions = {
    title: {
      text: profile.profile.name,
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold'
      }
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        let tooltip = ''
        for (const param of params) {
          const time = Math.floor(param.value[0] / 60)
          const timeStr = `${time}:${(param.value[0] % 60).toString().padStart(2, '0')}`
          
          if (param.seriesName === 'Target Temperature') {
            tooltip += `Time: ${timeStr}<br/>Temperature: ${param.value[1].toFixed(1)}°C<br/>`
          } else if (param.seriesName === 'Rate of Rise') {
            tooltip += `RoR: ${param.value[1].toFixed(1)}°C/min<br/>`
          }
        }
        return tooltip
      }
    },
    legend: {
      data: showRoRToggle ? ['Target Temperature', 'Rate of Rise'] : ['Target Temperature'],
      top: '40px'
    },
    grid: {
      left: '60px',
      right: '60px',
      bottom: '60px',
      top: showRoRToggle ? '100px' : '80px'
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
      max: profile.profile.target_total_time || 'dataMax'
    },
    yAxis: [
      {
        type: 'value',
        name: 'Temperature (°C)',
        nameLocation: 'middle',
        nameGap: 40,
        min: 0,
        max: 250,
        position: 'left'
      },
      ...(showRoRToggle ? [{
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
        name: 'Target Temperature',
        type: 'line',
        yAxisIndex: 0,
        data: profile.points
          .sort((a, b) => a.time_seconds - b.time_seconds)
          .map(point => [point.time_seconds, point.target_temp]),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#3b82f6'
        },
        lineStyle: {
          color: '#3b82f6',
          width: 3
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.1)' }
            ]
          }
        }
      },
      ...(showRoRToggle ? [{
        name: 'Rate of Rise',
        type: 'line',
        yAxisIndex: 1,
        data: rorData.map(point => [point.time, point.ror]),
        smooth: true,
        symbol: 'none',
        itemStyle: {
          color: '#ef4444'
        },
        lineStyle: {
          color: '#ef4444',
          width: 2,
          type: 'solid'
        }
      }] : [])
    ],
    ...(dryEndTime || firstCrackTime || secondCrackTime ? {
      markLine: {
        silent: true,
        data: [
          ...(dryEndTime ? [{
            name: 'Dry End',
            xAxis: dryEndTime,
            lineStyle: { color: '#eab308', type: 'dashed' },
            label: { formatter: 'Dry End', position: 'insideEndTop' }
          }] : []),
          ...(firstCrackTime ? [{
            name: 'First Crack',
            xAxis: firstCrackTime,
            lineStyle: { color: '#f97316', type: 'dashed' },
            label: { formatter: 'First Crack', position: 'insideEndTop' }
          }] : []),
          ...(secondCrackTime ? [{
            name: 'Second Crack',
            xAxis: secondCrackTime,
            lineStyle: { color: '#dc2626', type: 'dashed' },
            label: { formatter: 'Second Crack', position: 'insideEndTop' }
          }] : [])
        ]
      }
    } : {})
  }

  return (
    <div style={{ width, height }}>
      <div className="mb-4 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {showRoRToggle && (
            <span>
              Avg RoR: {phaseStats.overallRoR.toFixed(1)}°C/min | 
              Max: {phaseStats.maxRoR.toFixed(1)}°C/min | 
              Min: {phaseStats.minRoR.toFixed(1)}°C/min
            </span>
          )}
        </div>
        <button
          onClick={() => setShowRoRToggle(!showRoRToggle)}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {showRoRToggle ? 'Hide RoR' : 'Show RoR'}
        </button>
      </div>
      <ReactECharts 
        option={chartOptions} 
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  )
}