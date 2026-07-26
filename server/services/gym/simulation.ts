import { and, eq, sql } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import { gymNpcDailyState, userGymNpcRelationships } from "../../db/schema.js"

type Db = MySql2Database<typeof schema>

export type PersonalityProfile = {
	traits: string[]
	goals: string[]
	quirks: string[]
	equipmentPreferences: string[]
	avoidEquipment: string[]
	friendlyWith: string[]
	rivalWith: string[]
	moodBaseline: number
}

export type ActivityStep = {
	type: "warmup" | "main" | "cooldown"
	durationMin: number
	equipmentCategory: string
}

export type NpcSchedule = {
	arrivalHour: number
	departureHour: number
	daysOfWeek: number[]
	activitySequence: ActivityStep[]
}

export type GymNpc = {
	key: string
	name: string
	role: string
	personalityProfile: PersonalityProfile
	defaultSchedule: NpcSchedule
	spriteKey: string
	unlockedByUpgradeKey: string | null
}

export type NpcRelationship = {
	npcKey: string
	relationshipLevel: number
	gymDaysActive: number
}

export type MoodVariant = "normal" | "energized" | "tired"

export type MoodEvent = {
	type: string
	delta: number
	timestamp: string
}

export type NpcSimState = {
	npcKey: string
	isPresent: boolean
	position: { x: number; y: number }
	currentActivity:
		| "walking"
		| "using_equipment"
		| "idle"
		| "chatting"
		| "leaving"
	targetEquipmentKey: string | null
	facingDirection: "up" | "down" | "left" | "right"
	mood: number
	moodVariant: MoodVariant
	moveSpeedMultiplier: number
	chatEventWith: string | null
	currentAnimation: string
	isInteractable: boolean
	progressionStage: string | null
}

type DailyStateRow = {
	id: number
	gymId: number
	npcKey: string
	date: Date
	mood: number
	goalSequence: unknown
	equipmentHistory: unknown
	moodEvents: unknown
}

// ── Crowd density windows ────────────────────────────────────────────────────

export const CROWD_WINDOWS: Array<{ start: number; end: number; max: number }> =
	[
		{ start: 0, end: 5, max: 0 },
		{ start: 5, end: 7, max: 1 },
		{ start: 7, end: 9, max: 5 },
		{ start: 9, end: 11, max: 3 },
		{ start: 11, end: 13, max: 4 },
		{ start: 13, end: 16, max: 2 },
		{ start: 16, end: 19, max: 6 },
		{ start: 19, end: 21, max: 3 },
		{ start: 21, end: 24, max: 0 },
	]

export function getCrowdMax(hour: number): number {
	return CROWD_WINDOWS.find((w) => hour >= w.start && hour < w.end)?.max ?? 0
}

const ROLE_PRIORITY: Record<string, number> = {
	trainer: 1,
	specialist: 2,
	receptionist: 3,
	regular: 4,
}

// ── Equipment mapping ────────────────────────────────────────────────────────

const EQUIPMENT_BY_CATEGORY: Record<string, string[]> = {
	cardio: [
		"cardio_treadmill",
		"cardio_rowing",
		"cardio_bikes",
		"cardio_stairs",
		"cardio_cinema",
	],
	weights: [
		"weights_dumbbells",
		"weights_barbell",
		"weights_cable",
		"weights_smith",
		"weights_olympic",
	],
	amenities: [
		"amenity_water",
		"amenity_lockers",
		"amenity_showers",
		"amenity_sauna",
		"amenity_juice",
	],
	decor: [
		"decor_posters",
		"decor_plants",
		"decor_mirrors",
		"decor_trophy",
		"decor_neon",
	],
	staff: [
		"staff_reception",
		"staff_trainer",
		"staff_massage",
		"staff_physio",
		"staff_nutrition",
	],
}

const EQUIPMENT_POSITIONS: Record<string, { x: number; y: number }> = {
	cardio_treadmill: { x: 2, y: 2 },
	cardio_rowing: { x: 4, y: 2 },
	cardio_bikes: { x: 6, y: 2 },
	cardio_stairs: { x: 8, y: 2 },
	cardio_cinema: { x: 2, y: 4 },
	weights_dumbbells: { x: 10, y: 2 },
	weights_barbell: { x: 12, y: 2 },
	weights_cable: { x: 14, y: 2 },
	weights_smith: { x: 10, y: 4 },
	weights_olympic: { x: 12, y: 4 },
	amenity_water: { x: 2, y: 8 },
	amenity_lockers: { x: 4, y: 8 },
	amenity_showers: { x: 6, y: 8 },
	amenity_sauna: { x: 8, y: 8 },
	amenity_juice: { x: 2, y: 10 },
	decor_posters: { x: 10, y: 8 },
	decor_plants: { x: 12, y: 8 },
	decor_mirrors: { x: 14, y: 8 },
	decor_trophy: { x: 10, y: 10 },
	decor_neon: { x: 12, y: 10 },
	staff_reception: { x: 6, y: 5 },
	staff_trainer: { x: 8, y: 5 },
	staff_massage: { x: 6, y: 7 },
	staff_physio: { x: 8, y: 7 },
	staff_nutrition: { x: 10, y: 6 },
}

