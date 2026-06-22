import { sql } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "./schema.js"
import { badges, gymNpcs, gymUpgradesCatalog } from "./schema.js"

type Db = MySql2Database<typeof schema>

type BadgeRow = {
	key: string
	name: string
	description: string
	tier: "bronze" | "silver" | "gold" | "platinum"
}

const BADGE_CATALOG: BadgeRow[] = [
	// ── Streak milestones ─────────────────────────────────────────────────
	{
		key: "streak_3",
		name: "3-Day Streak",
		description: "Check in 3 days in a row",
		tier: "bronze",
	},
	{
		key: "streak_7",
		name: "7-Day Streak",
		description: "Check in 7 days in a row",
		tier: "bronze",
	},
	{
		key: "streak_14",
		name: "2-Week Streak",
		description: "Check in 14 days in a row",
		tier: "silver",
	},
	{
		key: "streak_30",
		name: "30-Day Streak",
		description: "Check in 30 days in a row",
		tier: "silver",
	},
	{
		key: "streak_60",
		name: "60-Day Streak",
		description: "Check in 60 days in a row",
		tier: "gold",
	},
	{
		key: "streak_100",
		name: "100-Day Streak",
		description: "Check in 100 days in a row",
		tier: "gold",
	},
	{
		key: "streak_365",
		name: "Year Warrior",
		description: "Check in 365 days in a row",
		tier: "platinum",
	},

	// ── Weight loss milestones ─────────────────────────────────────────────
	{
		key: "loss_2kg",
		name: "First Steps",
		description: "Lose 2 kg from your starting weight",
		tier: "bronze",
	},
	{
		key: "loss_5kg",
		name: "5 kg Down",
		description: "Lose 5 kg from your starting weight",
		tier: "bronze",
	},
	{
		key: "loss_10kg",
		name: "10 kg Club",
		description: "Lose 10 kg from your starting weight",
		tier: "silver",
	},
	{
		key: "loss_15kg",
		name: "Halfway Hero",
		description: "Lose 15 kg from your starting weight",
		tier: "silver",
	},
	{
		key: "loss_20kg",
		name: "20 kg Legend",
		description: "Lose 20 kg from your starting weight",
		tier: "gold",
	},
	{
		key: "loss_25kg",
		name: "Quarter Century",
		description: "Lose 25 kg from your starting weight",
		tier: "gold",
	},
	{
		key: "loss_goal",
		name: "Goal Reached!",
		description: "Hit your target weight",
		tier: "platinum",
	},

	// ── Food logging consistency ───────────────────────────────────────────
	{
		key: "food_first",
		name: "First Bite",
		description: "Log your first meal photo",
		tier: "bronze",
	},
	{
		key: "food_7days",
		name: "Consistent Eater",
		description: "Log food 7 days in a row",
		tier: "bronze",
	},
	{
		key: "food_30days",
		name: "Food Diary Pro",
		description: "Log food 30 days in a row",
		tier: "silver",
	},
	{
		key: "food_100logs",
		name: "Century Logger",
		description: "Log 100 meals total",
		tier: "gold",
	},
	{
		key: "food_all_types",
		name: "Full Plate",
		description: "Log all 4 meal types in one day",
		tier: "bronze",
	},
	{
		key: "food_healthy_week",
		name: "Green Week",
		description: "Log 7 days with only highly-rated meals",
		tier: "silver",
	},

	// ── Social interactions ────────────────────────────────────────────────
	{
		key: "social_first_share",
		name: "Debut Post",
		description: "Share your first post to the feed",
		tier: "bronze",
	},
	{
		key: "social_first_react",
		name: "Emoji Buddy",
		description: "React to a friend's post for the first time",
		tier: "bronze",
	},
	{
		key: "social_first_reaction_received",
		name: "Fan Club",
		description: "Receive your first reaction",
		tier: "bronze",
	},
	{
		key: "social_10_reacts",
		name: "Hype Machine",
		description: "Receive 10 reactions on a single post",
		tier: "silver",
	},
	{
		key: "social_supportive",
		name: "Team Player",
		description: "React to 50 posts total",
		tier: "silver",
	},

	// ── Challenge completions ──────────────────────────────────────────────
	{
		key: "challenge_first",
		name: "Challenge Accepted",
		description: "Complete your first monthly challenge",
		tier: "silver",
	},
	{
		key: "challenge_3",
		name: "Streak Challenger",
		description: "Complete 3 monthly challenges",
		tier: "gold",
	},
	{
		key: "challenge_6",
		name: "Half-Year Hero",
		description: "Complete 6 monthly challenges",
		tier: "gold",
	},
	{
		key: "challenge_12",
		name: "Full Year Champion",
		description: "Complete 12 monthly challenges",
		tier: "platinum",
	},
	{
		key: "sprint_first",
		name: "Sprint Starter",
		description: "Complete your first weekly sprint",
		tier: "bronze",
	},
	{
		key: "sprint_10",
		name: "Sprint Veteran",
		description: "Complete 10 weekly sprints",
		tier: "silver",
	},

	// ── Tournament wins ────────────────────────────────────────────────────
	{
		key: "tournament_first_join",
		name: "Competitor",
		description: "Join your first tournament",
		tier: "bronze",
	},
	{
		key: "tournament_first_win",
		name: "Tournament Champion",
		description: "Win your first tournament",
		tier: "gold",
	},
	{
		key: "tournament_3_wins",
		name: "Triple Crown",
		description: "Win 3 tournaments",
		tier: "platinum",
	},
	{
		key: "tournament_weight_win",
		name: "Scale Slayer",
		description: "Win a weight loss tournament",
		tier: "gold",
	},
	{
		key: "tournament_streak_win",
		name: "Consistency King",
		description: "Win a streak tournament",
		tier: "gold",
	},

	// ── Gym milestones ────────────────────────────────────────────────────
	{
		key: "gym_level_5",
		name: "Growing Gym",
		description: "Reach gym level 5",
		tier: "bronze",
	},
	{
		key: "gym_level_10",
		name: "Popular Gym",
		description: "Reach gym level 10",
		tier: "silver",
	},
	{
		key: "gym_level_20",
		name: "Elite Gym",
		description: "Reach gym level 20",
		tier: "gold",
	},
	{
		key: "gym_first_upgrade",
		name: "First Upgrade",
		description: "Claim your first gym upgrade",
		tier: "bronze",
	},
	{
		key: "gym_10_upgrades",
		name: "Fully Equipped",
		description: "Unlock 10 gym upgrades",
		tier: "silver",
	},
	{
		key: "gym_all_categories",
		name: "Complete Gym",
		description: "Unlock at least one upgrade in every category",
		tier: "gold",
	},

	// ── App engagement ─────────────────────────────────────────────────────
	{
		key: "app_first_week",
		name: "Welcome Aboard",
		description: "Complete your first week on SlimPals",
		tier: "bronze",
	},
	{
		key: "app_first_month",
		name: "Month One",
		description: "Complete your first month on SlimPals",
		tier: "silver",
	},
	{
		key: "weight_first_log",
		name: "First Weigh-In",
		description: "Log your first weight entry",
		tier: "bronze",
	},
	{
		key: "weight_7_logs",
		name: "Scale Regular",
		description: "Log weight 7 times",
		tier: "bronze",
	},
	{
		key: "weight_30_logs",
		name: "Data Driven",
		description: "Log weight 30 times",
		tier: "silver",
	},
	{
		key: "inspiration_read",
		name: "Inspired",
		description: "Read your weekly inspiration message",
		tier: "bronze",
	},
	{
		key: "all_themes",
		name: "Style Explorer",
		description: "Try all 6 themes",
		tier: "bronze",
	},
	{
		key: "invite_friend",
		name: "Recruiter",
		description: "Successfully invite a friend to join",
		tier: "bronze",
	},
	{
		key: "invite_3_friends",
		name: "Squad Builder",
		description: "Invite 3 friends who join",
		tier: "silver",
	},
]

