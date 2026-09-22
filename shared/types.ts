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
