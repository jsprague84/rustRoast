import { lazy, Suspense, memo } from 'react'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { Card } from '../ui/Card'

// Lazy load the heavy chart component
const TelemetryChart = lazy(() =>
  import('../TelemetryChart').then(module => ({ default: module.TelemetryChart }))
)

// Lazy load echarts for dynamic imports
const loadEcharts = () => import('echarts-for-react')

interface LazyTelemetryChartProps {
  points: { ts: number; telemetry: any }[]
  profile?: any
  sessionStartTime?: number
  className?: string
}

// Memoized chart wrapper to prevent unnecessary re-renders
const ChartWrapper = memo(function ChartWrapper({
  points,
  profile,
  sessionStartTime
}: LazyTelemetryChartProps) {
  return (
    <TelemetryChart
      points={points}
      profile={profile}
      sessionStartTime={sessionStartTime}
    />
  )
})

// Loading fallback component
function ChartSkeleton() {
  return (
    <Card>
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-2 text-sm text-gray-500">Loading chart...</p>
        </div>
      </div>
    </Card>
  )
}

// Error boundary for chart loading failures
function ChartErrorFallback() {
  return (
    <Card className="border-red-200 bg-red-50">
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-600 font-medium">Failed to load chart</p>
          <p className="text-sm text-red-500 mt-1">Please refresh the page to try again</p>
        </div>
      </div>
    </Card>
  )
}

export function LazyTelemetryChart(props: LazyTelemetryChartProps) {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <div className={props.className}>
        <ChartWrapper {...props} />
      </div>
    </Suspense>
  )
}

// Hook for preloading chart components
export function usePreloadChart() {
  const preloadChart = () => {
    // Preload the chart component
    import('../TelemetryChart')
    // Preload echarts
    loadEcharts()
  }

  return { preloadChart }
}

// Higher-order component for chart optimization
export function withChartOptimization<T extends object>(
  WrappedComponent: React.ComponentType<T>
) {
  return memo(function OptimizedChart(props: T) {
    return <WrappedComponent {...props} />
  })
}