export async function seedBadges(db: Db) {
	if (BADGE_CATALOG.length === 0) return
	await db
		.insert(badges)
		.values(BADGE_CATALOG)
		.onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)` } })
}

type UpgradeRow = {
	key: string
	name: string
	description: string
	category: "cardio" | "weights" | "amenities" | "decor" | "staff"
	requiredXp: number
	sortOrder: number
	assetPrompt: string
	unlocksNpcKey: string | null
}

const GYM_UPGRADES: UpgradeRow[] = [
	// ── Cardio ────────────────────────────────────────────────────────────
	{
		key: "cardio_treadmill",
		name: "Basic Treadmill",
		description: "A simple treadmill to get started",
		category: "cardio",
		requiredXp: 0,
		sortOrder: 1,
		assetPrompt:
			"pixel art treadmill, stardew valley style, gym equipment, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "cardio_rowing",
		name: "Rowing Machine",
		description: "Full-body cardio workout station",
		category: "cardio",
		requiredXp: 200,
		sortOrder: 2,
		assetPrompt:
			"pixel art rowing machine, stardew valley style, gym equipment, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "cardio_bikes",
		name: "Stationary Bikes",
		description: "A row of spin bikes",
		category: "cardio",
		requiredXp: 500,
		sortOrder: 3,
		assetPrompt:
			"pixel art stationary bike row, stardew valley style, gym equipment, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "cardio_stairs",
		name: "Stair Climbers",
		description: "Intense stair climbing machines",
		category: "cardio",
		requiredXp: 900,
		sortOrder: 4,
		assetPrompt:
			"pixel art stair climber machine, stardew valley style, gym equipment, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "cardio_cinema",
		name: "Cardio Cinema",
		description: "Treadmills with personal screens showing movies",
		category: "cardio",
		requiredXp: 1500,
		sortOrder: 5,
		assetPrompt:
			"pixel art treadmill with screen showing movie, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},

	// ── Weights ───────────────────────────────────────────────────────────
	{
		key: "weights_dumbbells",
		name: "Dumbbell Rack",
		description: "A rack of dumbbells from 5 to 50 lbs",
		category: "weights",
		requiredXp: 0,
		sortOrder: 1,
		assetPrompt:
			"pixel art dumbbell rack, stardew valley style, gym equipment, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "weights_barbell",
		name: "Barbell Station",
		description: "Bench press and squat rack combo",
		category: "weights",
		requiredXp: 200,
		sortOrder: 2,
		assetPrompt:
			"pixel art barbell bench press station, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "weights_cable",
		name: "Cable Machine",
		description: "Versatile cable crossover system",
		category: "weights",
		requiredXp: 500,
		sortOrder: 3,
		assetPrompt:
			"pixel art cable crossover machine, stardew valley style, gym equipment, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "weights_smith",
		name: "Smith Machine",
		description: "Guided barbell for safe solo lifting",
		category: "weights",
		requiredXp: 900,
		sortOrder: 4,
		assetPrompt:
			"pixel art smith machine, stardew valley style, gym equipment, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "weights_olympic",
		name: "Olympic Platform",
		description: "Competition-grade lifting platform with bumper plates",
		category: "weights",
		requiredXp: 1500,
		sortOrder: 5,
		assetPrompt:
			"pixel art olympic lifting platform, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},

	// ── Amenities ─────────────────────────────────────────────────────────
	{
		key: "amenity_water",
		name: "Water Cooler",
		description: "Stay hydrated between sets",
		category: "amenities",
		requiredXp: 0,
		sortOrder: 1,
		assetPrompt:
			"pixel art water cooler dispenser, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "amenity_lockers",
		name: "Locker Room",
		description: "Secure storage for members",
		category: "amenities",
		requiredXp: 100,
		sortOrder: 2,
		assetPrompt:
			"pixel art gym locker room entrance, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "amenity_showers",
		name: "Showers",
		description: "Clean up after a tough workout",
		category: "amenities",
		requiredXp: 350,
		sortOrder: 3,
		assetPrompt: "pixel art shower room entrance, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "amenity_sauna",
		name: "Sauna",
		description: "Relax and recover in the steam room",
		category: "amenities",
		requiredXp: 700,
		sortOrder: 4,
		assetPrompt: "pixel art wooden sauna room, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "amenity_juice",
		name: "Juice Bar",
		description: "Fresh smoothies and protein shakes",
		category: "amenities",
		requiredXp: 1200,
		sortOrder: 5,
		assetPrompt:
			"pixel art juice bar counter with blender, stardew valley style, 64x64",
		unlocksNpcKey: "npc_barista",
	},

	// ── Decor ─────────────────────────────────────────────────────────────
	{
		key: "decor_posters",
		name: "Motivational Posters",
		description: '"No pain, no gain" and other classics',
		category: "decor",
		requiredXp: 0,
		sortOrder: 1,
		assetPrompt:
			"pixel art motivational poster on wall, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "decor_plants",
		name: "Plants",
		description: "Add some greenery to liven things up",
		category: "decor",
		requiredXp: 100,
		sortOrder: 2,
		assetPrompt: "pixel art potted plant in gym, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "decor_mirrors",
		name: "Wall Mirrors",
		description: "Full-length mirrors for form checking",
		category: "decor",
		requiredXp: 350,
		sortOrder: 3,
		assetPrompt:
			"pixel art large wall mirror in gym, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "decor_trophy",
		name: "Trophy Case",
		description: "Display your tournament victories",
		category: "decor",
		requiredXp: 700,
		sortOrder: 4,
		assetPrompt:
			"pixel art glass trophy display case, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "decor_neon",
		name: "Neon Sign",
		description: "A glowing neon sign with your gym name",
		category: "decor",
		requiredXp: 1200,
		sortOrder: 5,
		assetPrompt: "pixel art neon gym sign glowing, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},

	// ── Staff ─────────────────────────────────────────────────────────────
	{
		key: "staff_reception",
		name: "Reception Desk",
		description: "A welcoming front desk for your gym",
		category: "staff",
		requiredXp: 0,
		sortOrder: 1,
		assetPrompt: "pixel art gym reception desk, stardew valley style, 64x64",
		unlocksNpcKey: "npc_receptionist",
	},
	{
		key: "staff_trainer",
		name: "Personal Trainer Station",
		description: "Hire a personal trainer for your members",
		category: "staff",
		requiredXp: 200,
		sortOrder: 2,
		assetPrompt:
			"pixel art personal trainer corner with clipboard, stardew valley style, 64x64",
		unlocksNpcKey: "npc_trainer",
	},
	{
		key: "staff_massage",
		name: "Massage Chair",
		description: "Post-workout relaxation station",
		category: "staff",
		requiredXp: 500,
		sortOrder: 3,
		assetPrompt: "pixel art massage chair station, stardew valley style, 64x64",
		unlocksNpcKey: null,
	},
	{
		key: "staff_physio",
		name: "Physical Therapy Room",
		description: "Professional rehab and recovery room",
		category: "staff",
		requiredXp: 900,
		sortOrder: 4,
		assetPrompt: "pixel art physical therapy room, stardew valley style, 64x64",
		unlocksNpcKey: "npc_physio",
	},
	{
		key: "staff_nutrition",
		name: "Nutrition Corner",
		description: "Expert dietary advice and meal planning",
		category: "staff",
		requiredXp: 1500,
		sortOrder: 5,
		assetPrompt: "pixel art nutrition advice desk, stardew valley style, 64x64",
		unlocksNpcKey: "npc_nutritionist",
	},
]

export async function seedGymUpgrades(db: Db) {
	if (GYM_UPGRADES.length === 0) return
	await db
		.insert(gymUpgradesCatalog)
		.values(GYM_UPGRADES)
		.onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)` } })
}

