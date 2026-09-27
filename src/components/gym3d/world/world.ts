// The static 3D gym built from a GET /api/gym/layout response: ground and
// entrance, floors and walls per room, room badges, and every placed piece
// with its stations. Ported from the build lab's world/walls/pieces code,
// minus everything slice 1 leaves out (street, lots, building, coins).
import * as T from "three"
import {
	DOOR_HALF,
	isRoomType,
	itemSize,
	LOBBY_CELL,
	PD,
	PW,
	RT,
	roomName,
	WORLD_ROWS,
} from "../../../../shared/gym3d/rooms"
import type { GymLayoutDto } from "../../../../shared/types"
import type { AssetCache } from "../engine/assets"
import {
	batchMesh,
	boxGeo,
	C,
	canvasTex,
	cylGeo,
	eqGeo,
	hashString,
	mulberry32,
	type Part,
	pBox,
	pGeo,
	type Rng,
	shade,
	texPlane,
} from "../engine/helpers"
import { EQUIP } from "../equipment/builders"
import { DECOR } from "../equipment/decor"
import { applyTier, bakePiece } from "../equipment/tiers"
import { APRON, type NavSource, PathFinder, type WallSeg } from "./paths"
import { bindWorld, type WorldCtx } from "./state"
import type { Piece, Station } from "./types"

const H_BACK = 2.6
const H_IN = 0.95
const H_FRONT = 0.45

export type RoomView = {
	id: number
	type: string
	name: string
	level: number
	cells: { px: number; pz: number }[]
	x0: number
	z0: number
	cx: number
	cz: number
	paint: { wall: string; floorStyle: string; floorColor: string }
}

export type PickInfo =
	| { kind: "piece"; piece: Piece }
	| { kind: "person"; key: string }

const pkey = (px: number, pz: number) => `${px},${pz}`

// ── floors ───────────────────────────────────────────────────────────────────

function floorCanvas(style: string, col: string, rng: Rng): HTMLCanvasElement {
	const cv = document.createElement("canvas")
	cv.width = 256
	cv.height = 256
	const g = cv.getContext("2d")
	if (!g) return cv
	const w = 256
	const h = 256
	const a = col
	const b = shade(col, -0.045)
	const dk = shade(col, -0.14)
	const lt = shade(col, 0.08)
	if (style === "checker") {
		const n = 4
		for (let y = 0; y < n; y++)
			for (let x = 0; x < n; x++) {
				g.fillStyle = (x + y) % 2 ? a : b
				g.fillRect((x * w) / n, (y * h) / n, w / n, h / n)
			}
		g.strokeStyle = "rgba(120,80,60,.16)"
		g.lineWidth = 2
		for (let i = 0; i <= n; i++) {
			g.beginPath()
			g.moveTo((i * w) / n, 0)
			g.lineTo((i * w) / n, h)
			g.stroke()
			g.beginPath()
			g.moveTo(0, (i * h) / n)
			g.lineTo(w, (i * h) / n)
			g.stroke()
		}
	} else if (style === "wood") {
		const n = 8
		for (let i = 0; i < n; i++) {
			g.fillStyle = [a, b, lt, a, shade(col, -0.02)][i % 5]
			g.fillRect(0, (i * h) / n, w, h / n)
			g.fillStyle = "rgba(80,40,20,.18)"
			g.fillRect(0, (i * h) / n, w, 2)
			const off = (i * 97) % 256
			g.fillRect(off, (i * h) / n, 2, h / n)
			g.fillRect((off + 128) % 256, (i * h) / n, 2, h / n)
		}
	} else if (style === "rubber") {
		g.fillStyle = a
		g.fillRect(0, 0, w, h)
		for (let i = 0; i < 500; i++) {
			g.fillStyle = rng() < 0.5 ? lt : dk
			g.fillRect(rng() * w, rng() * h, 2, 2)
		}
		g.strokeStyle = "rgba(0,0,0,.18)"
		g.lineWidth = 2
		g.strokeRect(1, 1, w - 2, h - 2)
	} else if (style === "tile") {
		const n = 8
		g.fillStyle = lt
		g.fillRect(0, 0, w, h)
		for (let y = 0; y < n; y++)
			for (let x = 0; x < n; x++) {
				g.fillStyle = (x * 3 + y * 5) % 7 === 0 ? b : a
				g.fillRect((x * w) / n + 2, (y * h) / n + 2, w / n - 4, h / n - 4)
			}
	} else if (style === "terrazzo") {
		g.fillStyle = a
		g.fillRect(0, 0, w, h)
		const cs = ["#e8743b", "#3aa89a", "#9b6bc4", "#f2c14a", "#ffffff", dk]
		for (let i = 0; i < 160; i++) {
			g.fillStyle = cs[i % cs.length]
			g.beginPath()
			const x = rng() * w
			const y = rng() * h
			const r = 2 + rng() * 4
			g.moveTo(x, y - r)
			g.lineTo(x + r, y + r * 0.4)
			g.lineTo(x - r * 0.6, y + r)
			g.fill()
		}
	} else {
		g.fillStyle = a
		g.fillRect(0, 0, w, h)
		for (let i = 0; i < 900; i++) {
			g.fillStyle = `rgba(${rng() < 0.5 ? "255,255,255" : "60,50,40"},${rng() * 0.12})`
			g.fillRect(rng() * w, rng() * h, 3, 3)
		}
		g.strokeStyle = "rgba(60,50,40,.18)"
		g.lineWidth = 2
		g.strokeRect(1, 1, w - 2, h - 2)
	}
	return cv
}

