const BASE = "/api"

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

async function request<T>(
	method: HttpMethod,
	path: string,
	body?: unknown,
): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
		credentials: "include",
	})

	if (!res.ok) {
		const error = await res.json().catch(() => ({ message: res.statusText }))
		throw new Error(error.message ?? `HTTP ${res.status}`)
	}

	return res.json() as Promise<T>
}

export const api = {
	get: <T>(path: string) => request<T>("GET", path),
	post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
	patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
	put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
	del: <T>(path: string) => request<T>("DELETE", path),
}
