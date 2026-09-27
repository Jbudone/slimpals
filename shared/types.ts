// Shared TypeScript types used by both frontend and backend.
// Populated in subsequent slices.

export type CoachPersonality =
	| "drill_sergeant"
	| "friendly"
	| "roaster"
	| "anime_sensei"
	| "bro"

export type ViewMode = "simple" | "technical"

export type Theme =
	| "midnight"
	| "forest"
	| "sunset"
	| "ocean"
	| "light"
	| "neon"
	| "cream"

export type WeightSource = "manual" | "apple_health" | "fitbit" | "garmin"

export type MealType = "breakfast" | "lunch" | "dinner" | "snack"

export type MissionCadence = "daily" | "weekly"

export type MissionDifficulty = "easy" | "medium" | "hard"

/** XP awarded per completion, by cadence and difficulty. Calibrated against
 * the existing XP economy (checkin=15, food_log=5, sprint_complete=50,
 * challenge_complete=200) — see docs/prd-missions.md. */
export const MISSION_XP: Record<
	MissionCadence,
	Record<MissionDifficulty, number>
> = {
	daily: { easy: 5, medium: 10, hard: 20 },
	weekly: { easy: 20, medium: 40, hard: 80 },
}

/** The open-ended content-type allowlist for `gymUpgradesCatalog.category`
 * (gh-64) — a validated varchar, not a DB enum, so new categories (gh-112+)
 * are added here, not via a schema migration. */
export const GYM_UPGRADE_CATEGORIES = [
	"cardio",
	"weights",
	"amenities",
	"decor",
	"staff",
	"boxing", // gh-112
	"lagree", // gh-113
	"swimming", // gh-114
	"punching_bags", // gh-115
	"hero", // gh-68
] as const

export type GymUpgradeCategory = (typeof GYM_UPGRADE_CATEGORIES)[number]

/** Same open-ended pattern (gh-64) for `gymNpcs.role`. */
export const GYM_NPC_ROLES = [
	"trainer",
	"receptionist",
	"regular",
	"specialist",
	"manager", // gh-116
	"hero", // gh-68
] as const

export type GymNpcRole = (typeof GYM_NPC_ROLES)[number]

export type TournamentType =
	| "weight_loss"
	| "step_count"
	| "streak"
	| "food_challenge"

export type PostType =
	| "food_photo"
	| "ai_message"
	| "milestone"
	| "weight_update"
	| "challenge_completion"

export type ReactionEmoji = "❤️" | "😂" | "💪" | "🔥" | "😭"

// ── 3D gym layout (gym3d slice 1): GET /api/gym/layout ──────────────────────

export type GymLayoutPaint = {
	wall: string
	floorStyle: string
	floorColor: string
}

export type GymLayoutPlotDto = {
	px: number
	pz: number
	state: string
	lotShape: string
	roomId: number | null
}

export type GymLayoutRoomDto = {
	id: number
	/** RoomType from shared/gym3d/rooms.ts. */
	type: string
	shape: string
	level: number
	layoutVersion: number
	cells: { px: number; pz: number }[]
	/** Stored paint, or the room type's default. */
	paint: GymLayoutPaint
}

export type GymLayoutPieceDto = {
	id: number
	roomId: number | null
	kind: "equipment" | "decor"
	/** Builder key: the upgrade key for equipment, a decor key for decor. */
	itemKey: string
	upgradeKey: string | null
	/** Catalog name of the upgrade (or the decor item's own name). */
	name: string
	spotIndex: number | null
	/** World position (x, z), on a half-unit grid. */
	x: number
	z: number
	/** Quarter turns. */
	rot: number
	tier: number
	locked: boolean
	status: string
}

export type GymLayoutDto = {
	gymId: number
	plots: GymLayoutPlotDto[]
	rooms: GymLayoutRoomDto[]
	pieces: GymLayoutPieceDto[]
	/** Unlocked upgrades the 3D gym has no place for yet (never dropped). */
	unplaced: { key: string; name: string }[]
}
