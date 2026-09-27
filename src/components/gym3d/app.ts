// The mounted 3D gym: renderer + world + people + labels, the sim-state poll,
// tap picking and drag / pinch camera. Everything it creates is freed by
// dispose(), so mounting and unmounting repeatedly does not leak.
import * as T from "three"
import {
	finishCost,
	levelProgress,
	upgradeInfo,
} from "../../../shared/gym3d/economy"
import { NEIGHBOURHOOD_COLS, SHAPE_INFO } from "../../../shared/gym3d/lots"
import {
	type EquipmentRoomType,
	PD,
	PW,
	RT,
	roomSpots,
} from "../../../shared/gym3d/rooms"
import type { GymJobDto, GymLayoutDto } from "../../../shared/types"
import { AssetCache } from "./engine/assets"
import { GymRenderer, hasWebGL2 } from "./engine/renderer"
import { People } from "./people/members"
import { ambientCap, assignTargets, type PieceIn } from "./world/assignTargets"
import { BlobShadows } from "./world/blobShadows"
import {
	BuildLayer,
	fmtLeft,
	jobLeft,
	jobProgress,
	type PadRef,
} from "./world/build"
import {
	badgeAnchor,
	type Label,
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
import type { Person, Piece } from "./world/types"
import { GymWorld, type PickInfo } from "./world/world"

export const POLL_INTERVAL = 30000

export type Selection =
	| { kind: "person"; key: string; name: string; npcKey: string | null }
	| { kind: "piece"; id: number; name: string }
	| { kind: "lot"; lotId: string }
	| {
			kind: "spot"
			roomId: number
			spot: number
			size: number
			unlock: number
			open: boolean
	  }
	| { kind: "room"; roomId: number; paint?: boolean }
	| { kind: "job"; jobId: number }

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
	lots: number
	pads: number
	jobs: number
	coins: number
}

export type JobAction = "finish" | "workout"

export type AppOpts = {
	onSelect: (s: Selection | null) => void
	/** A piece was dropped / tapped onto a spot (move mode or drag). */
	onMoveTarget?: (pieceId: number, roomId: number, spot: number) => void
	/** Move mode or a drag ended without a target. */
	onMoveEnd?: () => void
	/** A button on a job's timer bubble. */
	onJobAction?: (jobId: number, action: JobAction, cost: number) => void
	/** The ribbon was cut on a finished job (toast time). */
	onJobDone?: (job: GymJobDto, title: string) => void
	/** An active job's time is up: reload the layout (the server settles). */
	onJobDue?: () => void
	/** A short hint for the player. */
	onHint?: (text: string) => void
}

function newRoomBadge(): HTMLButtonElement {
	const el = document.createElement("button")
	el.type = "button"
	el.className = "g3d-badge"
	el.textContent = "New room: choose its type"
	return el
}

const SEEN_KEY = "sp:gym3d:seenJob"

function readSeen(): number {
	try {
		return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0
	} catch {
		return 0
	}
}

function writeSeen(id: number): void {
	try {
		if (id > readSeen()) localStorage.setItem(SEEN_KEY, String(id))
	} catch {
		// private mode: celebrations may repeat, nothing else breaks
	}
}

