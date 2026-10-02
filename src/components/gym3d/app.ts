// The mounted 3D gym: renderer + world + people + labels, the sim-state poll,
// tap picking and drag / pinch camera. Everything it creates is freed by
// dispose(), so mounting and unmounting repeatedly does not leak.
import * as T from "three"
import { celebrationFor } from "../../../shared/gym3d/celebrations"
import {
	finishCost,
	levelProgress,
	upgradeInfo,
} from "../../../shared/gym3d/economy"
import { NEIGHBOURHOOD_COLS, SHAPE_INFO } from "../../../shared/gym3d/lots"
import {
	getRelationshipStage,
	getStageLabel,
	moodInfo,
	moodSpeed,
} from "../../../shared/gym3d/npcInfo"
import { firstName } from "../../../shared/gym3d/npcLines"
import {
	type EquipmentRoomType,
	PD,
	PW,
	RT,
	roomSpots,
} from "../../../shared/gym3d/rooms"
import type {
	GymIncomeSourceDto,
	GymJobDto,
	GymLayoutDto,
} from "../../../shared/types"
import { AssetCache } from "./engine/assets"
import { batchMesh, mulberry32, type Part, pBox } from "./engine/helpers"
import { GymRenderer, hasWebGL2 } from "./engine/renderer"
import { CAST, castHomes, outfitFor } from "./people/cast"
import { People } from "./people/members"
import { disposeRig, makeRig } from "./people/rig"
import { ambientCap, assignTargets, type PieceIn } from "./world/assignTargets"
import { BlobShadows } from "./world/blobShadows"
import {
	BuildLayer,
	fmtLeft,
	jobLeft,
	jobProgress,
	type PadRef,
} from "./world/build"
import { floorStation, Happenings } from "./world/happenings"
import { Kitchen } from "./world/kitchen"
import {
	badgeAnchor,
	type Label,
	LabelLayer,
	type LabelLayer as LabelLayerT,
	roomBadge,
} from "./world/labels"
import { Bubbles, Life } from "./world/life"
import {
	activeEvent,
	loadLayout,
	loadLines,
	loadRoster,
	loadSim,
	type NpcRosterEntry,
	type SimState,
	simNpcsIn,
} from "./world/loadLayout"
import { bindWorld, isBound, unbindWorld } from "./world/state"
import type { Person, Piece } from "./world/types"
import { GymWorld, type PickInfo } from "./world/world"

export const POLL_INTERVAL = 30000
/** Seconds the tap chip stays open on its own. */
export const CHIP_TTL = 15

/** What the tap chip shows about a person. */
export type PersonInfo = {
	/** Their job or who they are ("Head trainer", "Member"). */
	title: string | null
	/** "😄 Energized" (named NPCs). */
	mood: string | null
	/** What they are doing right now. */
	doing: string | null
	/** "Gym Buddy · 55" (named NPCs). */
	relation: string | null
	/** Relationship level 0..100 (named NPCs), for the bar. */
	bond: number | null
	hero: boolean
}

export type Selection =
	| {
			kind: "person"
			key: string
			name: string
			npcKey: string | null
			info: PersonInfo
	  }
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
	| { kind: "kitchen" }

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
	/** Speech bubbles on screen now. */
	says: number
	event: string
	classes: number
	classPeople: number
	heroes: number
	/** Coin bubbles showing now. */
	bubbles: number
	sweat: number
	greens: number
}

/** "sweat": spend 1 Sweat for an hour off; "finish": spend `cost` Sweat. */
export type JobAction = "sweat" | "finish"

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
	/** Coin bubbles tapped (income source keys); `from` is where the coins
	 * fly from. The UI posts the collect and applies the answer. */
	onCollect?: (keys: string[], from: HTMLElement | null) => void
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

/** A coin bubble: one per room (its machines together), the reception
 * desk and the kitchen. */
type CoinBubble = {
	L: Label
	kind: GymIncomeSourceDto["kind"]
	srcs: GymIncomeSourceDto[]
	/** Server time (ms) the banks were read at. */
	at: number
	v: T.Vector3
	n: HTMLElement
	shown: number
	full: boolean
}

const SWEAT_ICON =
	'<svg class="g3d-sw" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3.6 4.6 6.5 8.3 6.5 12a6.5 6.5 0 0 1-13 0c0-3.7 2.9-7.4 6.5-12z" fill="#3fa9f5"/><path d="M9 14.5a3 3 0 0 0 3 3" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>'

const COIN_SVG =
	'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f5b82e"/><circle cx="12" cy="12" r="7" fill="#ffd45c"/><path d="M12 8v8M9.5 10.5c0-1.4 5-1.4 5 0s-5 1.6-5 3 5 1.4 5 0" stroke="#b9791a" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>'

