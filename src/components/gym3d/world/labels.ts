// DOM labels anchored to world points (room badges, the tapped person's name
// chip). One absolutely positioned layer over the canvas; each label is moved
// with a transform every frame and hidden when its anchor is off screen.
import * as T from "three"
import { PD } from "../../../../shared/gym3d/rooms"
import type { GymRenderer } from "../engine/renderer"

export type Label = {
	el: HTMLElement
	anchor: () => T.Vector3
	sx: number
	sy: number
	vis: boolean
	dead: boolean
	/** Kept fully on screen (timer bubbles), pinned to the nearest edge. */
	clamp: boolean
	/** Soft labels fade while a clamped label covers them. */
	soft: boolean
	cw: number
	ch: number
	dim: boolean
	pin: boolean
}

export class LabelLayer {
	readonly root: HTMLDivElement
	private labels: Label[] = []
	private pt = { x: 0, y: 0 }
	private n = 0
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
		anchor: () => T.Vector3,
		opts?: { clamp?: boolean; soft?: boolean },
	): Label {
		el.style.position = "absolute"
		el.style.left = "0"
		el.style.top = "0"
		el.style.willChange = "transform"
		this.root.appendChild(el)
		const L: Label = {
			el,
			anchor,
			sx: Number.NaN,
			sy: Number.NaN,
			vis: true,
			dead: false,
			clamp: !!opts?.clamp,
			soft: !!opts?.soft,
			cw: 0,
			ch: 0,
			dim: false,
			pin: false,
		}
		if (L.clamp || L.soft) el.style.pointerEvents = "auto"
		this.labels.push(L)
		return L
	}

	remove(L: Label | null | undefined): void {
		if (!L || L.dead) return
		L.dead = true
		L.el.remove()
		this.labels = this.labels.filter((x) => x !== L)
	}

	/** Re-measure a label after its content changed size. */
	remeasure(L: Label): void {
		L.cw = 0
	}

	update(r: GymRenderer): void {
		const { w, h } = r.size
		this.n++
		for (const L of this.labels) {
			const p = r.toScreen(L.anchor(), this.pt)
			let vis = !(p.x < -200 || p.x > w + 200 || p.y < -100 || p.y > h + 200)
			let px = p.x
			let py = p.y
			let pin = false
			if (L.clamp) {
				if (!L.cw) {
					L.cw = L.el.offsetWidth
					L.ch = L.el.offsetHeight
				}
				const hw = L.cw / 2
				const top = this.insets.top + 6
				const bot = h - this.insets.bottom - 6
				const nx = Math.min(Math.max(px, hw + 6), w - hw - 6)
				const ny = Math.min(Math.max(py, top + L.ch), Math.max(top + L.ch, bot))
				pin = Math.abs(nx - px) > 1 || Math.abs(ny - py) > 1
				px = nx
				py = ny
				// no room between the HUD and a tall sheet: step aside rather
				// than sit half under the sheet
				vis = top + L.ch <= bot
			}
			if (pin !== L.pin) {
				L.pin = pin
				L.el.classList.toggle("pin", pin)
			}
			const x = Math.round(px * 2) / 2
			const y = Math.round(py * 2) / 2
			if (x !== L.sx || y !== L.sy) {
				L.el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-100%)`
				L.sx = x
				L.sy = y
			}
			if (vis !== L.vis) {
				L.el.style.visibility = vis ? "" : "hidden"
				L.vis = vis
			}
		}
		// a soft label (room badge) under a timer bubble fades so the timer
		// stays readable; checked a few times a second
		if (this.n % 8 === 0) {
			const hard = this.labels.filter((L) => L.clamp && L.cw)
			for (const L of this.labels) {
				if (!L.soft) continue
				if (!L.cw) {
					L.cw = L.el.offsetWidth
					L.ch = L.el.offsetHeight
				}
				const dim = hard.some(
					(H) =>
						Math.abs(H.sx - L.sx) < (H.cw + L.cw) / 2 &&
						L.sy > H.sy - H.ch &&
						L.sy - L.ch < H.sy,
				)
				if (dim !== L.dim) {
					L.dim = dim
					L.el.classList.toggle("dim", dim)
				}
			}
		}
	}

	/** A shown clamped label (a timer card) covers part of this screen box. */
	coversBox(x0: number, y0: number, x1: number, y1: number): boolean {
		for (const H of this.labels) {
			if (!H.clamp || !H.vis || !H.cw) continue
			const hw = H.cw / 2
			if (x0 < H.sx + hw && H.sx - hw < x1 && y0 < H.sy && H.sy - H.ch < y1)
				return true
		}
		return false
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
