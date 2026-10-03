// What is going on in the gym today, drawn in 3D: today's event (the host on
// the pavement by the entrance with themed props and a label), group classes
// (an instructor and members doing the class pose in sync in the class's
// room, with a label) and visiting heroes (a gold tag over their head and
// sparkles while they are on the spotlight stage).
import * as T from "three"
import {
	classFormation,
	classPose,
	classRoomType,
} from "../../../../shared/gym3d/npcInfo"
import { CELL, PD, PW } from "../../../../shared/gym3d/rooms"
import {
	batchMesh,
	cylGeo,
	hashString,
	mulberry32,
	type Part,
	pBox,
	pGeo,
	sphGeo,
} from "../engine/helpers"
import type { People } from "../people/members"
import { randOutfit, staffOutfit } from "../people/outfits"
import type { BuildLayer } from "./build"
import type { Label, LabelLayer, LabelOpts } from "./labels"
import type { ActiveClass, GymEvent } from "./loadLayout"
import { ctx } from "./state"
import type { Person, PoseName, Station } from "./types"
import type { GymWorld } from "./world"

export const EVENT_ICONS: Readonly<Record<string, string>> = {
	competition: "🏆",
	class: "🧘",
	delivery: "📦",
	special_guest: "⭐",
	maintenance: "🔧",
}

/** A station on the floor with no piece (class members, event extras). */
export function floorStation(
	x: number,
	z: number,
	face: number,
	pose: PoseName,
	label: string,
	o: Partial<Station> = {},
): Station {
	return {
		x,
		y: 0,
		z,
		face,
		lx: x,
		lz: z,
		lface: face,
		label,
		pose,
		busy: null,
		piece: null,
		...o,
	}
}

/** Tags go through the bubble layout: kept on screen and clear of the
 * bubbles; the event and class banners place before hero tags. */
export const TAG: LabelOpts = { bubble: "tag", tail: 2 }
const TAG_BANNER: LabelOpts = { bubble: "tag", tail: 2, boost: 5 }

function tag(cls: string, text: string): HTMLDivElement {
	const el = document.createElement("div")
	el.className = cls
	el.textContent = text
	return el
}

type ClassView = {
	key: string
	people: Person[]
	label: Label | null
}

export class Happenings {
	private eventKey = ""
	private eventG: T.Group | null = null
	private eventLabel: Label | null = null
	private eventExtras: Person[] = []
	private classes = new Map<string, ClassView>()
	private classList: ActiveClass[] = []
	private heroTags = new Map<string, Label>()
	private sparkT = 0
	private v = new T.Vector3()

	constructor(
		private w: GymWorld,
		private people: People,
		private labels: LabelLayer,
		private build: BuildLayer,
	) {}

	// ── today's event ─────────────────────────────────────────────────────

	setEvent(e: GymEvent | null): void {
		const key = e ? `${e.type}|${e.title}` : ""
		if (key === this.eventKey) return
		this.clearEvent()
		this.eventKey = key
		if (!e) return
		const s = this.w.eventSpot()
		const g = new T.Group()
		g.position.set(s.x, 0, s.z)
		this.w.scene.add(g)
		const parts: Part[] = []
		this.eventProps(e.type, parts, s)
		if (parts.length) batchMesh(parts, g, { noCast: true })
		this.eventG = g
		const el = tag("g3d-evt", `${EVENT_ICONS[e.type] ?? "🎉"} ${e.title}`)
		el.dataset.testid = "gym3d-event"
		const a = new T.Vector3(s.x + 0.6, 2.25, s.z)
		this.eventLabel = this.labels.add(el, () => a, TAG_BANNER)
	}

