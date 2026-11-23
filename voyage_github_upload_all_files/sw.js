// =========================================================================
// Voyage Financial Management System - PWA Service Worker (V2026.11.23.3)
// Designed for Samsung Android Tablets, Chrome, Edge, and Samsung Internet
// =========================================================================

const CACHE_VERSION = 'voyage-pwa-v2026.11.23.3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Core Application Shell Assets to Pre-cache
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './maskable-icon-192.png',
  './maskable-icon-512.png',
  './apple-touch-icon.png',
  './favicon.ico',
  './favicon.png',
  './favicon.svg'
];

// Essential Static CDN Vendor Libraries for Offline Shell Support
const CDN_VENDOR_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// -------------------------------------------------------------------------
// Security & Sensitive Data Bypass Rule (Strict Compliance with Requirement 9)
// NEVER cache sensitive financial transactions, auth tokens, or sync APIs!
// -------------------------------------------------------------------------
function isSensitiveOrBypassRequest(request, url) {
  // 1. Only GET requests are eligible for caching
  if (request.method !== 'GET') {
    return true;
  }

  // 2. Supabase Cloud Sync & Realtime Database endpoints
  if (url.hostname.includes('supabase.co') || 
      url.pathname.includes('/rest/v1/') || 
      url.pathname.includes('/auth/v1/')) {
    return true;
  }

  // 3. Sensitive headers detection
  const authHeader = request.headers.get('Authorization');
  const apiKeyHeader = request.headers.get('apikey');
  if (authHeader || apiKeyHeader) {
    return true;
  }

  // 4. Sensitive query parameters
  if (url.searchParams.has('apikey') || 
      url.searchParams.has('token') || 
      url.searchParams.has('secret') || 
      url.searchParams.has('key')) {
    return true;
  }

  // 5. Google APIs / Drive endpoints
  if (url.hostname.includes('googleapis.com') || 
      url.hostname.includes('google.com')) {
    return true;
  }

  // 6. Chrome extension or non-http protocols
  if (!url.protocol.startsWith('http')) {
    return true;
  }

  return false;
}

// -------------------------------------------------------------------------
// Service Worker Lifecycle: Install
// -------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  console.log('[Voyage PWA SW] Installing Service Worker version:', CACHE_VERSION);
  self.skipWaiting();

  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // 1. Cache local app shell assets
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[Voyage PWA SW] Pre-cache asset warning:', asset, err);
        }
      }

      // 2. Cache CDN vendor scripts (graceful fallback)
      for (const cdnUrl of CDN_VENDOR_ASSETS) {
        try {
          const resp = await fetch(cdnUrl, { mode: 'cors' });
          if (resp && resp.ok) {
            await cache.put(cdnUrl, resp);
          }
        } catch (err) {
          console.warn('[Voyage PWA SW] Pre-cache CDN warning:', cdnUrl, err);
        }
      }
      console.log('[Voyage PWA SW] Pre-caching complete');
    })
  );
});

// -------------------------------------------------------------------------
// Service Worker Lifecycle: Activate (Clean Old Caches)
// -------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  console.log('[Voyage PWA SW] Activating Service Worker version:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== STATIC_CACHE && name !== RUNTIME_CACHE) {
            console.log('[Voyage PWA SW] Removing obsolete cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// -------------------------------------------------------------------------
// Service Worker Lifecycle: Fetch (Smart Secure Caching Strategy)
// -------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Strictly bypass sensitive financial APIs and auth endpoints (Network-Only)
  if (isSensitiveOrBypassRequest(request, url)) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. HTML Document / App Shell Navigation: Network-First with Cache Fallback
  // Ensures new updates deployed to GitHub Pages appear immediately,
  // while tablet still boots smoothly if offline.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          console.log('[Voyage PWA SW] Offline navigation fallback for:', request.url);
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          const fallback = await caches.match('./index.html') || await caches.match('./');
          return fallback || Response.error();
        })
    );
    return;
  }

  // 3. Static Assets & App Shell Icons / CSS / Manifest: Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
            const responseClone = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse || Response.error());

      return cachedResponse || fetchPromise;
    })
  );
});

// -------------------------------------------------------------------------
// Message Handler for instant client updates
// -------------------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
