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
	"court", // gh-130
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
	/** RoomType from shared/gym3d/rooms.ts, or "empty" (bought, type not
	 * chosen yet). */
	type: string
	/** Lot shape: normal | wide | L | big. */
	shape: string
	level: number
	/** Sum of the tiers of the pieces on its spots (room level points). */
	points: number
	/** Plots still under construction. */
	building: boolean
	layoutVersion: number
	cells: { px: number; pz: number }[]
	/** Stored paint, or the room type's default. */
	paint: GymLayoutPaint
	/** The room's vibe (shared/gym3d/vibes.ts), or null. */
	vibe: string | null
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
	/** placed | stored (unlocked, not on a spot) | upgrading */
	status: string
	/** Room type this gear goes in (null: fixtures, decor, lobby staff). */
	roomType: string | null
	/** Footprint in tiles (spot size it needs). */
	size: number
}

export type GymLotDto = {
	id: string
	shape: string
	cells: { px: number; pz: number }[]
	price: number
	hours: number
}

export type GymJobDto = {
	id: number
	kind: "plot" | "upgrade"
	roomId: number | null
	pieceId: number | null
	targetTier: number | null
	status: "active" | "done"
	cost: number
	startedAt: string
	endsAt: string
	finishedAt: string | null
}

/** One coin bubble: a placed machine, the reception desk or the kitchen. */
export type GymIncomeSourceDto = {
	/** `piece:<id>`, `desk` or `kitchen`. */
	key: string
	kind: "machine" | "desk" | "kitchen"
	pieceId: number | null
	/** Whole coins waiting now (serverNow). */
	bank: number
	cap: number
	/** Coins per hour right now (rush hour included). */
	rate: number
}

export type GymKitchenDto = {
	/** Menu item keys that are on (KITCHEN_MENU order). */
	menu: string[]
	/** Coins per hour without rush hour. */
	rate: number
	rushEndsAt: string | null
	bank: number
	cap: number
}

/** Shown on open after a long absence. */
export type GymWelcomeBackDto = {
	hours: number
	coins: number
	builds: number
	members: number
	sales: number
}

/** Sweat and Greens a payout gives. */
export type Reward = { sweat: number; greens: number }

/** One staff member's card (see shared/gym3d/staff.ts). */
export type GymStaffDto = {
	npcKey: string
	level: number
	maxLevel: number
	stats: { friendliness: number; expertise: number; speed: number }
	/** What they look after: a room type, "desk", "kitchen" or "all". */
	area: string
	perk: string
	/** Coin bonus their level gives, 0.06 = +6%. */
	bonus: number
	/** Coins to train to the next level (null at the top level). */
	trainCost: number | null
	/** Brought to the gym by an upgrade that is claimed (or always there). */
	available: boolean
}

/** A staff member hired for a room (see shared/gym3d/hires.ts). */
export type GymHireDto = {
	id: number
	roomId: number
	role: string
	name: string
	level: number
	/** 0 or 1: which post in the room they stand at. */
	post: number
}

/** The gym's star rating (see shared/gym3d/rating.ts). */
export type GymRatingDto = {
	score: number
	stars: number
	next: number | null
	k: number
	parts: {
		levels: number
		variety: number
		decor: number
		staff: number
		bigRooms: number
		openWalls: number
		vibes: number
	}
}

/** One rolling goal (see shared/gym3d/goals.ts). */
export type GymGoalDto = {
	id: string
	title: string
	value: number
	target: number
	reward: Reward
	done: boolean
}

/** The monthly reward track (see shared/gym3d/rewardTrack.ts). */
export type GymRewardTrackDto = {
	month: string
	theme: string
	claimed: number
	claimedToday: boolean
	checkedIn: boolean
	canClaim: boolean
	/** Why a step cannot be claimed now (null when it can). */
	blockedReason: string | null
	steps: {
		n: number
		milestone: boolean
		claimed: boolean
		reward: { coins: number; sweat: number; greens: number; cosmetic?: string }
		/** Name of the cosmetic the step gives, if any. */
		cosmeticName?: string
	}[]
}

/** A cosmetic a gym owns (shared/gym3d/cosmetics.ts). */
export type GymCosmeticDto = {
	key: string
	name: string
	kind: "decor" | "outfit"
	from: string
	/** ISO time it was granted. */
	at: string
}

/** The Burger Baron's state (see shared/gym3d/burger.ts). */
export type GymBurgerDto = {
	state: "closed" | "forSale" | "bought"
	cost: number
	/** Stars the gym needs for it to go on sale. */
	stars: number
}

export type GymLayoutDto = {
	gymId: number
	/** Staff hired for rooms, and what the next hire costs. */
	hires: GymHireDto[]
	nextHireCost: number
	/** Walls opened between rooms, and what the next one costs. */
	openWalls: { px: number; pz: number; axis: "x" | "z" }[]
	nextWallCost: number
	/** Star rating (1..5) from the layout. */
	rating: GymRatingDto
	/** Every goal in queue order; the HUD shows the first open ones. */
	goals: GymGoalDto[]
	/** The Burger Baron across the street goes on sale at 4 stars. */
	burger: GymBurgerDto
	/** Rewards paid by this read for goals reached since the last one. */
	goalsPaid?: { id: string; title: string; reward: Reward }[]
	/** Sweat (exercise tasks) and Greens (diet tasks), gym home. */
	sweat: number
	greens: number
	/** Idle income: every coin bubble with coins in it (or a cap to fill). */
	income: GymIncomeSourceDto[]
	kitchen: GymKitchenDto
	/** Only on the first read after a long absence (GET ?open=1). */
	welcomeBack?: GymWelcomeBackDto | null
	/** Coins just collected (income/collect answers). */
	collected?: number
	plots: GymLayoutPlotDto[]
	rooms: GymLayoutRoomDto[]
	pieces: GymLayoutPieceDto[]
	/** Unlocked upgrades the 3D gym has no place for yet (never dropped). */
	unplaced: { key: string; name: string }[]
	/** Coin balance (gym3d slice 2). */
	coins: number
	/** Server clock when this was read (ISO), to time jobs on the client. */
	serverNow: string
	/** For Sale lots next to the building. */
	lots: GymLotDto[]
	/** Active jobs, plus ones finished in the last day (for the ribbon). */
	jobs: GymJobDto[]
	/** Room gear not unlocked yet (shown greyed out in the spot picker). */
	lockedGear: {
		key: string
		name: string
		requiredXp: number
		roomType: string
		size: number
	}[]
}
