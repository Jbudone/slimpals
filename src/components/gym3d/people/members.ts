// Everyone walking around the 3D gym: named NPCs placed by the server's sim
// state, anonymous staff on staff stations, swimmers in pools, and a few
// ambient members running the build lab's little AI (walk to a free
// station, work out, move on or leave).
import * as T from "three"
import { GHOST_STAY_CHANCE } from "../../../../shared/gym3d/ghost"
import { hirePost } from "../../../../shared/gym3d/hires"
import { PD, PW } from "../../../../shared/gym3d/rooms"
import { vibePace } from "../../../../shared/gym3d/vibes"
import type { GymHireDto, GymLayoutRoomDto } from "../../../../shared/types"
import {
	angLerp,
	batchMesh,
	boxGeo,
	hashString,
	mulberry32,
	type Part,
	pBox,
	type Rng,
	releaseMesh,
} from "../engine/helpers"
import type { Assignment } from "../world/assignTargets"
import { APRON, BUS_STOP_DX } from "../world/paths"
import { ctx } from "../world/state"
import type { Person, PersonKind, Station } from "../world/types"
import type { GymWorld } from "../world/world"
import { CAST, outfitFor, RESERVED_STATIONS } from "./cast"
import { type Outfit, randOutfit, staffOutfit, swimOutfit } from "./outfits"
import { POSES, poseOf } from "./poses"
import { disposeRig, makeRig, resetPose } from "./rig"

export type NpcView = { npcKey: string; name: string; role: string | null }

type AddOpts = {
	key: string
	kind: PersonKind
	name: string
	npcKey?: string | null
	role?: string | null
	out: Outfit
	x: number
	z: number
}

const CELL = 0.5
const tmp = new T.Vector3()

export class People {
	readonly people: Person[] = []
	private spawnT = 1.5
	private passT = 4
	private passN = 0
	private rng: Rng
	private memberN = 0
	private reduce: boolean
	/** Set when a bus runs: waiters at the stop board it when it pulls in. */
	busAtStop: (() => boolean) | null = null
	/** October: about one in four members and passers-by wear a witch hat. */
	costumes = false
	/** Most ambient members right now (follows the quality level). */
	cap = 6

	constructor(private w: GymWorld) {
		this.rng = mulberry32(hashString(`people:${w.layout.gymId}`))
		this.reduce =
			typeof window !== "undefined" &&
			!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
		this.seedFixed()
	}

	private stationKey(st: Station): string {
		const p = st.piece
		return p ? `${p.id}:${p.stations.indexOf(st)}` : "?"
	}

	// ── spawning ───────────────────────────────────────────────────────────

	add(o: AddOpts): Person {
		if (
			this.costumes &&
			(o.kind === "member" || o.key.startsWith("pass:")) &&
			hashString(o.key) % 4 === 0
		)
			o = { ...o, out: { ...o.out, acc: [...o.out.acc, "witch"] } }
		const rig = makeRig(o.out)
		const proxy = new T.Mesh(boxGeo(0.55, 1.3, 0.55), ctx().assets.HIT)
		proxy.position.y = 0.65
		proxy.userData.pick = { kind: "person", key: o.key }
		rig.root.add(proxy)
		rig.root.position.set(o.x, 0, o.z)
		const p: Person = {
			key: o.key,
			kind: o.kind,
			name: o.name,
			npcKey: o.npcKey ?? null,
			role: o.role ?? null,
			out: o.out,
			rig,
			proxy,
			path: [],
			state: "idle",
			idle: 0.3,
			t: this.rng() * 10,
			station: null,
			fixed: null,
			after: null,
			dest: null,
			fin: null,
			exitFrom: null,
			timer: 0,
			home: null,
			leaving: false,
		}
		this.people.push(p)
		return p
	}

	/** Called for each person removed (speech bubbles let go of them). */
	onRemove: ((p: Person) => void) | null = null
	/** The ghost talked a member out of leaving (they say so). */
	onGhostStay: ((p: Person) => void) | null = null
	/** A member started a set on upgraded gear (tier 2 or 3). */
	onUpgradedUse: ((p: Person, tier: number) => void) | null = null

