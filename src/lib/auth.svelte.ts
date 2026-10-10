export type CurrentUser = {
	id: string
	email: string
	name: string
	emailVerified: boolean
}

export const authState = $state<{
	user: CurrentUser | null
	loading: boolean
}>({
	user: null,
	loading: true,
})

const USER_KEY = "sp:user"

function rememberedUser(): CurrentUser | null {
	try {
		const raw = localStorage.getItem(USER_KEY)
		return raw ? (JSON.parse(raw) as CurrentUser) : null
	} catch {
		return null
	}
}

function rememberUser(u: CurrentUser | null): void {
	try {
		if (u) localStorage.setItem(USER_KEY, JSON.stringify(u))
		else localStorage.removeItem(USER_KEY)
	} catch {
		// not remembered, the next visit just asks the server
	}
}

/** Whether this browser has had a signed-in session (decides what main.ts
 * starts loading before the session answer is back). */
export function wasSignedIn(): boolean {
	return rememberedUser() !== null
}

export async function fetchSession() {
	try {
		const res = await fetch("/api/auth/get-session", { credentials: "include" })
		if (res.ok) {
			const data = await res.json()
			authState.user = data?.user ?? null
			rememberUser(authState.user)
		} else {
			// the server answered "not signed in": that is final
			authState.user = null
			rememberUser(null)
		}
	} catch {
		// no connection: keep the player in the app on what we remember rather
		// than throwing them at the login page
		authState.user = rememberedUser()
	} finally {
		authState.loading = false
	}
}

export async function logout() {
	await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" })
	authState.user = null
	rememberUser(null)
}
