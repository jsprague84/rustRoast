import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children?: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="error-message" style={{
          margin: '1rem',
          padding: '1rem',
          borderRadius: '0.5rem'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            ⚠️ Something went wrong
          </h2>
          <p style={{ marginBottom: '1rem', color: 'var(--color-gray-600)' }}>
            An error occurred while rendering this component. The application will continue to work, but this section may not display correctly.
          </p>

          <details style={{ fontSize: '0.875rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: '500', marginBottom: '0.5rem' }}>
              Error details (click to expand)
            </summary>
            <div style={{
              backgroundColor: 'var(--color-gray-100)',
              padding: '0.75rem',
              borderRadius: '0.25rem',
              marginTop: '0.5rem',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              overflowX: 'auto'
            }}>
              {this.state.error?.name}: {this.state.error?.message}
              {this.state.error?.stack && (
                <pre style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>
                  {this.state.error.stack}
                </pre>
              )}
            </div>
          </details>

          <button
            onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
            className="btn-secondary"
            style={{ marginTop: '1rem' }}
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Higher-order component for easier usage
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    )
  }
}

// Hook for error boundary functionality in function components
export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    if (error) {
      throw error
    }
  }, [error])

  return { throwError: setError }
}