type Bubble = {
	L: Label
	job: GymJobDto
	bar: HTMLElement
	left: HTMLElement
	cost: HTMLElement
	shown: string
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
	private build: BuildLayer
	private badges: Label[] = []
	private bubbles = new Map<number, Bubble>()
	private skew = 0
	private dueAsked = false
	private tick1 = 0
	private floorPlane = new T.Plane(new T.Vector3(0, 1, 0), 0)
	/** Tap-move-tap: the piece being moved and where it may go. */
	private moving: { piece: Piece; targets: PadRef[] } | null = null
	/** A drag of a piece onto a spot. */
	private drag: {
		piece: Piece
		targets: PadRef[]
		target: PadRef | null
	} | null = null
	private press: {
		id: number
		piece: Piece
		x0: number
		y0: number
		selected: boolean
		timer: ReturnType<typeof setTimeout> | null
	} | null = null
	private pollSoon: ReturnType<typeof setTimeout> | null = null

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
			this.build = new BuildLayer(this.world)
		} catch (e) {
			this.r.dispose()
			unbindWorld()
			this.assets.dispose()
			throw e
		}
		this.skew = Date.parse(layout.serverNow) - Date.now() || 0
		this.build.sync(layout, this.now())
		this.rebuildBadges()
		this.syncBubbles()
		this.celebrateUnseen(layout)
		this.fitView()
		this.bounds = {
			x0: 0,
			x1: NEIGHBOURHOOD_COLS * PW,
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
		const now = this.now()
		this.build.frame(dt, now, this.frameN)
		if (this.build.busy && this.frameN % 10 === 0) this.r.dirtyShadow()
		this.tick1 += dt
		if (this.tick1 >= 0.5) {
			this.tick1 = 0
			this.updateBubbles(now)
		}
		this.r.render(this.world.scene)
		this.labels.update(this.r)
		this.placeChip()
	}

	// ── layout changes ─────────────────────────────────────────────────────

	/** Server clock now. */
	now(): number {
		return Date.now() + this.skew
	}

	get layout(): GymLayoutDto {
		return this.world.layout
	}

	/** Applies a new layout from the server in place (people keep walking),
	 * and cuts the ribbon on jobs that finished since the last one. */
	applyLayout(next: GymLayoutDto): void {
		if (this.disposed) return
		bindWorld(this.world.ctx)
		const prev = this.world.layout
		this.skew = Date.parse(next.serverNow) - Date.now() || this.skew
		const finished = next.jobs.filter(
			(j) =>
				j.status === "done" &&
				prev.jobs.some((q) => q.id === j.id && q.status === "active"),
		)
		const rects = new Map(
			finished.map((j) => [j.id, this.build.siteOf(j.id)] as const),
		)
		this.endMove(false)
		const diff = this.world.applyLayout(next)
		this.people.layoutChanged(diff.removed)
		this.build.sync(next, this.now())
		this.rebuildBadges()
		this.syncBubbles()
		for (const j of finished) this.celebrate(j, rects.get(j.id) ?? null)
		this.dueAsked = false
		this.r.dirtyShadow()
		// the selection may point at something that moved or went away
		const s = this.sel
		if (s?.kind === "piece" && !this.world.pieces.some((p) => p.id === s.id))
			this.select(null)
		else if (s?.kind === "lot" && !next.lots.some((l) => l.id === s.lotId))
			this.select(null)
		// named NPCs whose stations moved get new targets
		if (this.pollSoon) clearTimeout(this.pollSoon)
		this.pollSoon = setTimeout(() => {
			this.pollSoon = null
			void this.pollSim(false).catch(() => {})
		}, 400)
	}

	private rebuildBadges(): void {
		for (const b of this.badges) this.labels.remove(b)
		this.badges = []
		for (const room of this.world.rooms) {
			// the lobby has no level of its own; rooms being built show a timer
			if (room.type === "lobby" || room.building) continue
			const a = badgeAnchor(room.cx, room.z0)
			const typed = room.type in RT
			const el = typed
				? roomBadge(
						room.name,
						room.level,
						levelProgress(room.level, room.points).k,
					)
				: newRoomBadge()
			if (!typed) el.classList.add("g3d-badge-new")
			const id = room.id
			el.addEventListener("click", (e) => {
				e.stopPropagation()
				this.select({ kind: "room", roomId: id })
			})
			this.badges.push(this.labels.add(el, () => a, { soft: true }))
		}
	}

	private jobTitle(j: GymJobDto): string {
		const h = Math.round(
			(Date.parse(j.endsAt) - Date.parse(j.startedAt)) / 3_600_000,
		)
		if (j.kind === "plot") {
			const r = this.world.rooms.find((q) => q.id === j.roomId)
			const shape = (r?.shape ?? "normal") as keyof typeof SHAPE_INFO
			return `${SHAPE_INFO[shape]?.name ?? "Plot"}: building`
		}
		const p = this.world.pieces.find((q) => q.id === j.pieceId)
		void h
		return `${p?.name ?? "Gear"} to tier ${j.targetTier ?? 2}`
	}

	/** Timer bubbles, one per running job, clamped on screen. */
	private syncBubbles(): void {
		const active = new Map(
			this.world.layout.jobs
				.filter((j) => j.status === "active")
				.map((j) => [j.id, j]),
		)
		for (const [id, b] of this.bubbles) {
			const j = active.get(id)
			if (j) {
				b.job = j
				continue
			}
			this.labels.remove(b.L)
			this.bubbles.delete(id)
		}
		const anchors = new Map(
			this.build.siteAnchors().map((a) => [a.jobId, a] as const),
		)
		for (const j of active.values()) {
			if (this.bubbles.has(j.id)) continue
			const an = anchors.get(j.id)
			if (!an) continue
			const v = new T.Vector3(an.x, an.y, an.z)
			const el = document.createElement("div")
			el.className = "g3d-bub"
			el.dataset.job = String(j.id)
			const title = document.createElement("b")
			title.textContent = this.jobTitle(j)
			const bar = document.createElement("span")
			bar.className = "g3d-pbar"
			const fill = document.createElement("i")
			bar.append(fill)
			const left = document.createElement("span")
			left.className = "g3d-left"
			const row = document.createElement("span")
			row.className = "g3d-bb"
			const fin = document.createElement("button")
			fin.type = "button"
			fin.className = "g3d-fin"
			const coin = document.createElement("span")
			coin.className = "g3d-coin"
			coin.setAttribute("aria-hidden", "true")
			const cost = document.createElement("span")
			fin.append("Finish ", coin, cost)
			const wk = document.createElement("button")
			wk.type = "button"
			wk.className = "g3d-wk"
			wk.textContent = "Log a workout: −1h"
			row.append(fin, wk)
			el.append(title, bar, left, row)
			const id = j.id
			fin.addEventListener("click", (e) => {
				e.stopPropagation()
				const b = this.bubbles.get(id)
				if (b)
					this.opts.onJobAction?.(
						id,
						"finish",
						finishCost(jobLeft(b.job, this.now())),
					)
			})
			wk.addEventListener("click", (e) => {
				e.stopPropagation()
				this.opts.onJobAction?.(id, "workout", 0)
			})
			const L = this.labels.add(el, () => v, { clamp: true })
			this.bubbles.set(j.id, {
				L,
				job: j,
				bar: fill,
				left,
				cost,
				shown: "",
			})
		}
		this.updateBubbles(this.now())
	}

	private updateBubbles(now: number): void {
		let due = false
		for (const b of this.bubbles.values()) {
			const ms = jobLeft(b.job, now)
			if (ms <= 0) due = true
			const k = jobProgress(b.job, now)
			const pc = `${Math.round(k * 200) / 2}%`
			const lt = ms > 0 ? `${fmtLeft(ms)} left` : "Finishing..."
			const c = String(finishCost(ms))
			const key = `${pc}|${lt}|${c}`
			if (key === b.shown) continue
			b.shown = key
			b.bar.style.width = pc
			b.left.textContent = lt
			b.cost.textContent = c
		}
		if (due && !this.dueAsked) {
			this.dueAsked = true
			this.opts.onJobDue?.()
		}
	}

	/** Ribbon cutting + confetti for a finished job; toast via onJobDone. */
	private celebrate(
		j: GymJobDto,
		rect: { x: number; z: number; w: number; d: number } | null,
	): void {
		writeSeen(j.id)
		let r = rect
		if (!r) {
			if (j.kind === "plot") {
				const room = this.world.rooms.find((q) => q.id === j.roomId)
				if (!room) return
				const c = room.cells[0]
				r = {
					x: c.px * PW + PW / 2,
					z: c.pz * PD + PD / 2,
					w: PW - 0.8,
					d: PD - 0.8,
				}
			} else {
				const p = this.world.pieces.find((q) => q.id === j.pieceId)
				if (!p) return
				r = { x: p.x, z: p.z, w: p.size, d: p.size }
			}
		}
		const title = j.kind === "plot" ? "New room!" : `Tier ${j.targetTier ?? 2}!`
		const fr = r
		this.build.ceremony(
			fr.x,
			fr.z,
			j.kind === "plot" ? 4 : fr.w,
			Math.min(fr.d, PD - 1),
			() => this.opts.onJobDone?.(j, title),
		)
	}

	/** Jobs that finished while the player was away get their ribbon once. */
	private celebrateUnseen(layout: GymLayoutDto): void {
		const seen = readSeen()
		const fresh = layout.jobs.filter((j) => j.status === "done" && j.id > seen)
		if (!seen) {
			// first visit on this device: remember, do not replay history
			for (const j of layout.jobs) writeSeen(j.id)
			return
		}
		for (const j of fresh.slice(-3)) this.celebrate(j, null)
	}

	/** Screen space the HUD (top) and an open sheet (bottom) cover. */
	setInsets(top: number, bottom: number): void {
		this.labels.insets = { top, bottom }
		for (const b of this.bubbles.values()) this.labels.remeasure(b.L)
	}

	// ── moving pieces ─────────────────────────────────────────────────────

	/** Spots a piece can go to: same room type, same size, open, not its own
	 * (filled spots swap). */
	targetsFor(p: Piece): PadRef[] {
		if (!p.roomType || p.locked || p.status !== "placed") return []
		const out: PadRef[] = []
		const pieces = this.world.layout.pieces
		for (const r of this.world.rooms) {
			if (r.type !== p.roomType || r.building || !(r.type in RT)) continue
			for (const s of roomSpots(r.type as EquipmentRoomType, r.cells)) {
				if (s.size !== p.size || s.unlock > r.level) continue
				if (r.id === p.roomId && s.index === p.spotIndex) continue
				const on = pieces.find(
					(q) => q.roomId === r.id && q.spotIndex === s.index,
				)
				if (on && on.status === "upgrading") continue
				out.push({
					roomId: r.id,
					spot: s.index,
					x: s.x,
					z: s.z,
					size: s.size,
					unlock: s.unlock,
					open: true,
					filled: !!on,
				})
			}
		}
		return out
	}

	/** Tap-move-tap: shows where the piece can go; the next tap on a mark
	 * moves it (onMoveTarget), anywhere else cancels. Returns the number of
	 * places it can go. */
	beginMove(pieceId: number): number {
		const p = this.world.pieces.find((q) => q.id === pieceId)
		if (!p) return 0
		const targets = this.targetsFor(p)
		this.endMove(false)
		if (!targets.length) return 0
		this.moving = { piece: p, targets }
		this.build.showTargets(targets)
		return targets.length
	}

	endMove(notify = true): void {
		const was = !!this.moving || !!this.drag
		if (this.drag) {
			const p = this.drag.piece
			p.root.position.set(p.x, 0, p.z)
			this.drag = null
		}
		this.moving = null
		this.build.showTargets(null)
		if (was && notify) this.opts.onMoveEnd?.()
	}

	/** Spots the piece being moved can go to, with screen points (tests). */
	moveTargets(): { roomId: number; spot: number; x: number; y: number }[] {
		return (this.moving?.targets ?? []).map((t) => ({
			roomId: t.roomId,
			spot: t.spot,
			...this.screenAt(t.x, t.filled ? 0.9 : 0.05, t.z),
		}))
	}

	get isMoving(): boolean {
		return !!this.moving
	}

	private floorAt(x: number, y: number): T.Vector3 | null {
		const { w, h } = this.r.size
		this.ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1)
		this.ray.setFromCamera(this.ndc, this.r.cam)
		return this.ray.ray.intersectPlane(this.floorPlane, _f) ? _f : null
	}

	private startDrag(p: Piece): boolean {
		const targets = this.targetsFor(p)
		if (!targets.length) {
			this.opts.onHint?.("No other spot fits it right now.")
			return false
		}
		this.moving = null
		this.drag = { piece: p, targets, target: null }
		this.build.showTargets(targets)
		p.root.position.y = 0.45
		this.opts.onHint?.("Drop it on a glowing spot. A filled spot swaps.")
		return true
	}

	private dragMove(x: number, y: number): void {
		const d = this.drag
		if (!d) return
		const f = this.floorAt(x, y)
		if (!f) return
		d.piece.root.position.set(f.x, 0.45, f.z)
		let best: PadRef | null = null
		let bd = 1.8
		for (const t of d.targets) {
			const dist = Math.hypot(t.x - f.x, t.z - f.z)
			if (dist < bd) {
				bd = dist
				best = t
			}
		}
		if (best !== d.target) {
			d.target = best
			this.build.hoverTarget(best)
		}
	}

	private dragDrop(): void {
		const d = this.drag
		if (!d) return
		const t = d.target
		const p = d.piece
		if (t) {
			// sit it on the spot right away; the server's answer rebuilds it
			p.root.position.set(t.x, 0, t.z)
			this.drag = null
			this.build.showTargets(null)
			this.build.dustAt(t.x, 0.1, t.z, 8, p.size * 0.5)
			this.opts.onMoveTarget?.(p.id, t.roomId, t.spot)
			return
		}
		const x0 = p.root.position.x
		const z0 = p.root.position.z
		this.drag = null
		this.build.showTargets(null)
		this.build.tween(0.25, (k) => {
			p.root.position.set(
				x0 + (p.x - x0) * k,
				0.45 * (1 - k),
				z0 + (p.z - z0) * k,
			)
		})
		this.opts.onMoveEnd?.()
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
		if (s.kind !== "piece") return null
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

	/** Sets the selection (the UI closes a sheet with null). */
	select(s: Selection | null): void {
		this.sel = s
		this.opts.onSelect(s)
	}

	/** Reads the layout again (a job's time is up: the server settles it). */
	async reload(): Promise<GymLayoutDto> {
		const next = await loadLayout()
		this.applyLayout(next)
		return next
	}

	/** Picks what is under a canvas point: a person, else the nearest
	 * piece, spot, lot, construction site, floor or wall. */
	pickAt(x: number, y: number): Selection | null {
		const { w, h } = this.r.size
		this.ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1)
		this.ray.setFromCamera(this.ndc, this.r.cam)
		this.world.scene.updateMatrixWorld()
		// named NPCs (Talk) first; then gear and sites, so a member on a
		// treadmill does not hide the treadmill; then other people
		let person: Selection | null = null
		const hitP = this.ray.intersectObjects(this.people.pickables(), false)[0]
		if (hitP) {
			const info = hitP.object.userData.pick as PickInfo
			if (info.kind === "person") {
				const p = this.people.find(info.key)
				if (p?.npcKey) return this.selectionOf(p)
				if (p) person = this.selectionOf(p)
			}
		}
		const hits = this.ray.intersectObjects(
			[...this.world.pickables, ...this.build.pickables],
			false,
		)
		for (const hit of hits) {
			const info = hit.object.userData.pick as PickInfo | undefined
			// only builder gear (and sites) wins over a person: fixtures like
			// the reception desk still name the staff member behind them
			if (
				(info?.kind === "piece" && info.piece.roomType) ||
				info?.kind === "job"
			)
				break
			if (person) return person
			break
		}
		if (person && !hits.length) return person
		const objs = [
			...this.world.pickables,
			...this.build.pickables,
			...this.world.structure,
		]
		for (const hit of this.ray.intersectObjects(objs, false)) {
			const o = hit.object
			const pads = o.userData.pads as PadRef[] | undefined
			if (pads && hit.instanceId != null) {
				const pd = pads[hit.instanceId]
				if (pd)
					return {
						kind: "spot",
						roomId: pd.roomId,
						spot: pd.spot,
						size: pd.size,
						unlock: pd.unlock,
						open: pd.open,
					}
				continue
			}
			const info = o.userData.pick as PickInfo | undefined
			if (!info) continue
			switch (info.kind) {
				case "piece":
					return { kind: "piece", id: info.piece.id, name: info.piece.name }
				case "lot":
					return { kind: "lot", lotId: info.lotId }
				case "job": {
					const j = this.world.layout.jobs.find((q) => q.id === info.jobId)
					if (j?.kind === "upgrade" && j.pieceId != null) {
						const p = this.world.pieces.find((q) => q.id === j.pieceId)
						if (p) return { kind: "piece", id: p.id, name: p.name }
					}
					return { kind: "job", jobId: info.jobId }
				}
				case "floor":
					return { kind: "room", roomId: info.roomId }
				case "wall": {
					// the visible face of a wall belongs to the room in front of it
					const id = this.world.roomIdAt(hit.point.x + 0.3, hit.point.z + 0.3)
					if (id != null) return { kind: "room", roomId: id, paint: true }
					break
				}
				default:
					break
			}
		}
		return null
	}

	/** The move mark under a canvas point, in move mode. */
	private targetAt(x: number, y: number): PadRef | null {
		const { w, h } = this.r.size
		this.ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1)
		this.ray.setFromCamera(this.ndc, this.r.cam)
		const hit = this.ray.intersectObjects(this.build.targetMeshes, false)[0]
		if (hit) return hit.object.userData.target as PadRef
		// generous on phones: the nearest mark within a spot's reach
		const f = this.floorAt(x, y)
		if (!f || !this.moving) return null
		let best: PadRef | null = null
		let bd = 1.4
		for (const t of this.moving.targets) {
			const d = Math.hypot(t.x - f.x, t.z - f.z)
			if (d < bd) {
				bd = d
				best = t
			}
		}
		return best
	}

	tapAt(x: number, y: number): Selection | null {
		if (this.moving) {
			const t = this.targetAt(x, y)
			const p = this.moving.piece
			if (t) {
				this.moving = null
				this.build.showTargets(null)
				p.root.position.set(t.x, 0, t.z)
				this.build.dustAt(t.x, 0.1, t.z, 8, p.size * 0.5)
				this.opts.onMoveTarget?.(p.id, t.roomId, t.spot)
				return { kind: "piece", id: p.id, name: p.name }
			}
			this.endMove()
			return null
		}
		const s = this.pickAt(x, y)
		this.select(s)
		return s
	}

	/** Screen point (inside the host) of a world point, for tests. */
	screenAt(x: number, y: number, z: number): { x: number; y: number } {
		return { ...this.r.toScreen(_a.set(x, y, z), { x: 0, y: 0 }) }
	}

	/** Frames a world point (e.g. a new site) with a short camera glide. */
	panTo(x: number, z: number): void {
		const t = this.r.target
		const x0 = t.x
		const z0 = t.z
		this.build.tween(0.5, (k) => {
			const e = 1 - (1 - k) ** 3
			t.x = x0 + (x - x0) * e
			t.z = z0 + (z - z0) * e
			this.r.placeCam()
		})
	}

	sparkleRoom(roomId: number, col: string): void {
		this.build.sparkleRoom(roomId, col)
	}

	bounceJob(jobId: number): void {
		this.build.bounceSite(jobId)
	}

	/** Upgrade price shown for a piece (same function the server charges). */
	upgradeOf(pieceId: number): ReturnType<typeof upgradeInfo> {
		const p = this.world.pieces.find((q) => q.id === pieceId)
		return p ? upgradeInfo(p.itemKey, p.tier) : null
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
		const local = (ev: PointerEvent) => {
			const b = el.getBoundingClientRect()
			return { x: ev.clientX - b.left, y: ev.clientY - b.top }
		}
		const cancelPress = () => {
			if (this.press?.timer) clearTimeout(this.press.timer)
			this.press = null
		}
		this.on(el, "pointerdown", (e) => {
			const ev = e as PointerEvent
			const { x, y } = local(ev)
			this.pointers.set(ev.pointerId, {
				x,
				y,
				x0: x,
				y0: y,
				t0: performance.now(),
			})
			el.setPointerCapture?.(ev.pointerId)
			if (this.pointers.size === 2) {
				const [a, c] = [...this.pointers.values()]
				this.pinch0 = Math.hypot(a.x - c.x, a.y - c.y)
				this.zoom0 = this.r.zoom
				cancelPress()
				if (this.drag) this.endMove()
				return
			}
			if (this.pointers.size > 1) return
			// a press on movable gear: drag it when it is already selected (or
			// being moved), or after a short hold; a quick swipe still pans
			const s = this.pickAt(x, y)
			if (s?.kind !== "piece") return
			const p = this.world.pieces.find((q) => q.id === s.id)
			if (!p?.roomType || p.locked || p.status !== "placed") return
			const selected =
				(this.sel?.kind === "piece" && this.sel.id === p.id) ||
				this.moving?.piece === p
			const press = {
				id: ev.pointerId,
				piece: p,
				x0: x,
				y0: y,
				selected,
				timer: null as ReturnType<typeof setTimeout> | null,
			}
			press.timer = setTimeout(() => {
				press.timer = null
				if (this.press !== press || this.drag) return
				if (this.startDrag(p))
					this.select({ kind: "piece", id: p.id, name: p.name })
			}, 380)
			this.press = press
		})
		this.on(el, "pointermove", (e) => {
			const ev = e as PointerEvent
			const pt = this.pointers.get(ev.pointerId)
			if (!pt) return
			const { x, y } = local(ev)
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
			if (this.drag) {
				this.dragMove(x, y)
				return
			}
			const far = Math.hypot(x - pt.x0, y - pt.y0) > 7
			if (this.press && far) {
				const pr = this.press
				cancelPress()
				if (pr.selected && this.startDrag(pr.piece)) {
					this.dragMove(x, y)
					return
				}
			}
			if (Math.hypot(x - pt.x0, y - pt.y0) > 6) this.pan(dx, dy)
		})
		const up = (e: Event) => {
			const ev = e as PointerEvent
			const pt = this.pointers.get(ev.pointerId)
			this.pointers.delete(ev.pointerId)
			if (this.pointers.size < 2) this.pinch0 = 0
			const wasPress = this.press
			cancelPress()
			if (this.drag) {
				if (ev.type === "pointercancel") this.endMove()
				else this.dragDrop()
				return
			}
			if (!pt || ev.type === "pointercancel") return
			const moved = Math.hypot(pt.x - pt.x0, pt.y - pt.y0)
			if (
				moved < 8 &&
				performance.now() - pt.t0 < 600 &&
				this.pointers.size === 0
			)
				this.tapAt(pt.x, pt.y)
			void wasPress
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
			lots: this.world.layout.lots.length,
			pads: this.build.pads.length,
			jobs: this.world.layout.jobs.filter((j) => j.status === "active").length,
			coins: this.world.layout.coins,
		}
	}

	dispose(): void {
		if (this.disposed) return
		this.disposed = true
		if (this.pollTimer) clearInterval(this.pollTimer)
		this.pollTimer = null
		if (this.pollSoon) clearTimeout(this.pollSoon)
		this.pollSoon = null
		if (this.press?.timer) clearTimeout(this.press.timer)
		this.press = null
		for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn)
		this.listeners = []
		this.pointers.clear()
		this.chip = null
		this.r.dispose()
		this.labels.dispose()
		bindWorld(this.world.ctx)
		this.people.dispose()
		this.build.dispose()
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
const _f = new T.Vector3()