	remove(p: Person): void {
		this.onRemove?.(p)
		this.release(p)
		if (p.dog) releaseMesh(p.dog)
		disposeRig(p.rig)
		const i = this.people.indexOf(p)
		if (i >= 0) this.people.splice(i, 1)
	}

	find(key: string): Person | undefined {
		return this.people.find((p) => p.key === key)
	}

	/** Anonymous staff on staff stations and swimmers in pools. */
	private seedFixed(): void {
		for (const st of this.w.stations) {
			const swim = poseOf(st) === "swim"
			if (!st.staff && !swim) continue
			this.fillFixed(st)
		}
	}

	private fillFixed(st: Station): void {
		if (st.busy) return
		// kept for its named NPC (the manager's desk)
		const uk = st.piece?.upgradeKey
		if (uk && RESERVED_STATIONS.has(uk) && poseOf(st) !== "swim") return
		const swim = poseOf(st) === "swim"
		const k = this.stationKey(st)
		const key = swim ? `swim:${k}` : `staff:${k}`
		if (this.find(key)) return
		const m = this.add({
			key,
			kind: "staff",
			name: swim ? "Swimmer" : "Staff",
			out: swim ? swimOutfit(key) : staffOutfit(key),
			x: st.x,
			z: st.z,
		})
		m.fixed = st
		this.claimSnap(m, st)
	}

	/** The layout changed: people on removed stations move on (anonymous
	 * staff and swimmers go), members leave stations that closed (gear being
	 * upgraded), walkers re-path around the new walls and pieces, and new
	 * staff stations get their staff. */
	layoutChanged(removed: ReadonlySet<Station>): void {
		for (const p of this.people.slice()) {
			if (p.exitFrom && removed.has(p.exitFrom)) p.exitFrom = null
			const gone =
				(p.station && removed.has(p.station)) ||
				(p.fixed && removed.has(p.fixed))
			if (gone) {
				if (p.kind === "staff") {
					this.remove(p)
					continue
				}
				const st = p.station
				if (st && st.busy === p) st.busy = null
				p.station = null
				p.fixed = null
				resetPose(p.rig)
				p.rig.root.position.y = 0
				if (p.kind === "member") this.chooseNext(p)
				else {
					p.state = "idle"
					p.idle = 1
				}
				continue
			}
			if (p.kind === "member" && p.station?.closed) {
				this.release(p)
				this.chooseNext(p)
				continue
			}
			if (p.state === "walk" && p.dest) {
				const [x, z, m] = p.dest
				if (!this.walkTo(p, x, z, p.after, m, p.fin ?? undefined)) {
					this.release(p)
					if (p.kind === "member") this.chooseNext(p)
					else if (p.leaving) this.remove(p)
					else {
						p.state = "idle"
						p.idle = 1
					}
				}
			}
		}
		this.seedFixed()
	}

	/** Staff hired for rooms stand at their post in the room. New hires walk
	 * in from the door (`walkIn`); hires that are gone are removed. */
	syncHires(
		hires: readonly GymHireDto[],
		rooms: readonly GymLayoutRoomDto[],
		walkIn: boolean,
	): void {
		const want = new Map(hires.map((h) => [`hire:${h.id}`, h]))
		for (const p of this.people.slice())
			if (p.key.startsWith("hire:") && !want.has(p.key)) this.remove(p)
		for (const [key, h] of want) {
			if (this.find(key)) continue
			const cell = rooms.find((r) => r.id === h.roomId)?.cells[0]
			if (!cell) continue
			const post = hirePost(h.post, cell, PW, PD)
			const from = walkIn ? this.w.spawn : post
			const p = this.add({
				key,
				kind: "staff",
				name: h.name,
				role: h.role,
				out: staffOutfit(key),
				x: from.x,
				z: from.z,
			})
			p.home = { x: post.x, z: post.z, face: Math.PI * 0.75 }
			if (walkIn) this.walkTo(p, post.x, post.z, "idle")
			else p.rig.root.rotation.y = p.home.face
		}
	}

