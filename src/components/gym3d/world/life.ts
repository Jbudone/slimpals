// Life in the 3D gym: short speech bubbles over people's heads. A few pooled
// DOM bubbles (never more than POOL at a time) live in the label layer, which
// places them with the other bubbles (no overlap, on screen, capped); each is
// measured once per line, so they cost no layout per frame. Tapping a bubble
// pops it; lines also expire. A scheduler picks who talks: named NPCs mostly
// (lines from the server's dialog data, their cast lines, their role), the
// crowd now and then (ambient lines, drawn as thoughts), and two NPCs near
// each other (or chatting in the sim) exchange a line.
import * as T from "three"
import {
	type BanterContext,
	gearLine,
	pickBanter,
} from "../../../../shared/gym3d/banter"
import {
	firstName,
	pairLines,
	pickLine,
	type Rng,
	ROLE_LINES,
	relationOf,
} from "../../../../shared/gym3d/npcLines"
import { CAST } from "../people/cast"
import { PLAYER_BOOST } from "./bubbleLayout"
import type { Label, LabelLayer } from "./labels"
import type { NpcLines, SimNpc } from "./loadLayout"
import type { Person } from "./types"

const POOL = 3
/** Seconds a popped bubble takes to burst, and an expiring one to fade. */
const POP_S = 0.22
const FADE_S = 0.25

type Slot = {
	L: Label
	who: HTMLElement
	text: HTMLElement
	p: Person | null
	until: number
	/** Bursting (tapped) or fading out (expired). */
	ending: "pop" | "fade" | null
	/** When (performance.now ms) a pop or fade is over: wall time, so a
	 * slow frame rate does not leave a burst bubble hanging. */
	endAt: number
	player: boolean
	anim: Animation | null
	pt: T.Vector3
}

export class Bubbles {
	private slots: Slot[] = []
	/** Seconds now (the caller's clock), for taps between frames. */
	private now = 0

	constructor(
		private layer: LabelLayer,
		private calm = false,
	) {
		for (let i = 0; i < POOL; i++) {
			const el = document.createElement("div")
			el.className = "g3d-say"
			el.setAttribute("role", "status")
			el.dataset.testid = "gym3d-say"
			const who = document.createElement("b")
			const text = document.createElement("span")
			el.append(who, text)
			const pt = new T.Vector3()
			const slot = {} as Slot
			const L = layer.add(
				el,
				() => {
					const p = slot.p
					if (!p) return null
					const r = p.rig.root.position
					return pt.set(r.x, r.y + 1.72, r.z)
				},
				{ bubble: "speech", tail: 7 },
			)
			L.off = true
			Object.assign(slot, {
				L,
				who,
				text,
				p: null,
				until: 0,
				ending: null,
				endAt: 0,
				player: false,
				anim: null,
				pt,
			})
			// a short tap pops it (a drag that starts here pans: app.ts)
			el.addEventListener("click", (e) => {
				e.stopPropagation()
				this.pop(slot)
			})
			this.slots.push(slot)
		}
	}

	get active(): number {
		let n = 0
		for (const s of this.slots) if (s.p && !s.ending) n++
		return n
	}

	speaking(p: Person): boolean {
		return this.slots.some((s) => s.p === p && !s.ending)
	}

	/** Shows `text` over `p` for `dur` seconds. When all bubbles are busy and
	 * `force` is set, takes the oldest (an ambient one before a line the
	 * player caused); else returns false. `player`: the player caused it
	 * (outranks ambient chatter on screen). */
	say(
		p: Person,
		text: string,
		name: string | null,
		now: number,
		dur = 3.6,
		force = false,
		player = false,
	): boolean {
		this.now = now
		let s =
			this.slots.find((q) => q.p === p) ??
			this.slots.find((q) => !q.p) ??
			this.slots.find((q) => q.ending)
		if (!s && force) {
			const pool = player
				? this.slots
				: this.slots.filter((q) => !q.player).length
					? this.slots.filter((q) => !q.player)
					: this.slots
			s = pool.reduce((a, b) => (a.until < b.until ? a : b))
		}
		if (!s) return false
		this.stopAnim(s)
		s.p = p
		s.until = now + dur
		s.ending = null
		s.player = player
		s.who.textContent = name ?? ""
		s.who.style.display = name ? "" : "none"
		s.text.textContent = text
		const L = s.L
		// named people (and anyone cheering the player) speak; the crowd's
		// own chatter reads as thoughts
		L.bubble = name || player ? "speech" : "ambient"
		L.boost = player ? PLAYER_BOOST : 0
		L.el.classList.toggle("npc", !!name)
		L.el.classList.toggle("amb", L.bubble === "ambient")
		L.el.dataset.kind = L.bubble
		L.off = false
		L.ox = 0
		L.oy = 0
		this.layer.remeasure(L)
		s.anim = L.el.animate?.(
			[
				{ opacity: 0, translate: "0 6px" },
				{ opacity: 1, translate: "0 0" },
			],
			{ duration: 180, easing: "ease-out" },
		)
		return true
	}

