// Data the 3D gym reads from the server: the stored layout, the NPC roster
// (names, roles, relationship), the live sim state (who is in, on what, in
// what mood; today's event and classes) and speech-bubble lines.
import type { GymLayoutDto } from "../../../../shared/types"
import { api, NetworkError } from "../../../lib/api"
import { authState } from "../../../lib/auth.svelte"
import { kvGet, kvSet } from "../../../lib/net/kv"
import type { NpcIn } from "./assignTargets"

export type NpcRosterEntry = {
	key: string
	name: string
	role: string
	relationshipLevel?: number
}

/** One NPC in GET /api/gym/sim-state. */
export type SimNpc = {
	npcKey: string
	isPresent: boolean
	targetEquipmentKey: string | null
	currentActivity?: string
	mood?: number
	chatEventWith?: string | null
	isHeroVisit?: boolean
}

export type GymEvent = {
	type: string
	title: string
	description?: string
	npcKey: string | null
	activeHours: [number, number]
}

export type ActiveClass = { key: string; name: string; category: string }

export type SimState = {
	npcs: SimNpc[]
	/** Sim clock (hour override applied), ms. */
	simTime: number
	todayEvent: GymEvent | null
	/** The event is on at the sim's hour (server clock). */
	eventActive: boolean
	activeClasses: ActiveClass[]
}

export type NpcLines = {
	key: string
	lines: string[]
	friends: string[]
	rivals: string[]
}

/** The gym's layout; `open` marks a fresh open of the gym (the answer may
 * carry a "welcome back" summary after a long absence). */
const LAYOUT_KEY = () => `gym:layout:${authState.user?.id ?? ""}`
const ROSTER_KEY = () => `gym:roster:${authState.user?.id ?? ""}`

export async function loadLayout(open = false): Promise<GymLayoutDto> {
	// the last layout is kept on the device, so the gym still opens (read-only
	// in effect: builds need the connection) when there is none
	try {
		const L = await api.get<GymLayoutDto>(
			open ? "/gym/layout?open=1" : "/gym/layout",
		)
		void kvSet(LAYOUT_KEY(), L)
		return L
	} catch (e) {
		if (e instanceof NetworkError) {
			const old = await kvGet<GymLayoutDto>(LAYOUT_KEY())
			if (old) return old
		}
		throw e
	}
}

export async function loadRoster(): Promise<NpcRosterEntry[]> {
	try {
		const r = await api.get<NpcRosterEntry[]>("/gym/npcs")
		void kvSet(ROSTER_KEY(), r)
		return r
	} catch (e) {
		if (e instanceof NetworkError) {
			const old = await kvGet<NpcRosterEntry[]>(ROSTER_KEY())
			if (old) return old
		}
		throw e
	}
}

export async function loadLines(): Promise<NpcLines[]> {
	const d = await api.get<{ npcs?: NpcLines[] }>("/gym/npc-lines")
	return d.npcs ?? []
}

/** The AI's nightly banter exchanges (a nicety: empty when there are none). */
export async function loadBanter(): Promise<
	{ id: number; situation: string; lines: string[] }[]
> {
	const d = await api.get<{
		banter?: { id: number; situation: string; lines: string[] }[]
	}>("/gym/banter")
	return d.banter ?? []
}

export async function loadSim(): Promise<SimState> {
	const d = await api.get<{
		npcs?: SimNpc[]
		simTime?: string
		todayEvent?: GymEvent | null
		eventActive?: boolean
		activeClasses?: ActiveClass[]
	}>("/gym/sim-state")
	return {
		npcs: d.npcs ?? [],
		simTime: Date.parse(d.simTime ?? "") || Date.now(),
		todayEvent: d.todayEvent ?? null,
		eventActive: !!d.eventActive,
		activeClasses: d.activeClasses ?? [],
	}
}

/** The sim's NPCs joined with roster roles, in sim order. */
export function simNpcsIn(
	sim: SimState,
	roster: readonly NpcRosterEntry[],
): NpcIn[] {
	const role = new Map(roster.map((r) => [r.key, r.role]))
	return sim.npcs.map((n) => ({
		npcKey: n.npcKey,
		isPresent: n.isPresent,
		targetEquipmentKey: n.targetEquipmentKey ?? null,
		role: role.get(n.npcKey) ?? null,
	}))
}

/** Today's event when it is on (by the server's sim clock). */
export function activeEvent(sim: SimState): GymEvent | null {
	return sim.eventActive ? sim.todayEvent : null
}
