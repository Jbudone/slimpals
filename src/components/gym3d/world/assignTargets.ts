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
	/** Hosting today's event at the event spot. */
	| { kind: "event" }

/** A station a named NPC calls home (cast.ts). `always` wins over the
 * sim's pick; otherwise it is used when the sim gives them nothing to do
 * or staff work. */
export type Home = { key: string; always?: boolean }

export type AssignOpts = {
	homes?: Readonly<Record<string, Home>>
	/** The NPC hosting today's event right now. */
	eventHost?: string | null
}

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
 * at most once. The input order decides who wins a contested station,
 * except that the event host goes to the event spot and NPCs with an
 * `always` home (heroes on the stage, the manager in the office) claim it
 * first. A home is used only while its piece exists and has a free station.
 */
export function assignTargets(
	npcs: readonly NpcIn[],
	pieces: readonly PieceIn[],
	opts: AssignOpts = {},
): Assignment[] {
	const taken = new Set<string>()
	const byNpc = new Map<string, Target>()
	let slot = 0
	const byUpgrade = new Map<string, PieceIn>()
	for (const p of pieces)
		if (p.upgradeKey && !byUpgrade.has(p.upgradeKey))
			byUpgrade.set(p.upgradeKey, p)
	const homes = opts.homes ?? {}

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
	const homeOf = (n: NpcIn): Target | null => {
		const h = homes[n.npcKey]
		const piece = h ? byUpgrade.get(h.key) : undefined
		if (!piece) return null
		// a home's own stations: any (the manager's desk is a staff seat,
		// the hero stage a member one)
		const i = piece.stations.findIndex(
			(s, k) => !s.swim && !taken.has(`${piece.id}:${k}`),
		)
		return i >= 0 ? { kind: "station", pieceId: piece.id, station: i } : null
	}
	const claim = (n: NpcIn, t: Target) => {
		if (t.kind === "station") taken.add(`${t.pieceId}:${t.station}`)
		byNpc.set(n.npcKey, t)
	}

	const present = npcs.filter((n) => n.isPresent)
	// 1. the event host, 2. `always` homes, 3. everyone else in sim order
	for (const n of present)
		if (opts.eventHost && n.npcKey === opts.eventHost)
			claim(n, { kind: "event" })
	for (const n of present) {
		if (byNpc.has(n.npcKey) || !homes[n.npcKey]?.always) continue
		const t = homeOf(n)
		if (t) claim(n, t)
	}
	for (const n of present) {
		if (byNpc.has(n.npcKey)) continue
		const role = n.role ?? ""
		const staffRole = STAFF_ROLES.has(role)
		let target: Target | null = null
		const key = n.targetEquipmentKey
		// a home wins when the sim has nothing for them, or only staff work
		if (homes[n.npcKey] && (!key || key.startsWith("staff_")))
			target = homeOf(n)
		const piece = !target && key ? byUpgrade.get(key) : undefined
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
		claim(n, target ?? { kind: "lobby", slot: slot++ })
	}
	const out: Assignment[] = []
	for (const n of present) {
		const t = byNpc.get(n.npcKey)
		if (t) out.push({ npcKey: n.npcKey, target: t })
	}
	return out
}
