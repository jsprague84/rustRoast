import { useAppUpdate, useNetworkStatus } from '../../hooks/useServiceWorker'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

export function UpdatePrompt() {
  const { isUpdatePromptShown, applyUpdate, dismissUpdate } = useAppUpdate()
  const { isOnline, isOffline } = useNetworkStatus()

  if (!isUpdatePromptShown) return null

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4">
      <Card className="border-blue-200 bg-blue-50">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <span className="text-blue-600 text-xl">🔄</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-blue-900 mb-1">
                Update Available
              </h3>
              <p className="text-sm text-blue-700 mb-3">
                A new version of RustRoast is available. Update now to get the latest features and improvements.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={applyUpdate}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Update Now
                </Button>
                <Button
                  onClick={dismissUpdate}
                  variant="ghost"
                  size="sm"
                  className="text-blue-600 hover:bg-blue-100"
                >
                  Later
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export function OfflineIndicator() {
  const { isOffline, isSlowConnection } = useNetworkStatus()

  if (!isOffline && !isSlowConnection) return null

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <Card className={`border-2 ${isOffline ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}`}>
        <div className="px-3 py-2 flex items-center gap-2">
          <span className="text-lg">
            {isOffline ? '📵' : '🐌'}
          </span>
          <span className={`text-sm font-medium ${isOffline ? 'text-red-800' : 'text-yellow-800'}`}>
            {isOffline ? 'Offline Mode' : 'Slow Connection'}
          </span>
        </div>
      </Card>
    </div>
  )
}

export function ServiceWorkerStatus() {
  const { isRegistered, isSupported } = useAppUpdate()

  if (!isSupported) {
    return (
      <div className="text-xs text-gray-500 p-2">
        ⚠️ Service Worker not supported
      </div>
    )
  }

  return (
    <div className="text-xs text-gray-500 p-2">
      {isRegistered ? '✅ Offline support enabled' : '⏳ Enabling offline support...'}
    </div>
  )
}