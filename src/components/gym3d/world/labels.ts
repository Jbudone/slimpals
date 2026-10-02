// DOM labels anchored to world points. One absolutely positioned layer over
// the canvas; each label is moved with a transform every frame and hidden
// when its anchor is off screen.
//
// Two sorts: plain tags (room badges, event / class / hero tags, the lineup's
// names) sit on their anchor; bubbles (the tap chip, job timer cards, coin
// bubbles, speech lines) go through one layout pass (bubbleLayout.ts) that
// keeps them on screen, apart, in priority order and under a cap.
import * as T from "three"
import { PD } from "../../../../shared/gym3d/rooms"
import type { GymRenderer } from "../engine/renderer"
import {
	type BubbleIn,
	type BubbleKind,
	capsFor,
	layoutBubbles,
} from "./bubbleLayout"

export type Label = {
	el: HTMLElement
	/** World point; null hides the label. */
	anchor: () => T.Vector3 | null
	sx: number
	sy: number
	vis: boolean
	dead: boolean
	/** Soft labels fade while a bubble covers them. */
	soft: boolean
	cw: number
	ch: number
	dim: boolean
	pin: boolean
	/** Managed bubble kind, or null for a plain tag. */
	bubble: BubbleKind | null
	/** Extra priority (a line the player caused). */
	boost: number
	/** Hidden by its owner (an idle speech slot, an empty coin bubble). */
	off: boolean
	/** Space between the anchor and the bubble (its tail). */
	tail: number
	/** Pinned to the nearest edge when its anchor is off screen. */
	edge: boolean
	/** Appended to (and removed from) the layer by the layer. */
	owned: boolean
	/** Offset from the anchor last frame (the layout keeps it if it can). */
	ox: number
	oy: number
	/** Tail position from the left edge (CSS var --tx). */
	tx: number
	id: number
}

export type LabelOpts = {
	soft?: boolean
	bubble?: BubbleKind
	boost?: number
	tail?: number
	edge?: boolean
	/** false: the element lives elsewhere (a Svelte node); only moved. */
	adopt?: boolean
}

/** A bubble on screen now (tests, tooling): top-left box in CSS px. */
export type ShownBubble = {
	kind: BubbleKind
	x: number
	y: number
	w: number
	h: number
	el: HTMLElement
}

let nextId = 1

export class LabelLayer {
	readonly root: HTMLDivElement
	private labels: Label[] = []
	private pt = { x: 0, y: 0 }
	private n = 0
	private items: BubbleIn[] = []
	private managed: Label[] = []
	/** Screen space kept free at the top (HUD) and bottom (open sheet). */
	insets = { top: 0, bottom: 0 }

	constructor(host: HTMLElement) {
		const d = document.createElement("div")
		d.className = "g3d-labels"
		d.setAttribute("aria-hidden", "false")
		d.style.cssText =
			"position:absolute;inset:0;pointer-events:none;overflow:hidden;overflow:clip;z-index:2"
		host.appendChild(d)
		this.root = d
	}

	add(
		el: HTMLElement,
		anchor: () => T.Vector3 | null,
		opts?: LabelOpts,
	): Label {
		const owned = opts?.adopt !== false
		if (owned) {
			el.style.position = "absolute"
			el.style.left = "0"
			el.style.top = "0"
			el.style.willChange = "transform"
			this.root.appendChild(el)
		}
		const L: Label = {
			el,
			anchor,
			sx: Number.NaN,
			sy: Number.NaN,
			vis: true,
			dead: false,
			soft: !!opts?.soft,
			cw: 0,
			ch: 0,
			dim: false,
			pin: false,
			bubble: opts?.bubble ?? null,
			boost: opts?.boost ?? 0,
			off: false,
			tail: opts?.tail ?? 8,
			edge: !!opts?.edge,
			owned,
			ox: 0,
			oy: 0,
			tx: -1,
			id: nextId++,
		}
		if (owned && (L.bubble || L.soft)) el.style.pointerEvents = "auto"
		// bubbles show once the layout has placed them
		if (L.bubble) {
			L.vis = false
			el.style.visibility = "hidden"
		}
		this.labels.push(L)
		return L
	}

	remove(L: Label | null | undefined): void {
		if (!L || L.dead) return
		L.dead = true
		if (L.owned) L.el.remove()
		this.labels = this.labels.filter((x) => x !== L)
	}

	/** Re-measure a label after its content changed size. */
	remeasure(L: Label): void {
		L.cw = 0
	}

	private show(L: Label, vis: boolean): void {
		if (vis === L.vis) return
		L.el.style.visibility = vis ? "" : "hidden"
		L.vis = vis
	}

	private move(L: Label, x: number, y: number, css: string): void {
		if (x === L.sx && y === L.sy) return
		L.el.style.transform = css
		L.sx = x
		L.sy = y
	}

