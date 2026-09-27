// Procedural poses for the toon rigs (ported from the build lab). Each pose
// sets joint rotations for time t; st carries station options (bars that
// follow the hands, recline angles, ...).
import * as T from "three"
import {
	box,
	C,
	clamp01,
	cyl,
	eqGeo,
	group,
	lerp,
	sphGeo,
} from "../engine/helpers"
import type { PoseName, Station } from "../world/types"
import { H0, type Rig, tmesh } from "./rig"

/** Foot offset from the hip joint for thigh angle a and shin angle b. */
function legVec(a: number, b: number): { y: number; z: number } {
	const th = H0 - 0.24
	const sh = 0.24
	return {
		y: -th * Math.cos(a) - sh * Math.cos(b),
		z: -th * Math.sin(a) - sh * Math.sin(b),
	}
}

function plantLegs(r: Rig, a: number, kn: number, footZ: number): void {
	for (const l of [r.legL, r.legR]) {
		l.hp.rotation.x = a
		l.kn.rotation.x = kn
	}
	const v = legVec(a, a + kn)
	r.hips.position.y = -v.y
	r.body.position.z = footZ - v.z
}

function rigProp(r: Rig, key: string, mk: (r: Rig) => T.Object3D[]): void {
	if (!r.props[key]) r.props[key] = mk(r)
	for (const o of r.props[key]) o.visible = true
}

const _ha = new T.Vector3()
const _hb = new T.Vector3()
export function followHands(r: Rig, obj: T.Object3D): void {
	r.root.updateMatrixWorld(true)
	r.armL.hand.getWorldPosition(_ha)
	r.armR.hand.getWorldPosition(_hb)
	_ha.add(_hb).multiplyScalar(0.5)
	obj.parent?.worldToLocal(_ha)
	obj.position.copy(_ha)
}

const mkGloves = (r: Rig): T.Object3D[] =>
	[r.armL, r.armR].map((a) => {
		const g = group(0, -0.02, 0.01, a.hand)
		tmesh(sphGeo(0.068, 12, 10), "glove", "#d4463a", g).scale.set(1, 1.15, 1.2)
		tmesh(
			sphGeo(0.05, 10, 8),
			"glove",
			"#fff7ea",
			g,
			0,
			0.07,
			0,
			true,
		).scale.set(1, 0.5, 1)
		return g
	})

const mkMitts = (r: Rig): T.Object3D[] =>
	[r.armL, r.armR].map((a) => {
		const g = group(0, -0.05, 0, a.hand)
		tmesh(
			eqGeo("mitt", () => new T.CylinderGeometry(0.075, 0.075, 0.05, 14)),
			"glove",
			"#f2c14a",
			g,
		)
		tmesh(sphGeo(0.03, 8, 6), "glove", "#d4463a", g, 0, -0.03, 0, true)
		return g
	})

const mkClip =
	(col: string) =>
	(r: Rig): T.Object3D[] => {
		const g = group(0, -0.07, 0.035, r.armR.hand)
		box(0.15, 0.2, 0.014, col, 0, 0, 0, g)
		box(0.12, 0.15, 0.006, "#fff7ea", 0, -0.01, 0.01, g, { noCast: true })
		box(0.05, 0.025, 0.02, C.steelD, 0, 0.09, 0.008, g, { noCast: true })
		return [g]
	}

const mkDumbbells = (r: Rig): T.Object3D[] =>
	[r.armL, r.armR].map((a) => {
		const d = group(0, -0.02, 0.02, a.hand)
		const rz = [0, 0, Math.PI / 2] as const
		cyl(0.015, 0.2, "#3a3f4a", 0, 0, 0, d, 6, rz)
		cyl(0.05, 0.04, "#2c2f36", -0.09, 0, 0, d, 10, rz)
		cyl(0.05, 0.04, "#2c2f36", 0.09, 0, 0, d, 10, rz)
		return d
	})

type PoseFn = (r: Rig, t: number, st: Station | null) => void