/** Coins a source holds at `now`, from what the server said at `at`. */
export function bankAt(
	src: GymIncomeSourceDto,
	at: number,
	now: number,
): number {
	const h = Math.max(0, now - at) / 3_600_000
	return Math.min(src.cap, Math.floor(src.bank + src.rate * h))
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
	/** The tap chip (a Svelte node), placed with the other bubbles. */
	private chipL: Label | null = null
	/** When (performance.now ms; wall time, not the frame clock) the tap
	 * chip closes by itself. */
	private chipUntil = 0
	/** A drag that started on a bubble ended: swallow its click. */
	private noClickUntil = 0
	private ray = new T.Raycaster()
	private ndc = new T.Vector2()
	private pointers = new Map<
		number,
		{
			x: number
			y: number
			x0: number
			y0: number
			t0: number
			/** Started on the canvas (not on a bubble). */
			canvas: boolean
			panning: boolean
		}
	>()
	private pinch0 = 0
	private zoom0 = 1
	private bounds = { x0: 0, x1: 27, z0: 0, z1: 21 }
	private listeners: [EventTarget, string, EventListener, boolean][] = []
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
	private says: Bubbles
	private life: Life
	private hap: Happenings
	private sim: SimState | null = null
	/** An upgrade claim in progress: workers, a progress bubble, taps help. */
	private claiming: {
		key: string
		piece: Piece | null
		x: number
		z: number
		size: number
		k: number
		L: Label
		bar: HTMLElement
		crate: T.Mesh | null
		done: () => void
	} | null = null
	private clock = 0
	private kitchen: Kitchen
	private coinBubs = new Map<string, CoinBubble>()

	/** Builds the gym. Throws (the caller falls back to the 2D gym) when
	 * WebGL2 is missing or the build fails. */
	static async create(host: HTMLElement, opts: AppOpts): Promise<Gym3DApp> {
		if (!hasWebGL2()) throw new Error("WebGL2 unavailable")
		const [layout, roster] = await Promise.all([
			loadLayout(true),
			loadRoster().catch(() => []),
		])
		const app = new Gym3DApp(host, layout, roster, opts)
		// bubble lines are a nicety: the built-in ones do without them
		loadLines()
			.then((l) => {
				if (!app.disposed) app.life.setLines(l)
			})
			.catch(() => {})
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
			this.hap = new Happenings(
				this.world,
				this.people,
				this.labels,
				this.build,
			)
			this.kitchen = new Kitchen(this.world)
			this.world.pickables.push(this.kitchen.hit)
			this.world.extraBlockers.push(...this.kitchen.blockers())
			this.world.paths.invalidate()
			this.kitchen.setMenu(layout.kitchen?.menu ?? [])
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
		this.syncCoins()
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
		const calm =
			typeof window !== "undefined" &&
			!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
		this.says = new Bubbles(this.labels, calm)
		this.people.onRemove = (p) => this.says.forget(p)
		this.life = new Life(
			this.says,
			() => this.people.people,
			mulberry32((Date.now() & 0xffff) + 7),
			calm,
		)
		this.bindInput(host)
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
		const [sim, roster] = await Promise.all([
			loadSim(),
			// names and relationship levels change as the member plays
			first ? this.roster : loadRoster().catch(() => this.roster),
		])
		if (this.disposed) return
		this.sim = sim
		this.roster = roster
		const npcs = simNpcsIn(sim, roster)
		const ev = activeEvent(sim)
		const host =
			ev?.npcKey && npcs.some((n) => n.npcKey === ev.npcKey && n.isPresent)
				? ev.npcKey
				: null
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
		this.people.applyNpcs(
			views,
			assignTargets(npcs, pieces, { homes: castHomes(), eventHost: host }),
			first,
		)
		const bySim = new Map(sim.npcs.map((n) => [n.npcKey, n]))
		for (const p of this.people.people)
			if (p.kind === "npc" && p.npcKey)
				p.speed = moodSpeed(bySim.get(p.npcKey)?.mood ?? 50)
		this.hap.setEvent(ev)
		this.hap.setClasses(sim.activeClasses)
		this.hap.syncHeroes(
			new Set(
				sim.npcs
					.filter((n) => n.isHeroVisit && n.isPresent)
					.map((n) => n.npcKey),
			),
		)
		this.life.setSim(sim.npcs, roster)
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
			this.updateCoins(now)
		}
		this.kitchen.frame(dt)
		this.clock += dt
		if (this.claiming) this.claimTick(dt)
		this.hap.frame(dt)
		this.life.tick(dt, this.clock)
		this.says.frame(this.clock)
		// the tap chip closes by itself after a while
		if (this.sel?.kind === "person" && performance.now() > this.chipUntil)
			this.select(null)
		this.r.render(this.world.scene)
		this.labels.update(this.r)
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
		this.hap.layoutChanged()
		this.build.sync(next, this.now())
		this.rebuildBadges()
		this.syncBubbles()
		this.kitchen.setMenu(next.kitchen?.menu ?? [])
		this.syncCoins()
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
			const sw = document.createElement("button")
			sw.type = "button"
			sw.className = "g3d-wk"
			sw.dataset.testid = "job-sweat"
			sw.innerHTML = `${SWEAT_ICON}<span>1 · −1h</span>`
			const fin = document.createElement("button")
			fin.type = "button"
			fin.className = "g3d-fin"
			fin.dataset.testid = "job-finish"
			const cost = document.createElement("span")
			fin.append("Finish ")
			fin.insertAdjacentHTML("beforeend", SWEAT_ICON)
			fin.append(cost)
			row.append(sw, fin)
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
			sw.addEventListener("click", (e) => {
				e.stopPropagation()
				this.opts.onJobAction?.(id, "sweat", 1)
			})
			const L = this.labels.add(el, () => v, {
				bubble: "timer",
				edge: true,
				tail: 10,
			})
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

	// ── idle coins (gym home) ───────────────────────────────────────────────

	/** Which bubble a source shows in: machines by room. */
	private coinGroup(src: GymIncomeSourceDto): string | null {
		if (src.kind !== "machine") return src.kind
		const p = this.world.layout.pieces.find((q) => q.id === src.pieceId)
		return p?.roomId != null ? `room:${p.roomId}` : null
	}

	private coinAnchor(group: string, out: T.Vector3): T.Vector3 | null {
		if (group === "kitchen") return out.copy(this.kitchen.anchor())
		if (group === "desk") {
			const d = this.world.pieces.find((p) => p.itemKey === "staff_reception")
			const lb = this.world.lobby
			return out.set(d?.x ?? lb.x0 + 7, 2.3, d?.z ?? lb.z0 + 2.5)
		}
		const id = Number(group.slice(5))
		const r = this.world.rooms.find((q) => q.id === id)
		return r ? out.set(r.cx, 2.4, r.cz + 0.6) : null
	}

	private coinSum(b: CoinBubble, now: number): { bank: number; cap: number } {
		let bank = 0
		let cap = 0
		for (const s of b.srcs) {
			bank += bankAt(s, b.at, now)
			cap += s.cap
		}
		return { bank, cap }
	}

	/** Coin bubbles (shown once they hold a coin), from the layout. */
	private syncCoins(): void {
		const lay = this.world.layout
		const at = Date.parse(lay.serverNow) || this.now()
		const groups = new Map<string, GymIncomeSourceDto[]>()
		for (const s of lay.income ?? []) {
			const g = this.coinGroup(s)
			if (!g) continue
			const list = groups.get(g)
			if (list) list.push(s)
			else groups.set(g, [s])
		}
		for (const [k, b] of this.coinBubs) {
			const srcs = groups.get(k)
			if (srcs && this.coinAnchor(k, b.v)) {
				b.srcs = srcs
				b.at = at
				b.shown = -1
				continue
			}
			this.labels.remove(b.L)
			this.coinBubs.delete(k)
		}
		for (const [k, srcs] of groups) {
			if (this.coinBubs.has(k)) continue
			const v = this.coinAnchor(k, new T.Vector3())
			if (!v) continue
			const kind = srcs[0].kind
			const el = document.createElement("button")
			el.type = "button"
			el.className = `g3d-cb g3d-cb-${kind}`
			el.dataset.income = k
			el.dataset.testid = "coin-bubble"
			el.setAttribute("aria-label", "Collect coins")
			el.innerHTML = COIN_SVG
			const n = document.createElement("b")
			el.append(n)
			el.addEventListener("click", (e) => {
				e.stopPropagation()
				this.collect([k])
			})
			const L = this.labels.add(el, () => v, { bubble: "coin", tail: 6 })
			this.coinBubs.set(k, { L, kind, srcs, at, v, n, shown: -1, full: false })
		}
		this.updateCoins(this.now())
	}

	private updateCoins(now: number): void {
		for (const b of this.coinBubs.values()) {
			const { bank, cap } = this.coinSum(b, now)
			if (bank === b.shown) continue
			// one more digit: measure again for the layout
			if (String(bank).length !== String(b.shown).length)
				this.labels.remeasure(b.L)
			b.shown = bank
			b.n.textContent = String(bank)
			b.L.off = bank < 1
			const full = bank >= cap
			if (full !== b.full) {
				b.full = full
				b.L.el.classList.toggle("full", full)
			}
		}
	}

	/** Coins waiting in every bubble now. */
	coinsWaiting(): number {
		const now = this.now()
		let n = 0
		for (const b of this.coinBubs.values()) n += this.coinSum(b, now).bank
		return n
	}

	/** Coin bubbles on screen (tests): key, coins and screen point. */
	coinBubbles(): { key: string; coins: number; x: number; y: number }[] {
		const now = this.now()
		return [...this.coinBubs.entries()]
			.map(([key, b]) => ({
				key,
				coins: this.coinSum(b, now).bank,
				...this.r.toScreen(b.v, { x: 0, y: 0 }),
			}))
			.filter((b) => b.coins >= 1)
	}

	/** Empties the given bubbles at once (the server's answer follows) and
	 * asks the UI to collect them; no keys = every bubble. */
	collect(keys?: string[]): void {
		const now = this.now()
		const pick = keys ?? [...this.coinBubs.keys()]
		let from: HTMLElement | null = null
		const got: string[] = []
		const hit: CoinBubble[] = []
		for (const k of pick) {
			const b = this.coinBubs.get(k)
			if (!b || this.coinSum(b, now).bank < 1) continue
			hit.push(b)
			for (const s of b.srcs) got.push(s.key)
			from ??= b.L.el
			this.build.confetti(b.v.x, b.v.y, b.v.z, 10)
			if (b.kind === "kitchen") this.kitchen.bounce()
		}
		if (!got.length) return
		this.opts.onCollect?.(got, from)
		for (const b of hit) {
			b.srcs = b.srcs.map((s) => ({ ...s, bank: 0 }))
			b.at = now
			b.shown = -1
		}
		this.updateCoins(now)
	}

	/** Screen point of the kitchen kiosk (tests). */
	kitchenScreen(): { x: number; y: number } {
		return this.screenAt(this.kitchen.x, 1.2, this.kitchen.z)
	}

	/** A member cheers a ticked task (Today drawer). */
	cheer(kind: string): void {
		const ps = this.people.people.filter((p) => !p.leaving)
		if (!ps.length) return
		const who = ps[Math.floor(Math.random() * ps.length)]
		const lines =
			kind === "diet"
				? [
						"Greens! The kitchen loves you.",
						"Healthy choice, boss!",
						"That's the good stuff.",
					]
				: kind === "exercise"
					? ["Sweat pays off!", "Look at you go!", "That's how it's done!"]
					: ["Nice one, boss!", "One more done!", "Keep it rolling!"]
		this.life.sayNow(
			who,
			lines[Math.floor(Math.random() * lines.length)],
			this.clock,
			3.2,
		)
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

	// ── upgrade claim (the 2D gym's build ceremony, in 3D) ─────────────────

	/** The upgrade `key` was just claimed: reload the layout, hide the new
	 * piece, let a crew build it (taps speed them up), then drop it onto
	 * its spot with confetti and a line from Marcus (or whoever is near).
	 * Gear with no free spot goes to storage: a crate drops in the lobby. */
	async claimCeremony(key: string, done: () => void): Promise<void> {
		if (this.disposed) return
		this.endClaim()
		let next: GymLayoutDto | null = null
		try {
			next = await loadLayout()
		} catch {
			// the claim went through; the view just catches up later
		}
		if (this.disposed) return
		if (next) this.applyLayout(next)
		bindWorld(this.world.ctx)
		const piece = this.world.pieces.find((p) => p.upgradeKey === key) ?? null
		const lb = this.world.lobby
		const x = piece?.x ?? lb.x0 + 6.6
		const z = piece?.z ?? lb.z0 + 4.2
		const size = piece ? Math.max(1, piece.size) : 1
		if (piece) piece.root.visible = false
		this.select(null)
		this.panTo(x, z)
		this.build.startClaim(x, z, size)
		const el = document.createElement("div")
		el.className = "g3d-bub"
		el.dataset.testid = "gym3d-claim"
		const t = document.createElement("div")
		t.className = "g3d-left"
		t.textContent = piece ? `Building ${piece.name}` : "Unpacking new gear"
		const pb = document.createElement("div")
		pb.className = "g3d-pbar"
		const bar = document.createElement("i")
		pb.appendChild(bar)
		el.append(t, pb)
		const a = new T.Vector3(x, piece?.kind === "decor" ? 1.8 : 2.3, z)
		// the player is watching this one: above timers and coins
		const L = this.labels.add(el, () => a, {
			bubble: "timer",
			boost: 25,
			edge: true,
			tail: 10,
		})
		this.life.paused = true
		this.claiming = { key, piece, x, z, size, k: 0, L, bar, crate: null, done }
	}

	/** Progress on its own (about 8s), faster with taps. */
	private claimTick(dt: number): void {
		const c = this.claiming
		if (!c) return
		c.k = Math.min(1, c.k + dt / 8)
		c.bar.style.width = `${Math.round(c.k * 100)}%`
		if (c.k >= 1) this.claimLand(c)
	}

	private claimLand(c: NonNullable<Gym3DApp["claiming"]>): void {
		this.claiming = null
		this.labels.remove(c.L)
		this.build.endClaim()
		const obj: T.Object3D = c.piece ? c.piece.root : this.dropCrate(c)
		obj.visible = true
		const y0 = obj.position.y
		this.build.tween(
			0.75,
			(k) => {
				// fall, then a little bounce
				const f =
					k < 0.6
						? 1 - (k / 0.6) ** 2
						: Math.abs(Math.sin((k - 0.6) * 7.8)) * 0.12 * (1 - k)
				obj.position.y = y0 + f * 5
			},
			() => {
				obj.position.y = y0
				this.r.dirtyShadow()
				this.build.dustAt(c.x, 0.15, c.z, 12, c.size * 0.6)
				this.build.confetti(c.x, 1.6, c.z, 90)
				this.celebrationLine(c.key, c.x, c.z)
				this.life.paused = false
				if (c.crate) {
					const m = c.crate
					c.crate = null
					setTimeout(() => {
						if (this.disposed) return
						this.build.dustAt(c.x, 0.3, c.z, 8, 0.5)
						m.removeFromParent()
						this.assets.release(m.geometry)
					}, 3500)
				}
				c.done()
			},
		)
	}

	private dropCrate(c: NonNullable<Gym3DApp["claiming"]>): T.Mesh {
		const parts: Part[] = []
		pBox(parts, 0.8, 0.7, 0.8, "#c8955a", 0, 0.35, 0)
		pBox(parts, 0.82, 0.08, 0.2, "#e8d4a8", 0, 0.71, 0)
		pBox(parts, 0.2, 0.08, 0.82, "#e8d4a8", 0, 0.71, 0)
		pBox(parts, 0.84, 0.06, 0.84, "#8a5a3a", 0, 0.03, 0)
		const m = batchMesh(parts, this.world.scene, { static: false })
		m.position.set(c.x, 0, c.z)
		c.crate = m
		return m
	}

	/** The claim's celebration line, from Marcus if he is in, else the
	 * named NPC nearest the new piece. */
	private celebrationLine(key: string, x: number, z: number): void {
		const named = this.people.people.filter((p) => p.npcKey && !p.leaving)
		const who =
			named.find((p) => p.npcKey === "trainer_marcus") ??
			named.sort(
				(a, b) =>
					Math.hypot(a.rig.root.position.x - x, a.rig.root.position.z - z) -
					Math.hypot(b.rig.root.position.x - x, b.rig.root.position.z - z),
			)[0]
		if (who) this.life.sayNow(who, celebrationFor(key), this.clock, 4.5)
	}

	private endClaim(): void {
		const c = this.claiming
		if (!c) return
		this.claiming = null
		this.labels.remove(c.L)
		this.build.endClaim()
		if (c.piece) c.piece.root.visible = true
		this.life.paused = false
		c.done()
	}

	get claimActive(): boolean {
		return !!this.claiming
	}

	/** Screen space the HUD (top) and an open sheet (bottom) cover. */
	setInsets(top: number, bottom: number): void {
		this.labels.insets = { top, bottom }
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
		if (this.chipL?.el === el) return
		this.labels.remove(this.chipL)
		this.chipL = null
		if (!el || this.disposed) return
		const v = new T.Vector3()
		this.chipL = this.labels.add(
			el,
			() => {
				const a = this.sel && this.anchorOf(this.sel)
				return a ? v.copy(a) : null
			},
			{ bubble: "info", edge: true, tail: 8, adopt: false },
		)
	}

	private anchorOf(s: Selection): T.Vector3 | null {
		if (s.kind === "person") {
			const p = this.people.find(s.key)
			// just over the head: the card must not hide who it is about
			return p
				? _a.copy(p.rig.root.position).setY(p.rig.root.position.y + 1.8)
				: null
		}
		if (s.kind !== "piece") return null
		const pc = this.world.pieces.find((q) => q.id === s.id)
		return pc ? _a.set(pc.x, pc.kind === "decor" ? 1.5 : 2.2, pc.z) : null
	}

	/** Drops the selection when its person has left. */
	private syncChip(): void {
		if (this.sel?.kind === "person" && !this.people.find(this.sel.key))
			this.select(null)
		else if (this.sel?.kind === "person") {
			const p = this.people.find(this.sel.key)
			const next = p && this.selectionOf(p)
			if (next && JSON.stringify(next) !== JSON.stringify(this.sel))
				this.select(next)
		}
	}

	private selectionOf(p: Person): Selection {
		return {
			kind: "person",
			key: p.key,
			name: p.name,
			npcKey: p.npcKey,
			info: this.infoOf(p),
		}
	}

	infoByKey(key: string): PersonInfo | null {
		const p = this.people.find(key)
		return p ? this.infoOf(p) : null
	}

	/** Title, mood, activity and relationship for the tap chip. */
	infoOf(p: Person): PersonInfo {
		const sim = p.npcKey
			? this.sim?.npcs.find((n) => n.npcKey === p.npcKey)
			: null
		const ros = p.npcKey ? this.roster.find((r) => r.key === p.npcKey) : null
		const title = p.npcKey
			? (CAST[p.npcKey]?.title ?? ros?.role ?? null)
			: p.kind === "extra"
				? p.note
					? p.name === "Instructor"
						? `${p.note} instructor`
						: `In the ${p.note}`
					: null
				: p.kind === "staff"
					? p.name === "Swimmer"
						? "Member"
						: "Staff"
					: "Member"
		let doing: string | null = null
		const ev = this.sim && activeEvent(this.sim)
		if (p.station?.label === "hosting today's event" && ev)
			doing = `Hosting: ${ev.title}`
		else if (sim?.chatEventWith) {
			const other = this.roster.find((r) => r.key === sim.chatEventWith)
			doing = `Chatting with ${firstName(other?.name ?? "a friend")}`
		} else if (p.state === "use" && p.station) doing = cap(p.station.label)
		else if (p.leaving) doing = "Heading home"
		else if (p.state === "walk") doing = "On the move"
		else if (p.npcKey) doing = "Hanging out in the lobby"
		const lvl = ros?.relationshipLevel
		return {
			title,
			mood: sim?.mood != null ? moodText(sim.mood) : null,
			doing,
			relation:
				p.npcKey && lvl != null
					? `${getStageLabel(getRelationshipStage(lvl))} · ${lvl}`
					: null,
			bond: p.npcKey && lvl != null ? Math.max(0, Math.min(100, lvl)) : null,
			hero: !!sim?.isHeroVisit,
		}
	}

	/** Sets the selection (the UI closes a sheet with null). */
	select(s: Selection | null): void {
		const prev = this.sel
		this.sel = s
		if (s?.kind === "person" && (prev?.kind !== "person" || prev.key !== s.key))
			this.chipUntil = performance.now() + CHIP_TTL * 1000
		// the chip's text changes with the selection
		if (this.chipL) this.labels.remeasure(this.chipL)
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
				case "kitchen":
					return { kind: "kitchen" }
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
		if (this.claiming) {
			// every tap helps the crew build
			const c = this.claiming
			c.k = Math.min(1, c.k + 0.08)
			this.build.dustAt(c.x, 0.3, c.z, 5, c.size * 0.4)
			return null
		}
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
		// an open tap chip: a tap elsewhere closes it (and does nothing
		// else); a tap on another person shows theirs
		if (this.sel?.kind === "person") {
			const next = s?.kind === "person" && s.key !== this.sel.key ? s : null
			this.select(next)
			return next
		}
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

	private portraits = new Map<string, string>()
	private lineupSet: { people: Person[]; labels: Label[] } | null = null

	/** Tooling: every cast look in two rows on the pavement, name tags on,
	 * the camera close. `false` clears it. Returns the cast keys. */
	lineup(on = true): string[] {
		bindWorld(this.world.ctx)
		if (this.lineupSet) {
			for (const p of this.lineupSet.people) this.people.remove(p)
			for (const L of this.lineupSet.labels) this.labels.remove(L)
			this.lineupSet = null
		}
		if (!on) return []
		const keys = Object.keys(CAST)
		const set = { people: [] as Person[], labels: [] as Label[] }
		const per = Math.ceil(keys.length / 2)
		// left of the door, clear of the event spot on its right
		const cx = this.world.doorX - 4
		const x0 = cx - (per - 1) * 0.6
		const fz = this.world.frontZ
		keys.forEach((k, i) => {
			const row = i < per ? 0 : 1
			const col = i % per
			const x = x0 + col * 1.2 + row * 0.6
			const z = fz + 1.9 + row * 1.5
			const name = this.roster.find((r) => r.key === k)?.name ?? CAST[k].name
			const p = this.people.addExtra({
				key: `lineup:${k}`,
				name,
				out: outfitFor(k),
				st: floorStation(x, z, Math.PI / 4, "idle", "lining up"),
			})
			set.people.push(p)
			const el = document.createElement("div")
			el.className = "g3d-name"
			el.textContent = firstName(name)
			const v = new T.Vector3(x, 1.62, z)
			set.labels.push(this.labels.add(el, () => v))
		})
		this.lineupSet = set
		this.select(null)
		const t = this.r.target
		t.set(cx + 0.3, 0, fz + 2.6)
		this.r.zoom = 2.2
		this.r.placeCam()
		return keys
	}

	/** A head-and-shoulders picture of a named NPC's 3D look (data URL),
	 * so the dialog shows the same person the gym does. Rendered once per
	 * NPC into a small offscreen target and cached as a string. */
	portraitOf(npcKey: string): string | null {
		const hit = this.portraits.get(npcKey)
		if (hit) return hit
		if (this.disposed || typeof document === "undefined") return null
		const S = 192
		bindWorld(this.world.ctx)
		const scene = new T.Scene()
		scene.background = new T.Color("#fde7d6")
		const hemi = new T.HemisphereLight(0xfff4ea, 0xb07a6a, 0.8 * Math.PI)
		const key = new T.DirectionalLight(0xffffff, 0.6 * Math.PI)
		key.position.set(2, 3, 3)
		scene.add(hemi, key)
		const rig = makeRig(outfitFor(npcKey))
		scene.add(rig.root)
		rig.root.rotation.y = -0.35
		rig.root.updateMatrixWorld(true)
		const cam = new T.PerspectiveCamera(24, 1, 0.1, 20)
		const hy = rig.neck.getWorldPosition(_f).y + rig.headY
		cam.position.set(0, hy + 0.02, 2.3)
		cam.lookAt(0, hy - 0.12, 0)
		const rt = new T.WebGLRenderTarget(S, S)
		const rd = this.r.renderer
		let url: string | null = null
		try {
			const prev = rd.getRenderTarget()
			rd.setRenderTarget(rt)
			rd.render(scene, cam)
			const px = new Uint8Array(S * S * 4)
			rd.readRenderTargetPixels(rt, 0, 0, S, S, px)
			rd.setRenderTarget(prev)
			const c = document.createElement("canvas")
			c.width = S
			c.height = S
			const g = c.getContext("2d")
			if (g) {
				const img = g.createImageData(S, S)
				// WebGL rows run bottom-up
				for (let y = 0; y < S; y++)
					img.data.set(
						px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4),
						y * S * 4,
					)
				g.putImageData(img, 0, 0)
				url = c.toDataURL("image/png")
			}
		} catch {
			url = null
		} finally {
			disposeRig(rig)
			rt.dispose()
			hemi.dispose()
			key.dispose()
			this.r.dirtyShadow()
		}
		if (url) this.portraits.set(npcKey, url)
		return url
	}

	/** Screen point (inside the host) of a person, for tests and tooling. */
	screenOf(key: string): { x: number; y: number } | null {
		const p = this.people.find(key)
		if (!p) return null
		_a.copy(p.rig.root.position).setY(0.8)
		return { ...this.r.toScreen(_a, { x: 0, y: 0 }) }
	}

	/** Bubbles on screen now (tests): kind and box in CSS px inside the host. */
	shownBubbles(): {
		kind: string
		x: number
		y: number
		w: number
		h: number
		text: string
	}[] {
		return this.labels.shown().map((b) => ({
			kind: b.kind,
			x: b.x,
			y: b.y,
			w: b.w,
			h: b.h,
			text: (b.el.textContent ?? "").trim().slice(0, 60),
		}))
	}

	/** A line over a person as if the player caused it (tests, tooling). */
	sayTo(key: string, text: string): boolean {
		const p = this.people.find(key)
		if (!p) return false
		this.life.sayNow(p, text, this.clock, 6)
		return true
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
		this.listeners.push([t, type, fn, !!opt?.capture])
	}

	/** Input lands on the canvas or on a bubble over it (speech, coins,
	 * timer cards, the tap chip); sheets, banners and buttons of the UI
	 * keep their own. */
	private overWorld(t: EventTarget | null, canvas: HTMLElement): boolean {
		if (t === canvas) return true
		if (!(t instanceof Node)) return false
		return this.labels.root.contains(t) || !!this.chipL?.el.contains(t as Node)
	}

	/** Listens on the host, so a press that starts on a bubble still pans
	 * the camera: only a short tap there reaches the bubble (its click). */
	private bindInput(host: HTMLElement): void {
		const el = this.r.renderer.domElement
		const local = (ev: PointerEvent) => {
			const b = el.getBoundingClientRect()
			return { x: ev.clientX - b.left, y: ev.clientY - b.top }
		}
		const cancelPress = () => {
			if (this.press?.timer) clearTimeout(this.press.timer)
			this.press = null
		}
		this.on(host, "pointerdown", (e) => {
			const ev = e as PointerEvent
			if (!this.overWorld(ev.target, el)) return
			const onCanvas = ev.target === el
			// a hand on the tap chip keeps it open a while longer
			if (this.chipL?.el.contains(ev.target as Node))
				this.chipUntil = performance.now() + CHIP_TTL * 1000
			const { x, y } = local(ev)
			this.pointers.set(ev.pointerId, {
				x,
				y,
				x0: x,
				y0: y,
				t0: performance.now(),
				canvas: onCanvas,
				panning: false,
			})
			// on a bubble, capture only once it turns into a drag: a capture
			// now would send the tap's click to the host, not the bubble
			if (onCanvas) el.setPointerCapture?.(ev.pointerId)
			if (this.pointers.size === 2) {
				const [a, c] = [...this.pointers.values()]
				this.pinch0 = Math.hypot(a.x - c.x, a.y - c.y)
				this.zoom0 = this.r.zoom
				cancelPress()
				if (this.drag) this.endMove()
				this.closeChip()
				return
			}
			if (this.pointers.size > 1 || !onCanvas) return
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
		this.on(host, "pointermove", (e) => {
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
			if (Math.hypot(x - pt.x0, y - pt.y0) > 6) {
				if (!pt.panning) {
					pt.panning = true
					// a drag from a bubble: the canvas takes the pointer over
					if (!pt.canvas) el.setPointerCapture?.(ev.pointerId)
					// panning away closes the tap chip
					this.closeChip()
				}
				this.pan(dx, dy)
			}
		})
		const up = (e: Event) => {
			const ev = e as PointerEvent
			const pt = this.pointers.get(ev.pointerId)
			if (!pt) return
			this.pointers.delete(ev.pointerId)
			if (this.pointers.size < 2) this.pinch0 = 0
			cancelPress()
			if (this.drag) {
				if (ev.type === "pointercancel") this.endMove()
				else this.dragDrop()
				return
			}
			if (ev.type === "pointercancel") return
			const moved = Math.hypot(pt.x - pt.x0, pt.y - pt.y0)
			const tap =
				moved < 8 && performance.now() - pt.t0 < 600 && this.pointers.size === 0
			// a drag that began on a bubble must not also tap it
			if (!pt.canvas && (pt.panning || !tap))
				this.noClickUntil = performance.now() + 400
			// a short tap on a bubble is its own (its click handler)
			if (tap && pt.canvas) this.tapAt(pt.x, pt.y)
		}
		this.on(host, "pointerup", up)
		this.on(host, "pointercancel", up)
		this.on(
			host,
			"click",
			(e) => {
				if (performance.now() > this.noClickUntil) return
				if (!this.overWorld(e.target, el)) return
				e.stopPropagation()
				e.preventDefault()
			},
			{ capture: true },
		)
		this.on(
			host,
			"wheel",
			(e) => {
				const ev = e as WheelEvent
				if (!this.overWorld(ev.target, el)) return
				ev.preventDefault()
				this.setZoom(this.r.zoom * (ev.deltaY > 0 ? 0.9 : 1.1))
			},
			{ passive: false },
		)
	}

	/** Closes the tap chip (a pan, a pinch). */
	private closeChip(): void {
		if (this.sel?.kind === "person") this.select(null)
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
			sweat: this.world.layout.sweat,
			greens: this.world.layout.greens,
			bubbles: [...this.coinBubs.values()].filter((b) => b.shown >= 1).length,
			says: this.says.active,
			...this.hap.stats(),
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
		this.claiming = null
		this.lineupSet = null
		for (const [t, type, fn, capture] of this.listeners)
			t.removeEventListener(type, fn, capture)
		this.listeners = []
		this.pointers.clear()
		this.chipL = null
		this.r.dispose()
		bindWorld(this.world.ctx)
		this.life.clear()
		this.hap.dispose()
		this.coinBubs.clear()
		this.kitchen.dispose()
		this.says.dispose()
		this.labels.dispose()
		this.people.onRemove = null
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

function cap(s: string): string {
	return s ? s[0].toUpperCase() + s.slice(1) : s
}

function moodText(m: number): string {
	const i = moodInfo(m)
	return `${i.emoji} ${i.word}`
}

const _v = new T.Vector3()
const _a = new T.Vector3()
const _f = new T.Vector3()
