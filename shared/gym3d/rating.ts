// The gym's star rating (1..5) and the rolling goals. Pure: the server
// pays goals and sends the rating, the client shows the same numbers.
//
// The rating is a score from what the layout holds:
// - room levels: every finished equipment room scores its level (1..5);
// - variety: 1 per different room type;
// - decor: 0.5 per placed decor piece, up to 6 pieces;
// - staff: 1 per different placed staff piece;
// - big rooms: 2 for every room that spans two or more plots;
// - open walls: 1 for every wall opened between two rooms, up to 4.
import type { GymLayoutPieceDto, GymLayoutRoomDto } from "../types.js"

export type RatingInput = {
	rooms: readonly Pick<
		GymLayoutRoomDto,
		"type" | "level" | "building" | "cells"
	>[]
	pieces: readonly Pick<
		GymLayoutPieceDto,
		"kind" | "itemKey" | "tier" | "status"
	>[]
	/** Walls opened between rooms (none when left out). */
	openWalls?: number
}

export const RATING = {
	/** Score needed for stars 1..5 (the first star is free). */
	thresholds: [0, 6, 14, 24, 38] as readonly number[],
	maxStars: 5,
	decorPoints: 0.5,
	decorCap: 6,
	staffPoints: 1,
	varietyPoints: 1,
	bigRoomPoints: 2,
	openWallPoints: 1,
	openWallCap: 4,
} as const

export type Rating = {
	score: number
	stars: number
	/** Score of the next star, null at five stars. */
	next: number | null
	/** Progress from this star's threshold to the next, 0..1. */
	k: number
	parts: {
		levels: number
		variety: number
		decor: number
		staff: number
		bigRooms: number
		openWalls: number
	}
}

function isEquipmentRoom(r: RatingInput["rooms"][number]): boolean {
	return r.type !== "lobby" && r.type !== "empty" && !r.building
}

export function gymScore(input: RatingInput): Rating["parts"] & {
	total: number
} {
	const rooms = input.rooms.filter(isEquipmentRoom)
	const levels = rooms.reduce((a, r) => a + Math.max(1, r.level), 0)
	const variety = new Set(rooms.map((r) => r.type)).size * RATING.varietyPoints
	const placed = input.pieces.filter((p) => p.status === "placed")
	const decor =
		Math.min(RATING.decorCap, placed.filter((p) => p.kind === "decor").length) *
		RATING.decorPoints
	const staff =
		new Set(
			placed
				.filter((p) => p.kind === "equipment" && p.itemKey.startsWith("staff_"))
				.map((p) => p.itemKey),
		).size * RATING.staffPoints
	const bigRooms =
		rooms.filter((r) => r.cells.length >= 2).length * RATING.bigRoomPoints
	const openWalls =
		Math.min(RATING.openWallCap, Math.max(0, input.openWalls ?? 0)) *
		RATING.openWallPoints
	return {
		levels,
		variety,
		decor,
		staff,
		bigRooms,
		openWalls,
		total: levels + variety + decor + staff + bigRooms + openWalls,
	}
}

export function starsFromScore(score: number): number {
	let stars = 1
	RATING.thresholds.forEach((t, i) => {
		if (score >= t) stars = i + 1
	})
	return Math.min(RATING.maxStars, stars)
}

export function ratingOf(input: RatingInput): Rating {
	const { total, ...parts } = gymScore(input)
	const stars = starsFromScore(total)
	const prev = RATING.thresholds[stars - 1] ?? 0
	const next = RATING.thresholds[stars] ?? null
	return {
		score: total,
		stars,
		next,
		k:
			next == null
				? 1
				: Math.max(0, Math.min(1, (total - prev) / Math.max(1, next - prev))),
		parts,
	}
}