type NpcRow = {
	key: string
	name: string
	role: "trainer" | "receptionist" | "regular" | "specialist"
	personalityProfile: object
	defaultSchedule: object
	spriteKey: string
	unlockedByUpgradeKey: string | null
}

const NPC_CATALOG: NpcRow[] = [
	{
		key: "trainer_marcus",
		name: "Marcus",
		role: "trainer",
		personalityProfile: {
			traits: ["disciplined", "competitive"],
			goals: ["build_strength", "help_others"],
			quirks: ["always_counts_reps_out_loud", "hates_people_hogging_equipment"],
			equipmentPreferences: ["weights_barbell", "weights_cable"],
			avoidEquipment: ["cardio_treadmill"],
			friendlyWith: ["regular_priya"],
			rivalWith: ["regular_tom"],
			moodBaseline: 60,
		},
		defaultSchedule: {
			arrivalHour: 6,
			departureHour: 20,
			daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
			activitySequence: [
				{
					type: "warmup",
					durationMin: 10,
					equipmentCategory: "cardio",
				},
				{
					type: "main",
					durationMin: 45,
					equipmentCategory: "weights",
				},
				{
					type: "cooldown",
					durationMin: 10,
					equipmentCategory: "amenities",
				},
			],
		},
		spriteKey: "npc_trainer_marcus",
		unlockedByUpgradeKey: null,
	},
	{
		key: "receptionist_lisa",
		name: "Lisa",
		role: "receptionist",
		personalityProfile: {
			traits: ["bubbly", "social"],
			goals: ["greet_everyone", "keep_gym_organized"],
			quirks: ["remembers_everyones_name", "gossips_nicely"],
			equipmentPreferences: ["staff_reception"],
			avoidEquipment: [],
			friendlyWith: ["trainer_marcus", "regular_priya"],
			rivalWith: [],
			moodBaseline: 75,
		},
		defaultSchedule: {
			arrivalHour: 7,
			departureHour: 15,
			daysOfWeek: [1, 2, 3, 4, 5],
			activitySequence: [
				{
					type: "main",
					durationMin: 480,
					equipmentCategory: "staff",
				},
			],
		},
		spriteKey: "npc_receptionist_lisa",
		unlockedByUpgradeKey: null,
	},
	{
		key: "regular_derek",
		name: "Derek",
		role: "regular",
		personalityProfile: {
			traits: ["quiet", "focused"],
			goals: ["build_strength"],
			quirks: ["never_talks_during_sets", "dislikes_cardio"],
			equipmentPreferences: [
				"weights_olympic",
				"weights_barbell",
				"weights_dumbbells",
			],
			avoidEquipment: ["cardio_treadmill", "cardio_bikes", "cardio_rowing"],
			friendlyWith: [],
			rivalWith: ["regular_tom"],
			moodBaseline: 50,
		},
		defaultSchedule: {
			arrivalHour: 6,
			departureHour: 8,
			daysOfWeek: [1, 2, 3, 4, 5, 6],
			activitySequence: [
				{
					type: "warmup",
					durationMin: 5,
					equipmentCategory: "weights",
				},
				{
					type: "main",
					durationMin: 100,
					equipmentCategory: "weights",
				},
				{
					type: "cooldown",
					durationMin: 10,
					equipmentCategory: "amenities",
				},
			],
		},
		spriteKey: "npc_regular_derek",
		unlockedByUpgradeKey: null,
	},
	{
		key: "regular_priya",
		name: "Priya",
		role: "regular",
		personalityProfile: {
			traits: ["calm", "welcoming"],
			goals: ["flexibility", "mindfulness"],
			quirks: ["always_on_time", "befriends_newcomers"],
			equipmentPreferences: ["amenity_sauna", "cardio_bikes"],
			avoidEquipment: ["weights_olympic"],
			friendlyWith: ["trainer_marcus", "receptionist_lisa"],
			rivalWith: [],
			moodBaseline: 70,
		},
		defaultSchedule: {
			arrivalHour: 12,
			departureHour: 14,
			daysOfWeek: [1, 2, 3, 4, 5],
			activitySequence: [
				{
					type: "warmup",
					durationMin: 15,
					equipmentCategory: "cardio",
				},
				{
					type: "main",
					durationMin: 60,
					equipmentCategory: "amenities",
				},
				{
					type: "cooldown",
					durationMin: 15,
					equipmentCategory: "amenities",
				},
			],
		},
		spriteKey: "npc_regular_priya",
		unlockedByUpgradeKey: null,
	},
	{
		key: "regular_tom",
		name: "Tom",
		role: "regular",
		personalityProfile: {
			traits: ["loud", "enthusiastic"],
			goals: ["build_muscle", "show_off"],
			quirks: ["tells_everyone_about_gains", "grunts_loudly"],
			equipmentPreferences: [
				"weights_dumbbells",
				"weights_smith",
				"decor_mirrors",
			],
			avoidEquipment: ["cardio_stairs"],
			friendlyWith: [],
			rivalWith: ["regular_derek", "trainer_marcus"],
			moodBaseline: 65,
		},
		defaultSchedule: {
			arrivalHour: 17,
			departureHour: 19,
			daysOfWeek: [1, 2, 3, 4, 5],
			activitySequence: [
				{
					type: "warmup",
					durationMin: 5,
					equipmentCategory: "cardio",
				},
				{
					type: "main",
					durationMin: 90,
					equipmentCategory: "weights",
				},
				{
					type: "cooldown",
					durationMin: 10,
					equipmentCategory: "amenities",
				},
			],
		},
		spriteKey: "npc_regular_tom",
		unlockedByUpgradeKey: null,
	},
	{
		key: "regular_elena",
		name: "Elena",
		role: "regular",
		personalityProfile: {
			traits: ["reserved", "disciplined"],
			goals: ["cardio_fitness", "personal_bests"],
			quirks: ["ocd_about_treadmill", "warms_up_slowly_to_people"],
			equipmentPreferences: [
				"cardio_treadmill",
				"cardio_stairs",
				"cardio_rowing",
			],
			avoidEquipment: ["weights_olympic"],
			friendlyWith: ["regular_priya"],
			rivalWith: [],
			moodBaseline: 55,
		},
		defaultSchedule: {
			arrivalHour: 7,
			departureHour: 9,
			daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
			activitySequence: [
				{
					type: "warmup",
					durationMin: 10,
					equipmentCategory: "cardio",
				},
				{
					type: "main",
					durationMin: 60,
					equipmentCategory: "cardio",
				},
				{
					type: "cooldown",
					durationMin: 15,
					equipmentCategory: "amenities",
				},
			],
		},
		spriteKey: "npc_regular_elena",
		unlockedByUpgradeKey: null,
	},
	{
		key: "specialist_coach",
		name: "Coach Rivera",
		role: "specialist",
		personalityProfile: {
			traits: ["authoritative", "inspiring"],
			goals: ["run_group_classes", "build_team_spirit"],
			quirks: ["blows_whistle", "calls_everyone_champ"],
			equipmentPreferences: ["cardio_treadmill", "cardio_bikes"],
			avoidEquipment: [],
			friendlyWith: ["trainer_marcus"],
			rivalWith: [],
			moodBaseline: 70,
		},
		defaultSchedule: {
			arrivalHour: 9,
			departureHour: 12,
			daysOfWeek: [2, 4, 6],
			activitySequence: [
				{
					type: "main",
					durationMin: 120,
					equipmentCategory: "cardio",
				},
				{
					type: "cooldown",
					durationMin: 30,
					equipmentCategory: "amenities",
				},
			],
		},
		spriteKey: "npc_specialist_coach",
		unlockedByUpgradeKey: "staff_trainer",
	},
	{
		key: "specialist_nutritionist",
		name: "Dr. Kim",
		role: "specialist",
		personalityProfile: {
			traits: ["analytical", "caring"],
			goals: ["help_with_nutrition", "educate"],
			quirks: ["references_food_logs", "always_has_healthy_snack"],
			equipmentPreferences: ["staff_nutrition", "amenity_juice"],
			avoidEquipment: [],
			friendlyWith: ["receptionist_lisa", "regular_priya"],
			rivalWith: [],
			moodBaseline: 65,
		},
		defaultSchedule: {
			arrivalHour: 13,
			departureHour: 16,
			daysOfWeek: [1, 3, 5],
			activitySequence: [
				{
					type: "main",
					durationMin: 150,
					equipmentCategory: "staff",
				},
				{
					type: "cooldown",
					durationMin: 20,
					equipmentCategory: "amenities",
				},
			],
		},
		spriteKey: "npc_specialist_nutritionist",
		unlockedByUpgradeKey: "staff_nutrition",
	},
]

export async function seedNpcs(db: Db) {
	if (NPC_CATALOG.length === 0) return
	await db
		.insert(gymNpcs)
		.values(NPC_CATALOG)
		.onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)` } })
}
