// This month's challenge as the Today list needs it: the goals to log today
// (one tap each) and what was already logged. Shared by the Today page, the
// gym's Today drawer and the Compete card, so a tap in one shows in all.
import { loadEventTheme } from "./eventTheme.svelte.js"
import { sendOrQueue } from "./net/queue.js"
import { swr } from "./net/swr.js"
import { showBadgeToast } from "./toast.svelte.js"
import { loadWallet } from "./wallet.svelte.js"

export type ChallengeGoal = {
	id: string
	title: string
	target: number
	unit: string
	dailyAmount: number
	dailyPrompt: string
	auto?: string
}

export type TodayChallenge = {
	id: number
	title: string
	theme?: string | null
	goals: ChallengeGoal[]
	joined: boolean
	progress: Record<string, number>
	dailyLog: Record<string, string[]>
	completedAt: string | null
	goalsCompleted: number
	totalGoals: number
} | null

export const challengeToday = $state<{
	data: TodayChallenge
	loaded: boolean
	saving: string | null
}>({ data: null, loaded: false, saving: null })

export const todayIso = () => new Date().toISOString().slice(0, 10)

export type GoalState = "done-today" | "reached" | "auto" | "pending"

/** Where one goal stands today. */
export function goalState(c: NonNullable<TodayChallenge>, g: ChallengeGoal) {
	if ((c.progress[g.id] ?? 0) >= g.target) return "reached" as const
	if ((c.dailyLog[g.id] ?? []).includes(todayIso()))
		return "done-today" as const
	if (g.auto) return "auto" as const
	return "pending" as const
}

export async function loadChallengeToday(): Promise<void> {
	await swr<TodayChallenge>("/challenges/current", (r) => {
		challengeToday.data = r
	})
	challengeToday.loaded = true
}

/** One tap logs today's amount for a goal (queued when there is no
 * connection: the stamp shows at once and the server catches up later). */
export async function logChallengeGoal(goal: ChallengeGoal): Promise<void> {
	const c = challengeToday.data
	if (!c || challengeToday.saving) return
	challengeToday.saving = goal.id
	try {
		const sent = await sendOrQueue<{
			newBadges?: {
				key: string
				name: string
				tier: string
				earnedAt: string
			}[]
			milestonesPaid?: unknown[]
		}>("PATCH", `/challenges/${c.id}/progress`, {
			dailyProgress: { [goal.id]: goal.dailyAmount },
		})
		if (sent.queued) {
			c.dailyLog[goal.id] = [...(c.dailyLog[goal.id] ?? []), todayIso()]
			c.progress[goal.id] = (c.progress[goal.id] ?? 0) + goal.dailyAmount
			return
		}
		const res = sent.data
		for (const b of res.newBadges ?? []) showBadgeToast(b)
		if (res.milestonesPaid?.length) void loadWallet()
		await loadChallengeToday()
		// finishing it can change the app's look
		void loadEventTheme()
	} finally {
		challengeToday.saving = null
	}
}