// ── the world ────────────────────────────────────────────────────────────────

export class GymWorld implements NavSource {
	readonly ctx: WorldCtx
	readonly scene: T.Scene
	readonly sun: T.DirectionalLight
	readonly cols: number
	readonly rows = WORLD_ROWS
	readonly frontZ: number
	readonly doorX: number
	readonly lobby: { x0: number; z0: number }
	readonly rooms: RoomView[] = []
	readonly pieces: Piece[] = []
	readonly stations: Station[] = []
	readonly paths: PathFinder
	/** Invisible pick proxies (pieces; people add their own). */
	readonly pickables: T.Object3D[] = []
	private plotRoom = new Map<string, number>()
	private wallSegs: WallSeg[] = []
	private flags: { mesh: T.Object3D; id: number }[] = []

	constructor(
		readonly layout: GymLayoutDto,
		assets: AssetCache,
	) {
		this.scene = new T.Scene()
		this.ctx = {
			scene: this.scene,
			assets,
			time: { t: 0 },
			stations: null,
			ticks: null,
			belts: [],
			wheels: [],
			rng: mulberry32(hashString(`gym:${layout.gymId}`)),
		}
		bindWorld(this.ctx)
		const maxPx = layout.plots.reduce(
			(m, p) => Math.max(m, p.px),
			LOBBY_CELL.px,
		)
		this.cols = Math.max(3, maxPx + 1)
		this.frontZ = this.rows * PD
		this.lobby = { x0: LOBBY_CELL.px * PW, z0: LOBBY_CELL.pz * PD }
		this.doorX = this.lobby.x0 + PW / 2
		for (const p of layout.plots)
			if (p.roomId != null && p.state === "owned")
				this.plotRoom.set(pkey(p.px, p.pz), p.roomId)
		for (const r of layout.rooms) {
			if (!r.cells.length) continue
			const x0 = Math.min(...r.cells.map((c) => c.px * PW))
			const z0 = Math.min(...r.cells.map((c) => c.pz * PD))
			const cx =
				r.cells.reduce((a, c) => a + c.px * PW + PW / 2, 0) / r.cells.length
			const cz =
				r.cells.reduce((a, c) => a + c.pz * PD + PD / 2, 0) / r.cells.length
			this.rooms.push({
				id: r.id,
				type: r.type,
				name:
					isRoomType(r.type) && r.type !== "lobby"
						? RT[r.type].name
						: roomName(r.type),
				level: r.level,
				cells: r.cells,
				x0,
				z0,
				cx,
				cz,
				paint: r.paint,
			})
		}
		this.paths = new PathFinder(this)

		this.scene.add(new T.HemisphereLight(0xfff4ea, 0xb07a6a, 0.72 * Math.PI))
		const sun = new T.DirectionalLight(0xffffff, 0.62 * Math.PI)
		sun.shadow.mapSize.set(2048, 2048)
		const sc = sun.shadow.camera
		const cx = (this.cols * PW) / 2
		const cz = (this.rows * PD) / 2 + 3
		const R = Math.hypot(this.cols * PW, this.rows * PD + 14) * 0.56
		sc.left = -R
		sc.right = R
		sc.top = R
		sc.bottom = -R
		sc.near = 1
		sc.far = 160
		sun.shadow.bias = -0.0006
		sun.position.set(cx - 26, 36, cz + 3)
		sun.target.position.set(cx, 0, cz)
		this.scene.add(sun, sun.target)
		this.sun = sun

		this.buildGround()
		this.buildFloors()
		this.buildWalls()
		for (const p of layout.pieces) this.addPiece(p)
	}

