// Today's tasks (the daily check-in, daily and weekly missions), shared by
// the Home drawer, the Today tab and the tab bar's badge. Ticking a task
// flies its rewards into the HUD and lets the gym react.
import type { MissionCadence, MissionDifficulty } from "../../shared/types.js"
import { chipHtml } from "../components/home/icons.js"
import { api } from "./api.js"
import {
	checkinState,
	loadCheckinStatus,
	submitCheckin,
} from "./checkin.svelte.js"
import { burstAt, centerOf, flyChip } from "./fly.js"
import { showBadgeToast } from "./toast.svelte.js"
import { addXp, loadWallet, patchWallet, wallet } from "./wallet.svelte.js"

export type MissionKind = "exercise" | "diet" | "other"

export type Mission = {
	id: number
	title: string
	description: string | null
	cadence: MissionCadence
	difficulty: MissionDifficulty
	kind: MissionKind
	xp: number
	sweat: number
	greens: number
	createdAt: string
	completedThisPeriod: boolean
}

type Rewards = { xp: number; sweat: number; greens: number }

type GymAfter = {
	xp: number
	level: number
	xpIntoLevel: number
	xpForLevel: number
	coins: number
	sweat: number
	greens: number
}

export const today = $state<{
	loaded: boolean
	error: string | null
	daily: Mission[]
	weekly: Mission[]
	busy: number | "checkin" | null
}>({ loaded: false, error: null, daily: [], weekly: [], busy: null })

export const CHECKIN_XP = 15

export async function loadToday(): Promise<void> {
	try {
		const res = await api.get<{ daily: Mission[]; weekly: Mission[] }>(
			"/missions",
		)
		today.daily = res.daily
		today.weekly = res.weekly
		today.error = null
	} catch (e) {
		today.error = e instanceof Error ? e.message : "Could not load missions"
	} finally {
		today.loaded = true
	}
	if (!checkinState.data) void loadCheckinStatus()
}

/** Check-in + daily missions: what the drawer counts. */
export function todayCounts(): { done: number; all: number } {
	const c = checkinState.data?.checkedInToday ? 1 : 0
	return {
		done: c + today.daily.filter((m) => m.completedThisPeriod).length,
		all: 1 + today.daily.length,
	}
}

/** The next thing to do today (check-in first). */
export function nextTask():
	| { kind: "checkin" }
	| { kind: "mission"; mission: Mission }
	| null {
	if (checkinState.data && !checkinState.data.checkedInToday)
		return { kind: "checkin" }
	const m =
		today.daily.find((q) => !q.completedThisPeriod) ??
		today.weekly.find((q) => !q.completedThisPeriod)
	return m ? { kind: "mission", mission: m } : null
}

function tell(kind: MissionKind | "checkin"): void {
	window.dispatchEvent(new CustomEvent("sp:task-done", { detail: { kind } }))
}

const BURST: Record<MissionKind | "checkin", string[]> = {
	exercise: ["#3d9df0", "#34c973", "#9ed0ff"],
	diet: ["#62b83f", "#34c973", "#d6f5a0"],
	other: ["#34c973", "#f2c14a", "#9af0b9"],
	checkin: ["#ff8a3d", "#ffd35a", "#34c973"],
}

/** Flies the paid rewards from `row` into the HUD, then settles the HUD on
 * the server's numbers. */
async function payOut(
	row: HTMLElement | null,
	r: Rewards,
	after: Partial<GymAfter> | null,
	unlockedKeys: string[],
): Promise<void> {
	// the newly unlocked gear's names for the level-up card
	let unlocked: string[] = []
	if (unlockedKeys.length) {
		await loadWallet()
		unlocked = (wallet.data?.pendingUpgrades ?? [])
			.filter((u) => unlockedKeys.includes(u.key))
			.map((u) => u.name)
	}
	const from = (sel: string) => {
		const el = row?.querySelector(sel) ?? row
		return el ? centerOf(el) : { x: innerWidth / 2, y: innerHeight / 2 }
	}
	const flights: Promise<void>[] = []
	let i = 0
	if (r.xp)
		flights.push(
			flyChip("xp", chipHtml("xp", r.xp), from("[data-r=xp]"), i++ * 140).then(
				() => addXp(r.xp, unlocked),
			),
		)
	if (r.sweat)
		flights.push(
			flyChip(
				"sw",
				chipHtml("sw", r.sweat),
				from("[data-r=sw]"),
				i++ * 140,
			).then(() => {
				if (wallet.data) patchWallet({ sweat: wallet.data.sweat + r.sweat })
			}),
		)
	if (r.greens)
		flights.push(
			flyChip(
				"gr",
				chipHtml("gr", r.greens),
				from("[data-r=gr]"),
				i++ * 140,
			).then(() => {
				if (wallet.data) patchWallet({ greens: wallet.data.greens + r.greens })
			}),
		)
	await Promise.all(flights)
	if (after) {
		const { xp, level, xpIntoLevel, xpForLevel, sweat, greens } = after
		patchWallet({
			...(xp != null ? { xp } : {}),
			...(level != null ? { level } : {}),
			...(xpIntoLevel != null ? { xpIntoLevel } : {}),
			...(xpForLevel != null ? { xpForLevel } : {}),
			...(sweat != null ? { sweat } : {}),
			...(greens != null ? { greens } : {}),
		})
	}
	window.dispatchEvent(new CustomEvent("sp:wallet-changed"))
}