	/** Seeds ambient members already working out, plus one walking in. */
	seedMembers(): void {
		const fr = this.freeStations().sort(() => this.rng() - 0.5)
		const n = Math.min(Math.ceil(this.cap / 2), fr.length)
		for (const st of fr.slice(0, n)) {
			const m = this.addMember(st.x, st.z)
			this.claimSnap(m, st)
		}
		if (this.ambientCount() < this.cap) {
			const s = this.w.spawn
			this.chooseNext(this.addMember(s.x + (this.rng() - 0.5) * 6, s.z + 0.5))
		}
	}

	private addMember(x: number, z: number): Person {
		const n = ++this.memberN
		return this.add({
			key: `member:${n}`,
			kind: "member",
			name: "Member",
			out: randOutfit(this.rng),
			x,
			z,
		})
	}

	/** Passers-by on the pavement in front of the gym: now and then someone
	 * walks along it from one edge to the other (a few at a time), and about
	 * one in eight turns in at the door and becomes a member. */
	private trickleStreet(dt: number): void {
		this.passT -= dt
		if (this.passT > 0) return
		this.passT = 6 + this.rng() * 6
		const about = this.people.filter((p) => p.key.startsWith("pass:")).length
		if (about >= Math.max(2, Math.round(this.cap / 2))) return
		const w = this.w
		const x0 = -6
		const x1 = w.cols * PW + 6
		const left = this.rng() < 0.5
		const z = w.frontZ + 3 + (this.rng() - 0.5) * 0.5
		if (
			this.busAtStop &&
			this.rng() < 0.2 &&
			!this.people.some((q) => q.after === "wait")
		) {
			this.addWaiter(left ? x0 : x1, z)
			return
		}
		const p = this.add({
			key: `pass:${++this.passN}`,
			kind: "extra",
			name: "Passer-by",
			out: randOutfit(this.rng),
			x: left ? x0 : x1,
			z,
		})
		p.speed = 0.7 + this.rng() * 0.5
		p.state = "walk"
		if (this.rng() < 0.12) {
			p.path = [
				[w.doorX, z],
				[w.doorX, w.spawn.z],
			]
			p.after = "enter"
		} else {
			p.path = [[left ? x1 : x0, z]]
			p.after = "leave"
			// now and then a dog trots along on a lead
			if (this.rng() < 0.3) this.addDog(p)
		}
	}

	/** Someone who walks to the bus stop and waits for the bus. */
	private addWaiter(x: number, z: number): void {
		const w = this.w
		const p = this.add({
			key: `pass:${++this.passN}`,
			kind: "extra",
			name: "Passer-by",
			out: randOutfit(this.rng),
			x,
			z,
		})
		p.speed = 0.8 + this.rng() * 0.4
		p.state = "walk"
		p.path = [[w.doorX + BUS_STOP_DX - 0.4, w.frontZ + APRON - 0.5]]
		p.after = "wait"
		p.timer = 120
	}

	/** Waiters climb on when the bus is in (or give up and wander off). */
	private boardWaiters(dt: number): void {
		for (const p of this.people) {
			if (p.after !== "wait" || p.state !== "idle") continue
			const w = this.w
			p.timer -= dt
			const boards = this.busAtStop?.() ?? false
			if (!boards && p.timer > 0) continue
			const roadZ = w.frontZ + APRON + 3.3
			p.path = boards
				? [[w.doorX + BUS_STOP_DX, roadZ - 0.95]]
				: [[w.doorX + BUS_STOP_DX + 12, p.rig.root.position.z]]
			p.after = "leave"
			p.state = "walk"
		}
	}