	/** Bursts a bubble (tapped). */
	private pop(s: Slot): void {
		if (!s.p || s.ending === "pop") return
		this.stopAnim(s)
		s.ending = "pop"
		s.endAt = performance.now() + POP_S * 1000
		s.anim = s.L.el.animate?.(
			this.calm
				? [{ opacity: 1 }, { opacity: 0 }]
				: [
						{ opacity: 1, scale: "1" },
						{ opacity: 1, scale: "1.18", offset: 0.35 },
						{ opacity: 0, scale: "0.4" },
					],
			{ duration: POP_S * 1000, easing: "ease-out", fill: "forwards" },
		)
	}

	/** Pops the bubble over a person (tests, tooling). */
	popOf(p: Person): boolean {
		const s = this.slots.find((q) => q.p === p && !q.ending)
		if (!s) return false
		this.pop(s)
		return true
	}

	/** Drops bubbles of people that are gone. */
	forget(p: Person): void {
		for (const s of this.slots) if (s.p === p) this.release(s)
	}

	private stopAnim(s: Slot): void {
		s.anim?.cancel()
		s.anim = null
	}

	private release(s: Slot): void {
		this.stopAnim(s)
		s.p = null
		s.ending = null
		s.player = false
		s.L.off = true
		s.L.el.style.visibility = "hidden"
		s.L.vis = false
	}

	/** Ends lines whose time is up (a short fade) and bubbles of people
	 * leaving. The label layer places what is left. */
	frame(now: number): void {
		this.now = now
		for (const s of this.slots) {
			const p = s.p
			if (!p) continue
			if (s.ending) {
				if (performance.now() > s.endAt) this.release(s)
				continue
			}
			if (now > s.until || p.leaving) {
				if (p.leaving) this.release(s)
				else {
					// time is up: fade out, then let the slot go
					s.ending = "fade"
					s.endAt = performance.now() + FADE_S * 1000
					s.anim = s.L.el.animate?.([{ opacity: 1 }, { opacity: 0 }], {
						duration: FADE_S * 1000,
						fill: "forwards",
					})
				}
			}
		}
	}

	dispose(): void {
		for (const s of this.slots) {
			this.stopAnim(s)
			this.layer.remove(s.L)
		}
		this.slots = []
	}
}

type Pending = { at: number; p: Person; text: string; name: string | null }

/** Who says what, and when. */
export class Life {
	private timer = 2.5
	private pending: Pending[] = []
	private recent = new Map<string, string[]>()
	private lines = new Map<string, NpcLines>()
	private sim = new Map<string, SimNpc>()
	private names = new Map<string, string>()
	private roles = new Map<string, string>()
	/** Slower in reduced motion, and paused (e.g. during a ceremony). */
	paused = false
	/** What the gym holds now, for banter that fits it (none: no banter). */
	banterContext: (() => BanterContext) | null = null
	private banterTimer = 20
	private banterSeen: string[] = []

	constructor(
		private bubbles: Bubbles,
		private people: () => readonly Person[],
		private rng: Rng,
		private calm: boolean,
	) {}

	setLines(list: readonly NpcLines[]): void {
		this.lines = new Map(list.map((l) => [l.key, l]))
	}

	setSim(
		npcs: readonly SimNpc[],
		roster: readonly { key: string; name: string; role: string }[],
	): void {
		this.sim = new Map(npcs.map((n) => [n.npcKey, n]))
		for (const r of roster) {
			this.names.set(r.key, r.name)
			this.roles.set(r.key, r.role)
		}
	}

	/** A line the player caused (a ticked task, a claim): skips the queue,
	 * takes a bubble and outranks chatter on screen. */
	sayNow(p: Person, text: string, now: number, dur = 4.2): void {
		this.bubbles.say(p, text, this.nameOf(p), now, dur, true, true)
	}

	private nameOf(p: Person): string | null {
		if (!p.npcKey) return null
		return firstName(this.names.get(p.npcKey) ?? p.name)
	}

	private remember(key: string, line: string): void {
		const r = this.recent.get(key) ?? []
		r.push(line)
		if (r.length > 4) r.shift()
		this.recent.set(key, r)
	}

	/** A member started a set on upgraded gear: now and then they say so
	 * (at most one such line every 20 s, and never over a busy bubble pool). */
	private lastGear = -1e9
	gearReaction(p: Person, tier: number, now: number): void {
		if (this.paused || now - this.lastGear < 20 || this.rng() > 0.4) return
		if (this.bubbles.active >= 2 || !this.visible(p)) return
		const line = gearLine(tier, this.rng)
		if (!line) return
		this.lastGear = now
		this.bubbles.say(p, line, this.nameOf(p), now, 3.2)
	}

