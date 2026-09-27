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
}

export class LabelLayer {
	readonly root: HTMLDivElement
	private labels: Label[] = []
	private pt = { x: 0, y: 0 }

	constructor(host: HTMLElement) {
		const d = document.createElement("div")
		d.className = "g3d-labels"
		d.setAttribute("aria-hidden", "false")
		d.style.cssText =
			"position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2"
		host.appendChild(d)
		this.root = d
	}

	add(el: HTMLElement, anchor: () => T.Vector3): Label {
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
		}
		this.labels.push(L)
		return L
	}

	remove(L: Label | null | undefined): void {
		if (!L || L.dead) return
		L.dead = true
		L.el.remove()
		this.labels = this.labels.filter((x) => x !== L)
	}

	update(r: GymRenderer): void {
		const { w, h } = r.size
		for (const L of this.labels) {
			const p = r.toScreen(L.anchor(), this.pt)
			const vis = !(p.x < -200 || p.x > w + 200 || p.y < -100 || p.y > h + 200)
			const x = Math.round(p.x * 2) / 2
			const y = Math.round(p.y * 2) / 2
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

/** A room badge: name, level and stars, built with textContent only. */
export function roomBadge(name: string, level: number): HTMLElement {
	const b = document.createElement("div")
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
	return b
}

/** Badge anchor: above the room's back wall (higher for the back row). */
export function badgeAnchor(cx: number, z0: number): T.Vector3 {
	return new T.Vector3(cx, z0 < PD ? 3.1 : 2.2, z0 + 0.8)
}
