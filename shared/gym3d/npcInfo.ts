// What the 3D gym shows about a person (tap chip) and where group classes
// stand. Pure functions shared by the client and tests; the relationship
// stage thresholds are the same ones the server's dialog system uses.

export type RelationshipStage = 0 | 1 | 2 | 3

const STAGE_LABELS: Record<RelationshipStage, string> = {
	0: "Stranger",
	1: "Acquaintance",
	2: "Gym Buddy",
	3: "Friend",
}

export function getRelationshipStage(level: number): RelationshipStage {
	if (level >= 75) return 3
	if (level >= 50) return 2
	if (level >= 25) return 1
	return 0
}

export function getStageLabel(stage: RelationshipStage): string {
	return STAGE_LABELS[stage]
}

/** Mood (-100..100) as a word and an emoji, in the sim's own bands
 * (energized > 70, tired < 20). */
export function moodInfo(mood: number): { word: string; emoji: string } {
	if (mood > 70) return { word: "Energized", emoji: "😄" }
	if (mood >= 40) return { word: "Happy", emoji: "🙂" }
	if (mood >= 20) return { word: "Okay", emoji: "😐" }
	if (mood >= 0) return { word: "Tired", emoji: "🥱" }
	return { word: "Grumpy", emoji: "😤" }
}

/** Walk speed factor from mood (the sim's getMoveSpeedMultiplier). */
export function moodSpeed(mood: number): number {
	if (mood > 70) return 1.2
	if (mood < 20) return 0.85
	if (mood < 40) return 0.9
	return 1
}

/** The room type a class of a catalog category happens in. */
export function classRoomType(category: string): string | null {
	switch (category) {
		case "boxing":
		case "punching_bags":
		case "hero":
			return "boxing"
		case "swimming":
			return "pool"
		case "cardio":
		case "lagree":
			return "cardio"
		case "weights":
			return "weights"
		case "court":
			return "court"
		case "amenities":
			return "recovery"
		default:
			return null
	}
}

/** The pose class members do, by room type. */
export function classPose(
	roomType: string,
): "punch" | "stretch" | "run" | "lunge" {
	if (roomType === "boxing") return "punch"
	if (roomType === "cardio") return "run"
	if (roomType === "weights") return "lunge"
	return "stretch"
}

export type Formation = {
	instructor: { x: number; z: number; face: number }
	members: { x: number; z: number; face: number }[]
}

/**
 * Where a group class stands: an instructor facing up to `n` members laid
 * out in rows (0.9 apart) in front of them, all on walkable floor inside
 * the room. Candidate centres are tried nearest-to-the-room-centre first;
 * the first place that fits the most members wins (at least 2, else null).
 * `walk(x, z)` says whether a floor point is free.
 */
export function classFormation(
	walk: (x: number, z: number) => boolean,
	room: { x0: number; z0: number; x1: number; z1: number },
	n = 4,
): Formation | null {
	const cx = (room.x0 + room.x1) / 2
	const cz = (room.z0 + room.z1) / 2
	const cands: { x: number; z: number; d: number }[] = []
	for (let x = room.x0 + 1.25; x <= room.x1 - 1.25; x += 0.5)
		for (let z = room.z0 + 1.25; z <= room.z1 - 1.25; z += 0.5)
			cands.push({ x, z, d: Math.hypot(x - cx, z - cz) })
	cands.sort((a, b) => a.d - b.d)
	const S = 0.9
	// members in two rows behind the instructor's line (toward +z, the
	// camera side, so their backs are not all we see)
	const offs: [number, number][] = [
		[-S / 2, S],
		[S / 2, S],
		[-S, S * 2],
		[0, S * 2],
		[S, S * 2],
		[-S * 1.5, S],
		[S * 1.5, S],
	]
	let best: Formation | null = null
	for (const c of cands) {
		if (!walk(c.x, c.z)) continue
		const members: Formation["members"] = []
		for (const [dx, dz] of offs) {
			if (members.length >= n) break
			const x = c.x + dx
			const z = c.z + dz
			if (x < room.x0 + 0.4 || x > room.x1 - 0.4) continue
			if (z < room.z0 + 0.4 || z > room.z1 - 0.4) continue
			if (walk(x, z)) members.push({ x, z, face: Math.PI })
		}
		if (members.length >= 2 && (!best || members.length > best.members.length))
			best = { instructor: { x: c.x, z: c.z, face: 0 }, members }
		if (best && best.members.length >= n) break
	}
	return best
}