export async function toggleMission(
	m: Mission,
	btn: HTMLElement | null,
): Promise<void> {
	if (today.busy != null) return
	today.busy = m.id
	const done = !m.completedThisPeriod
	// optimistic: the tick fills in at once
	m.completedThisPeriod = done
	try {
		const res = await api.post<{
			rewards?: Rewards
			newPendingUpgrades?: string[]
			gym: GymAfter
		}>(`/missions/${m.id}/${done ? "complete" : "uncomplete"}`)
		if (done) {
			if (btn) {
				const c = centerOf(btn)
				burstAt(c.x, c.y, BURST[m.kind])
			}
			tell(m.kind)
			await payOut(
				btn?.closest<HTMLElement>("[data-task]") ?? null,
				res.rewards ?? { xp: m.xp, sweat: 0, greens: 0 },
				res.gym,
				res.newPendingUpgrades ?? [],
			)
		} else {
			patchWallet({
				xp: res.gym.xp,
				level: res.gym.level,
				xpIntoLevel: res.gym.xpIntoLevel,
				xpForLevel: res.gym.xpForLevel,
			})
		}
	} catch {
		m.completedThisPeriod = !done
	} finally {
		today.busy = null
	}
}

export async function checkIn(btn: HTMLElement | null): Promise<void> {
	if (today.busy != null || checkinState.data?.checkedInToday) return
	today.busy = "checkin"
	try {
		const res = (await submitCheckin()) as Awaited<
			ReturnType<typeof submitCheckin>
		> & { rewards?: Rewards; newPendingUpgrades?: string[] }
		for (const b of res.newBadges ?? []) showBadgeToast(b)
		if (btn) {
			const c = centerOf(btn)
			burstAt(c.x, c.y, BURST.checkin)
		}
		tell("checkin")
		const row = btn?.closest<HTMLElement>("[data-task]") ?? null
		void flyChip("st", "+1 day", row ? centerOf(row) : { x: 60, y: 300 })
		await payOut(
			row,
			res.rewards ?? { xp: CHECKIN_XP, sweat: 0, greens: 0 },
			null,
			res.newPendingUpgrades ?? [],
		)
		await loadWallet()
	} finally {
		today.busy = null
	}
}

export type MissionInput = {
	title: string
	description?: string
	cadence: MissionCadence
	difficulty: MissionDifficulty
	kind: MissionKind
}

export async function saveMission(
	input: MissionInput,
	id: number | null,
): Promise<void> {
	if (id != null) await api.patch(`/missions/${id}`, input)
	else await api.post("/missions", input)
	await loadToday()
}

export async function archiveMission(id: number): Promise<void> {
	await api.post(`/missions/${id}/archive`)
	await loadToday()
}

/** One-tap starter missions for an empty Today list. */
export const SUGGESTED: MissionInput[] = [
	{
		title: "Snap a meal",
		cadence: "daily",
		difficulty: "medium",
		kind: "diet",
	},
	{
		title: "30-minute workout",
		cadence: "daily",
		difficulty: "hard",
		kind: "exercise",
	},
	{
		title: "Drink 2 L of water",
		cadence: "daily",
		difficulty: "easy",
		kind: "diet",
	},
	{
		title: "10-minute walk",
		cadence: "daily",
		difficulty: "easy",
		kind: "exercise",
	},
	{
		title: "Run 3 times",
		cadence: "weekly",
		difficulty: "hard",
		kind: "exercise",
	},
]
