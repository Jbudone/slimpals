// Walk grid (half-unit cells; walls block cell edges, pieces block cells)
// and A* on a binary heap, ported from the build lab.
import { CELL, PD, PW } from "../../../../shared/gym3d/rooms"

/** Depth of the walkable apron in front of the gym. */
export const APRON = 3.5

export type WallSeg = {
	vert: boolean
	/** Fixed coordinate (x for vertical walls, z for horizontal ones). */
	c: number
	a0: number
	a1: number
	h: number
}

export type NavSource = {
	cols: number
	frontZ: number
	isOwned(px: number, pz: number): boolean
	roomAt(x: number, z: number): number | null
	blockers(): { x: number; z: number; s: number }[]
	walls(): WallSeg[]
}

export type Grid = {
	nx: number
	nz: number
	walk: Uint8Array
	ve: Uint8Array
	he: Uint8Array
}

export type PathPt = [number, number]

const DIRS: readonly (readonly [number, number, number])[] = [
	[1, 0, 1],
	[-1, 0, 1],
	[0, 1, 1],
	[0, -1, 1],
	[1, 1, Math.SQRT2],
	[1, -1, Math.SQRT2],
	[-1, 1, Math.SQRT2],
	[-1, -1, Math.SQRT2],
]

export function buildGrid(src: NavSource): Grid {
	const nx = Math.round((src.cols * PW) / CELL)
	const nz = Math.round((src.frontZ + APRON) / CELL)
	const walk = new Uint8Array(nx * nz)
	for (let j = 0; j < nz; j++) {
		const z = (j + 0.5) * CELL
		for (let i = 0; i < nx; i++) {
			const x = (i + 0.5) * CELL
			const ok =
				z > src.frontZ || src.isOwned(Math.floor(x / PW), Math.floor(z / PD))
			walk[j * nx + i] = ok ? 1 : 0
		}
	}
	for (const b of src.blockers()) {
		const h = b.s / 2
		const i0 = Math.max(0, Math.floor((b.x - h) / CELL - 0.5) + 1)
		const i1 = Math.min(nx - 1, Math.ceil((b.x + h) / CELL - 0.5) - 1)
		const j0 = Math.max(0, Math.floor((b.z - h) / CELL - 0.5) + 1)
		const j1 = Math.min(nz - 1, Math.ceil((b.z + h) / CELL - 0.5) - 1)
		for (let j = j0; j <= j1; j++)
			for (let i = i0; i <= i1; i++) walk[j * nx + i] = 0
	}
	const ve = new Uint8Array((nx + 1) * nz)
	const he = new Uint8Array(nx * (nz + 1))
	for (const s of src.walls()) {
		if (s.vert) {
			const bi = Math.round(s.c / CELL)
			if (bi < 0 || bi > nx) continue
			for (let j = 0; j < nz; j++) {
				const zc = (j + 0.5) * CELL
				if (zc > s.a0 && zc < s.a1) ve[j * (nx + 1) + bi] = 1
			}
		} else {
			const bj = Math.round(s.c / CELL)
			if (bj < 0 || bj > nz) continue
			for (let i = 0; i < nx; i++) {
				const xc = (i + 0.5) * CELL
				if (xc > s.a0 && xc < s.a1) he[bj * nx + i] = 1
			}
		}
	}
	return { nx, nz, walk, ve, he }
}

export function canStep(
	G: Grid,
	i: number,
	j: number,
	di: number,
	dj: number,
): boolean {
	const ni = i + di
	const nj = j + dj
	if (ni < 0 || nj < 0 || ni >= G.nx || nj >= G.nz || !G.walk[nj * G.nx + ni])
		return false
	if (di && dj)
		return (
			canStep(G, i, j, di, 0) &&
			canStep(G, i + di, j, 0, dj) &&
			canStep(G, i, j, 0, dj) &&
			canStep(G, i, j + dj, di, 0)
		)
	if (di) return !G.ve[j * (G.nx + 1) + (di > 0 ? i + 1 : i)]
	return !G.he[(dj > 0 ? j + 1 : j) * G.nx + i]
}

export function nearestWalk(G: Grid, x: number, z: number): number {
	let best = -1
	let bd = 1e9
	const ci = Math.floor(x / CELL)
	const cj = Math.floor(z / CELL)
	for (let j = Math.max(0, cj - 6); j <= Math.min(G.nz - 1, cj + 6); j++)
		for (let i = Math.max(0, ci - 6); i <= Math.min(G.nx - 1, ci + 6); i++) {
			if (!G.walk[j * G.nx + i]) continue
			const d = Math.hypot((i + 0.5) * CELL - x, (j + 0.5) * CELL - z)
			if (d < bd) {
				bd = d
				best = j * G.nx + i
			}
		}
	return best
}

