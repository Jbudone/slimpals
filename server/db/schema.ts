import {
	boolean,
	datetime,
	index,
	int,
	json,
	mysqlEnum,
	mysqlTable,
	text,
	timestamp,
	unique,
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
	// Curated cards (shared/challenges/catalog.ts): a tagline, the coach's
	// opening line and a decor cosmetic key given for finishing.
	tagline: varchar("tagline", { length: 255 }),
	coachIntro: text("coach_intro"),
	rewardCosmetic: varchar("reward_cosmetic", { length: 64 }),
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
	// Bronze / silver / gold, chosen on joining (shared/challenges/tiers.ts):
	// scales the goals' targets. Silver = the challenge as generated.
	tier: mysqlEnum("tier", ["bronze", "silver", "gold"])
		.notNull()
		.default("silver"),
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
	// 3D gym (gym3d slice 1): set once the first layout has been seeded from
	// the gym's unlocked upgrades; null = seed on the next GET /gym/layout.
	layoutSeededAt: timestamp("layout_seeded_at"),
	// 3D gym building (gym3d slice 2): the coin balance (every gym XP award
	// also grants coins; see ECONOMY in shared/gym3d/economy.ts), how many
	// plots were bought (the next one costs more) and when the one-time
	// starter coins were granted (null = not yet).
	coins: int("coins").notNull().default(0),
	plotsBought: int("plots_bought").notNull().default(0),
	starterCoinsAt: timestamp("starter_coins_at"),
	// Gym home (0021): Sweat (exercise tasks) and Greens (diet tasks), see
	// ECONOMY. Idle coins accrue lazily from the *_collected_at times (null =
	// since the gym was created); the Slim Kitchen menu is a bitmask over
	// KITCHEN_MENU. last_open_at drives the "Welcome back" card.
	sweat: int("sweat").notNull().default(0),
	greens: int("greens").notNull().default(0),
	deskCollectedAt: timestamp("desk_collected_at"),
	kitchenCollectedAt: timestamp("kitchen_collected_at"),
	kitchenMenu: int("kitchen_menu").notNull().default(1),
	kitchenRushEndsAt: timestamp("kitchen_rush_ends_at"),
	lastOpenAt: timestamp("last_open_at"),
})