export const POSES: Record<PoseName, PoseFn> = {
	idle(r, t) {
		r.hips.position.y = H0 + Math.sin(t * 2) * 0.006
		r.armL.sh.rotation.z = 0.08
		r.armR.sh.rotation.z = -0.08
		r.neck.rotation.y = Math.sin(t * 0.6) * 0.25
	},
	walk(r, t) {
		const s = Math.sin(t * 9)
		r.legL.hp.rotation.x = s * 0.55
		r.legR.hp.rotation.x = -s * 0.55
		r.legL.kn.rotation.x = Math.max(0, -s) * 0.6
		r.legR.kn.rotation.x = Math.max(0, s) * 0.6
		r.armL.sh.rotation.x = -s * 0.5
		r.armR.sh.rotation.x = s * 0.5
		r.armL.sh.rotation.z = 0.08
		r.armR.sh.rotation.z = -0.08
		r.hips.position.y = H0 + Math.abs(Math.cos(t * 9)) * 0.022
		r.torso.rotation.y = s * 0.08
	},
	run(r, t) {
		const s = Math.sin(t * 14)
		r.torso.rotation.x = 0.18
		r.legL.hp.rotation.x = s * 0.85
		r.legR.hp.rotation.x = -s * 0.85
		r.legL.kn.rotation.x = 0.4 + Math.max(0, -s) * 0.9
		r.legR.kn.rotation.x = 0.4 + Math.max(0, s) * 0.9
		r.armL.sh.rotation.x = -s * 0.8
		r.armR.sh.rotation.x = s * 0.8
		r.armL.el.rotation.x = -1.3
		r.armR.el.rotation.x = -1.3
		r.hips.position.y = H0 - 0.02 + Math.abs(Math.cos(t * 14)) * 0.05
	},
	bench(r, t, st) {
		r.body.rotation.x = -Math.PI / 2
		r.body.position.set(0, 0.12, H0)
		r.legL.hp.rotation.x = 0.2
		r.legR.hp.rotation.x = 0.2
		r.legL.kn.rotation.x = 1.35
		r.legR.kn.rotation.x = 1.35
		r.legL.hp.rotation.z = -0.25
		r.legR.hp.rotation.z = 0.25
		const k = (Math.sin(t * 2.4) + 1) / 2
		for (const [a, s] of [
			[r.armL, -1],
			[r.armR, 1],
		] as const) {
			a.sh.rotation.x = -Math.PI / 2
			a.sh.rotation.z = s * (1.0 - 0.85 * k)
			a.el.rotation.z = -s * (1.0 - 0.85 * k)
		}
		if (st?.bar && st.benchGroup) {
			r.root.updateMatrixWorld(true)
			r.armL.hand.getWorldPosition(_ha)
			r.armR.hand.getWorldPosition(_hb)
			const mid = _ha.add(_hb).multiplyScalar(0.5)
			st.benchGroup.worldToLocal(mid)
			st.bar.position.copy(mid)
		}
	},
	curl(r, t) {
		const k = (Math.sin(t * 3) + 1) / 2
		r.armL.el.rotation.x = -0.2 - k * 1.9
		r.armR.el.rotation.x = -0.2 - (1 - k) * 1.9
		r.armL.sh.rotation.x = 0.05
		r.armR.sh.rotation.x = 0.05
		rigProp(r, "dbs", mkDumbbells)
	},
	sit(r, t) {
		r.hips.position.y = H0 - 0.03
		r.legL.hp.rotation.x = -1.5
		r.legR.hp.rotation.x = -1.5
		r.legL.kn.rotation.x = 1.5
		r.legR.kn.rotation.x = 1.5
		const k = Math.sin(t * 6)
		r.armL.sh.rotation.x = -0.9 + k * 0.05
		r.armR.sh.rotation.x = -0.9 - k * 0.05
		r.armL.el.rotation.x = -0.5
		r.armR.el.rotation.x = -0.5
		r.neck.rotation.y = Math.sin(t * 0.7) * 0.3
	},
	stand_work(r, t) {
		const k = Math.sin(t * 5)
		r.armL.sh.rotation.x = -0.8 + k * 0.1
		r.armR.sh.rotation.x = -0.8 - k * 0.1
		r.armL.el.rotation.x = -0.6
		r.armR.el.rotation.x = -0.6
		r.neck.rotation.y = Math.sin(t * 0.5) * 0.4
	},
	bike(r, t) {
		r.hips.position.y = 0.02
		r.torso.rotation.x = 0.45
		const s = t * 6
		r.legL.hp.rotation.x = -1.1 + Math.sin(s) * 0.45
		r.legR.hp.rotation.x = -1.1 - Math.sin(s) * 0.45
		r.legL.kn.rotation.x = 1.2 + Math.cos(s) * 0.4
		r.legR.kn.rotation.x = 1.2 - Math.cos(s) * 0.4
		r.armL.sh.rotation.x = -1.1
		r.armR.sh.rotation.x = -1.1
		r.armL.el.rotation.x = 0.1
		r.armR.el.rotation.x = 0.1
		r.neck.rotation.x = -0.3
	},
	sitstool(r, t) {
		r.hips.position.y = 0.02
		r.legL.hp.rotation.x = -1.4
		r.legR.hp.rotation.x = -1.4
		r.legL.kn.rotation.x = 1.2
		r.legR.kn.rotation.x = 1.2
		const k = (Math.sin(t * 1.2) + 1) / 2
		r.armR.sh.rotation.x = -0.6 - k * 0.9
		r.armR.el.rotation.x = -1.4
		r.armL.sh.rotation.x = -0.4
		r.armL.el.rotation.x = -0.8
	},
	stretch(r, t) {
		const k = (Math.sin(t * 1.3) + 1) / 2
		r.hips.position.y = 0.02
		r.legL.hp.rotation.x = -1.5
		r.legR.hp.rotation.x = -1.5
		r.legL.hp.rotation.z = -0.35
		r.legR.hp.rotation.z = 0.35
		r.torso.rotation.x = 0.25 + k * 0.8
		r.armL.sh.rotation.x = -1.2 - k * 0.6
		r.armR.sh.rotation.x = -1.2 - k * 0.6
	},
	row(r, t, st) {
		const u = 0.5 - 0.5 * Math.cos(t * 2.6)
		const L = clamp01(u * 1.5)
		const A = clamp01((u - 0.45) * 2.2)
		const lean = lerp(0.4, -0.3, clamp01(u * 1.3 - 0.15))
		const a = lerp(-2.3, -1.5, L)
		const kn = lerp(2.1, 0.05, L)
		;[r.legL, r.legR].forEach((l, i) => {
			l.hp.rotation.x = a
			l.kn.rotation.x = kn
			l.hp.rotation.z = i ? 0.12 : -0.12
		})
		const v = legVec(a, a + kn)
		r.hips.position.y = 0.1
		r.body.position.z = (st?.footZ ?? 0.6) - v.z
		r.torso.rotation.x = lean
		r.neck.rotation.x = -lean * 0.6
		for (const [m, s] of [
			[r.armL, -1],
			[r.armR, 1],
		] as const) {
			m.sh.rotation.x = lerp(-Math.PI / 2 - lean, 0.3, A)
			m.el.rotation.x = lerp(-0.05, -1.75, A)
			m.sh.rotation.z = s * 0.12
		}
	},
	climb(r, t) {
		const s = Math.sin(t * 4.2)
		const kL = clamp01(s)
		const kR = clamp01(-s)
		r.legL.hp.rotation.x = -0.25 - 0.75 * kL
		r.legL.kn.rotation.x = 0.3 + 0.9 * kL
		r.legR.hp.rotation.x = -0.25 - 0.75 * kR
		r.legR.kn.rotation.x = 0.3 + 0.9 * kR
		r.hips.position.y = -legVec(-0.25, 0.05).y + Math.abs(s) * 0.02
		r.torso.rotation.x = 0.15
		r.torso.rotation.y = s * 0.06
		r.armL.sh.rotation.x = -0.55
		r.armR.sh.rotation.x = -0.55
		r.armL.el.rotation.x = -0.7
		r.armR.el.rotation.x = -0.7
		r.armL.sh.rotation.z = -0.3
		r.armR.sh.rotation.z = 0.3
	},
	punch(r, t, st) {
		const w = t * 5.5 + (st?.sync ?? 0)
		const jL = Math.max(0, Math.sin(w)) ** 2
		const jR = Math.max(0, Math.sin(w - Math.PI)) ** 2
		r.legL.hp.rotation.x = -0.35
		r.legL.kn.rotation.x = 0.45
		r.legR.hp.rotation.x = 0.3
		r.legR.kn.rotation.x = 0.2
		r.legL.hp.rotation.z = -0.1
		r.legR.hp.rotation.z = 0.1
		r.hips.position.y = H0 - 0.04 + Math.abs(Math.sin(w * 0.5)) * 0.015
		r.torso.rotation.x = 0.12
		r.torso.rotation.y = (jL - jR) * 0.35
		r.neck.rotation.y = -(jL - jR) * 0.28
		for (const [a, j, s] of [
			[r.armL, jL, 1],
			[r.armR, jR, -1],
		] as const) {
			a.sh.rotation.x = lerp(-0.55, -1.6, j)
			a.el.rotation.x = lerp(-2.3, -0.08, j)
			a.sh.rotation.z = s * lerp(0.35, 0.12, j)
		}
		rigProp(r, "gloves", mkGloves)
		if (st) st.hit = Math.max(jL, jR)
	},
	mitts(r, t, st) {
		const w = t * 5.5 + (st?.sync ?? 0)
		const jL = Math.max(0, Math.sin(w)) ** 2
		const jR = Math.max(0, Math.sin(w - Math.PI)) ** 2
		r.legL.hp.rotation.x = -0.25
		r.legL.kn.rotation.x = 0.35
		r.legR.hp.rotation.x = 0.25
		r.legR.kn.rotation.x = 0.15
		r.hips.position.y = H0 - 0.03
		r.torso.rotation.x = 0.08
		for (const [a, j, s] of [
			[r.armL, jR, 1],
			[r.armR, jL, -1],
		] as const) {
			a.sh.rotation.x = -1.15 + j * 0.18
			a.el.rotation.x = -1.2 + j * 0.2
			a.sh.rotation.z = s * 0.3
		}
		rigProp(r, "mitts", mkMitts)
	},
	lie(r, t, st) {
		const H = H0
		const prone = !!st?.prone
		r.body.rotation.x = prone ? Math.PI / 2 : -Math.PI / 2
		r.body.position.set(0, 0.12, prone ? -H : H)
		r.hips.position.y = H + Math.sin(t * 1.5) * 0.004
		r.armL.sh.rotation.z = -0.14
		r.armR.sh.rotation.z = 0.14
		if (prone) {
			r.neck.rotation.y = 1.3
			r.armL.sh.rotation.z = -0.25
			r.armR.sh.rotation.z = 0.25
		} else {
			r.neck.rotation.y = Math.sin(t * 0.4) * 0.2
			if (st?.recline) {
				r.torso.rotation.x = st.recline
				r.neck.rotation.x = -st.recline * 0.4
				r.armL.sh.rotation.x = -0.25
				r.armR.sh.rotation.x = -0.25
				r.armL.el.rotation.x = -0.5
				r.legL.hp.rotation.x = -0.45
				r.legL.kn.rotation.x = 0.8
			}
			if (st?.legLift) {
				const k = (Math.sin(t * 1.4) + 1) / 2
				r.legR.hp.rotation.x = -0.15 - 1.0 * k
			}
		}
	},
	swim(r, t) {
		const H = H0
		const w = t * 3.2
		r.body.rotation.x = Math.PI / 2
		r.body.position.set(0, 0, -H)
		r.body.rotation.y = Math.sin(w) * 0.35
		r.neck.rotation.x = -0.3
		r.neck.rotation.y = Math.max(0, Math.sin(w)) * 0.6
		for (const [a, ph] of [
			[r.armL, 0],
			[r.armR, Math.PI],
		] as const) {
			const g = (w + ph) % (Math.PI * 2)
			a.sh.rotation.x = -Math.PI + g
			a.el.rotation.x = g > Math.PI ? -0.9 * Math.sin(g - Math.PI) : 0
		}
		const f = Math.sin(t * 9)
		r.legL.hp.rotation.x = f * 0.28
		r.legR.hp.rotation.x = -f * 0.28
		r.legL.kn.rotation.x = 0.15 + Math.max(0, f) * 0.3
		r.legR.kn.rotation.x = 0.15 + Math.max(0, -f) * 0.3
	},
	lift(r, t, st) {
		const k = ((1 - Math.cos(t * 1.9)) / 2) ** 1.2
		r.legL.hp.rotation.z = -0.12
		r.legR.hp.rotation.z = 0.12
		if (st?.lift === "squat") {
			plantLegs(r, -1.5 * k, 1.9 * k, 0)
			const lean = 0.5 * k
			r.torso.rotation.x = lean
			r.neck.rotation.x = -lean * 0.7
			r.armL.sh.rotation.z = -1.35
			r.armR.sh.rotation.z = 1.35
			r.armL.el.rotation.z = -1.7
			r.armR.el.rotation.z = 1.7
			r.armL.sh.rotation.x = 0.35
			r.armR.sh.rotation.x = 0.35
			const bar = st.bar
			if (bar?.parent) {
				r.root.updateMatrixWorld(true)
				const p = r.torso.localToWorld(_ha.set(0, 0.42, -0.1))
				bar.parent.worldToLocal(p)
				if (st.barAxis === "y") bar.position.y = p.y
				else bar.position.copy(p)
			}
		} else {
			plantLegs(r, -1.0 * k, 1.1 * k, 0)
			const lean = 0.8 * k
			r.torso.rotation.x = lean
			r.neck.rotation.x = -lean * 0.6
			r.armL.sh.rotation.x = -lean
			r.armR.sh.rotation.x = -lean
			r.armL.sh.rotation.z = -0.1
			r.armR.sh.rotation.z = 0.1
			if (st?.bar) followHands(r, st.bar)
		}
	},
	seated(r, t, st) {
		r.hips.position.y = H0 - 0.1
		;[r.legL, r.legR].forEach((l, i) => {
			l.hp.rotation.x = -1.25
			l.kn.rotation.x = 1.25
			l.hp.rotation.z = i ? 0.08 : -0.08
		})
		if (st?.work) {
			const k = Math.sin(t * 6)
			r.armL.sh.rotation.x = -0.85 + k * 0.05
			r.armR.sh.rotation.x = -0.85 - k * 0.05
			r.armL.el.rotation.x = -0.55
			r.armR.el.rotation.x = -0.55
			r.neck.rotation.x = 0.12
		} else {
			r.armL.sh.rotation.x = -0.45
			r.armR.sh.rotation.x = -0.45
			r.armL.el.rotation.x = -0.35
			r.armR.el.rotation.x = -0.35
			r.torso.rotation.x = -0.05 + Math.sin(t * 1.3) * 0.02
			if (st?.talk) {
				r.armR.sh.rotation.x = -0.75 + Math.sin(t * 2.3) * 0.25
				r.armR.el.rotation.x = -1.0
			}
		}
		r.neck.rotation.y = Math.sin(t * 0.6) * 0.3
	},
	coach(r, t, st) {
		r.armR.sh.rotation.x = -0.55
		r.armR.el.rotation.x = -1.25
		r.armR.sh.rotation.z = -0.15
		r.armL.sh.rotation.x = -0.5 + Math.sin(t * 2) * 0.35
		r.armL.el.rotation.x = -0.5
		r.armL.sh.rotation.z = -0.15
		r.neck.rotation.y = Math.sin(t * 0.7) * 0.4
		r.hips.position.y = H0 + Math.sin(t * 2) * 0.005
		const pr = st?.prop ?? "board"
		if (pr !== "none")
			rigProp(r, `clip_${pr}`, mkClip(pr === "tablet" ? "#2c2f36" : "#c98b56"))
	},
	flex(r, t) {
		const k = (Math.sin(t * 2) + 1) / 2
		r.armL.sh.rotation.z = -1.45
		r.armR.sh.rotation.z = 1.45
		r.armL.sh.rotation.x = -0.2
		r.armR.sh.rotation.x = -0.2
		r.armL.el.rotation.z = -(1.3 + 0.5 * k)
		r.armR.el.rotation.z = 1.3 + 0.5 * k
		r.legL.hp.rotation.z = -0.15
		r.legR.hp.rotation.z = 0.15
		r.hips.position.y = H0 - 0.01
		r.torso.rotation.y = Math.sin(t * 0.8) * 0.25
		r.neck.rotation.x = -0.1
	},
	fly(r, t) {
		const k = (1 - Math.cos(t * 2.2)) / 2
		r.legL.hp.rotation.x = -0.3
		r.legL.kn.rotation.x = 0.3
		r.legR.hp.rotation.x = 0.2
		r.legR.kn.rotation.x = 0.05
		r.hips.position.y = H0 - 0.02
		r.torso.rotation.x = 0.18
		r.armL.sh.rotation.x = lerp(-1.0, -1.25, k)
		r.armR.sh.rotation.x = lerp(-1.0, -1.25, k)
		r.armL.sh.rotation.z = lerp(-1.25, 0.3, k)
		r.armR.sh.rotation.z = lerp(1.25, -0.3, k)
		r.armL.el.rotation.x = -0.3
		r.armR.el.rotation.x = -0.3
	},
	lunge(r, t, st) {
		const k = (1 - Math.cos(t * 1.8)) / 2
		const a = -0.75 - 0.45 * k
		const kn = 0.7 + 0.75 * k
		r.legL.hp.rotation.x = a
		r.legL.kn.rotation.x = kn
		const v = legVec(a, a + kn)
		r.hips.position.y = -v.y
		r.body.position.z = (st?.frontZ ?? 0.35) - v.z
		r.legR.hp.rotation.x = 0.35 + 0.05 * k
		r.legR.kn.rotation.x = 0.3 + 0.4 * k
		r.torso.rotation.x = 0.15
		r.armL.sh.rotation.x = -1.0
		r.armR.sh.rotation.x = -1.0
		r.armL.el.rotation.x = -0.25
		r.armR.el.rotation.x = -0.25
		r.armL.sh.rotation.z = -0.12
		r.armR.sh.rotation.z = 0.12
	},
}

export function poseOf(st: Station): PoseName {
	if (st.pose) return st.pose
	if (st.type === "sit") return st.stand ? "stand_work" : "sit"
	if (st.type === "staff") return "stand_work"
	return st.type ?? "idle"
}