	/** One line for a person, or null. */
	lineFor(p: Person): string | null {
		const recent = this.recent.get(p.key) ?? []
		if (p.npcKey) {
			const role = this.roles.get(p.npcKey) ?? p.role ?? "regular"
			return pickLine(
				{
					server: this.lines.get(p.npcKey)?.lines,
					own: CAST[p.npcKey]?.lines,
					role: ROLE_LINES[role],
				},
				recent,
				this.rng,
			)
		}
		const pool =
			p.kind === "extra"
				? ROLE_LINES.class
				: p.kind === "staff"
					? p.name === "Swimmer"
						? ROLE_LINES.swimmer
						: ROLE_LINES.staff
					: ROLE_LINES.member
		return pickLine({ role: pool }, recent, this.rng)
	}

	private visible(p: Person): boolean {
		return p.onscr !== false && !p.leaving && !this.bubbles.speaking(p)
	}

	/** A pair of named NPCs to exchange lines: chatting in the sim first,
	 * else any two within 3 units of each other. */
	private findPair(ps: readonly Person[]): [Person, Person] | null {
		const named = ps.filter((p) => p.npcKey && this.visible(p))
		for (const a of named) {
			const w = this.sim.get(a.npcKey as string)?.chatEventWith
			const b = w ? named.find((q) => q.npcKey === w) : undefined
			if (b) return [a, b]
		}
		const close: [Person, Person][] = []
		for (let i = 0; i < named.length; i++)
			for (let j = i + 1; j < named.length; j++) {
				const a = named[i].rig.root.position
				const b = named[j].rig.root.position
				if (Math.hypot(a.x - b.x, a.z - b.z) < 3)
					close.push([named[i], named[j]])
			}
		return close.length
			? close[Math.floor(this.rng() * close.length) % close.length]
			: null
	}

	tick(dt: number, now: number): void {
		for (const q of this.pending.slice()) {
			if (q.at > now) continue
			this.pending.splice(this.pending.indexOf(q), 1)
			if (!q.p.leaving) this.bubbles.say(q.p, q.text, q.name, now, 3.2, true)
		}
		if (this.paused) return
		this.timer -= dt
		if (this.timer > 0) return
		this.timer = (this.calm ? 9 : 3.2) + this.rng() * 3.5
		this.banterTimer -= this.timer
		if (this.bubbles.active >= 2 || this.pending.length) return
		const ps = this.people()
		if (this.banterTimer <= 0 && this.banter(ps, now)) return
		if (this.rng() < 0.35) {
			const pair = this.findPair(ps)
			if (pair) {
				const [a, b] = pair
				const la = this.lines.get(a.npcKey as string)
				const lb = this.lines.get(b.npcKey as string)
				const rel = relationOf(
					la && { friends: la.friends, rivals: la.rivals },
					lb && { friends: lb.friends, rivals: lb.rivals },
					a.npcKey as string,
					b.npcKey as string,
				)
				const l = pairLines(
					rel,
					this.names.get(b.npcKey as string) ?? b.name,
					this.rng,
				)
				this.bubbles.say(a, l.open, this.nameOf(a), now, 3)
				this.pending.push({
					at: now + 1.7,
					p: b,
					text: l.reply,
					name: this.nameOf(b),
				})
				return
			}
		}
		// the lineup (extras with no class) stays quiet
		const vis = ps.filter(
			(p) => this.visible(p) && (p.kind !== "extra" || !!p.note),
		)
		if (!vis.length) return
		const named = vis.filter((p) => p.npcKey)
		const who =
			named.length && this.rng() < 0.7
				? named[Math.floor(this.rng() * named.length) % named.length]
				: vis[Math.floor(this.rng() * vis.length) % vis.length]
		const line = this.lineFor(who)
		if (!line) return
		this.remember(who.key, line)
		this.bubbles.say(who, line, this.nameOf(who), now)
	}

	/** Two people close together swap a scripted exchange that fits the gym
	 * (rarely: one every minute or so). */
	private banter(ps: readonly Person[], now: number): boolean {
		const ctx = this.banterContext?.()
		if (!ctx) return false
		const near = ps.filter(
			(p) => this.visible(p) && (p.kind !== "extra" || !!p.note),
		)
		const pairs: [Person, Person][] = []
		for (let i = 0; i < near.length; i++)
			for (let j = i + 1; j < near.length; j++) {
				const a = near[i].rig.root.position
				const b = near[j].rig.root.position
				if (Math.hypot(a.x - b.x, a.z - b.z) < 2.5)
					pairs.push([near[i], near[j]])
			}
		if (!pairs.length) return false
		const b = pickBanter(ctx, this.banterSeen, this.rng)
		if (!b) return false
		const [x, y] = pairs[Math.floor(this.rng() * pairs.length) % pairs.length]
		this.banterSeen.push(b.id)
		if (this.banterSeen.length > 6) this.banterSeen.shift()
		this.banterTimer = (this.calm ? 90 : 55) + this.rng() * 40
		b.lines.forEach((text, i) => {
			const p = i % 2 ? y : x
			if (i === 0) this.bubbles.say(p, text, this.nameOf(p), now, 3.4)
			else
				this.pending.push({
					at: now + i * 2.2,
					p,
					text,
					name: this.nameOf(p),
				})
		})
		return true
	}

	clear(): void {
		this.pending = []
	}
}
