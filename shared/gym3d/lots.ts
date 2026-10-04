// For Sale lots of the 3D gym (gym3d slice 2). The neighbourhood is split
// into a fixed set of lots like the Build Lab's (normal, wide, L, big). A lot
// whose cells are all free keeps its shape; one that is partly built splits
// into single plots. A lot is for sale when it touches a built plot (owned or
// under construction). Pure: the server validates purchases with it and the
// client draws the same lots.
import type { LotShape } from "./economy.js"
import { LOBBY_CELL, PD, type PlotCell, PW, WORLD_ROWS } from "./rooms.js"

/** Columns of plots in the neighbourhood (x = 0 .. 7 * PW). */
export const NEIGHBOURHOOD_COLS = 7

/** Extra columns that open at the east end once the Burger Baron is bought. */
export const BURGER_COLS = 2

/** The neighbourhood's width in plots (wider once the Baron is bought). */
export function neighbourhoodCols(burger = false): number {
	return NEIGHBOURHOOD_COLS + (burger ? BURGER_COLS : 0)
}

export type LotTemplate = { shape: LotShape; cells: readonly PlotCell[] }

const c = (px: number, pz: number): PlotCell => ({ px, pz })

/** Every cell except the lobby's belongs to exactly one template. The first
 * cell of each lot is where its room gets the full spot layout. */
export const LOT_TEMPLATES: readonly LotTemplate[] = [
	{ shape: "normal", cells: [c(1, 1)] },
	{ shape: "normal", cells: [c(0, 2)] },
	{ shape: "L", cells: [c(0, 0), c(1, 0), c(0, 1)] },
	{ shape: "big", cells: [c(2, 1), c(3, 1), c(2, 2), c(3, 2)] },
	{ shape: "wide", cells: [c(2, 0), c(3, 0)] },
	{ shape: "normal", cells: [c(4, 2)] },
	{ shape: "normal", cells: [c(4, 1)] },
	{ shape: "normal", cells: [c(4, 0)] },
	{ shape: "big", cells: [c(5, 1), c(6, 1), c(5, 2), c(6, 2)] },
	{ shape: "wide", cells: [c(5, 0), c(6, 0)] },
]

/** The Baron's old lot: two more lots past the east end, only once he is
 * bought (#131). Same rules as the rest: they are for sale next to a built
 * plot, and bought and built like any other. */
export const BURGER_LOT_TEMPLATES: readonly LotTemplate[] = [
	{ shape: "big", cells: [c(7, 1), c(8, 1), c(7, 2), c(8, 2)] },
	{ shape: "wide", cells: [c(7, 0), c(8, 0)] },
]

export type Lot = {
	/** Stable id: `${shape}:${px},${pz}` of the first cell. */
	id: string
	shape: LotShape
	cells: PlotCell[]
}

export const SHAPE_INFO: Readonly<
	Record<LotShape, { name: string; sub: string }>
> = {
	normal: { name: "Plot", sub: "One room, 9 × 6" },
	wide: { name: "Wide plot", sub: "A long 18 × 6 hall" },
	L: { name: "L-shaped plot", sub: "Three plots that wrap a corner" },
	big: { name: "Big plot", sub: "18 × 12, fits a Pool hall" },
}

const key = (p: PlotCell) => `${p.px},${p.pz}`

export function lotId(shape: LotShape, cells: readonly PlotCell[]): string {
	return `${shape}:${key(cells[0])}`
}

export function inNeighbourhood(p: PlotCell): boolean {
	return (
		p.px >= 0 && p.px < NEIGHBOURHOOD_COLS && p.pz >= 0 && p.pz < WORLD_ROWS
	)
}

/** Lots as they stand given the built cells: whole templates where every
 * cell is free, single plots for the free cells of partly built ones. */
export function currentLots(built: readonly PlotCell[], burger = false): Lot[] {
	const taken = new Set(built.map(key))
	taken.add(key(LOBBY_CELL))
	const out: Lot[] = []
	for (const t of burger
		? [...LOT_TEMPLATES, ...BURGER_LOT_TEMPLATES]
		: LOT_TEMPLATES) {
		const free = t.cells.filter((p) => !taken.has(key(p)))
		if (!free.length) continue
		if (free.length === t.cells.length)
			out.push({
				id: lotId(t.shape, t.cells),
				shape: t.shape,
				cells: t.cells.map((p) => ({ ...p })),
			})
		else
			for (const p of free)
				out.push({
					id: lotId("normal", [p]),
					shape: "normal",
					cells: [{ ...p }],
				})
	}
	return out
}

/** The lots that are for sale: those touching a built cell. */
export function lotsForSale(built: readonly PlotCell[], burger = false): Lot[] {
	const taken = new Set(built.map(key))
	taken.add(key(LOBBY_CELL))
	const touches = (p: PlotCell) =>
		[
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		].some(([dx, dz]) => taken.has(`${p.px + dx},${p.pz + dz}`))
	return currentLots(built, burger).filter((l) => l.cells.some(touches))
}

/** World-space bounding box of a set of cells. */
export function cellsBox(cells: readonly PlotCell[]): {
	x0: number
	z0: number
	x1: number
	z1: number
	w: number
	d: number
	cx: number
	cz: number
} {
	const x0 = Math.min(...cells.map((p) => p.px * PW))
	const z0 = Math.min(...cells.map((p) => p.pz * PD))
	const x1 = Math.max(...cells.map((p) => p.px * PW + PW))
	const z1 = Math.max(...cells.map((p) => p.pz * PD + PD))
	return {
		x0,
		z0,
		x1,
		z1,
		w: x1 - x0,
		d: z1 - z0,
		cx: (x0 + x1) / 2,
		cz: (z0 + z1) / 2,
	}
}

/** Where a lot's construction site stands: the whole lot for rectangles,
 * the row of the first cell for an L. */
export function siteBox(
	cells: readonly PlotCell[],
): ReturnType<typeof cellsBox> {
	const rect = cellsBox(cells).w * cellsBox(cells).d === cells.length * PW * PD
	return cellsBox(rect ? cells : cells.filter((p) => p.pz === cells[0].pz))
}
