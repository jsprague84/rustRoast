// RustRoast Service Worker
// Provides offline functionality and intelligent caching

const CACHE_NAME = 'rustroast-v1'
const STATIC_CACHE = 'rustroast-static-v1'
const DYNAMIC_CACHE = 'rustroast-dynamic-v1'

// Files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  // Add critical CSS and JS files when known
]

// API endpoints that should be cached
const CACHEABLE_API_PATTERNS = [
  /\/api\/devices$/,
  /\/api\/sessions\/\w+$/,
  /\/api\/profiles$/,
]

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...')

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      })
      .then(() => {
        console.log('[SW] Installation complete')
        return self.skipWaiting()
      })
      .catch(error => {
        console.error('[SW] Installation failed:', error)
      })
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...')

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE &&
                cacheName !== DYNAMIC_CACHE &&
                cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => {
        console.log('[SW] Activation complete')
        return self.clients.claim()
      })
  )
})

// Fetch event - handle requests with caching strategies
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Handle different request types with appropriate strategies
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request))
  } else if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    event.respondWith(handleStaticAsset(request))
  } else {
    event.respondWith(handleNavigation(request))
  }
})

// Handle API requests with network-first strategy for critical data
async function handleApiRequest(request) {
  const url = new URL(request.url)

  // Real-time endpoints should not be cached
  if (url.pathname.includes('/telemetry/latest') ||
      url.pathname.includes('/ws/') ||
      url.pathname.includes('/control/')) {
    return fetch(request)
  }

  // Check if this API endpoint should be cached
  const shouldCache = CACHEABLE_API_PATTERNS.some(pattern =>
    pattern.test(url.pathname)
  )

  if (!shouldCache) {
    return fetch(request)
  }

  try {
    // Try network first
    const response = await fetch(request)

    if (response.ok) {
      // Cache successful responses
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    console.log('[SW] Network failed, trying cache for:', request.url)

    // Fallback to cache
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }

    // Return offline response for API calls
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'This data is not available offline'
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

// Handle static assets with cache-first strategy
async function handleStaticAsset(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }

    // Fetch from network and cache
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    console.log('[SW] Failed to load static asset:', request.url)
    return new Response('Asset not available offline', { status: 503 })
  }
}

// Handle navigation requests with cache-first strategy for app shell
async function handleNavigation(request) {
  try {
    // Try cache first for known routes
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }

    // Try network
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    console.log('[SW] Navigation failed, serving app shell')

    // Fallback to app shell (index.html)
    const appShell = await caches.match('/index.html')
    if (appShell) {
      return appShell
    }

    return new Response('App not available offline', {
      status: 503,
      headers: { 'Content-Type': 'text/html' }
    })
  }
}

// Background sync for when connection is restored
self.addEventListener('sync', event => {
  console.log('[SW] Background sync triggered:', event.tag)

  if (event.tag === 'background-sync') {
    event.waitUntil(handleBackgroundSync())
  }
})

async function handleBackgroundSync() {
  console.log('[SW] Performing background sync...')

  try {
    // Sync any queued telemetry data or commands
    const cache = await caches.open(DYNAMIC_CACHE)
    const cachedRequests = await cache.keys()

    // Clear old cache entries
    const now = Date.now()
    const oneHour = 60 * 60 * 1000

    for (const request of cachedRequests) {
      const response = await cache.match(request)
      const date = response.headers.get('date')

      if (date && now - new Date(date).getTime() > oneHour) {
        await cache.delete(request)
      }
    }

    console.log('[SW] Background sync completed')
  } catch (error) {
    console.error('[SW] Background sync failed:', error)
  }
}

// Push notification handling
self.addEventListener('push', event => {
  if (!event.data) return

  const data = event.data.json()
  const options = {
    body: data.body || 'New update available',
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    tag: data.tag || 'general',
    data: data.data || {},
    actions: [
      {
        action: 'view',
        title: 'View'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'RustRoast', options)
  )
})

// Notification click handling
self.addEventListener('notificationclick', event => {
  event.notification.close()

  if (event.action === 'view') {
    event.waitUntil(
      self.clients.openWindow('/')
    )
  }
})

// Message handling for communication with main thread
self.addEventListener('message', event => {
  const { type, payload } = event.data

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting()
      break

    case 'CACHE_UPDATE':
      handleCacheUpdate(payload)
      break

    case 'CLEAR_CACHE':
      handleClearCache(payload)
      break

    default:
      console.log('[SW] Unknown message type:', type)
  }
})

async function handleCacheUpdate(payload) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE)
    if (payload.url && payload.data) {
      const response = new Response(JSON.stringify(payload.data), {
        headers: { 'Content-Type': 'application/json' }
      })
      await cache.put(payload.url, response)
    }
  } catch (error) {
    console.error('[SW] Cache update failed:', error)
  }
}

async function handleClearCache(payload) {
  try {
    if (payload.cacheNames) {
      for (const cacheName of payload.cacheNames) {
        await caches.delete(cacheName)
      }
    } else {
      const cacheNames = await caches.keys()
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName)
      }
    }
    console.log('[SW] Cache cleared')
  } catch (error) {
    console.error('[SW] Cache clear failed:', error)
  }
}