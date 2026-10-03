// The rolling goals queue (gym home). Goals come in a fixed order; the HUD
// shows the first few that are not done yet. Each goal pays Sweat and/or
// Greens once (through gym_rewards, source `goal:<id>`), so a goal stays
// done even if the gym changes later. Conditions are read from the layout
// alone, so the server and the client agree.
import type { GymGoalDto, Reward } from "../types.js"
import { type Rating, type RatingInput, ratingOf } from "./rating.js"

export type GoalState = RatingInput & { rating: Rating }

export type GoalDef = {
	id: string
	title: string
	/** Where it stands now: value out of target (for the progress bar). */
	progress: (s: GoalState) => { value: number; target: number }
	reward: Reward
}

const equipmentRooms = (s: GoalState) =>
	s.rooms.filter((r) => r.type !== "lobby" && r.type !== "empty" && !r.building)

const maxLevel = (s: GoalState) =>
	equipmentRooms(s).reduce((a, r) => Math.max(a, r.level), 0)

const placed = (s: GoalState) => s.pieces.filter((p) => p.status === "placed")

const stars =
	(n: number): GoalDef["progress"] =>
	(s) => ({
		value: s.rating.stars,
		target: n,
	})

/** In queue order: early goals teach the loop, later ones are the long game. */
export const GOALS: readonly GoalDef[] = [
	{
		id: "rooms-2",
		title: "Open a second room",
		progress: (s) => ({ value: equipmentRooms(s).length, target: 2 }),
		reward: { sweat: 1, greens: 0 },
	},
	{
		id: "stars-2",
		title: "Reach 2 stars",
		progress: stars(2),
		reward: { sweat: 2, greens: 0 },
	},
	{
		id: "decor-1",
		title: "Put up some decor",
		progress: (s) => ({
			value: placed(s).filter((p) => p.kind === "decor").length,
			target: 1,
		}),
		reward: { sweat: 0, greens: 1 },
	},
	{
		id: "room-lv2",
		title: "Take a room to level 2",
		progress: (s) => ({ value: maxLevel(s), target: 2 }),
		reward: { sweat: 1, greens: 1 },
	},
	{
		id: "variety-3",
		title: "Have three kinds of room",
		progress: (s) => ({
			value: new Set(equipmentRooms(s).map((r) => r.type)).size,
			target: 3,
		}),
		reward: { sweat: 2, greens: 0 },
	},
	{
		id: "wall-1",
		title: "Knock out a wall between two rooms",
		progress: (s) => ({ value: Math.min(1, s.openWalls ?? 0), target: 1 }),
		reward: { sweat: 2, greens: 0 },
	},
	{
		id: "upgrade-t2",
		title: "Upgrade a machine to tier 2",
		progress: (s) => ({
			value: Math.max(1, ...placed(s).map((p) => p.tier)),
			target: 2,
		}),
		reward: { sweat: 2, greens: 0 },
	},
	{
		id: "stars-3",
		title: "Reach 3 stars",
		progress: stars(3),
		reward: { sweat: 3, greens: 1 },
	},
	{
		id: "staff-1",
		title: "Get a staff station going",
		progress: (s) => ({
			value: Math.min(
				1,
				placed(s).filter(
					(p) => p.kind === "equipment" && p.itemKey.startsWith("staff_"),
				).length,
			),
			target: 1,
		}),
		reward: { sweat: 0, greens: 2 },
	},
	{
		id: "room-lv3",
		title: "Take a room to level 3",
		progress: (s) => ({ value: maxLevel(s), target: 3 }),
		reward: { sweat: 2, greens: 2 },
	},
	{
		id: "big-room",
		title: "Own a room that spans two plots",
		progress: (s) => ({
			value: equipmentRooms(s).some((r) => r.cells.length >= 2) ? 1 : 0,
			target: 1,
		}),
		reward: { sweat: 3, greens: 0 },
	},
	{
		id: "stars-4",
		title: "Reach 4 stars",
		progress: stars(4),
		reward: { sweat: 4, greens: 2 },
	},
	{
		id: "stars-5",
		title: "Reach 5 stars",
		progress: stars(5),
		reward: { sweat: 6, greens: 3 },
	},
]

export const GOAL_SOURCE = (id: string): string => `goal:${id}`
/** Written once when a gym's goals are first read: what it already met
 * then starts out done, without a reward. */
export const GOALS_BASELINE_ID = "_start"

export function goalState(input: RatingInput): GoalState {
	return { ...input, rating: ratingOf(input) }
}

export function goalMet(def: GoalDef, s: GoalState): boolean {
	const p = def.progress(s)
	return p.value >= p.target
}

/** Goals whose condition holds now (ids), in queue order. */
export function metGoalIds(s: GoalState): string[] {
	return GOALS.filter((g) => goalMet(g, s)).map((g) => g.id)
}

/** The goals list for the client: every goal with its progress; `paid` is
 * the set of ids already settled. A goal is done once paid or when met. */
export function goalsDto(
	s: GoalState,
	paid: ReadonlySet<string>,
): GymGoalDto[] {
	return GOALS.map((g) => {
		const p = g.progress(s)
		const done = paid.has(g.id) || p.value >= p.target
		return {
			id: g.id,
			title: g.title,
			value: done ? p.target : Math.min(p.value, p.target),
			target: p.target,
			reward: g.reward,
			done,
		}
	})
}
