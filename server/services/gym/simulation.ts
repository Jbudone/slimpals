import { and, eq } from "drizzle-orm"
import type { MySql2Database } from "drizzle-orm/mysql2"
import type * as schema from "../../db/schema.js"
import { gymNpcDailyState } from "../../db/schema.js"

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
}

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
	currentAnimation: string
	isInteractable: boolean
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

function isNpcPresent(schedule: NpcSchedule, now: Date): boolean {
	const dayOfWeek = now.getDay()
	if (!schedule.daysOfWeek.includes(dayOfWeek)) return false
	const hour = now.getHours()
	return hour >= schedule.arrivalHour && hour < schedule.departureHour
}

function pickEquipment(
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

	if (preferred.length > 0) {
		return { key: preferred[0], gotPreferred: true }
	}

	if (nonAvoided.length > 0) {
		return { key: nonAvoided[0], gotPreferred: false }
	}

	return { key: available[0], gotPreferred: false }
}

function computeCurrentActivity(
	schedule: NpcSchedule,
	now: Date,
): { step: ActivityStep | null; elapsedInStep: number } {
	const arrivalMinute = schedule.arrivalHour * 60
	const currentMinute = now.getHours() * 60 + now.getMinutes()
	let elapsed = currentMinute - arrivalMinute

	for (const step of schedule.activitySequence) {
		if (elapsed < step.durationMin) {
			return { step, elapsedInStep: elapsed }
		}
		elapsed -= step.durationMin
	}

	return { step: null, elapsedInStep: 0 }
}

function computeMoodFromEvents(baseline: number, events: MoodEvent[]): number {
	let mood = baseline
	for (const ev of events) {
		mood += ev.delta
	}
	return Math.max(-100, Math.min(100, mood))
}

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
		const pick = pickEquipment(
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

function getFacingDirection(
	targetPos: { x: number; y: number },
	currentPos: { x: number; y: number },
): "up" | "down" | "left" | "right" {
	const dx = targetPos.x - currentPos.x
	const dy = targetPos.y - currentPos.y
	if (Math.abs(dx) > Math.abs(dy)) {
		return dx > 0 ? "right" : "left"
	}
	return dy > 0 ? "down" : "up"
}

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

	const [row] = await db
		.select()
		.from(gymNpcDailyState)
		.where(eq(gymNpcDailyState.id, inserted.id))

	return row
}

export async function computeGymSimState(
	gymId: number,
	npcs: GymNpc[],
	unlockedUpgrades: string[],
	relationships: NpcRelationship[],
	db: Db,
	now?: Date,
): Promise<NpcSimState[]> {
	const currentTime = now ?? new Date()
	const states: NpcSimState[] = []
	const occupiedEquipment = new Set<string>()

	const presentNpcs = npcs.filter((npc) => {
		if (
			npc.unlockedByUpgradeKey &&
			!unlockedUpgrades.includes(npc.unlockedByUpgradeKey)
		) {
			return false
		}
		return isNpcPresent(npc.defaultSchedule as NpcSchedule, currentTime)
	})

	const presentNpcKeys = presentNpcs.map((n) => n.key)

	for (const npc of presentNpcs) {
		const schedule = npc.defaultSchedule as NpcSchedule
		const profile = npc.personalityProfile as PersonalityProfile

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

		const { step } = computeCurrentActivity(schedule, currentTime)

		let activity: NpcSimState["currentActivity"] = "idle"
		let targetEquipmentKey: string | null = null
		let position = IDLE_POSITION
		let animation = "idle"

		if (step) {
			const pick = pickEquipment(
				npc,
				step.equipmentCategory,
				unlockedUpgrades,
				occupiedEquipment,
			)
			if (pick.key) {
				targetEquipmentKey = pick.key
				occupiedEquipment.add(pick.key)
				activity = "using_equipment"
				position = EQUIPMENT_POSITIONS[pick.key] ?? IDLE_POSITION
				animation = `use_${pick.key}`
			} else {
				activity = "idle"
				position = IDLE_POSITION
				animation = "idle"
			}
		}

		const friendPresent = profile.friendlyWith.some((f) =>
			presentNpcKeys.includes(f),
		)
		if (activity === "idle" && friendPresent) {
			activity = "chatting"
			animation = "chat"
		}

		const rel = relationships.find((r) => r.npcKey === npc.key)
		const isInteractable =
			activity !== "leaving" && (rel?.relationshipLevel ?? 0) >= 0

		states.push({
			npcKey: npc.key,
			isPresent: true,
			position,
			currentActivity: activity,
			targetEquipmentKey,
			facingDirection: getFacingDirection(position, DOOR_POSITION),
			mood: dailyState.mood,
			currentAnimation: animation,
			isInteractable,
		})
	}

	for (const npc of npcs) {
		if (presentNpcs.includes(npc)) continue
		if (
			npc.unlockedByUpgradeKey &&
			!unlockedUpgrades.includes(npc.unlockedByUpgradeKey)
		)
			continue

		states.push({
			npcKey: npc.key,
			isPresent: false,
			position: { x: 0, y: 0 },
			currentActivity: "leaving",
			targetEquipmentKey: null,
			facingDirection: "down",
			mood: (npc.personalityProfile as PersonalityProfile).moodBaseline,
			currentAnimation: "absent",
			isInteractable: false,
		})
	}

	return states
}