	private addDog(p: Person): void {
		const d: Part[] = []
		const fur = this.rng() < 0.5 ? "#b9824f" : "#e8dcc4"
		pBox(d, 0.2, 0.2, 0.46, fur, 0, 0.3, 0)
		pBox(d, 0.17, 0.17, 0.17, fur, 0, 0.42, 0.3)
		pBox(d, 0.06, 0.1, 0.06, "#4a3a2a", 0.06, 0.55, 0.28)
		pBox(d, 0.06, 0.1, 0.06, "#4a3a2a", -0.06, 0.55, 0.28)
		pBox(d, 0.05, 0.05, 0.2, fur, 0, 0.36, -0.3)
		for (const [lx, lz] of [
			[0.06, 0.16],
			[-0.06, 0.16],
			[0.06, -0.16],
			[-0.06, -0.16],
		] as const)
			pBox(d, 0.05, 0.2, 0.05, "#4a3a2a", lx, 0.1, lz)
		const m = batchMesh(d, p.rig.root, { static: false, noCast: true })
		m.position.set(0.55, 0, 0.45)
		p.dog = m
	}

	private ambientCount(): number {
		let n = 0
		for (const p of this.people) if (p.kind === "member" && !p.leaving) n++
		return n
	}

	// ── named NPCs from the sim ───────────────────────────────────────────

	/** Applies the latest sim assignments. `first` places people directly
	 * (the first render should look lived-in); later polls walk them. */
	applyNpcs(
		views: readonly NpcView[],
		assignments: readonly Assignment[],
		first: boolean,
	): void {
		const byKey = new Map(views.map((v) => [v.npcKey, v]))
		const want = new Set(assignments.map((a) => a.npcKey))
		for (const p of this.people.slice())
			if (p.kind === "npc" && p.npcKey && !want.has(p.npcKey) && !p.leaving)
				this.leave(p)
		for (const a of assignments) {
			const v = byKey.get(a.npcKey)
			const key = `npc:${a.npcKey}`
			let p = this.find(key)
			if (p?.leaving) {
				this.remove(p)
				p = undefined
			}
			if (!p) {
				const s = this.w.spawn
				p = this.add({
					key,
					kind: "npc",
					name: v?.name ?? a.npcKey,
					npcKey: a.npcKey,
					role: v?.role ?? null,
					out: outfitFor(a.npcKey),
					x: s.x + (this.rng() - 0.5) * 2,
					z: s.z,
				})
			} else if (v) {
				p.name = v.name
				p.role = v.role
			}
			if (a.target.kind === "station" || a.target.kind === "event") {
				const t = a.target
				const st =
					t.kind === "event"
						? this.eventStation()
						: this.w.pieces.find((q) => q.id === t.pieceId)?.stations[t.station]
				if (!st) continue
				if (p.fixed === st) continue
				// Whoever holds the station (ambient member or anonymous staff)
				// makes way for the named NPC.
				const holder = st.busy
				if (holder && holder !== p) {
					if (holder.kind === "staff") this.remove(holder)
					else {
						this.release(holder)
						this.chooseNext(holder)
					}
				}
				this.release(p)
				p.home = null
				p.fixed = st
				const home = CAST[a.npcKey]?.home
				p.poseAs =
					home?.pose && st.piece?.upgradeKey === home.key ? home.pose : null
				if (first) {
					p.rig.root.position.set(st.x, 0, st.z)
					this.claimSnap(p, st)
				} else if (!this.claim(p, st)) this.claimSnap(p, st)
			} else {
				const h = this.w.lobbySpot(a.target.slot)
				if (p.home && p.home.x === h.x && p.home.z === h.z && !p.fixed) continue
				const old = p.fixed
				this.release(p)
				p.fixed = null
				p.poseAs = null
				p.home = h
				if (old?.staff) this.fillFixed(old)
				if (first) {
					p.rig.root.position.set(h.x, 0, h.z)
					p.rig.root.rotation.y = h.face
					p.state = "idle"
				} else if (!this.walkTo(p, h.x, h.z, "idle")) {
					p.rig.root.position.set(h.x, 0, h.z)
					p.state = "idle"
				}
			}
		}
		// staff stations freed by NPCs that moved on get anonymous staff back
		for (const st of this.w.stations)
			if (st.staff && !st.busy) this.fillFixed(st)
	}

	// ── the build lab's member AI ─────────────────────────────────────────