	/** Themed props next to the event spot (local to it; +x is further
	 * from the door). */
	private eventProps(
		type: string,
		parts: Part[],
		s: { x: number; z: number },
	): void {
		const rng = mulberry32(hashString(`event:${type}`))
		if (type === "competition") {
			// a three-step podium with a trophy on top
			pBox(parts, 0.5, 0.3, 0.5, "#c8ccd4", 0.65, 0.15, -0.1)
			pBox(parts, 0.5, 0.5, 0.5, "#f2c14a", 1.15, 0.25, -0.1)
			pBox(parts, 0.5, 0.2, 0.5, "#c98b56", 1.65, 0.1, -0.1)
			pGeo(parts, cylGeo(0.05, 0.12, 8), "#e8b83a", 1.15, 0.56, -0.1)
			pGeo(parts, cylGeo(0.1, 0.16, 10), "#e8b83a", 1.15, 0.7, -0.1)
			pGeo(parts, sphGeo(0.05, 8, 6), "#e8b83a", 1.15, 0.82, -0.1)
		} else if (type === "class") {
			for (let i = 0; i < 3; i++)
				pBox(
					parts,
					0.5,
					0.03,
					1.1,
					["#9b6bc4", "#3aa89a", "#e8743b"][i],
					0.7 + i * 0.65,
					0.015,
					0.05,
				)
		} else if (type === "delivery") {
			const boxes: [number, number, number, number][] = [
				[0.8, 0.2, -0.2, 0.45],
				[1.3, 0.2, -0.1, 0.4],
				[1.05, 0.62, -0.15, 0.36],
				[1.7, 0.18, 0.2, 0.35],
			]
			for (const [x, y, z, sz] of boxes) {
				pBox(parts, sz, sz, sz, "#c8955a", x, y, z, rng() * 0.4)
				pBox(parts, sz + 0.01, 0.05, 0.1, "#e8d4a8", x, y + sz / 2, z)
			}
			// a hand truck
			pBox(parts, 0.05, 0.9, 0.05, "#d4463a", 0.35, 0.45, 0.35)
			pBox(parts, 0.05, 0.9, 0.05, "#d4463a", 0.55, 0.45, 0.35)
			pBox(parts, 0.3, 0.04, 0.25, "#5a5f6a", 0.45, 0.03, 0.45)
		} else if (type === "special_guest") {
			// a red carpet from the door to the kerb, with rope posts
			const cx = this.w.doorX - s.x
			pBox(
				parts,
				1.3,
				0.02,
				2.9,
				"#c8323a",
				cx,
				0.012,
				-s.z + this.w.frontZ + 1.6,
			)
			for (const sx of [-0.85, 0.85])
				for (const dz of [0.8, 2.2]) {
					const z = -s.z + this.w.frontZ + dz
					pGeo(parts, cylGeo(0.04, 0.8, 8), "#e8b83a", cx + sx, 0.4, z)
					pGeo(parts, sphGeo(0.07, 8, 6), "#e8b83a", cx + sx, 0.84, z)
				}
			for (const sx of [-0.85, 0.85])
				pBox(
					parts,
					0.04,
					0.04,
					1.4,
					"#8a1a2a",
					cx + sx,
					0.7,
					-s.z + this.w.frontZ + 1.5,
				)
		} else if (type === "maintenance") {
			for (const [x, z] of [
				[0.7, -0.3],
				[1.4, 0.2],
				[2.0, -0.2],
			]) {
				pGeo(parts, cylGeo(0.14, 0.04, 10), "#e8743b", x, 0.02, z)
				pGeo(parts, new T.ConeGeometry(0.12, 0.42, 10), "#f2a03a", x, 0.25, z)
				pGeo(parts, cylGeo(0.09, 0.06, 10), "#fff7ea", x, 0.27, z)
			}
			// a WET FLOOR A-frame in yellow
			pBox(parts, 0.4, 0.55, 0.04, "#f2c14a", 1.05, 0.3, 0.55, 0, 0.25)
			pBox(parts, 0.4, 0.55, 0.04, "#f2c14a", 1.05, 0.3, 0.75, 0, -0.25)
			pBox(parts, 0.45, 0.2, 0.25, "#d4463a", 1.7, 0.1, 0.6)
		}
		// class events bring two members stretching on the mats
		if (type === "class") {
			for (let i = 0; i < 2; i++) {
				const st = floorStation(
					s.x + 0.7 + i * 1.3,
					s.z + 0.05,
					Math.PI / 4,
					"stretch",
					"at the pop-up class",
				)
				this.eventExtras.push(
					this.people.addExtra({
						key: `event:m${i}`,
						name: "Member",
						out: randOutfit(mulberry32(hashString(`evt${i}`))),
						st,
						note: "Today's event",
					}),
				)
			}
		}
	}

	private clearEvent(): void {
		if (this.eventG) {
			const a = ctx().assets
			this.eventG.removeFromParent()
			this.eventG.traverse((o) => {
				const m = o as T.Mesh
				if (m.geometry) a.release(m.geometry)
			})
			this.eventG = null
		}
		this.labels.remove(this.eventLabel)
		this.eventLabel = null
		for (const p of this.eventExtras) this.people.remove(p)
		this.eventExtras = []
		this.eventKey = ""
	}

	// ── classes ───────────────────────────────────────────────────────────

	setClasses(list: readonly ActiveClass[]): void {
		this.classList = [...list]
		const want = new Set(list.map((c) => c.key))
		for (const [k, v] of this.classes)
			if (!want.has(k)) {
				this.dropClass(v)
				this.classes.delete(k)
			}
		for (const c of list) if (!this.classes.has(c.key)) this.addClass(c)
	}

	/** The layout changed: classes find their room and floor again. */
	layoutChanged(): void {
		for (const v of this.classes.values()) this.dropClass(v)
		this.classes.clear()
		for (const c of this.classList) this.addClass(c)
	}