	/** Where the camera should look to frame the whole gym. */
	get view(): { x: number; z: number } {
		return { x: (this.cols * PW) / 2, z: (this.rows * PD) / 2 + 1.5 }
	}

	// NavSource
	isOwned(px: number, pz: number): boolean {
		return this.plotRoom.has(pkey(px, pz))
	}
	roomAt(x: number, z: number): number | null {
		return (
			this.plotRoom.get(pkey(Math.floor(x / PW), Math.floor(z / PD))) ?? null
		)
	}
	blockers(): { x: number; z: number; s: number }[] {
		return this.pieces.map((p) => ({ x: p.x, z: p.z, s: p.size }))
	}
	walls(): WallSeg[] {
		return this.wallSegs
	}

	private buildGround(): void {
		const fz = this.frontZ
		const X0 = -30
		const X1 = this.cols * PW + 30
		const L = X1 - X0
		const mx = (X0 + X1) / 2
		const parts: Part[] = []
		pBox(parts, L, 0.2, 90, C.ground, mx, -0.2, fz / 2 - 10)
		pBox(parts, L, 0.06, APRON, C.walk, mx, -0.07, fz + APRON / 2)
		pBox(parts, L, 0.1, 0.18, "#e8a88f", mx, -0.02, fz + APRON - 0.09)
		pBox(parts, L, 0.05, 30, "#d9867a", mx, -0.12, fz + APRON + 15)
		const tree = (x: number, z: number, s: number) => {
			pGeo(parts, cylGeo(0.12 * s, 1.0 * s, 6), C.woodD, x, 0.5 * s, z)
			pGeo(
				parts,
				eqGeo("treeTop", () => new T.IcosahedronGeometry(0.8, 0)),
				C.leaf,
				x,
				1.4 * s,
				z,
				0,
				0,
				0,
				s,
			)
			pGeo(
				parts,
				eqGeo("treeTop2", () => new T.IcosahedronGeometry(0.55, 0)),
				C.leafD,
				x + 0.3 * s,
				1.85 * s,
				z + 0.1,
				0,
				0,
				0,
				s,
			)
		}
		for (let x = 3; x < this.cols * PW; x += 7.5)
			tree(
				x + Math.sin(x) * 1.5,
				-2.2 - Math.abs(Math.cos(x)) * 1.5,
				1 + Math.abs(Math.sin(x * 1.7)) * 0.4,
			)
		// street lamps along the curb
		for (let x = 4.5; x < this.cols * PW; x += 9) {
			const z = fz + APRON - 0.35
			pGeo(parts, cylGeo(0.07, 3.2, 6), "#4a4050", x, 1.6, z)
			pBox(parts, 0.08, 0.08, 0.9, "#4a4050", x, 3.15, z + 0.4)
			pBox(parts, 0.34, 0.14, 0.44, "#4a4050", x, 3.1, z + 0.8)
			pBox(parts, 0.26, 0.05, 0.34, "#fff1b8", x, 3.02, z + 0.8)
			pGeo(parts, cylGeo(0.16, 0.12, 8), "#4a4050", x, 0.06, z)
		}
		const g = batchMesh(parts)
		g.castShadow = false
		// entrance canopy with the SLIMPALS sign
		const cp = new T.Group()
		cp.position.set(this.doorX, 0, fz + 0.9)
		this.scene.add(cp)
		const cpp: Part[] = []
		pBox(cpp, 2.4, 0.12, 1.4, "#c85a3c", 0, 1.9, 0)
		pBox(cpp, 0.1, 1.9, 0.1, C.cream, -1.1, 0.95, 0.6)
		pBox(cpp, 0.1, 1.9, 0.1, C.cream, 1.1, 0.95, 0.6)
		pBox(cpp, 2.3, 0.62, 0.1, "#c85a3c", 0, 2.3, 0.14)
		pBox(cpp, 1.6, 0.02, 0.9, "#e8743b", 0, 0.01, -0.4)
		batchMesh(cpp, cp)
		const sign = canvasTex(
			512,
			128,
			(c, w, h) => {
				c.fillStyle = "#e8743b"
				c.fillRect(0, 0, w, h)
				c.fillStyle = "#fff7ea"
				c.font = '800 78px "Arial Black", "Arial Rounded MT Bold", sans-serif'
				c.textAlign = "center"
				c.textBaseline = "middle"
				c.fillText("SLIMPALS", w / 2, h / 2 + 6)
			},
			"signTex",
		)
		texPlane(2.2, 0.55, sign, 0, 2.3, 0.2, 0, cp)
	}

