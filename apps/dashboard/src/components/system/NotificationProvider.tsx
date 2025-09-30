import { createContext, useContext, useEffect } from 'react'
import { useAppStore, useNotifications, useAppActions } from '../../store/appStore'
import { NotificationToast } from './NotificationToast'

interface NotificationContextType {
  notify: (notification: {
    type: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
    duration?: number
  }) => void
}

const NotificationContext = createContext<NotificationContextType | null>(null)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const notifications = useNotifications()
  const { addNotification, clearNotification } = useAppActions()

  const notify = (notification: {
    type: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
    duration?: number
  }) => {
    addNotification({
      type: notification.type,
      title: notification.title,
      message: notification.message
    })
  }

  // Auto-clear notifications after duration
  useEffect(() => {
    const timers = new Map<string, NodeJS.Timeout>()

    notifications.forEach((notification) => {
      if (!notification.read && !timers.has(notification.id)) {
        const duration = notification.type === 'error' ? 8000 : 4000
        const timer = setTimeout(() => {
          clearNotification(notification.id)
          timers.delete(notification.id)
        }, duration)
        timers.set(notification.id, timer)
      }
    })

    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [notifications, clearNotification])

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}

      {/* Notification Container */}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
        {notifications
          .filter(n => !n.read)
          .slice(-5) // Show max 5 notifications
          .map((notification) => (
            <NotificationToast
              key={notification.id}
              notification={notification}
              onClose={() => clearNotification(notification.id)}
            />
          ))}
      </div>
    </NotificationContext.Provider>
  )
}

export function useNotify() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotify must be used within a NotificationProvider')
  }
  return context.notify
}