export class PathFinder {
	private G: Grid | null = null
	private n = 0
	private dist = new Float32Array(0)
	private prev = new Int32Array(0)
	private closed = new Uint8Array(0)
	private hk = new Float32Array(4096)
	private hv = new Int32Array(4096)
	private hn = 0

	constructor(private src: NavSource) {}

	/** Rebuild the grid on next use (pieces or walls changed). */
	invalidate(): void {
		this.G = null
	}

	grid(): Grid {
		if (!this.G) this.G = buildGrid(this.src)
		return this.G
	}

	private hpush(k: number, v: number): void {
		if (this.hn >= this.hk.length) {
			const a = new Float32Array(this.hk.length * 2)
			const b = new Int32Array(this.hk.length * 2)
			a.set(this.hk)
			b.set(this.hv)
			this.hk = a
			this.hv = b
		}
		const K = this.hk
		const V = this.hv
		let i = this.hn++
		while (i > 0) {
			const p = (i - 1) >> 1
			if (K[p] <= k) break
			K[i] = K[p]
			V[i] = V[p]
			i = p
		}
		K[i] = k
		V[i] = v
	}

	private hpop(): number {
		const K = this.hk
		const V = this.hv
		const top = V[0]
		const n = --this.hn
		const k = K[n]
		const v = V[n]
		let i = 0
		for (;;) {
			let c = 2 * i + 1
			if (c >= n) break
			if (c + 1 < n && K[c + 1] < K[c]) c++
			if (K[c] >= k) break
			K[i] = K[c]
			V[i] = V[c]
			i = c
		}
		K[i] = k
		V[i] = v
		return top
	}

	/** Path of waypoints from (sx, sz) toward (tx, tz); null when the best
	 * reachable cell is farther than maxEnd from the target. */
	findPath(
		sx: number,
		sz: number,
		tx: number,
		tz: number,
		maxEnd = 2.4,
	): PathPt[] | null {
		const G = this.grid()
		const nx = G.nx
		const N = nx * G.nz
		const src = this.src
		let s = Math.floor(sz / CELL) * nx + Math.floor(sx / CELL)
		if (
			sx < 0 ||
			sz < 0 ||
			sx >= src.cols * PW ||
			sz >= src.frontZ + APRON ||
			!G.walk[s]
		)
			s = nearestWalk(G, sx, sz)
		if (s < 0) return null
		if (this.n !== N) {
			this.n = N
			this.dist = new Float32Array(N)
			this.prev = new Int32Array(N)
			this.closed = new Uint8Array(N)
		}
		const dist = this.dist
		const prev = this.prev
		const closed = this.closed
		dist.fill(1e9)
		prev.fill(-1)
		closed.fill(0)
		this.hn = 0
		const tRoom = tz < src.frontZ ? src.roomAt(tx, tz) : null
		const score = (c: number) => {
			const x = ((c % nx) + 0.5) * CELL
			const z = (((c / nx) | 0) + 0.5) * CELL
			let d = Math.hypot(x - tx, z - tz)
			if (tRoom != null && z < src.frontZ && src.roomAt(x, z) !== tRoom) d += 6
			return d
		}
		const h = (c: number) =>
			Math.hypot(
				((c % nx) + 0.5) * CELL - tx,
				(((c / nx) | 0) + 0.5) * CELL - tz,
			) / CELL
		dist[s] = 0
		this.hpush(h(s), s)
		let best = s
		let bs = 1e9
		while (this.hn) {
			const c = this.hpop()
			if (closed[c]) continue
			closed[c] = 1
			const d = dist[c]
			const sc0 = score(c)
			const sc = sc0 + d * 0.02
			if (sc < bs) {
				bs = sc
				best = c
			}
			if (sc0 < CELL * 0.72) break
			const i = c % nx
			const j = (c / nx) | 0
			for (const [di, dj, cost] of DIRS) {
				if (!canStep(G, i, j, di, dj)) continue
				const n = (j + dj) * nx + i + di
				if (closed[n]) continue
				const nd = d + cost
				if (nd < dist[n]) {
					dist[n] = nd
					prev[n] = c
					this.hpush(nd + h(n), n)
				}
			}
		}
		this.hn = 0
		if (score(best) > maxEnd) return null
		const cells: number[] = []
		for (let c = best; c >= 0; c = prev[c]) cells.unshift(c)
		const pts: PathPt[] = []
		cells.forEach((c, k) => {
			if (k > 0 && k < cells.length - 1) {
				const a = cells[k - 1]
				const b = cells[k + 1]
				if (c - a === b - c) return
			}
			pts.push([((c % nx) + 0.5) * CELL, (Math.floor(c / nx) + 0.5) * CELL])
		})
		if (pts.length) pts.shift()
		pts.push([tx, tz])
		return pts
	}
}
