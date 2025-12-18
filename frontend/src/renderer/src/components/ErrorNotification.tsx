import { useEffect } from 'react'
import { useAppState, useAppDispatch, ErrorNotification as ErrorNotificationType } from '../context/AppContext'

/**
 * Get severity-based styling
 */
function getSeverityStyles(severity: ErrorNotificationType['severity']): {
  bg: string
  border: string
  icon: string
  text: string
} {
  switch (severity) {
    case 'error':
      return {
        bg: 'bg-red-900/90',
        border: 'border-red-700',
        icon: '❌',
        text: 'text-red-100'
      }
    case 'warning':
      return {
        bg: 'bg-yellow-900/90',
        border: 'border-yellow-700',
        icon: '⚠️',
        text: 'text-yellow-100'
      }
    case 'info':
    default:
      return {
        bg: 'bg-blue-900/90',
        border: 'border-blue-700',
        icon: 'ℹ️',
        text: 'text-blue-100'
      }
  }
}

/**
 * Single notification item component
 */
interface NotificationItemProps {
  notification: ErrorNotificationType
  onDismiss: (id: string) => void
}

function NotificationItem({ notification, onDismiss }: NotificationItemProps): JSX.Element {
  const styles = getSeverityStyles(notification.severity)

  // Auto-dismiss info notifications after 5 seconds
  useEffect(() => {
    if (notification.severity === 'info') {
      const timer = setTimeout(() => {
        onDismiss(notification.id)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [notification.id, notification.severity, onDismiss])

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border ${styles.bg} ${styles.border} shadow-lg animate-slide-in`}
      role="alert"
      data-testid="error-notification"
      data-severity={notification.severity}
    >
      <span className="text-lg flex-shrink-0" aria-hidden="true">
        {styles.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${styles.text}`}>
          {notification.message}
        </p>
      </div>
      <button
        onClick={() => onDismiss(notification.id)}
        className="flex-shrink-0 p-1 text-gray-400 hover:text-white transition-colors rounded hover:bg-white/10"
        aria-label="Dismiss notification"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

/**
 * ErrorNotification component
 * Displays error messages with dismiss action and severity levels
 * 
 * Requirements:
 * - 8.4: Display notification with actionable information when error occurs
 */
export function ErrorNotification(): JSX.Element | null {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const handleDismiss = (id: string): void => {
    dispatch({ type: 'ERROR_DISMISS', id })
  }

  const handleClearAll = (): void => {
    dispatch({ type: 'ERROR_CLEAR_ALL' })
  }

  // Don't render if no errors
  if (state.errors.length === 0) {
    return null
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] space-y-2"
      data-testid="error-notification-container"
    >
      {/* Clear all button when multiple notifications */}
      {state.errors.length > 1 && (
        <div className="flex justify-end mb-2">
          <button
            onClick={handleClearAll}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            Clear all ({state.errors.length})
          </button>
        </div>
      )}

      {/* Notification list */}
      {state.errors.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  )
}

export default ErrorNotification
