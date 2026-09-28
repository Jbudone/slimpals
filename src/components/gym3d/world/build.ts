// The building layer of the 3D gym (gym3d slice 2), ported from the Build
// Lab's rooms + spots mode: For Sale lots (ground decal, ropes, price sign),
// glowing spots, construction sites (striped fence, cones, bricks,
// scaffold, hard-hat workers hammering, dust), walls rising with progress,
// the ribbon-cutting ceremony with confetti, and move / drag target marks.
// Built for phones: every static part of a lot or site is one merged mesh,
// spots are instanced per texture, dust and confetti are one instanced mesh
// each.
import * as T from "three"
import { cellsBox, SHAPE_INFO, siteBox } from "../../../../shared/gym3d/lots"
import {
	type EquipmentRoomType,
	PD,
	PW,
	RT,
	roomSpots,
} from "../../../../shared/gym3d/rooms"
import type { GymJobDto, GymLayoutDto } from "../../../../shared/types"
import {
	batchMesh,
	C,
	canvasTex,
	cylGeo,
	DISPLAY_FONT,
	eqGeo,
	fitText,
	hashString,
	mulberry32,
	type Part,
	pBox,
	pGeo,
} from "../engine/helpers"
import { seededOutfit } from "../people/outfits"
import { POSES } from "../people/poses"
import { disposeRig, makeRig, type Rig, resetPose, tmesh } from "../people/rig"
import { ctx } from "./state"
import type { GymWorld, PickInfo } from "./world"

const HOUR = 3_600_000

export type PadRef = {
	roomId: number
	spot: number
	x: number
	z: number
	size: number
	unlock: number
	open: boolean
	/** A piece sits on it (only move targets can be filled). */
	filled: boolean
}

type Worker = { rig: Rig; t: number; c: number }

type Site = {
	job: GymJobDto
	g: T.Group
	mesh: T.Mesh
	proxy: T.Mesh
	workers: Worker[]
	x: number
	z: number
	w: number
	d: number
	/** Where the timer bubble floats. */
	top: number
}

type Particle = {
	x: number
	y: number
	z: number
	vx: number
	vy: number
	vz: number
	rx: number
	ry: number
	sx: number
	sy: number
	s: number
	life: number
	max: number
}

const CONF = [
	"#e8743b",
	"#3aa89a",
	"#f2c14a",
	"#d4463a",
	"#4a78c8",
	"#9b6bc4",
	"#ffffff",
]

const fmt = (n: number) => Math.round(n).toLocaleString("en-US")

/** Job progress 0..1 at `now` (server clock). */
export function jobProgress(j: GymJobDto, now: number): number {
	if (j.status !== "active") return 1
	const s = Date.parse(j.startedAt)
	const e = Date.parse(j.endsAt)
	if (e <= s) return 1
	return Math.max(0, Math.min(1, (now - s) / (e - s)))
}

/** Remaining milliseconds of a job at `now` (server clock). */
export function jobLeft(j: GymJobDto, now: number): number {
	if (j.status !== "active") return 0
	return Math.max(0, Date.parse(j.endsAt) - now)
}

export function fmtLeft(ms: number): string {
	if (ms <= 0) return "Done"
	const m = Math.ceil(ms / 60000)
	if (m < 60) return `${m}m`
	const h = Math.floor(m / 60)
	const r = m % 60
	return r ? `${h}h ${r}m` : `${h}h`
}

export class BuildLayer {
	readonly pickables: T.Object3D[] = []
	pads: PadRef[] = []
	private root = new T.Group()
	private lotG = new T.Group()
	private padG = new T.Group()
	private overlayG = new T.Group()
	private markG = new T.Group()
	private sites = new Map<number, Site>()
	private claimCrew: Worker[] = []
	private tweens: ((dt: number) => boolean)[] = []
	private padOpenMat: T.MeshBasicMaterial
	private markMat: T.MeshBasicMaterial
	private marks: { ref: PadRef; m: T.Mesh }[] = []
	private dustMesh: T.InstancedMesh
	private dust: Particle[] = []
	private confMesh: T.InstancedMesh
	private conf: (Particle & { col: T.Color })[] = []
	private t = 0
	private rng = mulberry32(7)
	private tmpM = new T.Matrix4()
	private tmpQ = new T.Quaternion()
	private tmpE = new T.Euler()
	private tmpS = new T.Vector3()
	private tmpP = new T.Vector3()

	constructor(private w: GymWorld) {
		const a = ctx().assets
		w.scene.add(this.root)
		this.root.add(this.lotG, this.padG, this.overlayG, this.markG)
		this.padOpenMat = a.track(
			new T.MeshBasicMaterial({
				map: padTex(true, 1),
				transparent: true,
				depthWrite: false,
				opacity: 0.9,
			}),
		)
		this.markMat = a.track(
			new T.MeshBasicMaterial({
				map: padTex(true, 1),
				transparent: true,
				depthWrite: false,
				opacity: 0.95,
				color: "#bffbf1",
			}),
		)
		const dg = eqGeo("dustIco", () => new T.IcosahedronGeometry(0.13, 0))
		this.dustMesh = new T.InstancedMesh(
			dg,
			a.track(
				new T.MeshBasicMaterial({
					color: "#ffffff",
					transparent: true,
					opacity: 0.85,
					depthWrite: false,
				}),
			),
			96,
		)
		this.dustMesh.setColorAt(0, new T.Color("#f5e9da"))
		this.dustMesh.frustumCulled = false
		this.dustMesh.count = 0
		this.dustMesh.renderOrder = 3
		this.root.add(this.dustMesh)
		const cg = eqGeo("confetti", () => new T.PlaneGeometry(0.1, 0.15))
		this.confMesh = new T.InstancedMesh(
			cg,
			a.track(new T.MeshBasicMaterial({ side: T.DoubleSide })),
			160,
		)
		this.confMesh.setColorAt(0, new T.Color("#ffffff"))
		this.confMesh.frustumCulled = false
		this.confMesh.count = 0
		this.root.add(this.confMesh)
	}

