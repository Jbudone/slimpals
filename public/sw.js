// The app shell, kept on the device: built files (/assets/*, hashed, so they
// never change under one name) come from the cache first, and the page itself
// is fetched fresh but falls back to the last copy, so the app still opens
// with a bad or missing connection. The API is never cached here (the app
// keeps its own copies of reads in IndexedDB, see src/lib/net).
const CACHE = "sp-shell-v1"
const MAX_ASSETS = 120

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			for (const k of await caches.keys())
				if (k !== CACHE) await caches.delete(k)
			await self.clients.claim()
		})(),
	)
})

async function trim(cache) {
	const keys = await cache.keys()
	for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)))
		await cache.delete(k)
}

self.addEventListener("fetch", (event) => {
	const req = event.request
	if (req.method !== "GET") return
	const url = new URL(req.url)
	if (url.origin !== self.location.origin) return
	if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/"))
		return

	if (url.pathname.startsWith("/assets/")) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(CACHE)
				const hit = await cache.match(req)
				if (hit) return hit
				const res = await fetch(req)
				if (res.ok) {
					await cache.put(req, res.clone())
					void trim(cache)
				}
				return res
			})(),
		)
		return
	}

	if (req.mode === "navigate") {
		event.respondWith(
			(async () => {
				const cache = await caches.open(CACHE)
				try {
					const res = await fetch(req)
					if (res.ok) await cache.put("/index.html", res.clone())
					return res
				} catch {
					return (await cache.match("/index.html")) ?? Response.error()
				}
			})(),
		)
	}
})
