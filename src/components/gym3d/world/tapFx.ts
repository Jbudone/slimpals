// Tap feedback in the 3D gym: a selection marker (a ring under a person,
// piece, spot or the kiosk; an outline around a room or a lot), a short
// squash and bounce of what was tapped, one ripple on the floor where the
// finger landed, and a 10 ms buzz where the device has one.
//
// GPU cost is kept tiny: three meshes made once (ripple, ring, outline), all
// hidden when idle, so nothing is drawn unless something is selected or a
// ripple is playing. A room outline is rebuilt only when a room is
// selected. frame() allocates nothing. With prefers-reduced-motion the
// marker still shows (no pulse) but nothing squashes or ripples.
import * as T from "three"
import { PD, PW } from "../../../../shared/gym3d/rooms"
import type { AssetCache } from "../engine/assets"

export type Cell = { px: number; pz: number }

export type Rect = { x0: number; z0: number; x1: number; z1: number }

const SIDES: readonly [number, number][] = [
	[0, -1],
	[0, 1],
	[-1, 0],
	[1, 0],
]

/** The strips that outline a set of plot cells: one per outer cell edge,
 * `inset` inside the edge and `width` wide. Strips meet at outer and inner
 * corners and run straight on across cells that share a side. World units,
 * min / max corners. */
export function outlineRects(
	cells: readonly Cell[],
	inset = 0.12,
	width = 0.14,
	W = PW,
	D = PD,
): Rect[] {
	const has = new Set(cells.map((c) => `${c.px},${c.pz}`))
	const at = (x: number, z: number) => has.has(`${x},${z}`)
	const out: Rect[] = []
	for (const c of cells) {
		for (const [ox, oz] of SIDES) {
			if (at(c.px + ox, c.pz + oz)) continue
			// along the edge: x for top / bottom, z for left / right
			const horiz = oz !== 0
			const ax = horiz ? 1 : 0
			const az = horiz ? 0 : 1
			// how far an end moves along the edge (outwards +): an outer
			// corner pulls in, an inner corner reaches the next strip
			const end = (s: number) => {
				const sx = c.px + ax * s
				const sz = c.pz + az * s
				if (!at(sx, sz)) return -inset
				if (at(sx + ox, sz + oz)) return inset + width
				return 0
			}
			const a0 = (horiz ? c.px * W : c.pz * D) - end(-1)
			const a1 = (horiz ? c.px * W + W : c.pz * D + D) + end(1)
			const line = horiz
				? oz < 0
					? c.pz * D
					: c.pz * D + D
				: ox < 0
					? c.px * W
					: c.px * W + W
			const inward = horiz ? -oz : -ox
			const b0 = line + inward * inset
			const b1 = line + inward * (inset + width)
			const lo = Math.min(b0, b1)
			const hi = Math.max(b0, b1)
			out.push(
				horiz
					? { x0: a0, z0: lo, x1: a1, z1: hi }
					: { x0: lo, z0: a0, x1: hi, z1: a1 },
			)
		}
	}
	return out
}

/** Squash then bounce: 0 at rest, positive = squashed. */
export function squashCurve(k: number): number {
	if (k <= 0 || k >= 1) return 0
	return Math.sin(k * Math.PI * 3) * (1 - k) ** 2
}

const RIPPLE_S = 0.5
const SQUASH_S = 0.45
const POP_S = 0.24
const COL = "#ffd75e"

/** Fires `navigator.vibrate(ms)` where the device supports it. */
export function buzz(ms = 10): void {
	try {
		if (typeof navigator !== "undefined" && "vibrate" in navigator)
			navigator.vibrate(ms)
	} catch {
		// no haptics here
	}
}

export class TapFx {
	private ripple: T.Mesh
	private rippleMat: T.MeshBasicMaterial
	private rippleT = -1
	private rippleS = 1
	private ring: T.Mesh
	private outline: T.Mesh
	private markMat: T.MeshBasicMaterial
	private outlineGeo: T.BufferGeometry | null = null
	/** The marker (ring or outline) now shown, and what it follows. */
	private mark: T.Mesh | null = null
	private follow: T.Object3D | null = null
	private popT = -1
	private ringR = 1
	private t = 0
	private sq: {
		o: T.Object3D | null
		t: number
		base: T.Vector3
		amp: number
	} = { o: null, t: -1, base: new T.Vector3(1, 1, 1), amp: 0 }

	constructor(
		scene: T.Scene,
		private assets: AssetCache,
		private calm = false,
	) {
		const a = assets
		this.rippleMat = a.track(
			new T.MeshBasicMaterial({
				color: "#ffffff",
				transparent: true,
				opacity: 0,
				depthWrite: false,
			}),
		)
		this.ripple = new T.Mesh(
			a.geo("tapRipple", () =>
				new T.RingGeometry(0.7, 1, 40).rotateX(-Math.PI / 2),
			),
			this.rippleMat,
		)
		this.markMat = a.track(
			new T.MeshBasicMaterial({
				color: COL,
				transparent: true,
				opacity: 0.95,
				depthWrite: false,
			}),
		)
		this.ring = new T.Mesh(
			a.geo("tapRing", () =>
				new T.RingGeometry(0.84, 1, 48).rotateX(-Math.PI / 2),
			),
			this.markMat,
		)
		this.outline = new T.Mesh(new T.BufferGeometry(), this.markMat)
		this.outlineGeo = a.track(this.outline.geometry)
		for (const m of [this.ripple, this.ring, this.outline]) {
			m.visible = false
			m.renderOrder = 4
			m.frustumCulled = false
			m.castShadow = false
			m.receiveShadow = false
			m.raycast = () => {}
			scene.add(m)
		}
	}