	private walkTo(
		p: Person,
		x: number,
		z: number,
		after: Person["after"],
		maxEnd?: number,
		fin?: [number, number],
	): boolean {
		const r = p.rig.root.position
		let sx = r.x
		let sz = r.z
		let ex: { x: number; z: number } | null = null
		if (p.exitFrom) {
			const ap = this.approachFor(p.exitFrom)
			p.exitFrom = null
			if (ap?.length) {
				ex = ap[0]
				sx = ex.x
				sz = ex.z
			}
		}
		const path = this.w.paths.findPath(sx, sz, x, z, maxEnd)
		if (!path) return false
		if (ex) path.unshift([ex.x, ex.z])
		if (fin) path.push(fin)
		p.path = path
		p.state = "walk"
		p.after = after
		p.dest = [x, z, maxEnd]
		p.fin = fin ?? null
		return true
	}

	/** Approach points around a station's piece, nearest clear side first
	 * (never through the piece, and not from its console side if avoidable). */
	private approachFor(
		st: Station,
	): { x: number; z: number; sc: number }[] | null {
		const pc = st.piece
		if (!pc || pc.kind === "decor") return null
		const G = this.w.paths.grid()
		const h = pc.size / 2
		const f = st.face
		const fx = Math.sin(f)
		const fz = Math.cos(f)
		const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
		const cz = cl(st.z, pc.z - h + 0.25, pc.z + h - 0.25)
		const cx = cl(st.x, pc.x - h + 0.25, pc.x + h - 0.25)
		const out: { x: number; z: number; sc: number }[] = []
		for (const [x, z] of [
			[pc.x + h + 0.25, cz],
			[pc.x - h - 0.25, cz],
			[cx, pc.z + h + 0.25],
			[cx, pc.z - h - 0.25],
		]) {
			const i = Math.floor(x / CELL)
			const j = Math.floor(z / CELL)
			if (i < 0 || j < 0 || i >= G.nx || j >= G.nz || !G.walk[j * G.nx + i])
				continue
			const x2 = (i + 0.5) * CELL
			const z2 = (j + 0.5) * CELL
			const d = Math.hypot(x2 - st.x, z2 - st.z) || 1e-3
			const front = ((x2 - st.x) * fx + (z2 - st.z) * fz) / d
			out.push({ x: x2, z: z2, sc: d + (front > 0.55 ? 1.6 : 0) })
		}
		return out.sort((a, b) => a.sc - b.sc)
	}

	private claim(p: Person, st: Station): boolean {
		const ap = this.approachFor(st)
		let ok = false
		if (ap?.length) {
			for (const a of ap.slice(0, 2)) {
				if (this.walkTo(p, a.x, a.z, "use", 0.45, [st.x, st.z])) {
					ok = true
					break
				}
			}
		} else ok = this.walkTo(p, st.x, st.z, "use")
		if (!ok) return false
		st.busy = p
		p.station = st
		return true
	}

	private claimSnap(p: Person, st: Station): void {
		st.busy = p
		p.station = st
		this.startUse(p)
	}

	private startUse(p: Person): void {
		const st = p.station
		if (!st) return
		const r = p.rig.root
		p.state = "use"
		p.path = []
		p.fin = null
		p.timer = this.reduce ? 60 : 10 + this.rng() * 10
		// a room's vibe sets the pace of the workout
		const room = this.w.rooms.find((q) => q.id === this.w.roomIdAt(st.x, st.z))
		p.pace = vibePace(room?.vibe)
		r.position.set(st.x, st.y || 0, st.z)
		r.rotation.y = st.face || 0
		if (st.sync != null) p.t = st.sync
		const tier = st.piece?.tier ?? 1
		if (tier >= 2 && p.kind === "member") this.onUpgradedUse?.(p, tier)
	}

	private release(p: Person): void {
		const st = p.station
		if (st) {
			if (st.piece && p.state === "use") p.exitFrom = st
			if (st.busy === p) st.busy = null
			if (st.bar && st.barRest) st.bar.position.copy(st.barRest)
			st.z0 = null
			st.x0 = null
			p.station = null
		}
		resetPose(p.rig)
		p.rig.root.position.y = 0
	}