	// ── sync from a layout ───────────────────────────────────────────────

	/** Rebuilds lots, spots and room overlays; adds / removes construction
	 * sites by job id (sites that keep running are left alone). */
	sync(layout: GymLayoutDto, now: number): void {
		this.buildLots(layout)
		this.buildPads(layout)
		this.buildOverlays()
		const active = new Map(
			layout.jobs.filter((j) => j.status === "active").map((j) => [j.id, j]),
		)
		for (const [id, s] of this.sites) {
			const j = active.get(id)
			if (j) {
				s.job = j
				continue
			}
			this.removeSite(s)
		}
		for (const j of active.values()) {
			if (this.sites.has(j.id)) continue
			const s = this.makeSite(j)
			if (s) this.sites.set(j.id, s)
		}
		this.frameWalls(now)
	}

	private clear(g: T.Group): void {
		const a = ctx().assets
		for (const c of g.children.slice()) {
			c.removeFromParent()
			c.traverse((o) => {
				if (o instanceof T.InstancedMesh) o.dispose()
				const m = o as T.Mesh
				if (m.geometry) a.release(m.geometry)
				const mat = m.material as T.MeshBasicMaterial | undefined
				if (mat && !Array.isArray(mat) && mat !== this.padOpenMat) {
					if (mat.map) a.release(mat.map)
					a.release(mat)
				}
			})
			const i = this.pickables.indexOf(c)
			if (i >= 0) this.pickables.splice(i, 1)
		}
		for (let i = this.pickables.length - 1; i >= 0; i--)
			if (!this.pickables[i].parent) this.pickables.splice(i, 1)
	}

	private buildLots(layout: GymLayoutDto): void {
		this.clear(this.lotG)
		if (!layout.lots.length) return
		const a = ctx().assets
		const parts: Part[] = []
		const tuft = eqGeo("tuft", () => new T.ConeGeometry(0.1, 0.22, 5))
		for (const lot of layout.lots) {
			const inL = (x: number, z: number) =>
				lot.cells.some(
					(p) =>
						x >= p.px * PW &&
						x < p.px * PW + PW &&
						z >= p.pz * PD &&
						z < p.pz * PD + PD,
				)
			const rng = mulberry32(hashString(lot.id))
			for (const P of lot.cells) {
				const x0 = P.px * PW
				const z0 = P.pz * PD
				pBox(parts, PW, 0.04, PD, "#d99e82", x0 + PW / 2, 0, z0 + PD / 2)
				for (let i = 0; i < 10; i++)
					pGeo(
						parts,
						tuft,
						i % 2 ? "#8f9c48" : "#7a8a3c",
						x0 + 0.6 + rng() * (PW - 1.2),
						0.1,
						z0 + 0.6 + rng() * (PD - 1.2),
					)
				// posts and ropes along the lot's outer edges
				for (const [dx, dz] of [
					[0, -1],
					[0, 1],
					[-1, 0],
					[1, 0],
				] as const) {
					if (
						inL(
							x0 + PW / 2 + dx * (PW / 2 + 0.5),
							z0 + PD / 2 + dz * (PD / 2 + 0.5),
						)
					)
						continue
					const vert = dx !== 0
					const c = vert
						? dx < 0
							? x0 + 0.2
							: x0 + PW - 0.2
						: dz < 0
							? z0 + 0.2
							: z0 + PD - 0.2
					const a0 = vert ? z0 : x0
					const len = vert ? PD : PW
					pBox(
						parts,
						vert ? 0.03 : len,
						0.03,
						vert ? len : 0.03,
						"#fff7ea",
						vert ? c : a0 + len / 2,
						0.42,
						vert ? a0 + len / 2 : c,
					)
					for (let k = 0; k <= 2; k++) {
						const q = a0 + (k * len) / 2
						pBox(
							parts,
							0.09,
							0.5,
							0.09,
							C.woodD,
							vert ? c : q,
							0.25,
							vert ? q : c,
						)
					}
				}
				// tap target
				const proxy = new T.Mesh(
					eqGeo("lotProxy", () => new T.BoxGeometry(PW - 0.1, 0.4, PD - 0.1)),
					a.HIT,
				)
				proxy.position.set(x0 + PW / 2, 0.2, z0 + PD / 2)
				const info: PickInfo = { kind: "lot", lotId: lot.id }
				proxy.userData.pick = info
				this.lotG.add(proxy)
				this.pickables.push(proxy)
			}
			const b = cellsBox(lot.cells)
			// ground decal: dashed outline + label reading upright in the iso view
			const decal = new T.Mesh(
				a.track(new T.PlaneGeometry(b.w, b.d)),
				a.track(
					new T.MeshBasicMaterial({
						map: lotDecalTex(lot.cells, lot.shape),
						transparent: true,
						depthWrite: false,
					}),
				),
			)
			decal.raycast = () => {}
			decal.rotation.x = -Math.PI / 2
			decal.position.set(b.cx, 0.035, b.cz)
			decal.renderOrder = 1
			this.lotG.add(decal)
			// For Sale sign on the lot's front corner, facing the camera
			const front = lot.cells.reduce(
				(m, P) => (P.pz > m.pz || (P.pz === m.pz && P.px > m.px) ? P : m),
				lot.cells[0],
			)
			const sg = new T.Group()
			sg.position.set(front.px * PW + PW - 1.6, 0, front.pz * PD + PD - 1.0)
			sg.rotation.y = Math.PI / 4
			this.lotG.add(sg)
			const sp: Part[] = []
			pBox(sp, 0.1, 1.5, 0.1, C.woodD, -0.7, 0.75, -0.05)
			pBox(sp, 0.1, 1.5, 0.1, C.woodD, 0.7, 0.75, -0.05)
			pBox(sp, 1.72, 1.36, 0.06, "#9a6238", 0, 1.5, 0)
			batchMesh(sp, sg)
			const pl = new T.Mesh(
				a.track(new T.PlaneGeometry(1.64, 1.28)),
				a.track(
					new T.MeshStandardMaterial({
						map: lotSignTex(lot.price),
						roughness: 1,
					}),
				),
			)
			pl.position.set(0, 1.5, 0.035)
			sg.add(pl)
			const info: PickInfo = { kind: "lot", lotId: lot.id }
			pl.userData.pick = info
			this.pickables.push(pl)
			this.popIn(sg)
		}
		const m = batchMesh(parts, this.lotG)
		m.castShadow = false
	}

