import { useEffect, useState, useCallback } from 'react'

interface ServiceWorkerState {
  isSupported: boolean
  isRegistered: boolean
  isUpdateAvailable: boolean
  isOffline: boolean
  registration: ServiceWorkerRegistration | null
}

interface ServiceWorkerActions {
  register: () => Promise<void>
  update: () => Promise<void>
  unregister: () => Promise<void>
  skipWaiting: () => void
  clearCache: (cacheNames?: string[]) => void
  cacheData: (url: string, data: any) => void
}

export function useServiceWorker(): ServiceWorkerState & ServiceWorkerActions {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: 'serviceWorker' in navigator,
    isRegistered: false,
    isUpdateAvailable: false,
    isOffline: !navigator.onLine,
    registration: null
  })

  // Register service worker
  const register = useCallback(async () => {
    if (!state.isSupported) {
      console.warn('Service workers are not supported in this browser')
      return
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      })

      console.log('Service worker registered:', registration)

      setState(prev => ({
        ...prev,
        isRegistered: true,
        registration
      }))

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing

        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setState(prev => ({ ...prev, isUpdateAvailable: true }))
            }
          })
        }
      })

      // Handle controlling change
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload()
      })

    } catch (error) {
      console.error('Service worker registration failed:', error)
    }
  }, [state.isSupported])

  // Update service worker
  const update = useCallback(async () => {
    if (!state.registration) return

    try {
      await state.registration.update()
      console.log('Service worker update checked')
    } catch (error) {
      console.error('Service worker update failed:', error)
    }
  }, [state.registration])

  // Unregister service worker
  const unregister = useCallback(async () => {
    if (!state.registration) return

    try {
      await state.registration.unregister()
      setState(prev => ({
        ...prev,
        isRegistered: false,
        registration: null,
        isUpdateAvailable: false
      }))
      console.log('Service worker unregistered')
    } catch (error) {
      console.error('Service worker unregistration failed:', error)
    }
  }, [state.registration])

  // Skip waiting and activate new service worker
  const skipWaiting = useCallback(() => {
    if (!state.registration || !state.registration.waiting) return

    state.registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  }, [state.registration])

  // Clear service worker cache
  const clearCache = useCallback((cacheNames?: string[]) => {
    if (!state.registration) return

    navigator.serviceWorker.controller?.postMessage({
      type: 'CLEAR_CACHE',
      payload: { cacheNames }
    })
  }, [state.registration])

  // Cache data manually
  const cacheData = useCallback((url: string, data: any) => {
    if (!state.registration) return

    navigator.serviceWorker.controller?.postMessage({
      type: 'CACHE_UPDATE',
      payload: { url, data }
    })
  }, [state.registration])

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => setState(prev => ({ ...prev, isOffline: false }))
    const handleOffline = () => setState(prev => ({ ...prev, isOffline: true }))

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Auto-register on mount
  useEffect(() => {
    if (state.isSupported && !state.isRegistered) {
      register()
    }
  }, [state.isSupported, state.isRegistered, register])

  // Check for existing registration
  useEffect(() => {
    if (!state.isSupported) return

    navigator.serviceWorker.getRegistration().then(registration => {
      if (registration) {
        setState(prev => ({
          ...prev,
          isRegistered: true,
          registration
        }))
      }
    })
  }, [state.isSupported])

  return {
    ...state,
    register,
    update,
    unregister,
    skipWaiting,
    clearCache,
    cacheData
  }
}

// Hook for monitoring network status
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSlowConnection, setIsSlowConnection] = useState(false)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check connection speed
    if ('connection' in navigator) {
      const connection = (navigator as any).connection
      const updateConnectionSpeed = () => {
        setIsSlowConnection(connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g')
      }

      connection.addEventListener('change', updateConnectionSpeed)
      updateConnectionSpeed()

      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
        connection.removeEventListener('change', updateConnectionSpeed)
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return {
    isOnline,
    isOffline: !isOnline,
    isSlowConnection
  }
}

// Hook for managing app updates
export function useAppUpdate() {
  const { isUpdateAvailable, skipWaiting, update } = useServiceWorker()
  const [isUpdatePromptShown, setIsUpdatePromptShown] = useState(false)

  const promptUpdate = useCallback(() => {
    setIsUpdatePromptShown(true)
  }, [])

  const applyUpdate = useCallback(() => {
    skipWaiting()
    setIsUpdatePromptShown(false)
  }, [skipWaiting])

  const dismissUpdate = useCallback(() => {
    setIsUpdatePromptShown(false)
  }, [])

  useEffect(() => {
    if (isUpdateAvailable && !isUpdatePromptShown) {
      promptUpdate()
    }
  }, [isUpdateAvailable, isUpdatePromptShown, promptUpdate])

  return {
    isUpdateAvailable,
    isUpdatePromptShown,
    promptUpdate,
    applyUpdate,
    dismissUpdate,
    checkForUpdate: update
  }
}