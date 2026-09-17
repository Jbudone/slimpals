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

export type GymUpgradeCategory =
	| "cardio"
	| "weights"
	| "amenities"
	| "decor"
	| "staff"

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