	/** Glowing open spots (one instanced mesh) and locked ones (one per
	 * unlock level), for every empty spot of every built, typed room. */
	private buildPads(layout: GymLayoutDto): void {
		this.clear(this.padG)
		const taken = new Set(
			layout.pieces
				.filter((p) => p.roomId != null && p.spotIndex != null)
				.map((p) => `${p.roomId}:${p.spotIndex}`),
		)
		const pads: PadRef[] = []
		for (const r of this.w.rooms) {
			if (r.building || !(r.type in RT)) continue
			for (const s of roomSpots(r.type as EquipmentRoomType, r.cells)) {
				if (taken.has(`${r.id}:${s.index}`)) continue
				pads.push({
					roomId: r.id,
					spot: s.index,
					x: s.x,
					z: s.z,
					size: s.size,
					unlock: s.unlock,
					open: r.level >= s.unlock,
					filled: false,
				})
			}
		}
		this.pads = pads
		const geo = eqGeo("padPlane", () =>
			new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
		)
		const groups = new Map<string, PadRef[]>()
		for (const p of pads) {
			const k = p.open ? "open" : `lv${p.unlock}`
			const list = groups.get(k) ?? []
			list.push(p)
			groups.set(k, list)
		}
		const a = ctx().assets
		for (const [k, list] of groups) {
			const mat =
				k === "open"
					? this.padOpenMat
					: a.mat(
							`padLock${k}`,
							() =>
								new T.MeshBasicMaterial({
									map: padTex(false, list[0].unlock),
									transparent: true,
									depthWrite: false,
									opacity: 0.85,
								}),
						)
			const im = new T.InstancedMesh(geo, mat, list.length)
			list.forEach((p, i) => {
				const s = p.size - 0.14
				this.tmpM.compose(
					this.tmpP.set(p.x, 0.03, p.z),
					this.tmpQ.identity(),
					this.tmpS.set(s, 1, s),
				)
				im.setMatrixAt(i, this.tmpM)
			})
			im.instanceMatrix.needsUpdate = true
			im.computeBoundingSphere()
			im.userData.pads = list
			im.renderOrder = 1
			this.padG.add(im)
			this.pickables.push(im)
		}
	}

	/** "NEW ROOM / Tap to choose its type" on bought rooms with no type. */
	private buildOverlays(): void {
		this.clear(this.overlayG)
		const a = ctx().assets
		for (const r of this.w.rooms) {
			if (r.type !== "empty" || r.building) continue
			const c = r.cells[0]
			const tex = a.tex("newRoomTex", () =>
				canvasTexRaw(512, 340, (g, w, h) => {
					g.fillStyle = "rgba(58,168,154,.16)"
					g.fillRect(0, 0, w, h)
					g.strokeStyle = "#3aa89a"
					g.lineWidth = 10
					g.setLineDash([26, 16])
					g.strokeRect(12, 12, w - 24, h - 24)
					g.setLineDash([])
					g.save()
					g.translate(w / 2, h / 2)
					g.rotate(-Math.PI / 4)
					g.scale(1, 1.5)
					g.textAlign = "center"
					g.textBaseline = "middle"
					g.fillStyle = "#1f7a6d"
					g.font = `800 58px ${DISPLAY_FONT}`
					g.fillText("NEW ROOM", 0, -22)
					g.font = '700 30px "Nunito Sans", Arial, sans-serif'
					g.fillText("Tap to choose its type", 0, 30)
					g.restore()
				}),
			)
			const m = new T.Mesh(
				eqGeo("newRoomPlane", () =>
					new T.PlaneGeometry(PW - 0.5, PD - 0.5).rotateX(-Math.PI / 2),
				),
				a.mat(
					"newRoomMat",
					() =>
						new T.MeshBasicMaterial({
							map: tex,
							transparent: true,
							depthWrite: false,
						}),
				),
			)
			m.raycast = () => {}
			m.position.set(c.px * PW + PW / 2, 0.012, c.pz * PD + PD / 2)
			m.renderOrder = 1
			this.overlayG.add(m)
		}
	}

	// ── construction sites ─────────────────────────────────────────────