	private freeStations(): Station[] {
		return this.w.stations.filter(
			(s) => !s.busy && !s.staff && !s.closed && poseOf(s) !== "swim",
		)
	}

	private chooseNext(p: Person): void {
		if (p.kind !== "member") {
			p.state = "idle"
			p.idle = 2
			return
		}
		const fr = this.freeStations()
		if (!fr.length || this.rng() < 0.08) {
			this.leave(p)
			return
		}
		// upgraded gear draws members: a tier 2 machine is 1.6 times as likely
		// to be picked as a basic one, tier 3 2.2 times
		const weight = (s: Station) =>
			1 + 0.6 * Math.max(0, (s.piece?.tier ?? 1) - 1)
		for (let k = 0; k < 4 && fr.length; k++) {
			let r = this.rng() * fr.reduce((a, s) => a + weight(s), 0)
			let i = 0
			for (; i < fr.length - 1; i++) {
				r -= weight(fr[i])
				if (r < 0) break
			}
			const st = fr.splice(i, 1)[0]
			if (this.claim(p, st)) return
		}
		p.state = "idle"
		p.idle = 2 + this.rng() * 2
	}

	private leave(p: Person): void {
		const s = this.w.spawn
		this.release(p)
		p.fixed = null
		p.home = null
		p.leaving = true
		const x = Math.max(
			1,
			Math.min(this.w.cols * 9 - 1, s.x + (this.rng() - 0.5) * 12),
		)
		if (!this.walkTo(p, x, s.z + 0.6, "leave", 3)) this.remove(p)
	}

	private finishSession(p: Person): void {
		this.release(p)
		if (this.rng() < 0.12) {
			// in October the ghost talks half of them into one more station
			if (this.costumes && !p.stayed && this.rng() < GHOST_STAY_CHANCE) {
				p.stayed = true
				this.onGhostStay?.(p)
				this.chooseNext(p)
			} else this.leave(p)
		} else this.chooseNext(p)
	}

	private arrive(p: Person): void {
		if (p.after === "use") {
			const st = p.station
			if (st && st.busy === p && !st.closed) this.startUse(p)
			else {
				this.release(p)
				this.chooseNext(p)
			}
		} else if (p.after === "leave") this.remove(p)
		else if (p.after === "wait") {
			// at the stop: face the road and wait for the bus
			p.state = "idle"
			p.idle = 1e9
			p.rig.root.rotation.y = 0
		} else if (p.after === "enter") {
			// a passer-by came in: they are a member now
			p.kind = "member"
			p.name = "Member"
			p.key = `member:${++this.memberN}`
			this.chooseNext(p)
		} else {
			p.state = "idle"
			p.idle = 1.5
			if (p.home) p.rig.root.rotation.y = p.home.face
		}
	}

	/** Hurries a working member along: their workout speeds up for a while. */
	hustle(p: Person, boost = 2.2): void {
		p.boost = Math.max(p.boost ?? 1, boost)
	}

	/** Ends a working member's session now (they walk off as usual). */
	hurry(p: Person): void {
		if (p.state === "use" && p.kind === "member") p.timer = 0
	}

