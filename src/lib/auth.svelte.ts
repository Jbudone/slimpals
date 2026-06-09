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

export async function fetchSession() {
	try {
		const res = await fetch("/api/auth/get-session", { credentials: "include" })
		if (res.ok) {
			const data = await res.json()
			authState.user = data?.user ?? null
		} else {
			authState.user = null
		}
	} catch {
		authState.user = null
	} finally {
		authState.loading = false
	}
}

export async function logout() {
	await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" })
	authState.user = null
}