	private siteRect(
		j: GymJobDto,
	): { x: number; z: number; w: number; d: number; big: boolean } | null {
		if (j.kind === "plot") {
			const r = this.w.rooms.find((q) => q.id === j.roomId)
			if (!r) return null
			const b = siteBox(r.cells)
			return { x: b.cx, z: b.cz, w: b.w - 0.8, d: b.d - 0.8, big: true }
		}
		const p = this.w.pieces.find((q) => q.id === j.pieceId)
		if (!p) return null
		return { x: p.x, z: p.z, w: p.size, d: p.size, big: p.size >= 3 }
	}

	private makeSite(j: GymJobDto): Site | null {
		const r = this.siteRect(j)
		if (!r) return null
		const plot = j.kind === "plot"
		const g = new T.Group()
		g.position.set(r.x, 0, r.z)
		this.root.add(g)
		const parts: Part[] = []
		const hw = r.w / 2 + 0.3
		const hd = r.d / 2 + 0.3
		// striped rails: alternating red / white segments, two heights
		const rail = (len: number, px: number, pz: number, vert: boolean) => {
			const n = Math.max(2, Math.round(len / 0.45))
			const seg = len / n
			for (const y of [0.32, 0.66])
				for (let i = 0; i < n; i++) {
					const o = -len / 2 + seg * (i + 0.5)
					pBox(
						parts,
						vert ? 0.04 : seg,
						0.11,
						vert ? seg : 0.04,
						i % 2 ? "#fff7ea" : "#d4463a",
						vert ? px : px + o,
						y,
						vert ? pz + o : pz,
					)
				}
		}
		rail(2 * hw, 0, -hd, false)
		rail(2 * hw, 0, hd, false)
		rail(2 * hd, -hw, 0, true)
		rail(2 * hd, hw, 0, true)
		const post = (px: number, pz: number) => {
			pGeo(parts, cylGeo(0.035, 0.8, 6), "#fff7ea", px, 0.4, pz)
			pGeo(parts, cylGeo(0.07, 0.05, 8), "#2c2f36", px, 0.025, pz)
		}
		const nx = Math.max(1, Math.round((2 * hw) / 1.2))
		const nz = Math.max(1, Math.round((2 * hd) / 1.2))
		for (let i = 0; i <= nx; i++) {
			post(-hw + (i * 2 * hw) / nx, -hd)
			post(-hw + (i * 2 * hw) / nx, hd)
		}
		for (let i = 1; i < nz; i++) {
			post(-hw, -hd + (i * 2 * hd) / nz)
			post(hw, -hd + (i * 2 * hd) / nz)
		}
		const cone = eqGeo("siteCone", () => new T.ConeGeometry(0.13, 0.34, 10))
		const cones: [number, number][] = plot
			? [
					[hw - 0.35, hd - 0.35],
					[-hw + 0.35, hd - 0.4],
					[hw - 0.35, hd - 1.0],
				]
			: [
					[hw + 0.3, hd + 0.25],
					[-hw - 0.25, hd + 0.3],
					[hw + 0.3, hd - 0.5],
				]
		for (const [cx, cz] of cones) {
			pGeo(parts, cone, "#f2803a", cx, 0.17, cz)
			pGeo(parts, cylGeo(0.085, 0.05, 10), "#fff7ea", cx, 0.2, cz)
			pBox(parts, 0.3, 0.03, 0.3, "#f2803a", cx, 0.015, cz)
		}
		const bx = -hw + 0.45
		const bz = hd - 0.4
		for (let i = 0; i < 5; i++)
			pBox(
				parts,
				0.26,
				0.12,
				0.14,
				"#c85a3c",
				bx + (i % 3) * 0.27 - 0.27 + (i > 2 ? 0.13 : 0),
				0.06 + (i > 2 ? 0.12 : 0),
				bz,
			)
		pBox(parts, 0.34, 0.3, 0.3, "#e9dfd6", bx + 0.7, 0.15, bz)
		if (r.big) {
			const sy = plot ? 2.6 : 2.0
			for (const px of [-hw + 0.15, 0, hw - 0.15]) {
				pGeo(parts, cylGeo(0.03, sy, 6), C.steel, px, sy / 2, -hd + 0.15)
				pGeo(parts, cylGeo(0.03, sy, 6), C.steel, px, sy / 2, -hd + 0.55)
			}
			for (const y of [sy * 0.5, sy]) {
				pBox(parts, 2 * hw - 0.2, 0.05, 0.42, C.wood, 0, y, -hd + 0.35)
				pGeo(
					parts,
					cylGeo(0.025, 2 * hw - 0.3, 6),
					C.steel,
					0,
					y + 0.3,
					-hd + 0.15,
					0,
					0,
					Math.PI / 2,
				)
			}
			for (const k of [-1, 1]) {
				const L = Math.hypot(hw, sy * 0.5)
				pGeo(
					parts,
					cylGeo(0.02, L, 5),
					C.steelD,
					(k * hw) / 2,
					sy * 0.25,
					-hd + 0.15,
					0,
					0,
					k * Math.atan2(hw, sy * 0.5),
				)
			}
		}
		const mesh = batchMesh(parts, g, { static: false })
		const a = ctx().assets
		const proxy = new T.Mesh(
			a.track(new T.BoxGeometry(2 * hw, 1.2, 2 * hd)),
			a.HIT,
		)
		proxy.position.y = 0.6
		const info: PickInfo = { kind: "job", jobId: j.id }
		proxy.userData.pick = info
		g.add(proxy)
		this.pickables.push(proxy)
		const workers: Worker[] = []
		const spots: [number, number, number][] = plot
			? [
					[r.x - 1.6, r.z + 0.8, Math.PI * 0.8],
					[r.x + 2.2, r.z - 1.2, Math.PI],
				]
			: [[r.x + 0.25, r.z + r.d / 2 + 0.12, Math.PI]]
		spots.forEach(([x, z, ry], i) => {
			workers.push(makeWorker(`worker:${j.id}:${i}`, x, z, ry))
		})
		g.scale.y = 0.01
		this.tween(0.4, (k) => {
			g.scale.y = Math.max(0.01, 1 - Math.exp(-6 * k) * Math.cos(9 * k))
		})
		this.dustAt(r.x, 0.2, r.z, 10, Math.min(2.5, r.w * 0.4))
		return {
			job: j,
			g,
			mesh,
			proxy,
			workers,
			x: r.x,
			z: r.z,
			w: r.w,
			d: r.d,
			top: plot ? 3.1 : 2.3,
		}
	}