	private buildFloors(): void {
		const a = this.ctx.assets
		for (const r of this.rooms) {
			const mat = a.mat(
				`floor_${r.paint.floorStyle}${r.paint.floorColor}`,
				() => {
					const t = a.track(
						new T.CanvasTexture(
							floorCanvas(r.paint.floorStyle, r.paint.floorColor, this.ctx.rng),
						),
					)
					t.wrapS = T.RepeatWrapping
					t.wrapT = T.RepeatWrapping
					t.anisotropy = 4
					return new T.MeshStandardMaterial({
						map: t,
						roughness: r.paint.floorStyle === "tile" ? 0.6 : 1,
					})
				},
			)
			for (const c of r.cells) {
				const x0 = c.px * PW
				const z0 = c.pz * PD
				const geo = a.geo(`floor${c.px}_${c.pz}`, () => {
					const g = new T.BoxGeometry(PW, 0.12, PD)
					const pos = g.attributes.position
					const uv = g.attributes.uv
					for (let i = 0; i < pos.count; i++)
						uv.setXY(
							i,
							(x0 + PW / 2 + pos.getX(i)) / 2,
							-(z0 + PD / 2 + pos.getZ(i)) / 2,
						)
					uv.needsUpdate = true
					return g
				})
				const f = new T.Mesh(geo, mat)
				f.position.set(x0 + PW / 2, -0.06, z0 + PD / 2)
				f.receiveShadow = true
				f.matrixAutoUpdate = false
				f.updateMatrix()
				this.scene.add(f)
			}
		}
	}

	private buildWalls(): void {
		type Seg = WallSeg & { gaps: [number, number][]; color: string }
		const segs: Seg[] = []
		for (const r of this.rooms) {
			for (const P of r.cells) {
				const x0 = P.px * PW
				const z0 = P.pz * PD
				const edges: [
					number,
					number,
					boolean,
					number,
					number,
					number,
					boolean,
				][] = [
					[-1, 0, true, x0, z0, z0 + PD, true],
					[1, 0, true, x0 + PW, z0, z0 + PD, false],
					[0, -1, false, z0, x0, x0 + PW, true],
					[0, 1, false, z0 + PD, x0, x0 + PW, false],
				]
				for (const [dx, dz, vert, c, a0, a1, low] of edges) {
					const nb = this.plotRoom.get(pkey(P.px + dx, P.pz + dz))
					const mid = (a0 + a1) / 2
					if (nb != null) {
						if (nb === r.id || !low) continue
						segs.push({
							vert,
							c,
							a0,
							a1,
							h: H_IN,
							gaps: [[mid - DOOR_HALF, mid + DOOR_HALF]],
							color: r.paint.wall,
						})
					} else {
						const gaps: [number, number][] = []
						if (
							!vert &&
							!low &&
							Math.abs(c - this.frontZ) < 1e-6 &&
							this.doorX + 1 > a0 &&
							this.doorX - 1 < a1
						)
							gaps.push([this.doorX - DOOR_HALF, this.doorX + DOOR_HALF])
						segs.push({
							vert,
							c,
							a0,
							a1,
							h: low ? H_BACK : H_FRONT,
							gaps,
							color: r.paint.wall,
						})
					}
				}
			}
		}
		const out: Seg[] = []
		for (const s of segs) {
			let st = s.a0
			for (const g of s.gaps.sort((a, b) => a[0] - b[0])) {
				if (g[0] > st) out.push({ ...s, a0: st, a1: g[0] })
				st = Math.max(st, g[1])
			}
			if (st < s.a1) out.push({ ...s, a0: st, a1: s.a1 })
		}
		this.wallSegs = out
		const parts: Part[] = []
		for (const s of out) {
			const L = s.a1 - s.a0
			const mid = (s.a0 + s.a1) / 2
			const th = 0.24
			const h = s.h
			const X = s.vert ? s.c : mid
			const Z = s.vert ? mid : s.c
			pBox(parts, s.vert ? th : L, h, s.vert ? L : th, s.color, X, h / 2, Z)
			pBox(
				parts,
				s.vert ? th + 0.06 : L + 0.02,
				0.1,
				s.vert ? L + 0.02 : th + 0.06,
				C.wallTop,
				X,
				h + 0.05,
				Z,
			)
			pBox(
				parts,
				s.vert ? th + 0.02 : L + 0.01,
				0.16,
				s.vert ? L + 0.01 : th + 0.02,
				C.wallOut,
				X,
				0.08,
				Z,
			)
			if (h > 2)
				pBox(
					parts,
					s.vert ? 0.02 : L,
					0.14,
					s.vert ? L : 0.02,
					C.trim,
					X + (s.vert ? 0.13 : 0),
					1.05,
					Z + (s.vert ? 0 : 0.13),
				)
		}
		if (parts.length) batchMesh(parts)
		this.paths.invalidate()
	}