	private walkable(): (x: number, z: number) => boolean {
		const G = this.w.paths.grid()
		const sts = this.w.stations
		return (x, z) => {
			const i = Math.floor(x / CELL)
			const j = Math.floor(z / CELL)
			if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return false
			if (!G.walk[j * G.nx + i]) return false
			// keep clear of people working out on gear
			for (const s of sts) if (Math.hypot(s.x - x, s.z - z) < 0.75) return false
			return true
		}
	}

	private addClass(c: ActiveClass): void {
		const rt = classRoomType(c.category)
		const room = rt
			? this.w.rooms.find((r) => r.type === rt && !r.building)
			: undefined
		const view: ClassView = { key: c.key, people: [], label: null }
		this.classes.set(c.key, view)
		if (!room || !rt) return
		const cell = room.cells[0]
		const rect = {
			x0: cell.px * PW,
			z0: cell.pz * PD,
			x1: cell.px * PW + PW,
			z1: cell.pz * PD + PD,
		}
		const f = classFormation(this.walkable(), rect, 4)
		const el = tag("g3d-class", `🎫 ${c.name} in session!`)
		el.dataset.testid = "gym3d-class"
		const anchor = new T.Vector3(room.cx, 2.0, room.cz)
		if (f) anchor.set(f.instructor.x, 2.1, f.instructor.z + 0.6)
		view.label = this.labels.add(el, () => anchor, TAG_BANNER)
		if (!f) return
		const pose = classPose(rt)
		const ins = f.instructor
		view.people.push(
			this.people.addExtra({
				key: `class:${c.key}:coach`,
				name: "Instructor",
				out: (() => {
					const o = staffOutfit(`class:${c.key}`)
					o.acc = ["whistle"]
					return o
				})(),
				st: floorStation(
					ins.x,
					ins.z,
					ins.face,
					pose === "punch" ? "mitts" : "coach",
					`teaching the ${c.name}`,
					{ prop: "none" },
				),
				note: c.name,
			}),
		)
		f.members.forEach((m, i) => {
			const rng = mulberry32(hashString(`class:${c.key}:${i}`))
			const out = randOutfit(rng)
			out.band = "#e8604a"
			view.people.push(
				this.people.addExtra({
					key: `class:${c.key}:${i}`,
					name: "Class member",
					out,
					// sync: everyone moves on the same beat
					st: floorStation(m.x, m.z, m.face, pose, `in the ${c.name}`, {
						sync: 0,
					}),
					note: c.name,
				}),
			)
		})
		// the same beat needs the same clock
		for (const p of view.people) p.t = 0
	}

	private dropClass(v: ClassView): void {
		for (const p of v.people) this.people.remove(p)
		v.people = []
		this.labels.remove(v.label)
		v.label = null
	}

	get classPeople(): number {
		let n = 0
		for (const v of this.classes.values()) n += v.people.length
		return n
	}

	// ── heroes ────────────────────────────────────────────────────────────

	/** Gold tags over visiting heroes who are in. */
	syncHeroes(heroKeys: ReadonlySet<string>): void {
		for (const [k, L] of this.heroTags)
			if (!heroKeys.has(k) || !this.people.find(`npc:${k}`)) {
				this.labels.remove(L)
				this.heroTags.delete(k)
			}
		for (const k of heroKeys) {
			if (this.heroTags.has(k)) continue
			const p = this.people.find(`npc:${k}`)
			if (!p) continue
			const v = new T.Vector3()
			const el = tag("g3d-hero", "★ Visiting hero")
			el.dataset.testid = "gym3d-hero"
			this.heroTags.set(
				k,
				this.labels.add(
					el,
					() => {
						const r = p.rig.root.position
						return v.set(r.x, r.y + 1.78, r.z)
					},
					TAG,
				),
			)
		}
	}

	frame(dt: number): void {
		this.sparkT -= dt
		if (this.sparkT > 0) return
		this.sparkT = 1.1
		for (const k of this.heroTags.keys()) {
			const p = this.people.find(`npc:${k}`)
			if (p?.station?.piece?.upgradeKey !== "hero_spotlight_stage") continue
			const r = p.rig.root.position
			this.v.copy(r)
			this.build.dustAt(r.x, 1.1, r.z, 3, 0.45, "#ffe38a")
		}
	}

	stats(): {
		event: string
		classes: number
		classPeople: number
		heroes: number
	} {
		return {
			event: this.eventKey,
			classes: [...this.classes.values()].filter((v) => v.label).length,
			classPeople: this.classPeople,
			heroes: this.heroTags.size,
		}
	}

	dispose(): void {
		this.clearEvent()
		for (const v of this.classes.values()) this.dropClass(v)
		this.classes.clear()
		for (const L of this.heroTags.values()) this.labels.remove(L)
		this.heroTags.clear()
	}
}