	private removeSite(s: Site): void {
		this.sites.delete(s.job.id)
		const i = this.pickables.indexOf(s.proxy)
		if (i >= 0) this.pickables.splice(i, 1)
		for (const wk of s.workers) {
			const p = wk.rig.root.position
			this.dustAt(p.x, 0.4, p.z, 6, 0.3)
			disposeRig(wk.rig)
		}
		s.workers = []
		const a = ctx().assets
		this.tween(
			0.3,
			(k) => {
				s.g.scale.set(1, Math.max(0.01, 1 - k), 1)
			},
			() => {
				s.g.removeFromParent()
				a.release(s.mesh.geometry)
				a.release(s.proxy.geometry)
			},
		)
	}

	/** Upgrade claim (slice 3): two workers hammer at a spot until
	 * endClaim(); the piece itself drops in afterwards. */
	startClaim(x: number, z: number, size: number): void {
		this.endClaim()
		const h = size / 2 + 0.45
		this.claimCrew = [
			makeWorker("worker:claim:0", x - h, z + 0.35, Math.PI / 2),
			makeWorker("worker:claim:1", x + 0.35, z + h, Math.PI),
		]
		this.dustAt(x, 0.2, z, 8, size * 0.5)
	}

	endClaim(): void {
		for (const wk of this.claimCrew) {
			const p = wk.rig.root.position
			this.dustAt(p.x, 0.4, p.z, 6, 0.3)
			disposeRig(wk.rig)
		}
		this.claimCrew = []
	}

	/** Timer bubble anchors of the running jobs. */
	siteAnchors(): { jobId: number; x: number; y: number; z: number }[] {
		return [...this.sites.values()].map((s) => ({
			jobId: s.job.id,
			x: s.x,
			y: s.top,
			z: s.z,
		}))
	}

	siteOf(jobId: number): { x: number; z: number; w: number; d: number } | null {
		const s = this.sites.get(jobId)
		return s ? { x: s.x, z: s.z, w: s.w, d: s.d } : null
	}

	/** A small hop of a site when it is tapped or sped up. */
	bounceSite(jobId: number): void {
		const s = this.sites.get(jobId)
		if (!s) return
		this.tween(0.4, (k) => {
			s.g.scale.setScalar(1 + 0.08 * Math.exp(-5 * k) * Math.sin(14 * k))
		})
		this.dustAt(s.x, 0.3, s.z, 8, Math.min(2, s.w * 0.4))
	}

	private frameWalls(now: number): void {
		for (const s of this.sites.values()) {
			if (s.job.kind !== "plot" || s.job.roomId == null) continue
			const m = this.w.risingWalls.get(s.job.roomId)
			if (m) m.scale.y = Math.max(0.05, jobProgress(s.job, now))
		}
	}

	// ── effects ──────────────────────────────────────────────────────────

	tween(dur: number, fn: (k: number) => void, done?: () => void): void {
		let t = 0
		this.tweens.push((dt) => {
			t += dt
			const k = Math.min(1, t / dur)
			fn(k)
			if (k >= 1) {
				done?.()
				return false
			}
			return true
		})
	}

	private popIn(o: T.Object3D, dur = 0.5): void {
		const s0 = o.scale.x
		this.tween(dur, (k) => {
			o.scale.setScalar(
				s0 * Math.max(0.01, 1 - Math.exp(-6 * k) * Math.cos(10 * k)),
			)
		})
	}

	dustAt(
		x: number,
		y: number,
		z: number,
		n: number,
		spread = 0.5,
		col = "#f5e9da",
	): void {
		const c = new T.Color(col)
		for (let i = 0; i < n; i++) {
			if (this.dust.length >= 96) this.dust.shift()
			const a = this.rng() * Math.PI * 2
			const r = spread * (0.6 + this.rng() * 0.5)
			const sp = 0.6 + this.rng() * 0.9
			const p: Particle & { col?: T.Color } = {
				x: x + Math.cos(a) * r,
				y,
				z: z + Math.sin(a) * r,
				vx: Math.cos(a) * sp * 0.7,
				vy: 0.55,
				vz: Math.sin(a) * sp * 0.7,
				rx: 0,
				ry: 0,
				sx: 0,
				sy: 0,
				s: 0.5 + this.rng() * 0.6,
				life: 0,
				max: 0.6 + this.rng() * 0.5,
			}
			;(p as { col?: T.Color }).col = c
			this.dust.push(p)
		}
	}

	confetti(x: number, y: number, z: number, n: number): void {
		for (let i = 0; i < n; i++) {
			if (this.conf.length >= 160) this.conf.shift()
			this.conf.push({
				x,
				y,
				z,
				vx: (this.rng() - 0.5) * 4.8,
				vy: 3 + this.rng() * 3.5,
				vz: (this.rng() - 0.5) * 4.8,
				rx: 0,
				ry: 0,
				sx: (this.rng() - 0.5) * 18,
				sy: (this.rng() - 0.5) * 18,
				s: 1,
				life: 0,
				max: 2.6 + this.rng() * 0.6,
				col: new T.Color(CONF[Math.floor(this.rng() * CONF.length)]),
			})
		}
	}