const DOOR_POSITION = { x: 10, y: 14 }
const IDLE_POSITION = { x: 9, y: 7 }
const EVENT_STAGE_POSITION = { x: 8, y: 6 }

// ── Mood helpers ─────────────────────────────────────────────────────────────

export function getMoodVariant(mood: number): MoodVariant {
	if (mood > 70) return "energized"
	if (mood < 20) return "tired"
	return "normal"
}

export function getMoveSpeedMultiplier(mood: number): number {
	if (mood > 70) return 1.2
	if (mood < 20) return 0.85
	if (mood < 40) return 0.9
	return 1.0
}

// ── Progression milestones ───────────────────────────────────────────────────

export function getProgressionStage(
	npcKey: string,
	gymDaysActive: number,
): string | null {
	if (npcKey === "regular_derek" && gymDaysActive >= 30) return "heavy_weights"
	if (npcKey === "regular_elena" && gymDaysActive >= 20) return "stair_climber"
	if (npcKey === "regular_tom" && gymDaysActive >= 15) return "group_trainer"
	if (npcKey === "trainer_marcus" && gymDaysActive >= 1) return "form_corrector"
	return null
}

// ── Schedule helpers ─────────────────────────────────────────────────────────

function isNpcPresentAtHour(
	schedule: NpcSchedule,
	hour: number,
	dayOfWeek: number,
	mood: number,
): boolean {
	if (!schedule.daysOfWeek.includes(dayOfWeek)) return false
	const arrivalOffset = mood < 20 ? 1 : 0
	const departureOffset = mood < 20 ? -1 : 0
	const effectiveArrival = schedule.arrivalHour + arrivalOffset
	const effectiveDeparture = Math.max(
		schedule.arrivalHour + 1,
		schedule.departureHour + departureOffset,
	)
	return hour >= effectiveArrival && hour < effectiveDeparture
}

// ── Equipment selection ──────────────────────────────────────────────────────

function pickEquipmentForCategory(
	npc: GymNpc,
	category: string,
	unlockedUpgrades: string[],
	occupiedEquipment: Set<string>,
): { key: string | null; gotPreferred: boolean } {
	const available = (EQUIPMENT_BY_CATEGORY[category] ?? []).filter(
		(e) => unlockedUpgrades.includes(e) && !occupiedEquipment.has(e),
	)

	if (available.length === 0) return { key: null, gotPreferred: false }

	const profile = npc.personalityProfile
	const preferred = available.filter((e) =>
		profile.equipmentPreferences.includes(e),
	)
	const nonAvoided = available.filter(
		(e) => !profile.avoidEquipment.includes(e),
	)

	if (preferred.length > 0) return { key: preferred[0], gotPreferred: true }
	if (nonAvoided.length > 0) return { key: nonAvoided[0], gotPreferred: false }
	return { key: available[0], gotPreferred: false }
}

function pickEquipmentWithRivalAvoidance(
	npc: GymNpc,
	category: string,
	unlockedUpgrades: string[],
	occupiedEquipment: Set<string>,
	rivalClaimedCategories: Set<string>,
): { key: string | null; gotPreferred: boolean; category: string } {
	// If rival is using this category, try to find an alternative category
	if (rivalClaimedCategories.has(category)) {
		const profile = npc.personalityProfile
		// Look for preferred equipment in other categories
		const allPreferred = profile.equipmentPreferences.filter(
			(e) => unlockedUpgrades.includes(e) && !occupiedEquipment.has(e),
		)
		// Find which category the preferred item belongs to
		for (const pref of allPreferred) {
			for (const [cat, items] of Object.entries(EQUIPMENT_BY_CATEGORY)) {
				if (
					cat !== category &&
					items.includes(pref) &&
					!rivalClaimedCategories.has(cat)
				) {
					return { key: pref, gotPreferred: true, category: cat }
				}
			}
		}
		// No alternative found, still pick from same category
	}

	const pick = pickEquipmentForCategory(
		npc,
		category,
		unlockedUpgrades,
		occupiedEquipment,
	)
	return { ...pick, category }
}

