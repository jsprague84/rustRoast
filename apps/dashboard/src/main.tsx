import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { ChartSettingsProvider } from './context/ChartSettingsContext'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds - consider data fresh for this duration
      gcTime: 300000, // 5 minutes - keep in cache for this duration (was cacheTime)
      refetchOnWindowFocus: true, // Refetch when window regains focus (helps with hibernation)
      refetchOnReconnect: true, // Refetch when network reconnects
      refetchInterval: false, // Disable automatic refetching by default
      retry: (failureCount, error: any) => {
        // Retry up to 3 times for network errors
        if (failureCount < 3) {
          // Check if it's a network error
          if (error?.code === 'ECONNREFUSED' || error?.name === 'NetworkError' || !navigator.onLine) {
            return true
          }
          // Retry for 5xx server errors
          if (error?.status >= 500) {
            return true
          }
        }
        return false
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff with max 30s
    },
    mutations: {
      retry: (failureCount, error: any) => {
        // Only retry mutations for network errors, not for client errors
        if (failureCount < 2) {
          if (error?.code === 'ECONNREFUSED' || error?.name === 'NetworkError' || !navigator.onLine) {
            return true
          }
        }
        return false
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff with max 10s
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <ChartSettingsProvider>
        <App />
      </ChartSettingsProvider>
    </QueryClientProvider>
  </React.StrictMode>
)