	/** Ribbon cutting: posts, a red ribbon that opens, confetti. `onCut`
	 * runs as the ribbon opens (toast time). */
	ceremony(
		x: number,
		z: number,
		w: number,
		d: number,
		onCut: () => void,
	): void {
		const g = new T.Group()
		this.root.add(g)
		const a = ctx().assets
		const fz = z + d / 2 + 0.5
		const hx = Math.min(w / 2 + 0.1, 2.2)
		const parts: Part[] = []
		for (const s of [-1, 1]) {
			pGeo(parts, cylGeo(0.045, 1.0, 8), C.steelD, x + s * hx, 0.5, fz)
			pGeo(parts, cylGeo(0.1, 0.05, 10), "#f2c14a", x + s * hx, 1.02, fz)
			pGeo(parts, cylGeo(0.14, 0.04, 10), C.steelD, x + s * hx, 0.02, fz)
		}
		const posts = batchMesh(parts, g)
		const halves = [-1, 1].map((s) => {
			const pv = new T.Group()
			pv.position.set(x + s * hx, 0.9, fz)
			g.add(pv)
			const m = new T.Mesh(
				a.track(new T.BoxGeometry(hx, 0.09, 0.02)),
				a.M("#d4463a"),
			)
			m.position.x = (-s * hx) / 2
			pv.add(m)
			const bow = new T.Mesh(
				eqGeo("bow", () => new T.SphereGeometry(0.1, 10, 8)),
				a.M("#d4463a"),
			)
			bow.scale.set(1.3, 0.8, 0.4)
			bow.position.set(-s * (hx - 0.1), 0, 0.02)
			pv.add(bow)
			return { pv, s, m }
		})
		this.popIn(g, 0.4)
		this.tween(
			1.0,
			() => {},
			() => {
				for (const h of halves)
					this.tween(0.6, (k) => {
						h.pv.rotation.z = h.s * k * 1.35
					})
				this.confetti(x, 1.4, fz - 0.4, 80)
				this.dustAt(x, 0.5, fz, 6, 0.4)
				onCut()
				this.tween(
					2.6,
					() => {},
					() =>
						this.tween(
							0.3,
							(k) => g.scale.setScalar(Math.max(0.01, 1 - k)),
							() => {
								g.removeFromParent()
								a.release(posts.geometry)
								for (const h of halves) a.release(h.m.geometry)
							},
						),
				)
			},
		)
	}

	/** Sparkles over a room (paint changes). */
	sparkleRoom(roomId: number, col: string): void {
		const r = this.w.rooms.find((q) => q.id === roomId)
		if (!r) return
		for (const c of r.cells)
			for (let i = 0; i < 4; i++)
				this.dustAt(
					c.px * PW + 1 + this.rng() * (PW - 2),
					0.3,
					c.pz * PD + 1 + this.rng() * (PD - 2),
					2,
					0.3,
					col,
				)
	}

	// ── move targets ─────────────────────────────────────────────────────

	/** Shows glowing marks on the spots a piece can move to (null clears). */
	showTargets(targets: readonly PadRef[] | null): void {
		for (const mk of this.marks) mk.m.removeFromParent()
		this.marks = []
		if (!targets) return
		const geo = eqGeo("padPlane", () =>
			new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
		)
		for (const ref of targets) {
			const m = new T.Mesh(geo, this.markMat)
			const s = ref.size - 0.14
			m.scale.set(s, 1, s)
			m.position.set(ref.x, ref.filled ? 0.9 : 0.05, ref.z)
			m.renderOrder = 2
			m.userData.target = ref
			this.markG.add(m)
			this.marks.push({ ref, m })
		}
	}

	get targetMeshes(): T.Object3D[] {
		return this.marks.map((m) => m.m)
	}

	/** Emphasises the mark a dragged piece would drop on. */
	hoverTarget(ref: PadRef | null): void {
		for (const mk of this.marks) {
			const s = (mk.ref.size - 0.14) * (mk.ref === ref ? 1.12 : 1)
			mk.m.scale.set(s, 1, s)
		}
	}

	// ── per frame ────────────────────────────────────────────────────────

	private hammer(wk: Worker, dt: number): void {
		const r = wk.rig
		wk.t += dt
		resetPose(r)
		POSES.hammer(r, wk.t, null)
		const c = (wk.t * 1.4) % 1
		if (c < wk.c) {
			r.root.updateMatrixWorld(true)
			r.armR.hand.getWorldPosition(this.tmpP)
			this.dustAt(
				this.tmpP.x,
				Math.max(0.1, this.tmpP.y - 0.1),
				this.tmpP.z,
				2,
				0.12,
			)
		}
		wk.c = c
	}

	frame(dt: number, now: number, frameN: number): void {
		this.t += dt
		const t = this.t
		if (this.tweens.length) {
			const cur = this.tweens
			this.tweens = []
			const keep = cur.filter((f) => f(dt))
			this.tweens = keep.concat(this.tweens)
		}
		if (frameN % 2 === 0) {
			this.padOpenMat.opacity = 0.62 + 0.3 * Math.sin(t * 3.2)
			this.markMat.opacity = 0.7 + 0.25 * Math.sin(t * 6)
		}
		for (const wk of this.claimCrew) this.hammer(wk, dt)
		for (const s of this.sites.values()) {
			for (const wk of s.workers) this.hammer(wk, dt)
			if (this.rng() < dt * 1.5)
				this.dustAt(
					s.x + (this.rng() - 0.5) * s.w,
					0.15,
					s.z + (this.rng() - 0.5) * s.d,
					2,
					0.3,
				)
		}
		if (frameN % 15 === 0) this.frameWalls(now)
		this.stepDust(dt)
		this.stepConfetti(dt)
	}

