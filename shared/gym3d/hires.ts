// Hiring staff for a room (gym home): a coach, lifeguard, therapist or
// barista who works in the room, walks in with an intro line, can be
// trained like the named staff, and makes that room's machines earn more.
// Pure: the server charges and applies it, the client shows the same
// numbers. The named cast (Marcus, Lisa, ...) is in `staff.ts`.
import { BONUS_PER_LEVEL, clampLevel } from "./staff.js"

export type HireRole = {
	role: string
	names: readonly string[]
	/** What they say on arrival, after "Hi, I'm <name>." */
	intro: string
}

/** One role per room type (the lobby and unfinished rooms hire nobody). */
export const HIRE_ROLES: Readonly<Record<string, HireRole>> = {
	cardio: {
		role: "Cardio coach",
		names: ["Nia", "Theo", "Ines", "Kofi"],
		intro: "Cardio is my thing. Please don't tell the treadmills.",
	},
	weights: {
		role: "Strength coach",
		names: ["Bruno", "Sasha", "Dana", "Rhys"],
		intro: "Form first, ego later. Mostly later.",
	},
	boxing: {
		role: "Boxing coach",
		names: ["Rocco", "Mina", "Dre", "Lena"],
		intro: "Hands up. Yes, those hands.",
	},
	pool: {
		role: "Lifeguard",
		names: ["Marlow", "Pia", "Jonah", "Tess"],
		intro: "No running. That includes you.",
	},
	recovery: {
		role: "Therapist",
		names: ["Ayla", "Cormac", "Noor", "Ben"],
		intro: "Stretch first. Complain second.",
	},
	court: {
		role: "Court coach",
		names: ["Kobe", "Maya", "Theo", "Zoe"],
		intro: "Pick a side. Winner buys the smoothies.",
	},
	juice: {
		role: "Barista",
		names: ["Poppy", "Iggy", "Suki", "Leo"],
		intro: "One green smoothie, coming up. Eventually.",
	},
}

export const HIRE = {
	/** Cost of the first hire; each hire already made adds `step`. */
	base: 300,
	step: 150,
	/** Most hires one room can have. */
	perRoom: 2,
	/** Coin bonus a hire gives its room's machines at level 1. */
	bonus: 0.05,
} as const

export function canHireIn(roomType: string): boolean {
	return roomType in HIRE_ROLES
}

/** Coins for the next hire when `hired` have been made in the gym. */
export function hireCost(hired: number): number {
	return HIRE.base + HIRE.step * Math.max(0, hired)
}

/** A hire's name: the room type's list, in turn (`n` = hires made so far). */
export function hireName(roomType: string, n: number): string {
	const names = HIRE_ROLES[roomType]?.names ?? ["Sam"]
	return names[Math.max(0, n) % names.length]
}

export function hireIntro(roomType: string, name: string): string {
	return `Hi, I'm ${name}. ${HIRE_ROLES[roomType]?.intro ?? ""}`.trim()
}

/** The coin bonus (0.08 = +8%) a hire at `level` gives their room. */
export function hireBonus(level: number): number {
	return HIRE.bonus + (clampLevel(level) - 1) * BONUS_PER_LEVEL
}

/** Where the `index`th hire of a room stands: the corridor between the
 * rows of spots, left then right, relative to the room's first plot
 * corner (world units). */
export function hirePost(
	index: number,
	plot: { px: number; pz: number },
	pw: number,
	pd: number,
): { x: number; z: number } {
	return {
		x: plot.px * pw + (index % 2 === 0 ? 1.5 : 7.5),
		z: plot.pz * pd + 3,
	}
}

/** Staffed rooms' flavour (#130): a recovery room with at least one hire
 * lifts the mood of everyone in the gym by this much, live (not stored). */
export const RECOVERY_MOOD = 8

/** A juice room with a barista adds this to the Slim Kitchen's coin rate
 * (the barista's customers tip). */
export const JUICE_TIPS = 0.12

/** The kitchen's extra rate from the staffed room types (see JUICE_TIPS). */
export function kitchenTips(staffedTypes: readonly string[]): number {
	return staffedTypes.includes("juice") ? JUICE_TIPS : 0
}

/** Rooms whose own machines earn more once the room has a hire (#130):
 * Boxing's sparring purses and the Court's pickup-game fees. */
export const STAFFED_RATE: Readonly<Record<string, number>> = {
	boxing: 0.1,
	court: 0.1,
}

/** The extra rate a staffed room of `roomType` gives its machines. */
export function staffedRate(roomType: string): number {
	return STAFFED_RATE[roomType] ?? 0
}

/** The extra a staffed room type brings besides coins, for the Staff page. */
export const STAFFED_PERK: Readonly<Record<string, string>> = {
	recovery: `Lifts everyone's mood by ${RECOVERY_MOOD}`,
	juice: `Tips: the Slim Kitchen earns ${Math.round(JUICE_TIPS * 100)}% more`,
	boxing: `Sparring purses: this room's machines earn ${Math.round(STAFFED_RATE.boxing * 100)}% more`,
	court: `Pickup-game fees: this room's machines earn ${Math.round(STAFFED_RATE.court * 100)}% more`,
}

/** The tag over a staffed room whose members are at it together (#130):
 * sparring in boxing, a pickup game on the court; null for the rest. */
export function roomPlayLabel(roomType: string): string | null {
	if (roomType === "boxing") return "🥊 Sparring"
	if (roomType === "court") return "🏀 Pickup game"
	return null
}

/** How many members at their stations make it a game. */
export const ROOM_PLAY_MIN = 2

/** Members in a room with a game on work out a little livelier (on top of
 * the room's vibe pace). */
export const PLAY_PACE = 1.25

/** The mood bonus for the room types that have a hire (see RECOVERY_MOOD). */
export function staffedMoodBonus(staffedTypes: readonly string[]): number {
	return staffedTypes.includes("recovery") ? RECOVERY_MOOD : 0
}
