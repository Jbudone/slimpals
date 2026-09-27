// The mounted 3D gym: renderer + world + people + labels, the sim-state poll,
// tap picking and drag / pinch camera. Everything it creates is freed by
// dispose(), so mounting and unmounting repeatedly does not leak.
import * as T from "three"
import { AssetCache } from "./engine/assets"
import { GymRenderer, hasWebGL2 } from "./engine/renderer"
import { People } from "./people/members"
import { ambientCap, assignTargets, type PieceIn } from "./world/assignTargets"
import { BlobShadows } from "./world/blobShadows"
import {
	badgeAnchor,
	LabelLayer,
	type LabelLayer as LabelLayerT,
	roomBadge,
} from "./world/labels"
import {
	loadLayout,
	loadRoster,
	loadSimNpcs,
	type NpcRosterEntry,
} from "./world/loadLayout"
import { bindWorld, isBound, unbindWorld } from "./world/state"
import type { Person } from "./world/types"
import { GymWorld, type PickInfo } from "./world/world"

export const POLL_INTERVAL = 30000

export type Selection =
	| { kind: "person"; key: string; name: string; npcKey: string | null }
	| { kind: "piece"; id: number; name: string }

export type Gym3DStats = {
	rooms: number
	pieces: number
	people: number
	drawCalls: number
	triangles: number
	geometries: number
	textures: number
	assets: number
	quality: string
	fps: number
	running: boolean
}

export type AppOpts = {
	onSelect: (s: Selection | null) => void
}

export class Gym3DApp {
	private r: GymRenderer
	private assets = new AssetCache()
	private world: GymWorld
	private people: People
	private labels: LabelLayerT
	private blobs: BlobShadows
	private roster: NpcRosterEntry[] = []
	private pollTimer: ReturnType<typeof setInterval> | null = null
	private frameN = 0
	private disposed = false
	private sel: Selection | null = null
	private chip: HTMLElement | null = null
	private chipPt = { x: 0, y: 0 }
	private ray = new T.Raycaster()
	private ndc = new T.Vector2()
	private pointers = new Map<
		number,
		{ x: number; y: number; x0: number; y0: number; t0: number }
	>()
	private pinch0 = 0
	private zoom0 = 1
	private bounds = { x0: 0, x1: 27, z0: 0, z1: 21 }
	private listeners: [EventTarget, string, EventListener][] = []

	/** Builds the gym. Throws (the caller falls back to the 2D gym) when
	 * WebGL2 is missing or the build fails. */
	static async create(host: HTMLElement, opts: AppOpts): Promise<Gym3DApp> {
		if (!hasWebGL2()) throw new Error("WebGL2 unavailable")
		const [layout, roster] = await Promise.all([
			loadLayout(),
			loadRoster().catch(() => []),
		])
		const app = new Gym3DApp(host, layout, roster, opts)
		try {
			await app.pollSim(true)
		} catch {
			// the gym still renders without people from the sim
		}
		return app
	}

	private constructor(
		host: HTMLElement,
		layout: Awaited<ReturnType<typeof loadLayout>>,
		roster: NpcRosterEntry[],
		private opts: AppOpts,
	) {
		this.roster = roster
		this.r = new GymRenderer(host)
		try {
			this.world = new GymWorld(layout, this.assets)
			this.blobs = new BlobShadows(this.world.scene)
			this.people = new People(this.world)
			this.labels = new LabelLayer(host)
		} catch (e) {
			this.r.dispose()
			unbindWorld()
			this.assets.dispose()
			throw e
		}
		for (const room of this.world.rooms) {
			// the lobby has no level of its own, so no badge
			if (room.type === "lobby") continue
			const a = badgeAnchor(room.cx, room.z0)
			this.labels.add(roomBadge(room.name, room.level), () => a)
		}
		this.fitView()
		this.bounds = {
			x0: 0,
			x1: this.world.cols * 9,
			z0: 0,
			z1: this.world.frontZ + 3,
		}
		this.r.onQuality = (q) => {
			this.assets.OUTLINE.visible = q.ol
			this.assets.OUTLINES.visible = q.ol
			this.world.sun.castShadow = q.sh
			this.people.cap = ambientCap(this.r.lvl)
			this.r.dirtyShadow()
		}
		this.people.cap = ambientCap(this.r.lvl)
		this.people.seedMembers()
		this.bindInput()
		this.r.start((dt) => this.frame(dt))
		this.pollTimer = setInterval(() => {
			void this.pollSim(false).catch(() => {})
		}, POLL_INTERVAL)
	}

