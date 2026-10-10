// A tiny key-value store on IndexedDB (memory when IndexedDB is missing or
// blocked), for what the app should still have after the tab closes: the last
// answer of a read, the queue of inputs not sent yet. Every call resolves, a
// failing disk only means the value is not remembered.
const DB = "slimpals-net"
const STORE = "kv"

let dbp: Promise<IDBDatabase | null> | null = null
const mem = new Map<string, unknown>()

function open(): Promise<IDBDatabase | null> {
	if (dbp) return dbp
	dbp = new Promise((resolve) => {
		try {
			const req = indexedDB.open(DB, 1)
			req.onupgradeneeded = () => req.result.createObjectStore(STORE)
			req.onsuccess = () => resolve(req.result)
			req.onerror = () => resolve(null)
			req.onblocked = () => resolve(null)
		} catch {
			resolve(null)
		}
	})
	return dbp
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
	if (mem.has(key)) return mem.get(key) as T
	const db = await open()
	if (!db) return undefined
	return new Promise((resolve) => {
		try {
			const r = db.transaction(STORE).objectStore(STORE).get(key)
			r.onsuccess = () => resolve(r.result as T | undefined)
			r.onerror = () => resolve(undefined)
		} catch {
			resolve(undefined)
		}
	})
}

export async function kvSet(key: string, value: unknown): Promise<void> {
	mem.set(key, value)
	const db = await open()
	if (!db) return
	await new Promise<void>((resolve) => {
		try {
			const tx = db.transaction(STORE, "readwrite")
			tx.objectStore(STORE).put(value, key)
			tx.oncomplete = () => resolve()
			tx.onerror = () => resolve()
			tx.onabort = () => resolve()
		} catch {
			resolve()
		}
	})
}

export async function kvDel(key: string): Promise<void> {
	mem.delete(key)
	const db = await open()
	if (!db) return
	await new Promise<void>((resolve) => {
		try {
			const tx = db.transaction(STORE, "readwrite")
			tx.objectStore(STORE).delete(key)
			tx.oncomplete = () => resolve()
			tx.onerror = () => resolve()
			tx.onabort = () => resolve()
		} catch {
			resolve()
		}
	})
}
