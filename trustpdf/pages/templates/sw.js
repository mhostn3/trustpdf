{% autoescape off %}/*
  TrustPDF service worker: makes the site work offline.

  It only ever stores the site's own public files (pages, scripts, styles,
  icons) in the browser's cache. It never sees, stores or sends your PDFs:
  those live in the page's memory only.

  - /static/ files have a content hash in their name, so they are served
    from the cache when present (cache first).
  - Pages are fetched from the network when online, so they are always
    current, and come from the cache when offline (network first).
  - Everything else (the statistics beacon, staff pages) is not touched at all.
*/
"use strict";

const STATIC_CACHE = "trustpdf-static";
const PAGE_CACHE = "trustpdf-pages";
const STATIC_PREFIX = {{ static_prefix }};
const IMMUTABLE_STATIC = {{ immutable }};   // false in development, where names carry no hash
const PRECACHE = {{ precache }};
const PAGES = {{ pages }};
// {{ version }}

const isCacheable = (response) => response && response.status === 200 && response.type === "basic";

async function precache() {
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(PRECACHE.map(async (url) => {
    if (IMMUTABLE_STATIC && (await statics.match(url))) return; // unchanged since the last version
    const response = await fetch(url, { cache: "no-cache" });
    if (isCacheable(response)) await statics.put(url, response);
  }));
  // The header tells the server these are not visits (they are not counted in the statistics).
  const pages = await caches.open(PAGE_CACHE);
  await Promise.all(PAGES.map(async (url) => {
    try {
      const response = await fetch(url, { headers: { "X-TrustPDF-Precache": "1" }, cache: "no-cache" });
      if (isCacheable(response)) await pages.put(url, response);
    } catch (_) { /* offline or blocked: the page is cached on its next visit */ }
  }));
}

async function cleanUp() {
  const statics = await caches.open(STATIC_CACHE);
  const keep = new Set(PRECACHE.map((url) => new URL(url, self.location).href));
  for (const request of await statics.keys()) {
    // Large on-demand libraries (OCR data, qpdf, fonts) live under vendor/ and stay.
    if (!keep.has(request.url) && !request.url.includes(STATIC_PREFIX + "vendor/")) await statics.delete(request);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(cleanUp().then(() => self.clients.claim()));
});

async function staticResponse(request) {
  const cache = await caches.open(STATIC_CACHE);
  if (IMMUTABLE_STATIC) {
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  try {
    const response = await fetch(request);
    if (isCacheable(response)) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
}

async function pageResponse(request, path) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) cache.put(path, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(path);
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(STATIC_PREFIX)) {
    if (request.headers.has("range")) return;
    event.respondWith(staticResponse(request));
  } else if (request.mode === "navigate" && PAGES.includes(url.pathname)) {
    event.respondWith(pageResponse(request, url.pathname));
  }
});
{% endautoescape %}