	/** Frames every built room (plus the entrance) in the view. */
	private fitView(): void {
		const r = this.r
		let x0 = Number.POSITIVE_INFINITY
		let x1 = Number.NEGATIVE_INFINITY
		let z0 = Number.POSITIVE_INFINITY
		let z1 = Number.NEGATIVE_INFINITY
		for (const room of this.world.rooms)
			for (const c of room.cells) {
				x0 = Math.min(x0, c.px * 9)
				x1 = Math.max(x1, c.px * 9 + 9)
				z0 = Math.min(z0, c.pz * 6)
				z1 = Math.max(z1, c.pz * 6 + 6)
			}
		if (!Number.isFinite(x0)) {
			const v = this.world.view
			r.target.set(v.x, 0, v.z)
			r.placeCam()
			return
		}
		z1 += 1.6 // the entrance canopy
		r.zoom = 1
		r.target.set((x0 + x1) / 2, 0, (z0 + z1) / 2)
		r.placeCam()
		r.cam.updateMatrixWorld()
		let nx0 = Number.POSITIVE_INFINITY
		let nx1 = Number.NEGATIVE_INFINITY
		let ny0 = Number.POSITIVE_INFINITY
		let ny1 = Number.NEGATIVE_INFINITY
		for (const x of [x0, x1])
			for (const z of [z0, z1])
				for (const y of [0, 2.7]) {
					_v.set(x, y, z).project(r.cam)
					nx0 = Math.min(nx0, _v.x)
					nx1 = Math.max(nx1, _v.x)
					ny0 = Math.min(ny0, _v.y)
					ny1 = Math.max(ny1, _v.y)
				}
		// re-centre on the projected box, then zoom so it fills ~90%
		_v.set((nx0 + nx1) / 2, (ny0 + ny1) / 2, 0).unproject(r.cam)
		_a.set(0, 0, 0).unproject(r.cam)
		r.target.add(_v.sub(_a))
		const half = Math.max((nx1 - nx0) / 2, (ny1 - ny0) / 2)
		r.zoom = Math.min(2.2, Math.max(0.7, 0.9 / half))
		// A big gym on a phone would shrink to a thumbnail: stay close enough
		// to read people and centre on the lobby and the room behind it (drag
		// or pinch to see the rest).
		const { w, h } = r.size
		const minZoom = w < h ? 1.35 : 0.9
		if (r.zoom < minZoom) {
			r.zoom = minZoom
			const lb = this.world.lobby
			r.target.set(lb.x0 + 3.2, 0, lb.z0 - 0.4)
		}
		r.placeCam()
	}

	private async pollSim(first: boolean): Promise<void> {
		const npcs = await loadSimNpcs(this.roster)
		if (this.disposed) return
		bindWorld(this.world.ctx)
		const pieces: PieceIn[] = this.world.pieces.map((p) => ({
			id: p.id,
			upgradeKey: p.upgradeKey,
			stations: p.stations.map((s) => ({
				staff: !!s.staff,
				swim: s.pose === "swim",
			})),
		}))
		const views = this.roster.map((r) => ({
			npcKey: r.key,
			name: r.name,
			role: r.role,
		}))
		this.people.applyNpcs(views, assignTargets(npcs, pieces), first)
		this.syncChip()
	}

	private frame(dt: number): void {
		if (this.disposed) return
		if (!isBound(this.world.ctx)) bindWorld(this.world.ctx)
		this.frameN++
		this.world.frame(dt, (st) => !!st.busy)
		const cam = this.r.cam
		this.people.frame(
			dt,
			(v) => {
				_v.copy(v).project(cam)
				return _v.x > -1.12 && _v.x < 1.12 && _v.y > -1.12 && _v.y < 1.12
			},
			this.frameN,
		)
		this.blobs.begin()
		for (const p of this.people.people) {
			const r = p.rig.root.position
			this.blobs.add(r.x, Math.max(0.07, r.y + 0.05), r.z, 0.62, 0.62)
		}
		if (!this.r.quality.sh)
			for (const p of this.world.pieces) {
				const s = p.kind === "decor" ? 0.7 : p.size * 1.05
				this.blobs.add(p.x, 0.02, p.z, s, s)
			}
		this.blobs.end()
		this.r.render(this.world.scene)
		this.labels.update(this.r)
		this.placeChip()
	}