	private stepDust(dt: number): void {
		const m = this.dustMesh
		let n = 0
		const keep: Particle[] = []
		for (const p of this.dust) {
			p.life += dt
			const k = p.life / p.max
			if (k >= 1) continue
			keep.push(p)
			const s = p.s * (0.6 + k * 1.6) * (1 - k * k)
			this.tmpM.compose(
				this.tmpP.set(p.x + p.vx * k, p.y + k * p.vy, p.z + p.vz * k),
				this.tmpQ.identity(),
				this.tmpS.set(s, s, s),
			)
			m.setMatrixAt(n, this.tmpM)
			m.setColorAt(n, (p as { col?: T.Color }).col ?? _white)
			n++
		}
		this.dust = keep
		m.count = n
		if (n) {
			m.instanceMatrix.needsUpdate = true
			if (m.instanceColor) m.instanceColor.needsUpdate = true
		}
	}

	private stepConfetti(dt: number): void {
		const m = this.confMesh
		let n = 0
		const keep: typeof this.conf = []
		const h = Math.min(dt, 1 / 30)
		for (const p of this.conf) {
			p.life += dt
			const k = p.life / p.max
			if (k >= 1) continue
			keep.push(p)
			if (p.y > 0.03) {
				p.vy -= 9.8 * h
				p.x += p.vx * h * 0.9
				p.z += p.vz * h * 0.9
				p.y = Math.max(0.03, p.y + p.vy * h)
				p.rx += p.sx * h
				p.ry += p.sy * h
			} else p.rx = -Math.PI / 2
			const s = k > 0.8 ? Math.max(0.01, (1 - k) / 0.2) : 1
			this.tmpE.set(p.rx, p.ry, 0)
			this.tmpM.compose(
				this.tmpP.set(p.x, p.y, p.z),
				this.tmpQ.setFromEuler(this.tmpE),
				this.tmpS.set(s, s, s),
			)
			m.setMatrixAt(n, this.tmpM)
			m.setColorAt(n, p.col)
			n++
		}
		this.conf = keep
		m.count = n
		if (n) {
			m.instanceMatrix.needsUpdate = true
			if (m.instanceColor) m.instanceColor.needsUpdate = true
		}
	}

	get busy(): boolean {
		return (
			this.sites.size > 0 ||
			this.tweens.length > 0 ||
			this.conf.length > 0 ||
			this.claimCrew.length > 0
		)
	}

	dispose(): void {
		for (const wk of this.claimCrew) disposeRig(wk.rig)
		this.claimCrew = []
		for (const s of this.sites.values())
			for (const wk of s.workers) disposeRig(wk.rig)
		this.sites.clear()
		this.tweens = []
		this.root.removeFromParent()
	}
}

const _white = new T.Color("#ffffff")

function makeWorker(seed: string, x: number, z: number, ry: number): Worker {
	const out = seededOutfit(seed)
	out.hair = "#2c1f1b"
	out.style = "buzz"
	out.top = "#d9ef3b"
	out.bottom = "#3a4a6a"
	out.shoes = "#7a4a3a"
	out.sleeves = true
	out.shorts = false
	out.band = null
	out.lashes = false
	out.tee = null
	out.tats = []
	out.acc = []
	const rig = makeRig(out, (r) => {
		const hat = tmesh(
			eqGeo(
				"hardhat",
				() =>
					new T.SphereGeometry(0.19, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
			),
			"hat",
			"#f2c14a",
			r.neck,
			0,
			0.215,
			0,
		)
		hat.scale.set(1, 0.9, 1.05)
		tmesh(
			eqGeo("hatbrim", () => new T.CylinderGeometry(0.235, 0.235, 0.02, 16)),
			"hat",
			"#f2c14a",
			r.neck,
			0,
			0.225,
			0.03,
			true,
		)
	})
	rig.root.position.set(x, 0, z)
	rig.root.rotation.y = ry
	const rng = mulberry32(hashString(seed))
	return { rig, t: rng() * 3, c: 0 }
}

// ── canvas textures ─────────────────────────────────────────────────────────

/** An untracked-key canvas texture made inside a cached tex() factory. */
function canvasTexRaw(
	w: number,
	h: number,
	draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
): T.CanvasTexture {
	const c = document.createElement("canvas")
	c.width = w
	c.height = h
	const g = c.getContext("2d")
	if (g) draw(g, w, h)
	const t = new T.CanvasTexture(c)
	t.anisotropy = 4
	return t
}

function padTex(open: boolean, unlock: number): T.Texture {
	return ctx().assets.tex(open ? "padOpen" : `padLock${unlock}`, () =>
		canvasTexRaw(128, 128, (g, w) => {
			const r = 18
			const rr = (x: number, y: number, s: number) => {
				g.beginPath()
				g.moveTo(x + r, y)
				g.arcTo(x + s, y, x + s, y + s, r)
				g.arcTo(x + s, y + s, x, y + s, r)
				g.arcTo(x, y + s, x, y, r)
				g.arcTo(x, y, x + s, y, r)
				g.closePath()
			}
			if (open) {
				const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64)
				gr.addColorStop(0, "rgba(127,224,208,.55)")
				gr.addColorStop(1, "rgba(127,224,208,.12)")
				g.fillStyle = gr
				rr(6, 6, w - 12)
				g.fill()
				g.strokeStyle = "#e9fffb"
				g.lineWidth = 7
				g.setLineDash([16, 10])
				rr(8, 8, w - 16)
				g.stroke()
				g.setLineDash([])
				g.fillStyle = "#ffffff"
				g.fillRect(58, 40, 12, 48)
				g.fillRect(40, 58, 48, 12)
			} else {
				g.fillStyle = "rgba(58,38,34,.22)"
				rr(6, 6, w - 12)
				g.fill()
				g.strokeStyle = "rgba(255,247,234,.7)"
				g.lineWidth = 5
				g.setLineDash([10, 10])
				rr(8, 8, w - 16)
				g.stroke()
				g.setLineDash([])
				// padlock
				g.fillStyle = "#fff7ea"
				g.fillRect(46, 52, 36, 28)
				g.strokeStyle = "#fff7ea"
				g.lineWidth = 6
				g.beginPath()
				g.arc(64, 52, 11, Math.PI, 0)
				g.stroke()
				g.fillStyle = "#fff7ea"
				g.font = `800 22px ${DISPLAY_FONT}`
				g.textAlign = "center"
				g.fillText(`Lv ${unlock}`, 64, 106)
			}
		}),
	)
}

