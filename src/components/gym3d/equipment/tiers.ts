// Static batching of a built piece (every untextured, non-animated mesh
// merged into one vertex-coloured mesh) and the tier 2/3 look: recoloured
// steel and pads, a coloured edge, a pennant, and a gold glow at tier 3.
import * as T from "three"
import {
	boxGeo,
	C,
	canvasTex,
	cylGeo,
	M,
	mergeParts,
	star,
} from "../engine/helpers"
import { ctx } from "../world/state"
import type { Piece } from "../world/types"
import { GOLD, glowM } from "./builders"

const TIER_COL: Record<2 | 3, string> = { 2: "#2f9e8f", 3: "#e0a82e" }

function tierMat(tier: number, base: T.Material): T.Material {
	if (tier < 2) return base
	if (base === M(C.steelD)) return tier === 2 ? M(TIER_COL[2]) : GOLD()
	if (base === M(C.pad)) return M(tier === 2 ? "#e8743b" : "#9b6bc4")
	return base
}

/** Merges the piece's static meshes (animated parts are tagged userData.dyn
 * and stay live). */
export function bakePiece(p: Piece): void {
	const g = p.inner
	g.updateMatrixWorld(true)
	const inv = new T.Matrix4().copy(g.matrixWorld).invert()
	const src: NonNullable<Piece["bakeSrc"]> = []
	const kill: T.Object3D[] = []
	const walk = (o: T.Object3D) => {
		for (const c of o.children.slice()) {
			if (c.userData.dyn) continue
			if (
				c instanceof T.Mesh &&
				!(c instanceof T.InstancedMesh) &&
				c.visible &&
				!c.children.length &&
				!Array.isArray(c.material) &&
				c.material.userData?.mergeable
			) {
				src.push({
					geo: c.geometry,
					m: new T.Matrix4().multiplyMatrices(inv, c.matrixWorld),
					mat: c.material,
				})
				kill.push(c)
			} else walk(c)
		}
	}
	walk(g)
	if (src.length < 2) return
	for (const c of kill) c.removeFromParent()
	const prune = (o: T.Object3D) => {
		for (const c of o.children.slice()) {
			if (!(c instanceof T.Mesh) && !(c instanceof T.Line) && !c.userData.dyn) {
				prune(c)
				if (!c.children.length) o.remove(c)
			}
		}
	}
	prune(g)
	p.bakeSrc = src
	rebakePiece(p)
}

export function rebakePiece(p: Piece): void {
	if (!p.bakeSrc) return
	const a = ctx().assets
	if (p.bakeMesh) {
		p.bakeMesh.removeFromParent()
		a.release(p.bakeMesh.geometry)
	}
	const parts = p.bakeSrc.map((s) => {
		const mt = tierMat(p.tier, s.mat) as T.MeshStandardMaterial
		const vc = mt.userData.vc as T.Color | undefined
		return { geo: s.geo, m: s.m, c: vc ?? mt.color }
	})
	const mesh = new T.Mesh(a.track(mergeParts(parts, false)), a.MV)
	mesh.castShadow = true
	mesh.receiveShadow = true
	mesh.userData.merged = true
	p.inner.add(mesh)
	p.bakeMesh = mesh
}

function tierFlagTex(t: number): T.Texture {
	return canvasTex(
		96,
		64,
		(g, w, h) => {
			g.fillStyle = t === 3 ? "#e0a82e" : "#2f9e8f"
			g.beginPath()
			g.moveTo(0, 0)
			g.lineTo(w, h / 2)
			g.lineTo(0, h)
			g.fill()
			g.fillStyle = "#fff"
			for (let i = 0; i < t - 1; i++) {
				star(g, 20 + i * 24, h / 2, 11, 5)
				g.fill()
			}
		},
		`tierflag${t}`,
	)
}

/** Parts a better machine really has, not a new colour: tier 2 gets a
 * floor mat and a console (screen on a stand) by the front corner; tier 3
 * adds an overhead light arch and side speakers, and a bigger screen. */