	// ── selection / name chip ───────────────────────────────────────────────

	setChipElement(el: HTMLElement | null): void {
		this.chip = el
		this.placeChip()
	}

	private anchorOf(s: Selection): T.Vector3 | null {
		if (s.kind === "person") {
			const p = this.people.find(s.key)
			return p
				? _a.copy(p.rig.root.position).setY(p.rig.root.position.y + 1.45)
				: null
		}
		const pc = this.world.pieces.find((q) => q.id === s.id)
		return pc ? _a.set(pc.x, pc.kind === "decor" ? 1.5 : 2.2, pc.z) : null
	}

	private placeChip(): void {
		const el = this.chip
		if (!el || !this.sel) return
		const a = this.anchorOf(this.sel)
		if (!a) return
		const p = this.r.toScreen(a, this.chipPt)
		const { w, h } = this.r.size
		const x = Math.min(Math.max(p.x, 70), w - 70)
		const y = Math.min(Math.max(p.y, 60), h - 8)
		el.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0) translate(-50%,-100%)`
	}

	/** Drops the selection when its person has left. */
	private syncChip(): void {
		if (this.sel?.kind === "person" && !this.people.find(this.sel.key))
			this.select(null)
		else if (this.sel?.kind === "person") {
			const p = this.people.find(this.sel.key)
			if (p && p.name !== this.sel.name) this.select(this.selectionOf(p))
		}
	}

	private selectionOf(p: Person): Selection {
		return { kind: "person", key: p.key, name: p.name, npcKey: p.npcKey }
	}

	private select(s: Selection | null): void {
		this.sel = s
		this.opts.onSelect(s)
	}

	/** Picks the person (or else piece) under a canvas point. */
	pickAt(x: number, y: number): Selection | null {
		const { w, h } = this.r.size
		this.ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1)
		this.ray.setFromCamera(this.ndc, this.r.cam)
		this.world.scene.updateMatrixWorld()
		const hitP = this.ray.intersectObjects(this.people.pickables(), false)[0]
		if (hitP) {
			const info = hitP.object.userData.pick as PickInfo
			if (info.kind === "person") {
				const p = this.people.find(info.key)
				if (p) return this.selectionOf(p)
			}
		}
		const hitW = this.ray.intersectObjects(this.world.pickables, false)[0]
		if (hitW) {
			const info = hitW.object.userData.pick as PickInfo
			if (info.kind === "piece")
				return { kind: "piece", id: info.piece.id, name: info.piece.name }
		}
		return null
	}

	tapAt(x: number, y: number): Selection | null {
		const s = this.pickAt(x, y)
		this.select(s)
		return s
	}

	/** Screen point (inside the host) of a person, for tests and tooling. */
	screenOf(key: string): { x: number; y: number } | null {
		const p = this.people.find(key)
		if (!p) return null
		_a.copy(p.rig.root.position).setY(0.8)
		return { ...this.r.toScreen(_a, { x: 0, y: 0 }) }
	}

	personKeys(): string[] {
		return this.people.people.map((p) => p.key)
	}

	// ── input ─────────────────────────────────────────────────────────────

	private on(
		t: EventTarget,
		type: string,
		fn: EventListener,
		opt?: AddEventListenerOptions,
	): void {
		t.addEventListener(type, fn, opt)
		this.listeners.push([t, type, fn])
	}

	private bindInput(): void {
		const el = this.r.renderer.domElement
		this.on(el, "pointerdown", (e) => {
			const ev = e as PointerEvent
			const b = el.getBoundingClientRect()
			const x = ev.clientX - b.left
			const y = ev.clientY - b.top
			this.pointers.set(ev.pointerId, {
				x,
				y,
				x0: x,
				y0: y,
				t0: performance.now(),
			})
			if (this.pointers.size === 2) {
				const [a, c] = [...this.pointers.values()]
				this.pinch0 = Math.hypot(a.x - c.x, a.y - c.y)
				this.zoom0 = this.r.zoom
			}
			el.setPointerCapture?.(ev.pointerId)
		})
		this.on(el, "pointermove", (e) => {
			const ev = e as PointerEvent
			const pt = this.pointers.get(ev.pointerId)
			if (!pt) return
			const b = el.getBoundingClientRect()
			const x = ev.clientX - b.left
			const y = ev.clientY - b.top
			const dx = x - pt.x
			const dy = y - pt.y
			pt.x = x
			pt.y = y
			if (this.pointers.size === 2) {
				const [a, c] = [...this.pointers.values()]
				const d = Math.hypot(a.x - c.x, a.y - c.y)
				if (this.pinch0 > 0) this.setZoom((this.zoom0 * d) / this.pinch0)
				return
			}
			if (Math.hypot(x - pt.x0, y - pt.y0) > 6) this.pan(dx, dy)
		})
		const up = (e: Event) => {
			const ev = e as PointerEvent
			const pt = this.pointers.get(ev.pointerId)
			this.pointers.delete(ev.pointerId)
			if (this.pointers.size < 2) this.pinch0 = 0
			if (!pt || ev.type === "pointercancel") return
			const moved = Math.hypot(pt.x - pt.x0, pt.y - pt.y0)
			if (
				moved < 8 &&
				performance.now() - pt.t0 < 600 &&
				this.pointers.size === 0
			)
				this.tapAt(pt.x, pt.y)
		}
		this.on(el, "pointerup", up)
		this.on(el, "pointercancel", up)
		this.on(
			el,
			"wheel",
			(e) => {
				const ev = e as WheelEvent
				ev.preventDefault()
				this.setZoom(this.r.zoom * (ev.deltaY > 0 ? 0.9 : 1.1))
			},
			{ passive: false },
		)
	}

	private setZoom(z: number): void {
		this.r.zoom = Math.min(2.2, Math.max(0.7, z))
		this.r.placeCam()
	}

	/** Drags the view: screen pixels -> ground units in the iso camera. */
	private pan(dx: number, dy: number): void {
		const { h } = this.r.size
		const k = (this.r.cam.top - this.r.cam.bottom) / h
		// camera right = (1, 0, -1)/sqrt2; screen up on the ground = (-1, 0, -1)
		// /sqrt2, stretched by the view's foreshortening (~1/sin 43.5deg).
		const s = Math.SQRT1_2
		const up = 1.45
		const t = this.r.target
		t.x += (-dx * s + -dy * s * up) * k
		t.z += (dx * s + -dy * s * up) * k
		t.x = Math.min(this.bounds.x1, Math.max(this.bounds.x0, t.x))
		t.z = Math.min(this.bounds.z1, Math.max(this.bounds.z0, t.z))
		this.r.placeCam()
	}

	// ── introspection & teardown ────────────────────────────────────────────

	stats(): Gym3DStats {
		const info = this.r.renderer.info
		return {
			rooms: this.world.rooms.length,
			pieces: this.world.pieces.length,
			people: this.people.people.length,
			drawCalls: info.render.calls,
			triangles: info.render.triangles,
			geometries: info.memory.geometries,
			textures: info.memory.textures,
			assets: this.assets.size,
			quality: this.r.quality.name,
			fps: Math.round(this.r.fps * 10) / 10,
			running: this.r.isRunning,
		}
	}

	dispose(): void {
		if (this.disposed) return
		this.disposed = true
		if (this.pollTimer) clearInterval(this.pollTimer)
		this.pollTimer = null
		for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn)
		this.listeners = []
		this.pointers.clear()
		this.chip = null
		this.r.dispose()
		this.labels.dispose()
		bindWorld(this.world.ctx)
		this.people.dispose()
		this.blobs.dispose()
		// Anything not in the asset cache (skinned-mesh skeletons are freed by
		// disposeRig; one-off geometries and materials are tracked) is swept
		// here so nothing outlives the component.
		this.world.scene.traverse((o) => {
			const m = o as T.Mesh
			if (m.geometry) m.geometry.dispose()
			const mat = m.material as T.Material | T.Material[] | undefined
			if (Array.isArray(mat)) for (const x of mat) x.dispose()
			else mat?.dispose()
		})
		this.world.scene.clear()
		this.assets.dispose()
		unbindWorld(this.world.ctx)
	}
}

const _v = new T.Vector3()
const _a = new T.Vector3()