function lotSignTex(price: number): T.Texture {
	return canvasTex(256, 200, (g, w, h) => {
		g.fillStyle = "#c85a3c"
		g.fillRect(0, 0, w, h)
		g.fillStyle = "#fff7ea"
		g.fillRect(10, 10, w - 20, h - 20)
		g.fillStyle = "#c85a3c"
		g.textAlign = "center"
		fitText(g, "FOR SALE", w - 40, "800", DISPLAY_FONT)
		g.fillText("FOR SALE", w / 2, 78)
		g.fillStyle = "#f2c14a"
		g.beginPath()
		g.arc(62, 136, 22, 0, 7)
		g.fill()
		g.strokeStyle = "#b8862a"
		g.lineWidth = 5
		g.stroke()
		g.beginPath()
		g.arc(62, 136, 11, 0, 7)
		g.stroke()
		g.fillStyle = "#3a2622"
		g.textAlign = "left"
		g.font = `800 46px ${DISPLAY_FONT}`
		g.fillText(fmt(price), 96, 152)
		void h
	})
}

function lotDecalTex(
	cells: readonly { px: number; pz: number }[],
	shape: string,
): T.Texture {
	const b = cellsBox(cells)
	const S = 32
	return canvasTex(Math.round(b.w * S), Math.round(b.d * S), (g) => {
		const inL = (x: number, z: number) =>
			cells.some(
				(P) =>
					x >= P.px * PW - 1e-6 &&
					x < P.px * PW + PW - 1e-6 &&
					z >= P.pz * PD - 1e-6 &&
					z < P.pz * PD + PD - 1e-6,
			)
		g.fillStyle = "rgba(255,247,234,.18)"
		for (const P of cells)
			g.fillRect((P.px * PW - b.x0) * S, (P.pz * PD - b.z0) * S, PW * S, PD * S)
		g.strokeStyle = "#fff7ea"
		g.lineWidth = 6
		g.setLineDash([18, 12])
		g.lineCap = "round"
		for (const P of cells) {
			const x0 = P.px * PW
			const z0 = P.pz * PD
			const x = (x0 - b.x0) * S
			const z = (z0 - b.z0) * S
			const e = 5
			const edges: [number, number, number, number, number, number][] = [
				[0, -1, x, z + e, x + PW * S, z + e],
				[0, 1, x, z + PD * S - e, x + PW * S, z + PD * S - e],
				[-1, 0, x + e, z, x + e, z + PD * S],
				[1, 0, x + PW * S - e, z, x + PW * S - e, z + PD * S],
			]
			for (const [dx, dz, a0, b0, c0, d0] of edges) {
				if (
					inL(
						x0 + PW / 2 + dx * (PW / 2 + 0.5),
						z0 + PD / 2 + dz * (PD / 2 + 0.5),
					)
				)
					continue
				g.beginPath()
				g.moveTo(a0, b0)
				g.lineTo(c0, d0)
				g.stroke()
			}
		}
		g.setLineDash([])
		let lx = cells.reduce((a, P) => a + P.px * PW + PW / 2, 0) / cells.length
		let lz = cells.reduce((a, P) => a + P.pz * PD + PD / 2, 0) / cells.length
		if (!inL(lx, lz)) {
			lx = cells[0].px * PW + PW / 2
			lz = cells[0].pz * PD + PD / 2
		}
		const info =
			SHAPE_INFO[shape as keyof typeof SHAPE_INFO] ?? SHAPE_INFO.normal
		g.save()
		g.translate((lx - b.x0 - 0.9) * S, (lz - b.z0 - 0.4) * S)
		g.rotate(-Math.PI / 4)
		g.scale(1, 1.7)
		g.textAlign = "center"
		g.textBaseline = "middle"
		const big = shape !== "normal"
		g.font = `800 ${big ? 36 : 30}px ${DISPLAY_FONT}`
		g.lineWidth = 7
		g.strokeStyle = "rgba(90,40,30,.5)"
		g.lineJoin = "round"
		const t1 = info.name.toUpperCase()
		g.strokeText(t1, 0, -12)
		g.fillStyle = "#fff7ea"
		g.fillText(t1, 0, -12)
		g.font = '800 17px "Nunito Sans", Arial, sans-serif'
		g.lineWidth = 5
		g.strokeText(info.sub, 0, 12)
		g.fillText(info.sub, 0, 12)
		g.restore()
	})
}

export { HOUR }