// ── Mood events ──────────────────────────────────────────────────────────────

function buildMoodEvents(
	npc: GymNpc,
	schedule: NpcSchedule,
	unlockedUpgrades: string[],
	occupiedEquipment: Set<string>,
	presentNpcKeys: string[],
): MoodEvent[] {
	const events: MoodEvent[] = []
	const profile = npc.personalityProfile
	const now = new Date().toISOString()

	for (const step of schedule.activitySequence) {
		const pick = pickEquipmentForCategory(
			npc,
			step.equipmentCategory,
			unlockedUpgrades,
			occupiedEquipment,
		)
		if (pick.key) {
			if (profile.equipmentPreferences[0] === pick.key) {
				events.push({
					type: "got_preferred_equipment_1",
					delta: 20,
					timestamp: now,
				})
			} else if (pick.gotPreferred) {
				events.push({
					type: "got_preferred_equipment_2",
					delta: 10,
					timestamp: now,
				})
			} else if (profile.avoidEquipment.includes(pick.key)) {
				events.push({ type: "used_non_preferred", delta: -10, timestamp: now })
			}
		} else {
			events.push({ type: "equipment_occupied", delta: -20, timestamp: now })
		}
	}

	for (const friendKey of profile.friendlyWith) {
		if (presentNpcKeys.includes(friendKey)) {
			events.push({
				type: `chatted_with_${friendKey}`,
				delta: 15,
				timestamp: now,
			})
		}
	}
	for (const rivalKey of profile.rivalWith) {
		if (presentNpcKeys.includes(rivalKey)) {
			events.push({
				type: `near_rival_${rivalKey}`,
				delta: -10,
				timestamp: now,
			})
		}
	}

	return events
}

function computeMoodFromEvents(baseline: number, events: MoodEvent[]): number {
	let mood = baseline
	for (const ev of events) mood += ev.delta
	return Math.max(-100, Math.min(100, mood))
}

function computeCurrentActivity(
	schedule: NpcSchedule,
	now: Date,
	mood: number,
): { step: ActivityStep | null; elapsedInStep: number } {
	const arrivalOffset = mood < 20 ? 1 : 0
	const arrivalMinute = (schedule.arrivalHour + arrivalOffset) * 60
	const currentMinute = now.getHours() * 60 + now.getMinutes()
	let elapsed = currentMinute - arrivalMinute

	if (elapsed < 0) return { step: null, elapsedInStep: 0 }

	// mood < 20: skip one activity (the first main activity)
	const sequence =
		mood < 20
			? schedule.activitySequence
					.filter((s) => s.type !== "main")
					.concat(
						schedule.activitySequence.filter((s) => s.type === "main").slice(1),
					)
			: schedule.activitySequence

	for (const step of sequence) {
		if (elapsed < step.durationMin) return { step, elapsedInStep: elapsed }
		elapsed -= step.durationMin
	}

	return { step: null, elapsedInStep: 0 }
}

function getFacingDirection(
	targetPos: { x: number; y: number },
	currentPos: { x: number; y: number },
): "up" | "down" | "left" | "right" {
	const dx = targetPos.x - currentPos.x
	const dy = targetPos.y - currentPos.y
	if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left"
	return dy > 0 ? "down" : "up"
}

