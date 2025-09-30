import { useState, useCallback } from 'react'

interface UseRetryOptions {
  maxRetries?: number
  delay?: number
  backoffMultiplier?: number
}

interface RetryState {
  isRetrying: boolean
  retryCount: number
  error: Error | null
}

export function useRetry<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  options: UseRetryOptions = {}
) {
  const { maxRetries = 3, delay = 1000, backoffMultiplier = 2 } = options

  const [state, setState] = useState<RetryState>({
    isRetrying: false,
    retryCount: 0,
    error: null
  })

  const execute = useCallback(async (...args: T): Promise<R> => {
    setState(prev => ({ ...prev, isRetrying: true, error: null }))

    let retryCount = 0
    let currentDelay = delay

    while (retryCount <= maxRetries) {
      try {
        const result = await fn(...args)
        setState(prev => ({ ...prev, isRetrying: false, retryCount }))
        return result
      } catch (error) {
        retryCount++

        if (retryCount > maxRetries) {
          setState(prev => ({
            ...prev,
            isRetrying: false,
            retryCount,
            error: error instanceof Error ? error : new Error('Unknown error')
          }))
          throw error
        }

        setState(prev => ({ ...prev, retryCount }))

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, currentDelay))
        currentDelay *= backoffMultiplier
      }
    }

    throw new Error('Max retries exceeded')
  }, [fn, maxRetries, delay, backoffMultiplier])

  const reset = useCallback(() => {
    setState({ isRetrying: false, retryCount: 0, error: null })
  }, [])

  return {
    execute,
    reset,
    ...state
  }
}

// Hook for use with React Query mutations
export function useRetryMutation<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  options: UseRetryOptions = {}
) {
  const retry = useRetry(fn, options)

  return {
    mutateAsync: retry.execute,
    isLoading: retry.isRetrying,
    error: retry.error,
    reset: retry.reset,
    retryCount: retry.retryCount
  }
}