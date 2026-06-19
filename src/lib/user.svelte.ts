import type { CoachPersonality, Theme, ViewMode } from "../../shared/types.js"

export type UserProfile = {
	id: string
	email: string
	name: string
	theme: Theme
	coachPersonality: CoachPersonality
	viewMode: ViewMode
	heightCm: number | null
	goalWeightKg: number | null
	goalDate: string | null
	isAdmin: boolean
	autoShareFoodLogs: boolean
	autoShareBadges: boolean
	autoShareWeightMilestones: boolean
}

export const userProfile = $state<{ data: UserProfile | null }>({ data: null })

export function applyTheme(theme: Theme) {
	document.documentElement.setAttribute("data-theme", theme)
	localStorage.setItem("sp:theme", theme)
}

export async function fetchUserProfile() {
	try {
		const res = await fetch("/api/users/me", { credentials: "include" })
		if (res.ok) {
			const data = (await res.json()) as UserProfile
			userProfile.data = data
			applyTheme(data.theme)
		}
	} catch {
		// silently ignore — user profile is non-critical on load
	}
}

export async function updateTheme(theme: Theme) {
	const res = await fetch("/api/users/me", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ theme }),
	})
	if (res.ok) {
		const data = (await res.json()) as UserProfile
		userProfile.data = data
		applyTheme(data.theme)
	}
}

export async function updateCoachPersonality(
	coachPersonality: CoachPersonality,
) {
	const res = await fetch("/api/users/me", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ coachPersonality }),
	})
	if (res.ok) {
		const data = (await res.json()) as UserProfile
		userProfile.data = data
	}
}