	update(r: GymRenderer): void {
		const { w, h } = r.size
		this.n++
		const items = this.items
		const managed = this.managed
		items.length = 0
		managed.length = 0
		for (const L of this.labels) {
			const a = L.anchor()
			if (L.bubble) {
				if (L.off || !a) {
					this.show(L, false)
					continue
				}
				if (!L.cw) {
					L.cw = L.el.offsetWidth
					L.ch = L.el.offsetHeight
				}
				const p = r.toScreen(a, this.pt)
				items.push({
					id: L.id,
					kind: L.bubble,
					boost: L.boost,
					ax: p.x,
					ay: p.y,
					w: L.cw,
					h: L.ch,
					tail: L.tail,
					edge: L.edge,
					prev: { dx: L.ox, dy: L.oy },
				})
				managed.push(L)
				continue
			}
			if (!a) {
				this.show(L, false)
				continue
			}
			const p = r.toScreen(a, this.pt)
			const vis = !(p.x < -200 || p.x > w + 200 || p.y < -100 || p.y > h + 200)
			const x = Math.round(p.x * 2) / 2
			const y = Math.round(p.y * 2) / 2
			this.move(L, x, y, `translate3d(${x}px,${y}px,0) translate(-50%,-100%)`)
			this.show(L, vis)
		}
		if (items.length) {
			const out = layoutBubbles(
				items,
				{ w, h, top: this.insets.top, bottom: this.insets.bottom },
				capsFor(w),
			)
			for (let i = 0; i < out.length; i++) {
				const o = out[i]
				const L = managed[i]
				if (!o.vis) {
					this.show(L, false)
					continue
				}
				L.ox = o.dx
				L.oy = o.dy
				this.move(L, o.x, o.y, `translate3d(${o.x}px,${o.y}px,0)`)
				// the tail points at the anchor, or hides when it cannot
				if (o.tailless !== L.pin) {
					L.pin = o.tailless
					L.el.classList.toggle("pin", o.tailless)
				}
				if (!o.tailless && o.tx !== L.tx) {
					L.tx = o.tx
					L.el.style.setProperty("--tx", `${o.tx}px`)
				}
				this.show(L, true)
			}
		}
		// a soft label (room badge) under a bubble fades so the bubble stays
		// readable; checked a few times a second
		if (this.n % 8 === 0) {
			const hard = this.labels.filter((L) => L.bubble && L.vis && L.cw)
			for (const L of this.labels) {
				if (!L.soft) continue
				if (!L.cw) {
					L.cw = L.el.offsetWidth
					L.ch = L.el.offsetHeight
				}
				// tags sit centred on their anchor's x, bottom on its y
				const x0 = L.sx - L.cw / 2
				const y0 = L.sy - L.ch
				const dim = hard.some(
					(H) =>
						x0 < H.sx + H.cw &&
						H.sx < x0 + L.cw &&
						y0 < H.sy + H.ch &&
						H.sy < y0 + L.ch,
				)
				if (dim !== L.dim) {
					L.dim = dim
					L.el.classList.toggle("dim", dim)
				}
			}
		}
	}

	/** Bubbles on screen now (tests): top-left boxes in CSS px. */
	shown(): ShownBubble[] {
		const out: ShownBubble[] = []
		for (const L of this.labels)
			if (L.bubble && L.vis && !L.off && L.cw && Number.isFinite(L.sx))
				out.push({
					kind: L.bubble,
					x: L.sx,
					y: L.sy,
					w: L.cw,
					h: L.ch,
					el: L.el,
				})
		return out
	}

	get count(): number {
		return this.labels.length
	}

	dispose(): void {
		for (const L of this.labels) L.dead = true
		this.labels = []
		this.root.remove()
	}
}

/** A room badge: name, level, stars and progress to the next level,
 * built with textContent only. */
export function roomBadge(
	name: string,
	level: number,
	progress?: number,
): HTMLElement {
	const b = document.createElement(progress == null ? "div" : "button")
	b.className = "g3d-badge"
	const l1 = document.createElement("span")
	l1.className = "g3d-badge-l1"
	const nm = document.createElement("b")
	nm.textContent = name
	const lv = document.createElement("span")
	lv.textContent = `Lv ${level}`
	const st = document.createElement("span")
	st.className = "g3d-stars"
	st.textContent = "★".repeat(level) + "☆".repeat(Math.max(0, 5 - level))
	l1.append(nm, lv, st)
	b.append(l1)
	if (progress != null) {
		;(b as HTMLButtonElement).type = "button"
		b.setAttribute("aria-label", `${name}, level ${level}`)
		const bar = document.createElement("span")
		bar.className = "g3d-pbar"
		const i = document.createElement("i")
		i.style.width = `${Math.round(progress * 100)}%`
		bar.append(i)
		b.append(bar)
	}
	return b
}

/** Badge anchor: above the room's back wall (higher for the back row). */
export function badgeAnchor(cx: number, z0: number): T.Vector3 {
	return new T.Vector3(cx, z0 < PD ? 3.1 : 2.2, z0 + 0.8)
}