function manhattanDistance(
	a: { x: number; y: number },
	b: { x: number; y: number },
): number {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

// ── Daily state ──────────────────────────────────────────────────────────────

async function getOrCreateDailyState(
	gymId: number,
	npc: GymNpc,
	today: Date,
	moodEvents: MoodEvent[],
	goalSeq: ActivityStep[],
	db: Db,
): Promise<DailyStateRow> {
	const dateStart = new Date(today)
	dateStart.setHours(0, 0, 0, 0)

	const [existing] = await db
		.select()
		.from(gymNpcDailyState)
		.where(
			and(
				eq(gymNpcDailyState.gymId, gymId),
				eq(gymNpcDailyState.npcKey, npc.key),
				eq(gymNpcDailyState.date, dateStart),
			),
		)

	if (existing) return existing

	const mood = computeMoodFromEvents(
		npc.personalityProfile.moodBaseline,
		moodEvents,
	)

	const [inserted] = await db
		.insert(gymNpcDailyState)
		.values({
			gymId,
			npcKey: npc.key,
			date: dateStart,
			mood,
			goalSequence: goalSeq,
			equipmentHistory: [],
			moodEvents,
		})
		.$returningId()

	// Increment gymDaysActive on the relationship (only if relationship exists)
	await db
		.update(userGymNpcRelationships)
		.set({ gymDaysActive: sql`${userGymNpcRelationships.gymDaysActive} + 1` })
		.where(
			and(
				eq(userGymNpcRelationships.gymId, gymId),
				eq(userGymNpcRelationships.npcKey, npc.key),
			),
		)

	const [row] = await db
		.select()
		.from(gymNpcDailyState)
		.where(eq(gymNpcDailyState.id, inserted.id))

	return row
}

// ── Event type ───────────────────────────────────────────────────────────────

type TodayEvent = {
	npcKey: string | null
	activeHours: [number, number]
	effects?: { allNpcMoodBonus?: number }
} | null

// ── Main export ──────────────────────────────────────────────────────────────

export async function computeGymSimState(
	gymId: number,
	npcs: GymNpc[],
	unlockedUpgrades: string[],
	relationships: NpcRelationship[],
	db: Db,
	now?: Date,
	todayEvent?: TodayEvent,
): Promise<NpcSimState[]> {
	const currentTime = now ?? new Date()
	const hour = currentTime.getHours()
	const dayOfWeek = currentTime.getDay()

	// Get stored daily states to check existing mood values
	const dateStart = new Date(currentTime)
	dateStart.setHours(0, 0, 0, 0)
	const storedStates = await db
		.select()
		.from(gymNpcDailyState)
		.where(
			and(
				eq(gymNpcDailyState.gymId, gymId),
				eq(gymNpcDailyState.date, dateStart),
			),
		)

	const getStoredMood = (npcKey: string): number | null => {
		const s = storedStates.find((r) => r.npcKey === npcKey)
		return s != null ? s.mood : null
	}

	// Phase 1: Filter eligible NPCs (unlocked + scheduled today with mood offset)
	const crowdMax = getCrowdMax(hour)

	const eligibleNpcs = npcs.filter((npc) => {
		if (
			npc.unlockedByUpgradeKey &&
			!unlockedUpgrades.includes(npc.unlockedByUpgradeKey)
		)
			return false
		const mood =
			getStoredMood(npc.key) ??
			(npc.personalityProfile as PersonalityProfile).moodBaseline
		return isNpcPresentAtHour(
			npc.defaultSchedule as NpcSchedule,
			hour,
			dayOfWeek,
			mood,
		)
	})

	// Phase 2: Apply crowd cap (trainer > specialist > receptionist > regular)
	const sortedEligible = [...eligibleNpcs].sort(
		(a, b) => (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99),
	)
	const presentNpcs = sortedEligible.slice(0, Math.max(0, crowdMax))
	const presentNpcKeys = presentNpcs.map((n) => n.key)

	// Phase 3: Compute mood events and daily states for present NPCs
	const occupiedEquipment = new Set<string>()
	const dailyStateMap = new Map<string, DailyStateRow>()

	for (const npc of presentNpcs) {
		const schedule = npc.defaultSchedule as NpcSchedule
		const moodEvents = buildMoodEvents(
			npc,
			schedule,
			unlockedUpgrades,
			occupiedEquipment,
			presentNpcKeys,
		)
		const dailyState = await getOrCreateDailyState(
			gymId,
			npc,
			currentTime,
			moodEvents,
			schedule.activitySequence,
			db,
		)
		dailyStateMap.set(npc.key, dailyState)
	}

	// Phase 4: Compute equipment choices (with rival avoidance)
	// Track which categories each NPC's rivals have claimed
	const rivalClaimedCategories = new Map<string, Set<string>>()
	const equipmentChoices = new Map<
		string,
		{ key: string | null; category: string }
	>()
	const positionMap = new Map<string, { x: number; y: number }>()

	// First sub-pass: claim equipment in role-priority order
	occupiedEquipment.clear()
	for (const npc of presentNpcs) {
		const profile = npc.personalityProfile as PersonalityProfile
		const schedule = npc.defaultSchedule as NpcSchedule
		const dailyState = dailyStateMap.get(npc.key)
		const mood = dailyState?.mood ?? npc.personalityProfile.moodBaseline

		const { step } = computeCurrentActivity(schedule, currentTime, mood)

		if (!step) {
			equipmentChoices.set(npc.key, { key: null, category: "none" })
			positionMap.set(npc.key, IDLE_POSITION)
			continue
		}

		// Gather rival's claimed categories so far
		const rivalCats = rivalClaimedCategories.get(npc.key) ?? new Set<string>()
		for (const rivalKey of profile.rivalWith) {
			const rivalChoice = equipmentChoices.get(rivalKey)
			if (rivalChoice?.category) rivalCats.add(rivalChoice.category)
		}

		const pick = pickEquipmentWithRivalAvoidance(
			npc,
			step.equipmentCategory,
			unlockedUpgrades,
			occupiedEquipment,
			rivalCats,
		)

		if (pick.key) {
			occupiedEquipment.add(pick.key)
			equipmentChoices.set(npc.key, { key: pick.key, category: pick.category })
			positionMap.set(npc.key, EQUIPMENT_POSITIONS[pick.key] ?? IDLE_POSITION)
		} else {
			equipmentChoices.set(npc.key, {
				key: null,
				category: step.equipmentCategory,
			})
			positionMap.set(npc.key, IDLE_POSITION)
		}
	}

	// Phase 5: Determine chat events (friendly pairs within 3 tiles)
	const chatEventMap = new Map<string, string>()
	for (const npc of presentNpcs) {
		if (chatEventMap.has(npc.key)) continue
		const profile = npc.personalityProfile as PersonalityProfile
		for (const friendKey of profile.friendlyWith) {
			if (!presentNpcKeys.includes(friendKey)) continue
			if (chatEventMap.has(friendKey)) continue
			const posA = positionMap.get(npc.key)
			const posB = positionMap.get(friendKey)
			if (posA && posB && manhattanDistance(posA, posB) <= 3) {
				chatEventMap.set(npc.key, friendKey)
				chatEventMap.set(friendKey, npc.key)
				break
			}
		}
	}

	// Phase 6: Event host override
	const eventHour = currentTime.getHours()
	const eventActive =
		todayEvent?.npcKey &&
		todayEvent.activeHours[0] <= eventHour &&
		eventHour < todayEvent.activeHours[1]
	const eventNpcKey = eventActive && todayEvent ? todayEvent.npcKey : null
	const eventMoodBonus =
		eventActive && todayEvent ? (todayEvent.effects?.allNpcMoodBonus ?? 0) : 0

	// Phase 7: Build final states
	const states: NpcSimState[] = []

	for (const npc of presentNpcs) {
		const dailyState = dailyStateMap.get(npc.key)
		const baseMood =
			(dailyState?.mood ?? npc.personalityProfile.moodBaseline) + eventMoodBonus
		const finalMood = Math.max(-100, Math.min(100, baseMood))
		const moodVariant = getMoodVariant(finalMood)
		const moveSpeedMultiplier = getMoveSpeedMultiplier(finalMood)

		const choice = equipmentChoices.get(npc.key) ?? {
			key: null,
			category: "none",
		}
		let position = positionMap.get(npc.key) ?? IDLE_POSITION
		const chatEventWith = chatEventMap.get(npc.key) ?? null

		const isEventHost = npc.key === eventNpcKey
		if (isEventHost) position = EVENT_STAGE_POSITION

		let activity: NpcSimState["currentActivity"] = "idle"
		let animation = "idle"

		if (isEventHost) {
			activity = "idle"
			animation = "idle"
		} else if (chatEventWith) {
			activity = "chatting"
			animation = "chat"
		} else if (choice.key) {
			activity = "using_equipment"
			animation = `use_${choice.key}`
		}

		const rel = relationships.find((r) => r.npcKey === npc.key)
		const gymDaysActive = rel?.gymDaysActive ?? 0
		const progressionStage = getProgressionStage(npc.key, gymDaysActive)

		states.push({
			npcKey: npc.key,
			isPresent: true,
			position,
			currentActivity: activity,
			targetEquipmentKey: isEventHost ? null : (choice.key ?? null),
			facingDirection: getFacingDirection(position, DOOR_POSITION),
			mood: finalMood,
			moodVariant,
			moveSpeedMultiplier,
			chatEventWith,
			currentAnimation: animation,
			isInteractable: true,
			progressionStage,
		})
	}

	// Absent NPCs
	for (const npc of npcs) {
		if (presentNpcs.includes(npc)) continue
		if (
			npc.unlockedByUpgradeKey &&
			!unlockedUpgrades.includes(npc.unlockedByUpgradeKey)
		)
			continue

		const profile = npc.personalityProfile as PersonalityProfile
		states.push({
			npcKey: npc.key,
			isPresent: false,
			position: { x: 0, y: 0 },
			currentActivity: "leaving",
			targetEquipmentKey: null,
			facingDirection: "down",
			mood: profile.moodBaseline,
			moodVariant: getMoodVariant(profile.moodBaseline),
			moveSpeedMultiplier: 1.0,
			chatEventWith: null,
			currentAnimation: "absent",
			isInteractable: false,
			progressionStage: null,
		})
	}

	return states
}
