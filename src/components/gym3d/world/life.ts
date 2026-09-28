// Life in the 3D gym: short speech bubbles over people's heads. A few pooled
// DOM bubbles (never more than POOL at a time) are moved with a transform
// each frame and measured once per line, so they cost no layout per frame.
// A scheduler picks who talks: named NPCs mostly (lines from the server's
// dialog data, their cast lines, their role), the crowd now and then, and
// two NPCs near each other (or chatting in the sim) exchange a line.
import * as T from "three"
import {
	firstName,
	pairLines,
	pickLine,
	type Rng,
	ROLE_LINES,
	relationOf,
} from "../../../../shared/gym3d/npcLines"
import { CAST } from "../people/cast"
import type { NpcLines, SimNpc } from "./loadLayout"
import type { Person } from "./types"

const POOL = 3

type Slot = {
	el: HTMLDivElement
	who: HTMLElement
	text: HTMLElement
	p: Person | null
	until: number
	w: number
	h: number
	sx: number
	sy: number
	vis: boolean
}

export class Bubbles {
	private slots: Slot[] = []
	private pt = new T.Vector3()
	/** Screen space kept free at the top (HUD). */
	top = 0

	constructor(root: HTMLElement) {
		for (let i = 0; i < POOL; i++) {
			const el = document.createElement("div")
			el.className = "g3d-say"
			el.setAttribute("role", "status")
			el.style.cssText =
				"position:absolute;left:0;top:0;visibility:hidden;will-change:transform"
			const who = document.createElement("b")
			const text = document.createElement("span")
			el.append(who, text)
			root.appendChild(el)
			this.slots.push({
				el,
				who,
				text,
				p: null,
				until: 0,
				w: 0,
				h: 0,
				sx: Number.NaN,
				sy: Number.NaN,
				vis: false,
			})
		}
	}

	get active(): number {
		let n = 0
		for (const s of this.slots) if (s.p) n++
		return n
	}

	speaking(p: Person): boolean {
		return this.slots.some((s) => s.p === p)
	}

	/** Shows `text` over `p` for `dur` seconds. Takes the oldest bubble when
	 * all are busy and `force` is set; else returns false. */
	say(
		p: Person,
		text: string,
		name: string | null,
		now: number,
		dur = 3.6,
		force = false,
	): boolean {
		let s = this.slots.find((q) => q.p === p) ?? this.slots.find((q) => !q.p)
		if (!s && force)
			s = this.slots.reduce((a, b) => (a.until < b.until ? a : b))
		if (!s) return false
		s.p = p
		s.until = now + dur
		s.who.textContent = name ?? ""
		s.who.style.display = name ? "" : "none"
		s.text.textContent = text
		s.el.classList.toggle("npc", !!name)
		// one measure per line (not per frame)
		s.w = s.el.offsetWidth
		s.h = s.el.offsetHeight
		s.sx = Number.NaN
		s.el.animate?.(
			[
				{ opacity: 0, translate: "0 6px" },
				{ opacity: 1, translate: "0 0" },
			],
			{ duration: 180, easing: "ease-out" },
		)
		return true
	}

	/** Drops bubbles of people that are gone. */
	forget(p: Person): void {
		for (const s of this.slots) if (s.p === p) this.hide(s)
	}

	private hide(s: Slot): void {
		s.p = null
		if (s.vis) {
			s.el.style.visibility = "hidden"
			s.vis = false
		}
	}

	frame(
		now: number,
		toScreen: (v: T.Vector3) => { x: number; y: number },
		w: number,
		h: number,
	): void {
		for (const s of this.slots) {
			const p = s.p
			if (!p) continue
			if (now > s.until || p.leaving) {
				this.hide(s)
				continue
			}
			const r = p.rig.root.position
			const sp = toScreen(this.pt.set(r.x, r.y + 1.72, r.z))
			const on = sp.x > -40 && sp.x < w + 40 && sp.y > 0 && sp.y < h + 60
			if (!on) {
				if (s.vis) {
					s.el.style.visibility = "hidden"
					s.vis = false
				}
				continue
			}
			const hw = s.w / 2
			const x = Math.round(Math.min(Math.max(sp.x, hw + 6), w - hw - 6))
			const y = Math.round(Math.max(sp.y, this.top + s.h + 4))
			if (x !== s.sx || y !== s.sy) {
				s.el.style.transform = `translate3d(${x - hw}px,${y - s.h}px,0)`
				s.sx = x
				s.sy = y
			}
			if (!s.vis) {
				s.el.style.visibility = ""
				s.vis = true
			}
		}
	}

	dispose(): void {
		for (const s of this.slots) s.el.remove()
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

	/** A line now (celebrations): skips the queue, takes a bubble. */
	sayNow(p: Person, text: string, now: number, dur = 4.2): void {
		this.bubbles.say(p, text, this.nameOf(p), now, dur, true)
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
		if (this.bubbles.active >= 2 || this.pending.length) return
		const ps = this.people()
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

	clear(): void {
		this.pending = []
	}
}
