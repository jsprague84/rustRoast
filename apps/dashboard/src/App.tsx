import { useEffect, useMemo, useState } from 'react'
import { Sessions } from './pages/Sessions'
import { SessionDetail } from './pages/SessionDetail'
import { Profiles } from './pages/Profiles'
import { UnifiedDashboard } from './pages/UnifiedDashboard'
import { Settings } from './pages/Settings'
import { AutoTune } from './pages/AutoTune'
import { TestRoastControl } from './pages/TestRoastControl'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { NotificationProvider } from './components/system/NotificationProvider'
import { UpdatePrompt, OfflineIndicator } from './components/system/UpdatePrompt'

type Tab = 'roast' | 'sessions' | 'profiles' | 'autotune' | 'settings' | 'test'

export default function App() {
  const [tab, setTab] = useState<Tab>('roast')
  const [deviceId, setDeviceId] = useState<string>('esp32_roaster_01')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isDark, setIsDark] = useState<boolean>(() => {
    // Check for saved theme preference or default to false
    const saved = localStorage.getItem('theme')
    return saved ? saved === 'dark' : false
  })

  useEffect(() => {
    // hash routing light
    const h = window.location.hash.replace('#', '') as Tab
    if (h) setTab(h)
    const onHash = () => {
      const t = window.location.hash.replace('#', '') as Tab
      if (t) setTab(t)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    // Apply dark mode class to html element
    const html = document.documentElement
    if (isDark) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggleTheme = () => {
    setIsDark(!isDark)
  }

  const handleNavigate = (path: string, sessionIdParam?: string) => {
    if (path.startsWith('session/')) {
      setTab('sessions')
      setSessionId(sessionIdParam || path.split('/')[1])
    } else {
      setTab(path as Tab)
      setSessionId(null)
      window.location.hash = path
    }
  }

  const Nav = useMemo(() => (
    <nav style={{
      backgroundColor: 'var(--color-white)',
      borderBottom: '1px solid var(--color-gray-200)',
      marginBottom: '1.5rem',
      boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)'
    }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <div>
              <span style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                color: 'var(--color-primary-600)',
                whiteSpace: 'nowrap'
              }}>⚙️ rustRoast</span>
            </div>
            <div style={{ display: 'none', gap: '0.25rem' }} className="md:flex">
              <a href="#roast" style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                color: tab === 'roast' ? 'var(--color-primary-700)' : 'var(--color-gray-600)',
                backgroundColor: tab === 'roast' ? 'var(--color-primary-100)' : 'transparent',
                transition: 'all 0.2s ease'
              }}>
                Control
              </a>
              <a href="#sessions" style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                color: tab === 'sessions' ? 'var(--color-primary-700)' : 'var(--color-gray-600)',
                backgroundColor: tab === 'sessions' ? 'var(--color-primary-100)' : 'transparent',
                transition: 'all 0.2s ease'
              }}>
                Sessions
              </a>
              <a href="#profiles" style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                color: tab === 'profiles' ? 'var(--color-primary-700)' : 'var(--color-gray-600)',
                backgroundColor: tab === 'profiles' ? 'var(--color-primary-100)' : 'transparent',
                transition: 'all 0.2s ease'
              }}>
                Profiles
              </a>
              <a href="#autotune" style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                color: tab === 'autotune' ? 'var(--color-primary-700)' : 'var(--color-gray-600)',
                backgroundColor: tab === 'autotune' ? 'var(--color-primary-100)' : 'transparent',
                transition: 'all 0.2s ease'
              }}>
                AutoTune
              </a>
              <a href="#settings" style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                color: tab === 'settings' ? 'var(--color-primary-700)' : 'var(--color-gray-600)',
                backgroundColor: tab === 'settings' ? 'var(--color-primary-100)' : 'transparent',
                transition: 'all 0.2s ease'
              }}>
                Settings
              </a>
              <a href="#test" style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                color: tab === 'test' ? 'var(--color-primary-700)' : 'var(--color-gray-600)',
                backgroundColor: tab === 'test' ? 'var(--color-primary-100)' : 'transparent',
                transition: 'all 0.2s ease'
              }}>
                🧪 Test
              </a>
            </div>
          </div>
          <div>
            <button
              onClick={toggleTheme}
              className="theme-toggle"
              aria-label="Toggle theme"
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </div>
    </nav>
  ), [tab, isDark])

  return (
    <NotificationProvider>
      <div style={{ minHeight: '100vh' }}>
        {Nav}
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem 1rem' }}>
          <ErrorBoundary>
            {tab === 'roast' && <UnifiedDashboard deviceId={deviceId} />}
          </ErrorBoundary>
          <ErrorBoundary>
            {tab === 'sessions' && !sessionId && <Sessions deviceId={deviceId} onNavigate={handleNavigate} />}
            {tab === 'sessions' && sessionId && <SessionDetail sessionId={sessionId} onNavigate={handleNavigate} />}
          </ErrorBoundary>
          <ErrorBoundary>
            {tab === 'profiles' && <Profiles />}
          </ErrorBoundary>
          <ErrorBoundary>
            {tab === 'autotune' && <AutoTune deviceId={deviceId} />}
          </ErrorBoundary>
          <ErrorBoundary>
            {tab === 'settings' && <Settings deviceId={deviceId} onDeviceChange={setDeviceId} />}
          </ErrorBoundary>
          <ErrorBoundary>
            {tab === 'test' && <TestRoastControl />}
          </ErrorBoundary>
        </div>

        {/* PWA Features */}
        <UpdatePrompt />
        <OfflineIndicator />
      </div>
    </NotificationProvider>
  )
}