	private addPiece(d: GymLayoutDto["pieces"][number]): Piece | null {
		const build = d.kind === "decor" ? DECOR[d.itemKey] : EQUIP[d.itemKey]
		if (!build) return null
		const c = this.ctx
		const stations: Station[] = []
		const ticks: Piece["ticks"] = []
		c.stations = stations
		c.ticks = ticks
		const prevRng = c.rng
		c.rng = mulberry32(hashString(`${d.id}:${d.itemKey}`))
		let g: T.Group
		try {
			g = build()
		} finally {
			c.stations = null
			c.ticks = null
			c.rng = prevRng
		}
		const root = new T.Group()
		this.scene.add(root)
		root.add(g)
		const size = itemSize(d.itemKey, d.kind)
		const hit = new T.Mesh(
			boxGeo(
				Math.max(0.6, size * 0.9),
				d.kind === "decor" ? 1.2 : 1.1,
				Math.max(0.6, size * 0.9),
			),
			c.assets.HIT,
		)
		hit.position.y = d.kind === "decor" ? 0.6 : 0.55
		root.add(hit)
		const p: Piece = {
			id: d.id,
			itemKey: d.itemKey,
			kind: d.kind,
			upgradeKey: d.upgradeKey,
			name: d.name,
			size,
			tier: d.tier,
			x: d.x,
			z: d.z,
			rot: d.rot,
			roomId: d.roomId,
			locked: d.locked,
			root,
			inner: g,
			hit,
			ticks,
			stations: stations.filter((s) => !s.skip),
		}
		const info: PickInfo = { kind: "piece", piece: p }
		hit.userData.pick = info
		this.pickables.push(hit)
		root.position.set(p.x, 0, p.z)
		root.rotation.y = (p.rot * Math.PI) / 2
		root.updateMatrixWorld(true)
		for (const st of p.stations) {
			st.lx = st.x
			st.lz = st.z
			st.lface = st.face
			st.piece = p
			if (st.bar && !st.barRest) st.barRest = st.bar.position.clone()
			const v = root.localToWorld(new T.Vector3(st.lx, 0, st.lz))
			st.x = v.x
			st.z = v.z
			st.face = st.lface + root.rotation.y
			this.stations.push(st)
		}
		bakePiece(p)
		if (p.tier > 1) applyTier(p)
		this.pieces.push(p)
		if (p.deco) this.flags.push({ mesh: p.deco, id: p.id })
		this.paths.invalidate()
		return p
	}

	/** Free spots in the lobby where NPCs with nothing to do hang out. */
	lobbySpot(slot: number): { x: number; z: number; face: number } {
		const S: readonly [number, number][] = [
			[4.5, 2.2],
			[3.4, 3.2],
			[5.6, 3.4],
			[4.0, 4.4],
			[5.4, 4.7],
			[3.0, 2.0],
			[6.2, 4.6],
			[4.8, 1.2],
		]
		const [lx, lz] = S[slot % S.length]
		const x = this.lobby.x0 + lx + Math.floor(slot / S.length) * 0.4
		const z = this.lobby.z0 + lz
		return {
			x,
			z,
			face:
				Math.atan2(this.doorX - x, this.frontZ - z) +
				Math.PI * (slot % 2 ? 0.3 : -0.3),
		}
	}

	get spawn(): { x: number; z: number } {
		return { x: this.doorX, z: this.frontZ + 2.3 }
	}

	/** Belts, wheels, per-piece animations and tier pennants. */
	frame(dt: number, busyWheel: (st: Station) => boolean): void {
		const c = this.ctx
		c.time.t += dt
		const t = c.time.t
		for (const b of c.belts) {
			const ch = b.children
			for (let k = 0; k < ch.length; k++)
				ch[k].position.z = ((k * 0.27 + t * 1.6) % 1.62) - 0.72
		}
		for (const w of c.wheels) {
			const st = w.userData.st as Station | undefined
			if (st && busyWheel(st)) w.rotation.x += dt * 8
		}
		for (const p of this.pieces) for (const tk of p.ticks) tk(dt)
		for (const f of this.flags) {
			const fl = f.mesh.userData.flag as T.Object3D | undefined
			if (fl) fl.rotation.y = Math.sin(t * 3 + f.id) * 0.35
		}
	}

	/** Draw calls and triangle counts come from the renderer; this is what
	 * the world itself holds. */
	stats(): { rooms: number; pieces: number; stations: number } {
		return {
			rooms: this.rooms.length,
			pieces: this.pieces.length,
			stations: this.stations.length,
		}
	}
}
