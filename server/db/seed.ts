import { sql } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "./schema.js"
import { badges } from "./schema.js"

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

	// ── Pet milestones ─────────────────────────────────────────────────────
	{
		key: "pet_level_10",
		name: "Companion Bond",
		description: "Reach pet level 10",
		tier: "bronze",
	},
	{
		key: "pet_evolve_1",
		name: "First Evolution",
		description: "Evolve your pet for the first time",
		tier: "silver",
	},
	{
		key: "pet_level_25",
		name: "Trusted Partner",
		description: "Reach pet level 25",
		tier: "silver",
	},
	{
		key: "pet_evolve_2",
		name: "Second Evolution",
		description: "Evolve your pet to stage 3",
		tier: "gold",
	},
	{
		key: "pet_level_50",
		name: "Legendary Companion",
		description: "Reach pet level 50",
		tier: "platinum",
	},
	{
		key: "pet_items_5",
		name: "Fashionista",
		description: "Collect 5 pet items",
		tier: "bronze",
	},
	{
		key: "pet_items_20",
		name: "Wardrobe Master",
		description: "Collect 20 pet items",
		tier: "silver",
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
	// ON DUPLICATE KEY UPDATE makes this idempotent
	await db
		.insert(badges)
		.values(BADGE_CATALOG)
		.onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)` } })
}
