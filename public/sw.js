const CACHE_NAME = 'shots-sparkles-pos-v7'
const APP_SHELL = ['/', '/customer.html', '/manifest.webmanifest', '/customer.webmanifest', '/shots-sparkles.svg']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(APP_SHELL)
    const pages = await Promise.all(['/', '/customer.html'].map((path) => cache.match(path)))
    const assetsByPage = await Promise.all(pages.map(async (page) => {
      const html = await page?.text() || ''
      return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((match) => match[1])
    }))
    await cache.addAll([...new Set(assetsByPage.flat())])
  })())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        const cachePath = url.pathname === '/customer.html' ? '/customer.html' : '/'
        void caches.open(CACHE_NAME).then((cache) => cache.put(cachePath, copy))
      }
      return response
    }).catch(async () => {
      const fallbackPath = url.pathname === '/customer.html' ? '/customer.html' : '/'
      return (await caches.match(request)) || (await caches.match(fallbackPath))
    }))
    return
  }

  event.respondWith(caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      }
      return response
    })
    return cached || network
  }))
})