export const gymUpgradesCatalog = mysqlTable("gym_upgrades_catalog", {
	id: int("id").autoincrement().primaryKey(),
	key: varchar("key", { length: 128 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	description: text("description"),
	// varchar, not mysqlEnum (gh-64): validated at the TypeScript level
	// against GYM_UPGRADE_CATEGORIES in shared/types.ts, so a new category
	// is a content addition, not a schema migration.
	category: varchar("category", { length: 64 }).notNull(),
	requiredXp: int("required_xp").notNull().default(0),
	sortOrder: int("sort_order").notNull().default(0),
	assetPrompt: text("asset_prompt"),
	unlocksNpcKey: varchar("unlocks_npc_key", { length: 128 }),
})

// In-gym events/classes (gh-69): a global catalog, like gymUpgradesCatalog,
// not a per-user table — gating is computed dynamically each sim tick from
// requiredXp + whether the matching-category room is unlocked, not claimed
// once like an upgrade.
export const gymClasses = mysqlTable("gym_classes", {
	id: int("id").autoincrement().primaryKey(),
	key: varchar("key", { length: 128 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	description: text("description"),
	// varchar, not mysqlEnum — same open-ended pattern as
	// gymUpgradesCatalog.category (gh-64), validated against
	// GYM_UPGRADE_CATEGORIES in shared/types.ts.
	category: varchar("category", { length: 64 }).notNull(),
	requiredXp: int("required_xp").notNull().default(0),
	daysOfWeek: json("days_of_week").notNull(),
	startHour: int("start_hour").notNull(),
	endHour: int("end_hour").notNull(),
	// Extra crowd-cap headroom while the class is in session — see
	// getCrowdMax's classBoost param in server/services/gym/simulation.ts.
	capacityBoost: int("capacity_boost").notNull().default(2),
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

// ── 3D gym layout (gym3d slice 1) ─────────────────────────────────────────
// Rooms sit on plots (9 x 6 cells of the neighbourhood grid); pieces sit on a
// room's spots (derived from shared/gym3d/rooms.ts, not stored) or, for
// decor, at a free position. Positions are stored doubled (half-unit grid).

export const gymRooms = mysqlTable("gym_rooms", {
	id: int("id").autoincrement().primaryKey(),
	gymId: int("gym_id")
		.notNull()
		.references(() => userGyms.id),
	// RoomType in shared/gym3d/rooms.ts, validated in TypeScript (gh-64 style).
	type: varchar("type", { length: 32 }).notNull(),
	shape: varchar("shape", { length: 16 }).notNull().default("normal"),
	level: int("level").notNull().default(1),
	layoutVersion: int("layout_version").notNull().default(1),
	// Paint overrides; null = the room type's default from PAINT.
	wallColor: varchar("wall_color", { length: 16 }),
	floorStyle: varchar("floor_style", { length: 16 }),
	floorColor: varchar("floor_color", { length: 16 }),
	// Room vibe (shared/gym3d/vibes.ts); null = none.
	vibe: varchar("vibe", { length: 16 }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const gymPlots = mysqlTable(
	"gym_plots",
	{
		id: int("id").autoincrement().primaryKey(),
		gymId: int("gym_id")
			.notNull()
			.references(() => userGyms.id),
		px: int("px").notNull(),
		pz: int("pz").notNull(),
		state: varchar("state", { length: 16 }).notNull().default("owned"),
		lotShape: varchar("lot_shape", { length: 16 }).notNull().default("normal"),
		roomId: int("room_id").references(() => gymRooms.id),
	},
	(t) => [unique("gym_plots_gym_cell_unique").on(t.gymId, t.px, t.pz)],
)

export const gymPieces = mysqlTable(
	"gym_pieces",
	{
		id: int("id").autoincrement().primaryKey(),
		gymId: int("gym_id")
			.notNull()
			.references(() => userGyms.id),
		roomId: int("room_id").references(() => gymRooms.id),
		kind: varchar("kind", { length: 16 }).notNull(),
		itemKey: varchar("item_key", { length: 128 }).notNull(),
		upgradeKey: varchar("upgrade_key", { length: 128 }),
		spotIndex: int("spot_index"),
		posX2: int("pos_x2").notNull(),
		posZ2: int("pos_z2").notNull(),
		rot: int("rot").notNull().default(0),
		tier: int("tier").notNull().default(1),
		locked: boolean("locked").notNull().default(false),
		status: varchar("status", { length: 16 }).notNull().default("placed"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		// Idle coins (0021): a placed machine's bubble fills from this time
		// (null = since created_at).
		collectedAt: timestamp("collected_at"),
	},
	(t) => [
		unique("gym_pieces_gym_upgrade_unique").on(t.gymId, t.upgradeKey),
		unique("gym_pieces_room_spot_unique").on(t.roomId, t.spotIndex),
	],
)

// Timed construction (gym3d slice 2): buying a plot (kind "plot", room_id)
// or upgrading a piece (kind "upgrade", piece_id + target_tier). Jobs finish
// lazily: any read or write of the gym settles those with ends_at <= now.
export const gymJobs = mysqlTable(
	"gym_jobs",
	{
		id: int("id").autoincrement().primaryKey(),
		gymId: int("gym_id")
			.notNull()
			.references(() => userGyms.id),
		kind: varchar("kind", { length: 16 }).notNull(),
		roomId: int("room_id").references(() => gymRooms.id),
		pieceId: int("piece_id").references(() => gymPieces.id),
		targetTier: int("target_tier"),
		cost: int("cost").notNull().default(0),
		// active | done
		status: varchar("status", { length: 16 }).notNull().default("active"),
		startedAt: timestamp("started_at").notNull().defaultNow(),
		endsAt: timestamp("ends_at").notNull().defaultNow(),
		finishedAt: timestamp("finished_at"),
	},
	(t) => [index("gym_jobs_gym_status_idx").on(t.gymId, t.status)],
)

/** Sweat / Greens paid for a real activity, once per gym and `source`
 * (e.g. `mission:12:2026-09-28`, `meal:2026-09-28:lunch`,
 * `weight:2026-09-28`): un-ticking and ticking again never pays twice. */
export const gymRewards = mysqlTable(
	"gym_rewards",
	{
		id: int("id").autoincrement().primaryKey(),
		gymId: int("gym_id")
			.notNull()
			.references(() => userGyms.id),
		source: varchar("source", { length: 64 }).notNull(),
		sweat: int("sweat").notNull().default(0),
		greens: int("greens").notNull().default(0),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [unique("gym_rewards_gym_source_uq").on(t.gymId, t.source)],
)

// Staff hired for a room (gym home): see shared/gym3d/hires.ts.
export const gymHires = mysqlTable("gym_hires", {
	id: int("id").autoincrement().primaryKey(),
	gymId: int("gym_id")
		.notNull()
		.references(() => userGyms.id),
	roomId: int("room_id")
		.notNull()
		.references(() => gymRooms.id),
	role: varchar("role", { length: 32 }).notNull(),
	name: varchar("name", { length: 64 }).notNull(),
	level: int("level").notNull().default(1),
	createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Cosmetics a gym owns (gym home): decor, outfits and the like, from reward
// sources such as the monthly track. One row per gym and cosmetic; the
// catalog is shared/gym3d/cosmetics.ts.
export const gymCosmetics = mysqlTable(
	"gym_cosmetics",
	{
		id: int("id").autoincrement().primaryKey(),
		gymId: int("gym_id")
			.notNull()
			.references(() => userGyms.id),
		cosmeticKey: varchar("cosmetic_key", { length: 64 }).notNull(),
		/** What gave it (e.g. track:2026-10:7). */
		source: varchar("source", { length: 64 }).notNull(),
		/** Outfits: whether the coach wears it (decor ignores this). */
		worn: boolean("worn").notNull().default(true),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [unique("gym_cosmetics_gym_key_uq").on(t.gymId, t.cosmeticKey)],
)

// Walls opened between two rooms (gym home), named from the plot on the far
// side: axis "x" is the wall on that plot's -x side, "z" its -z side. See
// shared/gym3d/walls.ts.
export const gymOpenWalls = mysqlTable(
	"gym_open_walls",
	{
		id: int("id").autoincrement().primaryKey(),
		gymId: int("gym_id")
			.notNull()
			.references(() => userGyms.id),
		px: int("px").notNull(),
		pz: int("pz").notNull(),
		axis: varchar("axis", { length: 1 }).notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [unique("gym_open_walls_uq").on(t.gymId, t.px, t.pz, t.axis)],
)

// Trained staff (gym home): one row per gym and staff NPC once trained past
// level 1 (no row = level 1). See shared/gym3d/staff.ts.
export const gymStaff = mysqlTable(
	"gym_staff",
	{
		id: int("id").autoincrement().primaryKey(),
		gymId: int("gym_id")
			.notNull()
			.references(() => userGyms.id),
		npcKey: varchar("npc_key", { length: 128 }).notNull(),
		level: int("level").notNull().default(1),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [unique("gym_staff_gym_npc_uq").on(t.gymId, t.npcKey)],
)

/** Legacy (slice 2, no longer written since 0021): real activities that
 * sped up the 3D gym's jobs by an hour. Sweat replaced the automatic cut.
 * Kept so existing rows stay readable. The same
 * activity (a mission completed, un-completed and completed again) cuts
 * at most once. `source` is e.g. `checkin:2026-09-27` or
 * `mission:12:2026-09-21`. */
export const gymActivityCuts = mysqlTable(
	"gym_activity_cuts",
	{
		id: int("id").autoincrement().primaryKey(),
		gymId: int("gym_id")
			.notNull()
			.references(() => userGyms.id),
		source: varchar("source", { length: 64 }).notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [unique("gym_activity_cuts_gym_source_uq").on(t.gymId, t.source)],
)

export const gymNpcs = mysqlTable("gym_npcs", {
	id: int("id").autoincrement().primaryKey(),
	key: varchar("key", { length: 128 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	// varchar, not mysqlEnum (gh-64): validated at the TypeScript level
	// against GYM_NPC_ROLES in shared/types.ts.
	role: varchar("role", { length: 64 }).notNull(),
	personalityProfile: json("personality_profile").notNull(),
	defaultSchedule: json("default_schedule").notNull(),
	portraitUrl: varchar("portrait_url", { length: 500 }),
	spriteKey: varchar("sprite_key", { length: 128 }).notNull(),
	unlockedByUpgradeKey: varchar("unlocked_by_upgrade_key", { length: 128 }),
	portraitGeneratedAt: timestamp("portrait_generated_at"),
	// Hero/influencer visits (gh-68): null on both = a regular permanent NPC.
	// Set on both = a periodic rotating visitor, present for
	// heroVisitDurationDays every heroVisitCadenceDays (see
	// isHeroVisitingToday in server/services/gym/simulation.ts). Layered on
	// top of defaultSchedule, which still governs hour-of-day presence on a
	// visiting day.
	heroVisitCadenceDays: int("hero_visit_cadence_days"),
	heroVisitDurationDays: int("hero_visit_duration_days"),
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
	// null for system tournaments (see system_key)
	creatorId: varchar("creator_id", { length: 36 }).references(() => users.id),
	// Set for tournaments the scheduler creates: "weekly:<monday>" or
	// "monthly:<YYYY-MM>". Unique, so a period can never get two.
	systemKey: varchar("system_key", { length: 32 }).unique(),
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
	// null for posts the system makes (a recurring tournament opening)
	userId: varchar("user_id", { length: 36 }).references(() => users.id),
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

export const missions = mysqlTable("missions", {
	id: int("id").autoincrement().primaryKey(),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	title: varchar("title", { length: 255 }).notNull(),
	description: text("description"),
	cadence: mysqlEnum("cadence", ["daily", "weekly"]).notNull(),
	difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).notNull(),
	// exercise | diet | other (0021): exercise pays Sweat, diet pays Greens.
	kind: varchar("kind", { length: 16 }).notNull().default("other"),
	archivedAt: timestamp("archived_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const missionCompletions = mysqlTable("mission_completions", {
	id: int("id").autoincrement().primaryKey(),
	missionId: int("mission_id")
		.notNull()
		.references(() => missions.id),
	userId: varchar("user_id", { length: 36 })
		.notNull()
		.references(() => users.id),
	periodStart: timestamp("period_start").notNull(),
	completedAt: timestamp("completed_at").notNull().defaultNow(),
	xpAwarded: int("xp_awarded").notNull(),
})

export const contentTuningFeedback = mysqlTable("content_tuning_feedback", {
	id: int("id").autoincrement().primaryKey(),
	contentType: varchar("content_type", { length: 64 }).notNull(),
	subcategory: varchar("subcategory", { length: 64 }).notNull(),
	contextParams: json("context_params").notNull(),
	generatedSample: text("generated_sample").notNull(),
	tags: json("tags").notNull(),
	note: text("note"),
	noteScope: mysqlEnum("note_scope", ["sample", "global"])
		.notNull()
		.default("sample"),
	tuningDocBefore: text("tuning_doc_before").notNull(),
	tuningDocAfter: text("tuning_doc_after").notNull(),
	changelog: text("changelog"),
	createdBy: varchar("created_by", { length: 36 })
		.notNull()
		.references(() => users.id),
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

/** One row per scheduled job per period (server/services/scheduler). The
 * unique (job, period) row is the claim that keeps a restart, a double tick
 * or a second instance from running the same month/week/day twice, and it
 * is the last-run record the admin panel shows. `attempts` goes up on every
 * claim, so it doubles as the compare-and-swap token for retries. */
export const scheduledJobRuns = mysqlTable(
	"scheduled_job_runs",
	{
		id: int("id").autoincrement().primaryKey(),
		job: varchar("job", { length: 64 }).notNull(),
		period: varchar("period", { length: 32 }).notNull(),
		status: mysqlEnum("status", ["running", "ok", "failed"]).notNull(),
		attempts: int("attempts").notNull().default(1),
		trigger: mysqlEnum("trigger", ["schedule", "manual"])
			.notNull()
			.default("schedule"),
		startedAt: timestamp("started_at").notNull(),
		finishedAt: timestamp("finished_at"),
		result: json("result"),
		error: text("error"),
	},
	(t) => [unique("scheduled_job_runs_job_period_uq").on(t.job, t.period)],
)
