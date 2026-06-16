export type Toast = {
	id: number
	message: string
	detail?: string
	type: "badge" | "info" | "error"
}

let nextId = 0

export const toasts = $state<Toast[]>([])

export function addToast(t: Omit<Toast, "id">, durationMs = 4000) {
	const id = ++nextId
	toasts.push({ ...t, id })
	setTimeout(() => {
		const idx = toasts.findIndex((x) => x.id === id)
		if (idx !== -1) toasts.splice(idx, 1)
	}, durationMs)
}

export function showBadgeToast(badge: { name: string; tier: string }) {
	addToast({
		type: "badge",
		message: `Badge unlocked: ${badge.name}`,
		detail: badge.tier,
	})
}