function addUpgradeParts(
	d: T.Group,
	tier: number,
	s: number,
	h: number,
	roomType: string | null,
): void {
	const add = (
		geo: T.BufferGeometry,
		mat: T.Material,
		x: number,
		y: number,
		z: number,
	) => {
		const m = new T.Mesh(geo, mat)
		m.position.set(x, y, z)
		m.castShadow = true
		d.add(m)
		return m
	}
	add(boxGeo(s * 0.9, 0.02, s * 0.9), M(C.rubber), 0, 0.012, 0)
	const sw = tier === 3 ? 0.62 : 0.46
	const sh = tier === 3 ? 0.4 : 0.3
	add(cylGeo(0.03, 1.0, 6), M(C.steel), -h + 0.12, 0.5, h - 0.12)
	add(
		boxGeo(sw + 0.06, sh + 0.06, 0.05),
		M(C.rubber),
		-h + 0.12,
		1.12,
		h - 0.12,
	)
	add(
		boxGeo(sw, sh, 0.02),
		glowM(tier === 3 ? "#ffd35a" : "#7fe0d0"),
		-h + 0.12,
		1.12,
		h - 0.095,
	)
	// what this kind of machine would really get: a fan to cool a cardio
	// session, a plate tree beside the weights (bigger and gilded at tier 3)
	const cx = h - 0.14
	const cz = h - 0.14
	if (roomType === "cardio") {
		add(cylGeo(0.025, 0.85, 6), M(C.steel), cx, 0.42, cz)
		add(boxGeo(0.26, 0.26, 0.06), M(C.rubber), cx, 0.95, cz)
		add(
			cylGeo(0.09, 0.02, 12),
			glowM(tier === 3 ? "#ffd35a" : "#7fe0d0"),
			cx,
			0.95,
			cz - 0.04,
		).rotation.x = Math.PI / 2
	} else if (roomType === "weights") {
		add(cylGeo(0.03, 0.95, 6), M(C.steelD), cx, 0.47, cz)
		const discs = tier === 3 ? 4 : 3
		for (let i = 0; i < discs; i++)
			add(
				cylGeo(0.16 - i * 0.015, 0.045, 14),
				i === discs - 1 && tier === 3 ? glowM("#ffd35a") : M(C.steelD),
				cx,
				0.2 + i * 0.16,
				cz,
			)
	}
	if (tier < 3) return
	for (const x of [-h + 0.06, h - 0.06]) {
		add(cylGeo(0.04, 2.1, 8), M(C.steelD), x, 1.05, -h + 0.06)
		add(boxGeo(0.18, 0.42, 0.18), M(C.rubber), x, 0.21, h - 0.1)
		add(cylGeo(0.05, 0.02, 10), glowM("#ffd35a"), x, 0.43, h - 0.1)
	}
	add(boxGeo(s - 0.06, 0.06, 0.08), M(C.steelD), 0, 2.1, -h + 0.06)
	add(boxGeo(s - 0.3, 0.03, 0.05), glowM("#fff1c2"), 0, 2.06, -h + 0.12)
}

export function applyTier(p: Piece): void {
	rebakePiece(p)
	p.inner.traverse((o) => {
		if (
			!(o instanceof T.Mesh) ||
			o.userData.merged ||
			Array.isArray(o.material)
		)
			return
		if (!("baseMat" in o.userData)) o.userData.baseMat = o.material
		o.material = tierMat(p.tier, o.userData.baseMat as T.Material)
	})
	if (p.deco) {
		p.deco.removeFromParent()
		p.deco = undefined
	}
	if (p.tier < 2) return
	const a = ctx().assets
	const d = new T.Group()
	p.root.add(d)
	p.deco = d
	const s = p.size
	const h = s / 2 - 0.02
	const mt = p.tier === 3 ? glowM("#ffd35a") : M(TIER_COL[2])
	for (const [x, z, w, dd] of [
		[0, -h, s, 0.07],
		[0, h, s, 0.07],
		[-h, 0, 0.07, s],
		[h, 0, 0.07, s],
	]) {
		const m = new T.Mesh(boxGeo(w, 0.05, dd), mt)
		m.position.set(x, 0.03, z)
		d.add(m)
	}
	const pole = new T.Mesh(cylGeo(0.025, 1.5, 6), M(C.steelD))
	pole.position.set(h - 0.08, 0.75, -h + 0.08)
	d.add(pole)
	const flagMat = a.mat(
		`tierflagM${p.tier}`,
		() =>
			new T.MeshBasicMaterial({
				map: tierFlagTex(p.tier),
				transparent: true,
				side: T.DoubleSide,
			}),
	)
	const fl = new T.Mesh(
		a.geo("tierflagG", () => new T.PlaneGeometry(0.5, 0.33)),
		flagMat,
	)
	fl.position.set(h - 0.08 + 0.25, 1.32, -h + 0.08)
	d.add(fl)
	d.userData.flag = fl
	addUpgradeParts(d, p.tier, s, h, p.roomType)
	if (p.tier === 3) {
		const gl = new T.Mesh(
			a.geo(`tierglow${s}`, () => new T.PlaneGeometry(s + 0.5, s + 0.5)),
			glowM("#ffd76a", 0.22, true),
		)
		gl.rotation.x = -Math.PI / 2
		gl.position.y = 0.035
		d.add(gl)
	}
}
