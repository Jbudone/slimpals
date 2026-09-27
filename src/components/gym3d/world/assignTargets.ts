// Where each person in the 3D gym goes, decided from the server's sim state.
// Pure (no three.js) so it can be unit tested.

export type NpcIn = {
	npcKey: string
	isPresent: boolean
	/** Upgrade key of the equipment the sim put this NPC on, if any. */
	targetEquipmentKey: string | null
	/** Role from GET /api/gym/npcs (trainer, receptionist, regular, ...). */
	role: string | null
}

export type StationIn = { staff: boolean; swim: boolean }

export type PieceIn = {
	id: number
	upgradeKey: string | null
	stations: StationIn[]
}

export type Target =
	| { kind: "station"; pieceId: number; station: number }
	| { kind: "lobby"; slot: number }

export type Assignment = { npcKey: string; target: Target }

/** Roles that work the front desk when the sim gives them nothing to do. */
const DESK_ROLES = new Set(["receptionist", "staff"])
/** Roles that may take a staff station (coach / pads / desk). */
const STAFF_ROLES = new Set([
	"trainer",
	"receptionist",
	"staff",
	"manager",
	"specialist",
])

const RECEPTION_KEY = "staff_reception"

/** Most ambient (anonymous) members per quality level: High/Medium 6,
 * Low+/Low 4, Lowest 2. */
export function ambientCap(qualityLevel: number): number {
	if (qualityLevel <= 1) return 6
	if (qualityLevel <= 3) return 4
	return 2
}

/**
 * Present NPCs with a target piece go to a free station on it (staff roles
 * prefer staff stations, others avoid them); the receptionist (and any
 * staff) with no target works the reception desk; everyone else idles in
 * the lobby, one slot each. Absent NPCs are left out. Each station is used
 * at most once. The input order decides who wins a contested station.
 */
export function assignTargets(
	npcs: readonly NpcIn[],
	pieces: readonly PieceIn[],
): Assignment[] {
	const taken = new Set<string>()
	const out: Assignment[] = []
	let slot = 0
	const byUpgrade = new Map<string, PieceIn>()
	for (const p of pieces)
		if (p.upgradeKey && !byUpgrade.has(p.upgradeKey))
			byUpgrade.set(p.upgradeKey, p)

	const freeOn = (
		p: PieceIn,
		staffRole: boolean,
		staffOnly: boolean,
	): number => {
		const order = p.stations
			.map((s, i) => ({ s, i }))
			.filter(({ s, i }) => !s.swim && !taken.has(`${p.id}:${i}`))
			.filter(({ s }) => (staffOnly ? s.staff : staffRole || !s.staff))
			.sort(
				(a, b) =>
					Number(b.s.staff === staffRole) - Number(a.s.staff === staffRole),
			)
		return order.length ? order[0].i : -1
	}

	for (const n of npcs) {
		if (!n.isPresent) continue
		const role = n.role ?? ""
		const staffRole = STAFF_ROLES.has(role)
		let target: Target | null = null
		const piece = n.targetEquipmentKey
			? byUpgrade.get(n.targetEquipmentKey)
			: undefined
		if (piece) {
			const i = freeOn(piece, staffRole, false)
			if (i >= 0) target = { kind: "station", pieceId: piece.id, station: i }
		}
		if (!target && DESK_ROLES.has(role)) {
			const desk = byUpgrade.get(RECEPTION_KEY)
			if (desk) {
				const i = freeOn(desk, true, true)
				if (i >= 0) target = { kind: "station", pieceId: desk.id, station: i }
			}
		}
		if (target?.kind === "station")
			taken.add(`${target.pieceId}:${target.station}`)
		out.push({
			npcKey: n.npcKey,
			target: target ?? { kind: "lobby", slot: slot++ },
		})
	}
	return out
}
