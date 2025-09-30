import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import { useMemo } from 'react'

type Props = {
  statusHistory: { ts: number; telemetry: any }[]
  targetTemperature?: number
  isRunning: boolean
}

export function AutoTuneChart({ statusHistory, targetTemperature, isRunning }: Props) {
  const option = useMemo(() => {
    if (statusHistory.length === 0) {
      return {
        title: {
          text: 'AutoTune Chart',
          subtext: 'No data available - start AutoTune to see real-time progress',
          left: 'center',
          top: 'center',
          textStyle: { fontSize: 16, color: '#666' },
          subtextStyle: { fontSize: 12, color: '#999' }
        },
        grid: { left: 60, right: 60, top: 80, bottom: 60 },
        xAxis: { type: 'time', show: false },
        yAxis: { type: 'value', show: false }
      } as echarts.EChartsOption
    }

    const points = statusHistory
    const timestamps = points.map(p => p.ts * 1000) // Convert to milliseconds
    const beanTemp = points.map(p => p.telemetry?.beanTemp ?? null)
    const envTemp = points.map(p => p.telemetry?.envTemp ?? null)
    const setpoint = points.map(p => p.telemetry?.setpoint ?? null)
    const heaterPWM = points.map(p => p.telemetry?.heaterPWM ?? null)
    const fanPWM = points.map(p => p.telemetry?.fanPWM ?? null)
    const rateOfRise = points.map(p => p.telemetry?.rateOfRise ?? null)
    const output = points.map(p => p.telemetry?.output ?? null)
    
    const series: any[] = [
      {
        name: 'Bean Temperature',
        type: 'line',
        showSymbol: false,
        data: timestamps.map((x, i) => [x, beanTemp[i]]),
        yAxisIndex: 0,
        smooth: true,
        lineStyle: { width: 3, color: '#1f77b4' },
        itemStyle: { color: '#1f77b4' }
      },
      {
        name: 'Environment Temperature',
        type: 'line',
        showSymbol: false,
        data: timestamps.map((x, i) => [x, envTemp[i]]),
        yAxisIndex: 0,
        smooth: true,
        lineStyle: { width: 2, color: '#ff7f0e' },
        itemStyle: { color: '#ff7f0e' }
      }
    ]

    // Add target temperature line if specified
    if (targetTemperature) {
      series.push({
        name: 'Target Temperature',
        type: 'line',
        showSymbol: false,
        data: timestamps.map(x => [x, targetTemperature]),
        yAxisIndex: 0,
        smooth: false,
        lineStyle: { type: 'dashed', width: 2, color: '#2ca02c' },
        itemStyle: { color: '#2ca02c' }
      })
    }

    // Add setpoint if available (this shows what the PID is targeting)
    if (setpoint.some(s => s !== null)) {
      series.push({
        name: 'PID Setpoint',
        type: 'line',
        showSymbol: false,
        data: timestamps.map((x, i) => [x, setpoint[i]]),
        yAxisIndex: 0,
        smooth: true,
        lineStyle: { type: 'solid', width: 1, color: '#17becf' },
        itemStyle: { color: '#17becf' }
      })
    }

    // Add rate of rise
    if (rateOfRise.some(r => r !== null)) {
      series.push({
        name: 'Rate of Rise',
        type: 'line',
        showSymbol: false,
        data: timestamps.map((x, i) => [x, rateOfRise[i]]),
        yAxisIndex: 1,
        smooth: true,
        lineStyle: { width: 2, color: '#e377c2' },
        itemStyle: { color: '#e377c2' }
      })
    }

    // Add fan PWM
    if (fanPWM.some(f => f !== null)) {
      series.push({
        name: 'Fan PWM %',
        type: 'line',
        showSymbol: false,
        data: timestamps.map((x, i) => [x, fanPWM[i] ? fanPWM[i] * 100 / 255 : null]),
        yAxisIndex: 1,
        smooth: true,
        lineStyle: { width: 2, color: '#17becf' },
        itemStyle: { color: '#17becf' }
      })
    }

    // Add heater output
    if (heaterPWM.some(h => h !== null)) {
      series.push({
        name: 'Heater Output %',
        type: 'line',
        showSymbol: false,
        data: timestamps.map((x, i) => [x, heaterPWM[i]]),
        yAxisIndex: 1,
        smooth: true,
        lineStyle: { width: 2, color: '#d62728' },
        itemStyle: { color: '#d62728' }
      })
    }

    // Add PID output if available
    if (output.some(o => o !== null)) {
      series.push({
        name: 'PID Output',
        type: 'line',
        showSymbol: false,
        data: timestamps.map((x, i) => [x, output[i]]),
        yAxisIndex: 1,
        smooth: true,
        lineStyle: { width: 1, color: '#bcbd22' },
        itemStyle: { color: '#bcbd22' }
      })
    }

    const legendData = series.map(s => s.name)

    return {
      animation: false,
      title: {
        text: isRunning ? '🔄 AutoTune in Progress' : '📊 AutoTune Data',
        left: 'center',
        textStyle: { fontSize: 16, fontWeight: 'bold' }
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          let tooltip = ''
          for (const param of params) {
            const time = new Date(param.value[0]).toLocaleTimeString()
            const value = param.value[1]
            
            if (value !== null && value !== undefined) {
              if (param.seriesName.includes('%') || param.seriesName.includes('Output')) {
                tooltip += `${param.seriesName}: ${value.toFixed(1)}%<br/>`
              } else {
                tooltip += `${param.seriesName}: ${value.toFixed(1)}°C<br/>`
              }
            }
          }
          return `Time: ${time}<br/>${tooltip}`
        }
      },
      legend: { 
        data: legendData,
        top: 30
      },
      grid: { 
        left: 80, 
        right: 80, 
        top: 80, 
        bottom: 60 
      },
      xAxis: { 
        type: 'time',
        name: 'Time',
        nameLocation: 'middle',
        nameGap: 30,
        // Add time buffer to show trend progression
        min: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
        max: timestamps.length > 0 ? Math.max(...timestamps) + (2 * 60 * 1000) : undefined // Add 2 minutes ahead
      },
      yAxis: [
        { 
          type: 'value', 
          name: 'Temperature (°C)', 
          position: 'left',
          min: (value: any) => Math.max(0, value.min - 10),
          max: (value: any) => value.max + 20
        },
        { 
          type: 'value', 
          name: 'RoR/PWM %', 
          position: 'right',
          min: -10,
          max: 100
        }
      ],
      series
    } as echarts.EChartsOption
  }, [statusHistory, targetTemperature, isRunning])

  return (
    <div style={{ width: '100%', height: '400px' }}>
      <ReactECharts 
        option={option} 
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge 
        lazyUpdate 
      />
    </div>
  )
}