	/** A ring under something (radius in world units); `follow` keeps it
	 * under a moving object (a person). */
	ringAt(x: number, z: number, r: number, follow: T.Object3D | null = null) {
		this.hideMark()
		this.ring.position.set(x, 0.05, z)
		this.ringR = r
		this.ring.scale.set(r, 1, r)
		this.follow = follow
		this.showMark(this.ring)
	}

	/** An outline around plot cells (a room or a lot). */
	outlineCells(cells: readonly Cell[], inset = 0.3, width = 0.28): void {
		this.hideMark()
		if (!cells.length) return
		// centre the geometry on the cells so the pop scales about it
		let cx = 0
		let cz = 0
		for (const c of cells) {
			cx += c.px * PW + PW / 2
			cz += c.pz * PD + PD / 2
		}
		cx /= cells.length
		cz /= cells.length
		const pos: number[] = []
		for (const r of outlineRects(cells, inset, width)) {
			const x0 = r.x0 - cx
			const x1 = r.x1 - cx
			const z0 = r.z0 - cz
			const z1 = r.z1 - cz
			pos.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0)
		}
		const g = new T.BufferGeometry()
		g.setAttribute("position", new T.Float32BufferAttribute(pos, 3))
		g.computeVertexNormals()
		if (this.outlineGeo) this.assets.release(this.outlineGeo)
		this.outlineGeo = this.assets.track(g)
		this.outline.geometry = g
		this.outline.position.set(cx, 0.06, cz)
		this.showMark(this.outline)
	}

	private showMark(m: T.Mesh): void {
		this.mark = m
		m.visible = true
		this.markMat.opacity = 0.95
		this.popT = this.calm ? -1 : 0
		if (!this.calm) this.applyPop(0)
	}

	private hideMark(): void {
		if (this.mark) this.mark.visible = false
		this.mark = null
		this.follow = null
		this.popT = -1
	}

	/** No selection: the marker goes away. */
	clearMark(): void {
		this.hideMark()
	}

	get marked(): string | null {
		if (!this.mark) return null
		return this.mark === this.ring ? "ring" : "outline"
	}

	/** One ripple on the floor at a world point (the pooled ring restarts). */
	rippleAt(x: number, z: number, size = 1): void {
		if (this.calm) return
		this.ripple.position.set(x, 0.07, z)
		this.rippleS = size
		this.rippleT = 0
		this.ripple.visible = true
		this.stepRipple()
	}

	get rippling(): boolean {
		return this.rippleT >= 0
	}

	/** A short squash and bounce of `o` (a piece, a person). Only one plays
	 * at a time: a new one puts the last back first. */
	squash(o: T.Object3D, amp = 0.16): void {
		if (this.calm) return
		const s = this.sq
		if (s.o) s.o.scale.copy(s.base)
		s.o = o
		s.base.copy(o.scale)
		s.t = 0
		s.amp = amp
	}

	/** Puts a squashed object back at once (before a layout rebuild). */
	endSquash(): void {
		const s = this.sq
		if (s.o) s.o.scale.copy(s.base)
		s.o = null
		s.t = -1
	}

	private applyPop(k: number): void {
		const m = this.mark
		if (!m) return
		// a quick grow-in that settles (ease-out), so the marker reads as new
		const e = 1 - (1 - k) ** 3
		const f = 1.18 - 0.18 * e
		const r = m === this.ring ? this.ringR : 1
		m.scale.set(r * f, 1, r * f)
	}

	private stepRipple(): void {
		const k = this.rippleT / RIPPLE_S
		const s = this.rippleS * (0.25 + 0.95 * (1 - (1 - k) ** 2))
		this.ripple.scale.set(s, 1, s)
		this.rippleMat.opacity = 0.9 * (1 - k)
	}

	frame(dt: number): void {
		this.t += dt
		if (this.rippleT >= 0) {
			this.rippleT += dt
			if (this.rippleT >= RIPPLE_S) {
				this.rippleT = -1
				this.ripple.visible = false
			} else this.stepRipple()
		}
		const s = this.sq
		if (s.o && s.t >= 0) {
			s.t += dt
			const k = s.t / SQUASH_S
			if (k >= 1) {
				s.o.scale.copy(s.base)
				s.o = null
				s.t = -1
			} else {
				const e = squashCurve(k) * s.amp
				s.o.scale.set(
					s.base.x * (1 + e * 0.55),
					s.base.y * (1 - e),
					s.base.z * (1 + e * 0.55),
				)
			}
		}
		const m = this.mark
		if (!m) return
		if (this.follow) {
			const p = this.follow.position
			m.position.x = p.x
			m.position.z = p.z
		}
		if (this.popT >= 0) {
			this.popT += dt
			const k = Math.min(1, this.popT / POP_S)
			this.applyPop(k)
			if (k >= 1) this.popT = -1
		}
		if (!this.calm) this.markMat.opacity = 0.72 + 0.23 * Math.cos(this.t * 4)
	}

	dispose(): void {
		const s = this.sq
		if (s.o) s.o.scale.copy(s.base)
		s.o = null
		for (const m of [this.ripple, this.ring, this.outline]) m.removeFromParent()
		this.follow = null
		this.mark = null
	}
}