	private step(p: Person, dt: number, lite: boolean): void {
		const r = p.rig
		// a hustled member works out faster, then settles back
		if (p.boost && p.boost > 1) p.boost = Math.max(1, p.boost - dt * 0.5)
		p.t += dt * (p.boost ?? 1) * (p.state === "use" ? (p.pace ?? 1) : 1)
		if (!lite) resetPose(r)
		if (p.state === "walk") {
			const pos = r.root.position
			const tgt = p.path[0]
			if (!tgt) {
				this.arrive(p)
				if (lite || !this.people.includes(p)) return
				// arrive() may have switched the state
				const now = p.state as Person["state"]
				if (now === "use" && p.station)
					POSES[p.poseAs ?? poseOf(p.station)](r, p.t, p.station)
				else POSES.idle(r, p.t, null)
				return
			}
			const dx = tgt[0] - pos.x
			const dz = tgt[1] - pos.z
			const d = Math.hypot(dx, dz)
			const sp = 1.6 * dt * (p.speed ?? 1)
			if (d <= sp) {
				pos.x = tgt[0]
				pos.z = tgt[1]
				p.path.shift()
			} else {
				pos.x += (dx / d) * sp
				pos.z += (dz / d) * sp
				r.root.rotation.y = angLerp(
					r.root.rotation.y,
					Math.atan2(dx, dz),
					Math.min(1, dt * 12),
				)
			}
			if (!lite) POSES.walk(r, p.t, null)
			if (p.dog) p.dog.position.y = Math.abs(Math.sin(p.t * 9)) * 0.04
		} else if (p.state === "use") {
			const st = p.station
			if (!st) {
				p.state = "idle"
				p.idle = 1
				return
			}
			if (!lite) {
				POSES[p.poseAs ?? poseOf(st)](r, p.t, st)
				if (st.tick) {
					r.root.updateMatrixWorld(true)
					st.tick(p, p.t, dt)
				}
			}
			if (!p.fixed && p.kind === "member") {
				p.timer -= dt
				if (p.timer <= 0) this.finishSession(p)
			}
		} else {
			if (!lite) POSES.idle(r, p.t, null)
			p.idle -= dt
			if (p.idle <= 0 && p.kind === "member") this.chooseNext(p)
		}
	}

	/** One frame: every person steps (off-screen people skip their pose),
	 * ambient members trickle in up to the cap. */
	frame(dt: number, onScreen: (v: T.Vector3) => boolean, frameN: number): void {
		const pd = this.reduce ? dt * 0.3 : dt
		if (frameN % 10 === 0)
			for (const p of this.people)
				p.onscr = onScreen(tmp.copy(p.rig.root.position).setY(0.6))
		for (const p of this.people.slice()) this.step(p, pd, p.onscr === false)
		this.trickleStreet(dt)
		this.boardWaiters(dt)
		this.spawnT -= dt
		if (this.spawnT <= 0) {
			this.spawnT = 3
			const n = this.ambientCount()
			if (n > this.cap) {
				const extra = this.people.find((p) => p.kind === "member" && !p.leaving)
				if (extra) this.leave(extra)
			} else if (n < this.cap && this.freeStations().length) {
				const s = this.w.spawn
				const m = this.addMember(
					Math.max(1, s.x + (this.rng() < 0.5 ? -8 : 8)),
					s.z + 0.4,
				)
				this.chooseNext(m)
			}
		}
	}

	// ── extras: class groups, the cast lineup ─────────────────────────────

	/** A person fixed on a station of their own (a floor station with no
	 * piece), doing its pose until removed. */
	addExtra(o: {
		key: string
		name: string
		out: Outfit
		st: Station
		note?: string | null
		npcKey?: string | null
		role?: string | null
	}): Person {
		const old = this.find(o.key)
		if (old) this.remove(old)
		const p = this.add({
			key: o.key,
			kind: "extra",
			name: o.name,
			npcKey: o.npcKey ?? null,
			role: o.role ?? null,
			out: o.out,
			x: o.st.x,
			z: o.st.z,
		})
		p.note = o.note ?? null
		p.fixed = o.st
		this.claimSnap(p, o.st)
		return p
	}

	/** Where today's event host stands: a floor spot by the entrance. */
	private eventSt: Station | null = null
	private eventStation(): Station {
		const s = this.w.eventSpot()
		const e = this.eventSt
		if (e && e.x === s.x && e.z === s.z) return e
		this.eventSt = {
			x: s.x,
			y: 0,
			z: s.z,
			face: s.face,
			lx: s.x,
			lz: s.z,
			lface: s.face,
			label: "hosting today's event",
			pose: "coach",
			busy: null,
			piece: null,
		}
		return this.eventSt
	}

	pickables(): T.Object3D[] {
		return this.people.map((p) => p.proxy)
	}

	dispose(): void {
		for (const p of this.people) disposeRig(p.rig)
		this.people.length = 0
	}
}
