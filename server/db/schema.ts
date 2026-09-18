import {
	boolean,
	datetime,
	int,
	json,
	mysqlEnum,
	mysqlTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/mysql-core"

// ── Core user table (referenced by everything) ─────────────────────────────

export const users = mysqlTable("users", {
	id: varchar("id", { length: 36 }).primaryKey(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	emailVerified: boolean("email_verified").notNull().default(false),
	avatarUrl: varchar("avatar_url", { length: 500 }),
	inviteCodeUsed: varchar("invite_code_used", { length: 64 }),
	inviteCode: varchar("invite_code", { length: 64 }).unique(),
	coachPersonality: mysqlEnum("coach_personality", [
		"drill_sergeant",
		"friendly",
		"roaster",
		"anime_sensei",
		"bro",
	])
		.notNull()
		.default("friendly"),
	viewMode: mysqlEnum("view_mode", ["simple", "technical"])
		.notNull()
		.default("simple"),
	theme: varchar("theme", { length: 32 }).notNull().default("midnight"),
	isAdmin: boolean("is_admin").notNull().default(false),
	heightCm: int("height_cm"),
	goalWeightKg: int("goal_weight_kg"),
	goalDate: timestamp("goal_date"),
	dailyCalorieGoal: int("daily_calorie_goal"),
	autoShareFoodLogs: boolean("auto_share_food_logs").notNull().default(false),
	autoShareBadges: boolean("auto_share_badges").notNull().default(true),
	autoShareWeightMilestones: boolean("auto_share_weight_milestones")
		.notNull()
		.default(false),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
})

// ── Better Auth tables ─────────────────────────────────────────────────────

export const sessions = mysqlTable("session", {
	id: varchar("id", { length: 255 }).primaryKey(),
	expiresAt: datetime("expires_at").notNull(),
	token: varchar("token", { length: 255 }).notNull().unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
	ipAddress: varchar("ip_address", { length: 255 }),
	userAgent: varchar("user_agent", { length: 500 }),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
})

export const accounts = mysqlTable("account", {
	id: varchar("id", { length: 255 }).primaryKey(),
	accountId: varchar("account_id", { length: 255 }).notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: datetime("access_token_expires_at"),
	refreshTokenExpiresAt: datetime("refresh_token_expires_at"),
	scope: varchar("scope", { length: 255 }),
	password: text("password"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
})

export const verifications = mysqlTable("verification", {
	id: varchar("id", { length: 255 }).primaryKey(),
	identifier: varchar("identifier", { length: 255 }).notNull(),
	value: varchar("value", { length: 1024 }).notNull(),
	expiresAt: datetime("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
})

// ── App tables ─────────────────────────────────────────────────────────────

export const invites = mysqlTable("invites", {
	id: int("id").autoincrement().primaryKey(),
	code: varchar("code", { length: 64 }).notNull().unique(),
	createdByUserId: varchar("created_by_user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	usedByUserId: varchar("used_by_user_id", { length: 36 }).references(
		() => users.id,
	),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	expiresAt: timestamp("expires_at").notNull(),
	revokedAt: timestamp("revoked_at"),
})

export const weightEntries = mysqlTable("weight_entries", {
	id: int("id").autoincrement().primaryKey(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	weightKg: int("weight_kg").notNull(),
	source: mysqlEnum("source", ["manual", "apple_health", "fitbit", "garmin"])
		.notNull()
		.default("manual"),
	note: text("note"),
	recordedAt: timestamp("recorded_at").notNull().defaultNow(),
})

export const foodLogs = mysqlTable("food_logs", {
	id: int("id").autoincrement().primaryKey(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	photoUrl: varchar("photo_url", { length: 500 }).notNull(),
	aiAnalysis: json("ai_analysis"),
	aiEditedPhotoUrl: varchar("ai_edited_photo_url", { length: 500 }),
	mealType: mysqlEnum("meal_type", ["breakfast", "lunch", "dinner", "snack"])
		.notNull()
		.default("snack"),
	loggedAt: timestamp("logged_at").notNull().defaultNow(),
	isShared: boolean("is_shared").notNull().default(false),
})

export const challenges = mysqlTable("challenges", {
	id: int("id").autoincrement().primaryKey(),
	title: varchar("title", { length: 255 }).notNull(),
	description: text("description"),
	month: int("month").notNull(),
	year: int("year").notNull(),
	theme: varchar("theme", { length: 255 }),
	aiGenerated: boolean("ai_generated").notNull().default(false),
	tasks: json("tasks").notNull(),
})

export const userChallenges = mysqlTable("user_challenges", {
	id: int("id").autoincrement().primaryKey(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	challengeId: int("challenge_id")
		.notNull()
		.references(() => challenges.id),
	completedTasks: json("completed_tasks").notNull().default([]),
	// Additive alongside completedTasks (which stays a plain cumulative
	// per-goal counter, untouched, so admin tooling that reads/writes it
	// numerically keeps working unchanged) — Record<goalId, ISO date[]> of
	// the calendar days progress was logged, purely for the day-grid
	// visualization. Server-stamped on write, never client-supplied.
	dailyLog: json("daily_log"),
	completedAt: timestamp("completed_at"),
})

export const dailyCheckins = mysqlTable("daily_checkins", {
	id: int("id").autoincrement().primaryKey(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	date: timestamp("date").notNull(),
	goalsCompleted: json("goals_completed"),
	mood: varchar("mood", { length: 64 }),
	notes: text("notes"),
	streakCount: int("streak_count").notNull().default(0),
})

export const badges = mysqlTable("badges", {
	id: int("id").autoincrement().primaryKey(),
	key: varchar("key", { length: 128 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	description: text("description"),
	iconUrl: varchar("icon_url", { length: 500 }),
	tier: mysqlEnum("tier", ["bronze", "silver", "gold", "platinum"])
		.notNull()
		.default("bronze"),
})

export const userBadges = mysqlTable("user_badges", {
	id: int("id").autoincrement().primaryKey(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	badgeId: int("badge_id")
		.notNull()
		.references(() => badges.id),
	earnedAt: timestamp("earned_at").notNull().defaultNow(),
})

export const userGyms = mysqlTable("user_gyms", {
	id: int("id").autoincrement().primaryKey(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id)
		.unique(),
	name: varchar("name", { length: 128 }).notNull(),
	level: int("level").notNull().default(0),
	xp: int("xp").notNull().default(0),
	pendingUpgradeKeys: json("pending_upgrade_keys").notNull().default([]),
	todayEventData: json("today_event_data"),
	gymVisitStreak: int("gym_visit_streak").notNull().default(0),
	lastGymVisitDate: timestamp("last_gym_visit_date"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	simulatedHourOverride: int("simulated_hour_override"),
})

export const gymUpgradesCatalog = mysqlTable("gym_upgrades_catalog", {
	id: int("id").autoincrement().primaryKey(),
	key: varchar("key", { length: 128 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	description: text("description"),
	category: mysqlEnum("category", [
		"cardio",
		"weights",
		"amenities",
		"decor",
		"staff",
	]).notNull(),
	requiredXp: int("required_xp").notNull().default(0),
	sortOrder: int("sort_order").notNull().default(0),
	assetPrompt: text("asset_prompt"),
	unlocksNpcKey: varchar("unlocks_npc_key", { length: 128 }),
})

export const userGymUpgrades = mysqlTable("user_gym_upgrades", {
	id: int("id").autoincrement().primaryKey(),
	gymId: int("gym_id")
		.notNull()
		.references(() => userGyms.id),
	upgradeKey: varchar("upgrade_key", { length: 128 }).notNull(),
	unlockedAt: timestamp("unlocked_at").notNull().defaultNow(),
	placementData: json("placement_data"),
})

export const gymNpcs = mysqlTable("gym_npcs", {
	id: int("id").autoincrement().primaryKey(),
	key: varchar("key", { length: 128 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	role: mysqlEnum("role", [
		"trainer",
		"receptionist",
		"regular",
		"specialist",
	]).notNull(),
	personalityProfile: json("personality_profile").notNull(),
	defaultSchedule: json("default_schedule").notNull(),
	portraitUrl: varchar("portrait_url", { length: 500 }),
	spriteKey: varchar("sprite_key", { length: 128 }).notNull(),
	unlockedByUpgradeKey: varchar("unlocked_by_upgrade_key", { length: 128 }),
	portraitGeneratedAt: timestamp("portrait_generated_at"),
})

export const userGymNpcRelationships = mysqlTable(
	"user_gym_npc_relationships",
	{
		id: int("id").autoincrement().primaryKey(),
		gymId: int("gym_id")
			.notNull()
			.references(() => userGyms.id),
		npcKey: varchar("npc_key", { length: 128 }).notNull(),
		relationshipLevel: int("relationship_level").notNull().default(0),
		personalityNotes: json("personality_notes").notNull().default([]),
		gymMemoryEvents: json("gym_memory_events").notNull().default([]),
		interactionCount: int("interaction_count").notNull().default(0),
		lastInteractedAt: timestamp("last_interacted_at"),
		moodHistory: json("mood_history").notNull().default([]),
		gymDaysActive: int("gym_days_active").notNull().default(0),
		milestoneDialogsFired: json("milestone_dialogs_fired")
			.notNull()
			.default([]),
	},
)

export const gymNpcDailyState = mysqlTable("gym_npc_daily_state", {
	id: int("id").autoincrement().primaryKey(),
	gymId: int("gym_id")
		.notNull()
		.references(() => userGyms.id),
	npcKey: varchar("npc_key", { length: 128 }).notNull(),
	date: timestamp("date").notNull(),
	mood: int("mood").notNull().default(0),
	goalSequence: json("goal_sequence").notNull().default([]),
	equipmentHistory: json("equipment_history").notNull().default([]),
	moodEvents: json("mood_events").notNull().default([]),
})

export const gymNpcDialogBatches = mysqlTable("gym_npc_dialog_batches", {
	id: int("id").autoincrement().primaryKey(),
	gymId: int("gym_id")
		.notNull()
		.references(() => userGyms.id),
	npcKey: varchar("npc_key", { length: 128 }).notNull(),
	relationshipStage: int("relationship_stage").notNull().default(0),
	dialogs: json("dialogs").notNull(),
	generatedAt: timestamp("generated_at").notNull().defaultNow(),
	expiresAt: timestamp("expires_at").notNull(),
})

export const tournaments = mysqlTable("tournaments", {
	id: int("id").autoincrement().primaryKey(),
	name: varchar("name", { length: 255 }).notNull(),
	creatorId: varchar("creator_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	startDate: timestamp("start_date").notNull(),
	endDate: timestamp("end_date").notNull(),
	type: mysqlEnum("type", [
		"weight_loss",
		"step_count",
		"streak",
		"food_challenge",
	]).notNull(),
	goalValue: int("goal_value"),
	rewardDescription: text("reward_description"),
	winnerId: varchar("winner_id", { length: 36 }).references(() => users.id),
	victoryMessage: text("victory_message"),
	resolvedAt: timestamp("resolved_at"),
})

export const tournamentParticipants = mysqlTable("tournament_participants", {
	id: int("id").autoincrement().primaryKey(),
	tournamentId: int("tournament_id")
		.notNull()
		.references(() => tournaments.id),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	joinedAt: timestamp("joined_at").notNull().defaultNow(),
	completed: boolean("completed").notNull().default(false),
})

export const socialPosts = mysqlTable("social_posts", {
	id: int("id").autoincrement().primaryKey(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	type: mysqlEnum("type", [
		"food_photo",
		"ai_message",
		"milestone",
		"weight_update",
		"challenge_completion",
	]).notNull(),
	content: json("content").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const reactions = mysqlTable("reactions", {
	id: int("id").autoincrement().primaryKey(),
	postId: int("post_id")
		.notNull()
		.references(() => socialPosts.id),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	emoji: mysqlEnum("emoji", ["❤️", "😂", "💪", "🔥", "😭"]).notNull(),
})

export const weeklyInspirations = mysqlTable("weekly_inspirations", {
	id: int("id").autoincrement().primaryKey(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	weekStart: timestamp("week_start").notNull(),
	message: text("message").notNull(),
	generatedAt: timestamp("generated_at").notNull().defaultNow(),
})

export const sprints = mysqlTable("sprints", {
	id: int("id").autoincrement().primaryKey(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	weekStart: timestamp("week_start").notNull(),
	title: varchar("title", { length: 255 }).notNull(),
	tasks: json("tasks").notNull(),
	completedTasks: json("completed_tasks").notNull().default([]),
	completedAt: timestamp("completed_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const stepRecords = mysqlTable("step_records", {
	id: int("id").autoincrement().primaryKey(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	steps: int("steps").notNull(),
	source: mysqlEnum("source", ["apple_health", "fitbit", "garmin"])
		.notNull()
		.default("apple_health"),
	recordedAt: timestamp("recorded_at").notNull(),
})
