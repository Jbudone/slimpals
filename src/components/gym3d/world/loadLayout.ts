// Data the 3D gym reads from the server: the stored layout, the NPC roster
// (names and roles) and the live sim state (who is in, and on what).
import type { GymLayoutDto } from "../../../../shared/types"
import { api } from "../../../lib/api"
import type { NpcIn } from "./assignTargets"

export type NpcRosterEntry = { key: string; name: string; role: string }

type SimNpc = {
	npcKey: string
	isPresent: boolean
	targetEquipmentKey: string | null
}

export function loadLayout(): Promise<GymLayoutDto> {
	return api.get<GymLayoutDto>("/gym/layout")
}

export function loadRoster(): Promise<NpcRosterEntry[]> {
	return api.get<NpcRosterEntry[]>("/gym/npcs")
}

/** The sim's NPCs joined with roster roles, in sim order. */
export async function loadSimNpcs(
	roster: readonly NpcRosterEntry[],
): Promise<NpcIn[]> {
	const data = await api.get<{ npcs?: SimNpc[] }>("/gym/sim-state")
	const role = new Map(roster.map((r) => [r.key, r.role]))
	return (data.npcs ?? []).map((n) => ({
		npcKey: n.npcKey,
		isPresent: n.isPresent,
		targetEquipmentKey: n.targetEquipmentKey ?? null,
		role: role.get(n.npcKey) ?? null,
	}))
}
