import { lazy, Suspense } from 'react'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { Card } from '../components/ui/Card'

// Lazy load all page components for better code splitting
const LazyUnifiedDashboard = lazy(() =>
  import('./UnifiedDashboard').then(module => ({ default: module.UnifiedDashboard }))
)

const LazySessions = lazy(() =>
  import('./Sessions').then(module => ({ default: module.Sessions }))
)

const LazySessionDetail = lazy(() =>
  import('./SessionDetail').then(module => ({ default: module.SessionDetail }))
)

const LazyProfiles = lazy(() =>
  import('./Profiles').then(module => ({ default: module.Profiles }))
)

const LazyAutoTune = lazy(() =>
  import('./AutoTune').then(module => ({ default: module.AutoTune }))
)

const LazySettings = lazy(() =>
  import('./Settings').then(module => ({ default: module.Settings }))
)

// Loading fallback component
function PageSkeleton({ title = 'Loading...' }: { title?: string }) {
  return (
    <Card>
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-lg font-medium text-gray-600">{title}</p>
          <p className="text-sm text-gray-500">Please wait while we load the page...</p>
        </div>
      </div>
    </Card>
  )
}

// Wrapper components with suspense boundaries
export function UnifiedDashboardPage({ deviceId }: { deviceId: string }) {
  return (
    <Suspense fallback={<PageSkeleton title="Loading Dashboard..." />}>
      <LazyUnifiedDashboard deviceId={deviceId} />
    </Suspense>
  )
}

export function SessionsPage({
  deviceId,
  onNavigate
}: {
  deviceId: string
  onNavigate: (path: string, sessionId?: string) => void
}) {
  return (
    <Suspense fallback={<PageSkeleton title="Loading Sessions..." />}>
      <LazySessions deviceId={deviceId} onNavigate={onNavigate} />
    </Suspense>
  )
}

export function SessionDetailPage({
  sessionId,
  onNavigate
}: {
  sessionId: string
  onNavigate: (path: string, sessionId?: string) => void
}) {
  return (
    <Suspense fallback={<PageSkeleton title="Loading Session Details..." />}>
      <LazySessionDetail sessionId={sessionId} onNavigate={onNavigate} />
    </Suspense>
  )
}

export function ProfilesPage() {
  return (
    <Suspense fallback={<PageSkeleton title="Loading Profiles..." />}>
      <LazyProfiles />
    </Suspense>
  )
}

export function AutoTunePage({ deviceId }: { deviceId: string }) {
  return (
    <Suspense fallback={<PageSkeleton title="Loading Auto-Tune..." />}>
      <LazyAutoTune deviceId={deviceId} />
    </Suspense>
  )
}

export function SettingsPage({
  deviceId,
  onDeviceChange
}: {
  deviceId: string
  onDeviceChange: (deviceId: string) => void
}) {
  return (
    <Suspense fallback={<PageSkeleton title="Loading Settings..." />}>
      <LazySettings deviceId={deviceId} onDeviceChange={onDeviceChange} />
    </Suspense>
  )
}

// Preload functions for better UX
export const preloadPages = {
  dashboard: () => import('./UnifiedDashboard'),
  sessions: () => import('./Sessions'),
  sessionDetail: () => import('./SessionDetail'),
  profiles: () => import('./Profiles'),
  autoTune: () => import('./AutoTune'),
  settings: () => import('./Settings'),
}

// Hook for preloading pages based on navigation
export function usePagePreloader() {
  const preloadPage = (pageName: keyof typeof preloadPages) => {
    preloadPages[pageName]().catch(console.warn)
  }

  const preloadAllPages = () => {
    Object.values(preloadPages).forEach(preload =>
      preload().catch(console.warn)
    )
  }

  return {
    preloadPage,
    preloadAllPages
  }
}