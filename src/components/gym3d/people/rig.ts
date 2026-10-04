// The rounded, toon-shaded people from the prototype: a joint rig, faces,
// hair, graphic tees / tattoos / accessories, and "baking" (every untextured
// mesh of a person merged into one rigidly-skinned mesh + one outline mesh).
import * as T from "three"
import {
	capsuleGeo,
	DISPLAY_FONT,
	eqGeo,
	fitText,
	heart,
	isLight,
	latheGeo,
	mergeParts,
	type Part,
	shade,
	sphGeo,
	star,
	TM,
} from "../engine/helpers"
import { ctx } from "../world/state"
import type { Build, Outfit, TatKind, TeeKind } from "./outfits"

export type Arm = { sh: T.Bone; el: T.Bone; hand: T.Bone }
export type Leg = { hp: T.Bone; kn: T.Bone }

export type Rig = {
	root: T.Group
	body: T.Bone
	hips: T.Bone
	torso: T.Bone
	neck: T.Bone
	hairG: T.Bone
	faceG: T.Bone
	armL: Arm
	armR: Arm
	legL: Leg
	legR: Leg
	headY: number
	torsoMesh: T.Mesh
	torsoProf: [number, number][]
	torsoKey: string
	up: T.Mesh[]
	lo: T.Mesh[]
	shin: T.Mesh[]
	extras: T.Object3D[]
	props: Record<string, T.Object3D[]>
	dbs?: T.Object3D[]
	out: Outfit
	/** Geometries owned by this rig (freed by disposeRig). */
	baked: T.BufferGeometry[]
	skinMesh?: T.SkinnedMesh
}

type Role =
	| "top"
	| "bottom"
	| "skin"
	| "sleeve"
	| "shin"
	| "shoes"
	| "hair"
	| "band"
	| "glove"
	| "hat"

/** Hip height at rest. */
export const H0 = 0.46

function joint(x: number, y: number, z: number, parent: T.Object3D): T.Bone {
	const b = new T.Bone()
	b.position.set(x, y, z)
	parent.add(b)
	return b
}

/** A toon mesh with an inverted-hull outline child. */
export function tmesh(
	geo: T.BufferGeometry,
	role: Role,
	color: string,
	parent: T.Object3D,
	x = 0,
	y = 0,
	z = 0,
	noOutline = false,
): T.Mesh {
	const m = new T.Mesh(geo, TM(color))
	m.position.set(x, y, z)
	m.castShadow = false
	m.receiveShadow = false
	m.userData.role = role
	parent.add(m)
	if (!noOutline) {
		const o = new T.Mesh(geo, ctx().assets.OUTLINE)
		o.userData.isOutline = true
		m.add(o)
	}
	return m
}

const BUILD: Record<
	Build,
	{ sh: number; arm: number; chest: number; waist: number }
> = {
	avg: { sh: 1, arm: 1, chest: 1, waist: 1 },
	fit: { sh: 1.08, arm: 1.08, chest: 1.05, waist: 0.92 },
	strong: { sh: 1.2, arm: 1.3, chest: 1.18, waist: 1.02 },
	soft: { sh: 1, arm: 1.08, chest: 1.12, waist: 1.2 },
}

function buildRound(out: Outfit): Rig {
	const root = new T.Group()
	ctx().scene.add(root)
	const body = joint(0, 0, 0, root)
	const hips = joint(0, 0.5, 0, body)
	const torso = joint(0, 0, 0, hips)
	const neck = joint(0, 0.46, 0, torso)
	const hairG = joint(0, 0, 0, neck)
	const faceG = joint(0, 0, 0, neck)
	const b = BUILD[out.build]
	const tw = 0.13 * b.waist
	const tc = 0.165 * b.chest
	const shX = tc * b.sh + 0.03
	const arm = (s: number): Arm => {
		const sh = joint(s * shX, 0.36, 0, torso)
		const el = joint(0, -0.17, 0, sh)
		const hand = joint(0, -0.21, 0, el)
		return { sh, el, hand }
	}
	const leg = (s: number): Leg => {
		const hp = joint(s * 0.075, 0, 0, hips)
		const kn = joint(0, -0.22, 0, hp)
		return { hp, kn }
	}
	const armL = arm(-1)
	const armR = arm(1)
	const legL = leg(-1)
	const legR = leg(1)
	hips.position.y = H0
	const prof: [number, number][] = [
		[0.001, -0.02],
		[tw * 0.95, -0.02],
		[tw * 1.02, 0.05],
		[tw, 0.12],
		[tc * 0.92, 0.24],
		[tc, 0.3],
		[tc * 0.9, 0.37],
		[tc * 0.55, 0.41],
		[0.001, 0.42],
	]
	const torsoKey = `${tw}_${tc}`
	const torsoMesh = tmesh(
		latheGeo(`torso${torsoKey}`, prof),
		"top",
		"#fff",
		torso,
	)
	torsoMesh.scale.set(1, 1, 0.72)
	const pel = tmesh(
		latheGeo(`pel${tw}`, [
			[0.001, -0.1],
			[tw * 0.7, -0.1],
			[tw * 1.02, -0.05],
			[tw * 1.05, 0.0],
			[tw * 1.0, 0.03],
			[0.001, 0.03],
		]),
		"bottom",
		"#fff",
		torso,
	)
	pel.scale.set(1.05, 1, 0.78)
	neck.position.y = 0.4
	tmesh(capsuleGeo(0.045, 0.04), "skin", "#fff", neck, 0, 0.03, 0, true)
	// head: slightly squashed sphere with ears
	const head = tmesh(
		sphGeo(0.165, 16, 12),
		"skin",
		"#fff",
		neck,
		0,
		0.19,
		0.005,
	)
	head.scale.set(1, 0.96, 0.94)
	for (const s of [-1, 1]) {
		const e = tmesh(
			sphGeo(0.04, 10, 8),
			"skin",
			"#fff",
			neck,
			s * 0.162,
			0.18,
			-0.005,
			true,
		)
		e.scale.set(0.6, 1, 0.8)
	}
	const up: T.Mesh[] = []
	const lo: T.Mesh[] = []
	const shin: T.Mesh[] = []
	// arms: capsule upper (sleeve), capsule forearm, sphere hand
	for (const a of [armL, armR]) {
		const u = tmesh(
			capsuleGeo(0.045 * b.arm, 0.1),
			"sleeve",
			"#fff",
			a.sh,
			0,
			-0.085,
			0,
		)
		const l = tmesh(
			capsuleGeo(0.038 * b.arm, 0.11),
			"skin",
			"#fff",
			a.el,
			0,
			-0.1,
			0,
		)
		u.userData.rad = 0.045 * b.arm
		l.userData.rad = 0.038 * b.arm
		up.push(u)
		lo.push(l)
		tmesh(
			sphGeo(0.045 * Math.min(1.15, b.arm), 10, 8),
			"skin",
			"#fff",
			a.hand,
			0,
			0.01,
			0,
		)
	}
	// shoulder caps so sleeves read as a shirt
	for (const s of [-1, 1])
		tmesh(
			sphGeo(0.058 * b.sh, 12, 10),
			"sleeve",
			"#fff",
			torso,
			s * (tc * b.sh + 0.015),
			0.355,
			0,
			true,
		)
	// legs: capsule thigh, capsule shin, rounded shoe
	for (const l of [legL, legR]) {
		tmesh(capsuleGeo(0.058, 0.13), "bottom", "#fff", l.hp, 0, -0.11, 0)
		const sn = tmesh(capsuleGeo(0.048, 0.13), "shin", "#fff", l.kn, 0, -0.1, 0)
		sn.userData.rad = 0.048
		shin.push(sn)
		const sh = tmesh(
			sphGeo(0.07, 12, 10),
			"shoes",
			"#fff",
			l.kn,
			0,
			-0.2,
			0.035,
		)
		sh.scale.set(0.85, 0.55, 1.35)
	}
	return {
		root,
		body,
		hips,
		torso,
		neck,
		hairG,
		faceG,
		armL,
		armR,
		legL,
		legR,
		headY: 0.19,
		torsoMesh,
		torsoProf: prof,
		torsoKey,
		up,
		lo,
		shin,
		extras: [],
		props: {},
		out,
		baked: [],
	}
}

function clear(g: T.Object3D): void {
	while (g.children.length) g.remove(g.children[0])
}

function roundFace(g: T.Object3D, out: Outfit): void {
	clear(g)
	const a = ctx().assets
	const y = 0.19
	const z = 0.152
	const eyeC = "#2a1c18"
	const add = (m: T.Mesh) => {
		g.add(m)
		return m
	}
	for (const s of [-1, 1]) {
		const e = add(new T.Mesh(sphGeo(0.026, 10, 8), a.BM(eyeC)))
		e.position.set(s * 0.058, y + 0.005, z - 0.004)
		e.scale.set(0.9, 1.25, 0.5)
		const hl = add(new T.Mesh(sphGeo(0.008, 6, 5), a.BM("#ffffff")))
		hl.position.set(s * 0.058 + 0.008, y + 0.017, z + 0.006)
		const brow = add(
			new T.Mesh(
				eqGeo("brow", () => new T.BoxGeometry(0.05, 0.012, 0.012)),
				a.BM(out.hair === "#d8d8d8" ? "#8a8a8a" : out.hair),
			),
		)
		brow.position.set(s * 0.06, y + 0.058, z - 0.008)
		brow.rotation.z = -s * 0.12
		if (out.lashes) {
			const l = add(
				new T.Mesh(
					eqGeo("lash", () => new T.BoxGeometry(0.02, 0.008, 0.008)),
					a.BM(eyeC),
				),
			)
			l.position.set(s * 0.078, y + 0.03, z - 0.006)
			l.rotation.z = s * 0.5
		}
		const ck = add(new T.Mesh(sphGeo(0.022, 8, 6), a.BM("#f08a7a", 0.55)))
		ck.position.set(s * 0.092, y - 0.035, z - 0.02)
		ck.scale.set(1, 0.6, 0.3)
	}
	if (out.freckles)
		for (const s of [-1, 1])
			for (const [dx, dy] of [
				[0.075, -0.012],
				[0.095, -0.02],
				[0.083, -0.028],
			]) {
				const f = add(
					new T.Mesh(sphGeo(0.0055, 5, 4), a.BM(shade(out.skin, -0.28))),
				)
				f.position.set(s * dx, y + dy, z - 0.008)
			}
	const mouth = add(
		new T.Mesh(
			eqGeo("mouth", () => new T.TorusGeometry(0.026, 0.006, 6, 12, Math.PI)),
			a.BM("#7a2e28"),
		),
	)
	mouth.position.set(0, y - 0.052, z - 0.006)
	mouth.rotation.z = Math.PI
	const nose = add(new T.Mesh(sphGeo(0.016, 8, 6), TM(shade(out.skin, -0.08))))
	nose.position.set(0, y - 0.012, z + 0.004)
	if (out.beard) {
		const bd = add(
			new T.Mesh(
				sphGeo(0.15, 16, 10, Math.PI * 0.55, Math.PI * 0.45),
				TM(out.hair),
			),
		)
		bd.position.set(0, y + 0.005, 0.012)
		bd.scale.set(1.04, 1.02, 0.98)
		mouth.position.z += 0.012
	}
}

function roundHair(g: T.Object3D, out: Outfit): void {
	const h = out.hair
	const st = out.style
	const y = 0.19
	const cap = (
		cover: number,
		sx: number,
		sy: number,
		sz: number,
		dy: number,
		col?: string,
	) => {
		const m = tmesh(
			sphGeo(0.178, 16, 10, 0, Math.PI * cover),
			"hair",
			col ?? h,
			g,
			0,
			y + dy,
			-0.008,
		)
		m.scale.set(sx, sy, sz)
		return m
	}
	if (st === "buzz") cap(0.42, 1, 0.98, 1, 0.004)
	if (
		st === "short" ||
		st === "long" ||
		st === "bun" ||
		st === "pony" ||
		st === "curly" ||
		st === "buns"
	) {
		cap(0.5, 1.02, 1.02, 1.02, 0.006)
		// fringe
		const f = tmesh(capsuleGeo(0.035, 0.2), "hair", h, g, 0, y + 0.115, 0.12)
		f.rotation.z = Math.PI / 2
		f.scale.set(1, 1, 0.7)
		// back of head
		const bk = tmesh(
			sphGeo(0.17, 16, 12, 0, Math.PI * 0.75),
			"hair",
			h,
			g,
			0,
			y + 0.005,
			-0.035,
		)
		bk.scale.set(1.02, 1, 0.95)
	}
	if (st === "curly") {
		for (let i = 0; i < 9; i++) {
			const a = (i / 9) * Math.PI * 2
			tmesh(
				sphGeo(0.055, 10, 8),
				"hair",
				h,
				g,
				Math.cos(a) * 0.13,
				y + 0.1 + Math.sin(i * 1.7) * 0.02,
				Math.sin(a) * 0.11 - 0.02,
				true,
			)
		}
		tmesh(sphGeo(0.08, 12, 10), "hair", h, g, 0, y + 0.17, -0.02, true)
	}
	if (st === "long") {
		const l = tmesh(capsuleGeo(0.11, 0.14), "hair", h, g, 0, y - 0.1, -0.07)
		l.scale.set(1.45, 1, 0.55)
		for (const s of [-1, 1]) {
			const sd = tmesh(
				capsuleGeo(0.04, 0.14),
				"hair",
				h,
				g,
				s * 0.15,
				y - 0.04,
				0.0,
			)
			sd.scale.set(1, 1, 1.2)
		}
	}
	if (st === "bun")
		tmesh(sphGeo(0.075, 12, 10), "hair", h, g, 0, y + 0.19, -0.07)
	if (st === "buns")
		for (const s of [-1, 1]) {
			tmesh(sphGeo(0.072, 12, 10), "hair", h, g, s * 0.12, y + 0.16, -0.03)
			// a scrunchie under each bun
			const sc = tmesh(
				eqGeo("scrunchie", () => new T.TorusGeometry(0.05, 0.016, 6, 14)),
				"band",
				out.band ?? "#f2c14a",
				g,
				s * 0.105,
				y + 0.125,
				-0.025,
				true,
			)
			sc.rotation.set(Math.PI / 2 - 0.2, 0, s * 0.55)
		}
	if (st === "pony") {
		tmesh(
			sphGeo(0.035, 8, 6),
			"band",
			out.band ?? "#e8743b",
			g,
			0,
			y + 0.08,
			-0.175,
			true,
		)
		const p = tmesh(capsuleGeo(0.045, 0.14), "hair", h, g, 0, y - 0.02, -0.2)
		p.rotation.x = 0.35
	}
	if (st === "cap") {
		const c = out.band ?? "#d4463a"
		cap(0.5, 1.06, 1.0, 1.06, 0.012, c)
		const brim = tmesh(
			eqGeo(
				"capbrim",
				() =>
					new T.CylinderGeometry(
						0.13,
						0.13,
						0.018,
						16,
						1,
						false,
						-Math.PI / 2,
						Math.PI,
					),
			),
			"band",
			c,
			g,
			0,
			y + 0.085,
			0.1,
		)
		brim.scale.set(1, 1, 1.1)
	}
	if (
		out.band &&
		st !== "cap" &&
		st !== "bald" &&
		st !== "pony" &&
		st !== "buns"
	) {
		const b = tmesh(
			eqGeo("headband", () => new T.TorusGeometry(0.168, 0.017, 6, 24)),
			"band",
			out.band,
			g,
			0,
			y + 0.08,
			-0.005,
			true,
		)
		b.rotation.x = Math.PI / 2
	}
}

// ── graphic tees, tattoos and accessories ───────────────────────────────────

function decalTex(
	key: string,
	size: number,
	draw: (x: CanvasRenderingContext2D, s: number) => void,
): T.Texture {
	return ctx().assets.tex(key, () => {
		const c = document.createElement("canvas")
		c.width = size
		c.height = size
		const x = c.getContext("2d")
		if (x) {
			x.lineCap = "round"
			x.lineJoin = "round"
			draw(x, size)
		}
		const t = new T.CanvasTexture(c)
		t.anisotropy = 4
		return t
	})
}

function decalMat(key: string, tex: T.Texture): T.Material {
	const a = ctx().assets
	return a.mat(
		`decal_${key}`,
		() =>
			new T.MeshToonMaterial({
				map: tex,
				gradientMap: a.grad,
				transparent: true,
				alphaTest: 0.35,
				polygonOffset: true,
				polygonOffsetFactor: -4,
				polygonOffsetUnits: -4,
			}),
	)
}

function teeTex(kind: TeeKind, top: string): { key: string; tex: T.Texture } {
	const ink = isLight(top) ? "#2a2230" : "#fff6e8"
	const key = `tee_${kind}${ink}`
	const tex = decalTex(key, 256, (x, S) => {
		const c = S / 2
		if (kind !== "stripes") {
			x.translate(c, c)
			x.scale(1.22, 1.22)
			x.translate(-c, -c)
		}
		x.fillStyle = ink
		x.strokeStyle = ink
		x.textAlign = "center"
		x.textBaseline = "middle"
		if (kind === "bolt") {
			x.fillStyle = "#f2c14a"
			x.beginPath()
			for (const p of [
				[150, 40],
				[92, 138],
				[128, 138],
				[104, 216],
				[170, 110],
				[134, 110],
				[160, 40],
			])
				x.lineTo(p[0], p[1])
			x.closePath()
			x.fill()
			x.lineWidth = 7
			x.stroke()
		}
		if (kind === "heart") {
			heart(x, c, c + 4, 52)
			x.fillStyle = "#e0524a"
			x.fill()
			x.lineWidth = 7
			x.stroke()
			x.fillStyle = "rgba(255,255,255,.7)"
			x.beginPath()
			x.ellipse(c - 38, c - 24, 10, 6, -0.6, 0, 7)
			x.fill()
		}
		if (kind === "swole") {
			fitText(x, "SWOLE", 190, "900", `Impact, ${DISPLAY_FONT}`)
			x.fillText("SWOLE", c, c - 8)
			x.fillRect(46, c + 36, 164, 8)
		}
		if (kind === "lift") {
			fitText(x, "LIFT", 150, "900", DISPLAY_FONT)
			x.fillText("LIFT", c, c - 30)
			x.lineWidth = 10
			x.beginPath()
			x.moveTo(50, c + 44)
			x.lineTo(206, c + 44)
			x.stroke()
			;[62, 80, 176, 194].forEach((px, i) => {
				const h = i % 3 ? 34 : 50
				x.fillRect(px - 7, c + 44 - h / 2, 14, h)
			})
		}
		if (kind === "smile") {
			x.fillStyle = "#f2c14a"
			x.beginPath()
			x.arc(c, c, 72, 0, 7)
			x.fill()
			x.lineWidth = 8
			x.strokeStyle = "#2a2230"
			x.stroke()
			x.fillStyle = "#2a2230"
			x.fillRect(c - 30, c - 30, 14, 26)
			x.fillRect(c + 16, c - 30, 14, 26)
			x.beginPath()
			x.arc(c, c + 6, 40, 0.2, Math.PI - 0.2)
			x.stroke()
		}
		if (kind === "sunset") {
			x.save()
			x.beginPath()
			x.arc(c, c, 76, 0, 7)
			x.clip()
			;["#f2c14a", "#f0983c", "#e8604a", "#c8407a"].forEach((col, i) => {
				x.fillStyle = col
				x.fillRect(0, c - 76 + i * 38, S, i < 2 ? 38 : 26)
			})
			x.restore()
			x.fillStyle = ink
			x.fillRect(0, c + 44, S, 9)
			x.fillRect(0, c + 62, S, 6)
		}
		if (kind === "stripes") {
			x.fillStyle = ink
			x.fillRect(0, 86, S, 26)
			x.fillStyle = "#e8604a"
			x.fillRect(0, 124, S, 18)
			x.fillStyle = ink
			x.fillRect(0, 154, S, 10)
		}
		if (kind === "avo") {
			x.save()
			x.translate(c, c + 6)
			x.rotate(-0.3)
			x.fillStyle = "#4f7a2c"
			x.beginPath()
			x.ellipse(0, 0, 58, 78, 0, 0, 7)
			x.fill()
			x.fillStyle = "#d8e68a"
			x.beginPath()
			x.ellipse(0, 6, 44, 62, 0, 0, 7)
			x.fill()
			x.fillStyle = "#8a5a30"
			x.beginPath()
			x.arc(0, 20, 24, 0, 7)
			x.fill()
			x.fillStyle = "#2a2230"
			x.fillRect(-18, -22, 8, 10)
			x.fillRect(10, -22, 8, 10)
			x.lineWidth = 5
			x.strokeStyle = "#2a2230"
			x.beginPath()
			x.arc(0, -10, 9, 0.3, Math.PI - 0.3)
			x.stroke()
			x.restore()
		}
		if (kind === "num") {
			fitText(x, "07", 150, "900", DISPLAY_FONT)
			x.lineWidth = 12
			x.strokeStyle = "#e8604a"
			x.strokeText("07", c, c + 8)
			x.fillText("07", c, c + 8)
		}
		if (kind === "staff") {
			// the gym's logo (a little dumbbell in a ring) over STAFF
			x.lineWidth = 9
			x.beginPath()
			x.arc(c, c - 34, 34, 0, 7)
			x.stroke()
			x.fillRect(c - 20, c - 38, 40, 8)
			x.fillRect(c - 26, c - 48, 9, 28)
			x.fillRect(c + 17, c - 48, 9, 28)
			fitText(x, "STAFF", 170, "900", DISPLAY_FONT)
			x.fillText("STAFF", c, c + 44)
		}
		if (kind === "titan") {
			x.fillStyle = "#f2c14a"
			star(x, c, c - 30, 40, 17)
			x.fill()
			x.lineWidth = 6
			x.strokeStyle = ink
			x.stroke()
			x.fillStyle = ink
			fitText(x, "TITAN", 190, "900", `Impact, ${DISPLAY_FONT}`)
			x.fillText("TITAN", c, c + 40)
		}
		if (kind === "sparks") {
			for (const [sx, sy, r] of [
				[c - 44, c - 40, 26],
				[c + 30, c - 50, 18],
				[c + 50, c - 8, 12],
			]) {
				x.fillStyle = "#fff1b8"
				star(x, sx, sy, r, r * 0.4)
				x.fill()
				x.lineWidth = 4
				x.strokeStyle = ink
				x.stroke()
			}
			x.fillStyle = ink
			fitText(x, "SPARKS", 190, "900", DISPLAY_FONT)
			x.fillText("SPARKS", c, c + 42)
		}
		if (kind === "gymrat") {
			fitText(x, "GYM RAT", 200, "900", DISPLAY_FONT)
			x.fillText("GYM RAT", c, c + 50)
			x.fillStyle = "#b8b8c4"
			x.beginPath()
			x.ellipse(c, c - 24, 40, 28, 0, 0, 7)
			x.fill()
			x.beginPath()
			x.arc(c - 30, c - 50, 16, 0, 7)
			x.arc(c + 30, c - 50, 16, 0, 7)
			x.fill()
			x.fillStyle = "#2a2230"
			x.fillRect(c - 18, c - 32, 8, 9)
			x.fillRect(c + 10, c - 32, 8, 9)
			x.fillStyle = "#e0808a"
			x.beginPath()
			x.arc(c, c - 14, 6, 0, 7)
			x.fill()
		}
	})
	return { key, tex }
}

function tatTex(kind: TatKind): { key: string; tex: T.Texture } {
	const ink = "#1f2a44"
	const key = `tat_${kind}`
	const tex = decalTex(key, 128, (x, S) => {
		const c = S / 2
		x.strokeStyle = ink
		x.fillStyle = ink
		x.lineWidth = 5
		if (kind === "band") {
			x.fillRect(0, 40, S, 7)
			x.fillRect(0, 82, S, 7)
			x.beginPath()
			for (let i = 0; i <= 16; i++) x.lineTo(i * 8, i % 2 ? 52 : 76)
			x.stroke()
		}
		if (kind === "star") {
			star(x, c, c, 40, 17)
			x.lineWidth = 6
			x.stroke()
			x.fillStyle = "#c8423a"
			star(x, c, c, 26, 11)
			x.fill()
		}
		if (kind === "heart") {
			heart(x, c, c, 26)
			x.fillStyle = "#c8423a"
			x.fill()
			x.lineWidth = 6
			x.stroke()
			x.fillStyle = ink
			x.fillRect(18, c - 6, 92, 14)
			x.fillStyle = "#f2e6c8"
			x.fillRect(22, c - 3, 84, 8)
		}
		if (kind === "rose") {
			x.fillStyle = "#3f8a4a"
			for (const s of [-1, 1]) {
				x.beginPath()
				x.ellipse(c + s * 26, c + 26, 20, 9, s * 0.5, 0, 7)
				x.fill()
				x.stroke()
			}
			x.fillStyle = "#c8423a"
			x.beginPath()
			x.arc(c, c - 6, 28, 0, 7)
			x.fill()
			x.stroke()
			x.beginPath()
			x.arc(c, c - 6, 14, 0.5, 5.5)
			x.stroke()
		}
		if (kind === "anchor") {
			x.lineWidth = 7
			x.beginPath()
			x.arc(c, 26, 10, 0, 7)
			x.moveTo(c, 36)
			x.lineTo(c, 104)
			x.moveTo(c - 22, 52)
			x.lineTo(c + 22, 52)
			x.moveTo(c - 32, 82)
			x.quadraticCurveTo(c - 24, 108, c, 106)
			x.quadraticCurveTo(c + 24, 108, c + 32, 82)
			x.stroke()
		}
		if (kind === "script") {
			x.font = "italic 700 40px Georgia, serif"
			x.textAlign = "center"
			x.textBaseline = "middle"
			x.fillText("Lift", c, c)
			x.lineWidth = 3
			x.beginPath()
			x.moveTo(20, c + 26)
			x.quadraticCurveTo(c, c + 40, 108, c + 22)
			x.stroke()
		}
		if (kind === "sleeve") {
			x.lineWidth = 4
			for (let r = 0; r < 4; r++)
				for (let i = 0; i < 5; i++) {
					const px = i * 32 + (r % 2) * 16
					const py = 12 + r * 34
					x.beginPath()
					x.arc(px, py, 12, 0, 7)
					x.stroke()
					x.beginPath()
					x.arc(px, py, 4, 0, 7)
					x.fill()
				}
			x.beginPath()
			for (let i = 0; i <= 16; i++) x.lineTo(i * 8, 62 + Math.sin(i) * 8)
			x.stroke()
		}
	})
	return { key, tex }
}

export function profR(
	prof: readonly (readonly [number, number])[],
	y: number,
): number {
	for (let i = 1; i < prof.length; i++) {
		const [a, ya] = prof[i - 1]
		const [b, yb] = prof[i]
		if (y >= ya && y <= yb) return a + ((b - a) * (y - ya)) / (yb - ya || 1)
	}
	return prof[prof.length - 1][0]
}

function chestPatch(r: Rig): T.BufferGeometry {
	return eqGeo(`chest${r.torsoKey}`, () => {
		const pts: T.Vector2[] = []
		for (let i = 0; i <= 8; i++) {
			const y = 0.13 + (i / 8) * 0.23
			pts.push(new T.Vector2(profR(r.torsoProf, y) + 0.006, y))
		}
		return new T.LatheGeometry(pts, 12, -0.85, 1.7)
	})
}

function dress(r: Rig, out: Outfit): void {
	for (const m of r.extras) m.removeFromParent()
	r.extras = []
	const keep = <X extends T.Object3D>(m: X): X => {
		r.extras.push(m)
		return m
	}
	if (out.tee) {
		const t = teeTex(out.tee, out.top)
		const m = new T.Mesh(chestPatch(r), decalMat(t.key, t.tex))
		m.castShadow = false
		r.torsoMesh.add(keep(m))
	}
	for (const t of out.tats) {
		const side = t.w.endsWith("L") ? -1 : 1
		const part = t.w.startsWith("arm")
			? "lo"
			: t.w.startsWith("up")
				? "up"
				: "shin"
		if (part === "up" && out.sleeves) continue
		if (part === "shin" && !out.shorts) continue
		const host = r[part][side < 0 ? 0 : 1]
		const rad = (host.userData.rad as number) * 1.06
		const h = part === "shin" ? 0.11 : 0.1
		const full = t.k === "band" || t.k === "sleeve"
		const g = eqGeo(`tatg_${rad}_${h}_${full}_${side}`, () =>
			full
				? new T.CylinderGeometry(rad, rad, h, 16, 1, true)
				: new T.CylinderGeometry(
						rad,
						rad,
						h,
						10,
						1,
						true,
						side * Math.PI * 0.3 - 0.9,
						1.8,
					),
		)
		const tt = tatTex(t.k)
		const m = new T.Mesh(g, decalMat(tt.key, tt.tex))
		m.position.y = part === "shin" ? -0.01 : 0.005
		host.add(keep(m))
	}
	const acc = out.acc
	const y = r.headY
	const a = ctx().assets
	if (acc.includes("glasses") || acc.includes("shades")) {
		const fr = TM(acc.includes("shades") ? "#1d2230" : "#3a2622")
		for (const s of [-1, 1]) {
			const ring = new T.Mesh(
				eqGeo("glassring", () => new T.TorusGeometry(0.036, 0.0065, 6, 16)),
				fr,
			)
			ring.position.set(s * 0.058, y + 0.006, 0.168)
			r.faceG.add(keep(ring))
			if (acc.includes("shades")) {
				const d = new T.Mesh(
					eqGeo("shadelens", () => new T.CircleGeometry(0.034, 16)),
					a.BM("#223044"),
				)
				d.position.set(s * 0.058, y + 0.006, 0.166)
				r.faceG.add(keep(d))
			}
			const arm = new T.Mesh(
				eqGeo("glassarm", () => new T.BoxGeometry(0.008, 0.008, 0.12)),
				fr,
			)
			arm.position.set(s * 0.158, y + 0.012, 0.1)
			r.faceG.add(keep(arm))
		}
		const br = new T.Mesh(
			eqGeo("glassbridge", () => new T.BoxGeometry(0.046, 0.008, 0.008)),
			fr,
		)
		br.position.set(0, y + 0.012, 0.17)
		r.faceG.add(keep(br))
	}
	if (acc.includes("headphones")) {
		const c = out.band ?? "#e8604a"
		const band = new T.Mesh(
			eqGeo(
				"phoneband",
				() => new T.TorusGeometry(0.19, 0.016, 6, 20, Math.PI),
			),
			TM("#2c2f36"),
		)
		band.position.set(0, y + 0.01, -0.01)
		r.hairG.add(keep(band))
		for (const s of [-1, 1]) {
			const cup = new T.Mesh(
				eqGeo("phonecup", () => new T.CylinderGeometry(0.058, 0.058, 0.05, 14)),
				TM(c),
			)
			cup.rotation.z = Math.PI / 2
			cup.position.set(s * 0.19, y, -0.005)
			r.hairG.add(keep(cup))
		}
	}
	if (acc.includes("wristband")) {
		r.lo.forEach((lo, i) => {
			if (i === 0) return
			const rad = (lo.userData.rad as number) * 1.08
			const w = new T.Mesh(
				eqGeo(`wrist${rad}`, () => new T.TorusGeometry(rad, 0.016, 6, 14)),
				TM(out.band ?? "#3aa89a"),
			)
			w.rotation.x = Math.PI / 2
			w.position.y = -0.07
			lo.add(keep(w))
		})
	}
	if (acc.includes("socks") && out.shorts) {
		for (const sh of r.shin) {
			const s = new T.Mesh(
				eqGeo(
					"sock",
					() => new T.CylinderGeometry(0.052, 0.05, 0.07, 12, 1, true),
				),
				TM("#ffffff"),
			)
			s.position.y = -0.07
			sh.add(keep(s))
			const st = new T.Mesh(
				eqGeo(
					"sockstripe",
					() => new T.CylinderGeometry(0.0525, 0.0525, 0.012, 12, 1, true),
				),
				TM(out.band ?? "#e8604a"),
			)
			st.position.y = -0.045
			sh.add(keep(st))
		}
	}
	if (acc.includes("earrings"))
		for (const s of [-1, 1]) {
			const e = new T.Mesh(
				sphGeo(0.018, 8, 6),
				a.mat(
					"chain",
					() =>
						new T.MeshStandardMaterial({
							color: "#e8c05a",
							metalness: 0.6,
							roughness: 0.3,
						}),
				),
			)
			e.position.set(s * 0.162, y - 0.035, 0)
			r.neck.add(keep(e))
		}
	if (acc.includes("headset")) {
		const band = new T.Mesh(
			eqGeo(
				"headsetband",
				() => new T.TorusGeometry(0.182, 0.009, 5, 18, Math.PI),
			),
			TM("#2c2f36"),
		)
		band.position.set(0, y + 0.01, 0.01)
		r.hairG.add(keep(band))
		const cup = new T.Mesh(
			eqGeo("headsetcup", () => new T.CylinderGeometry(0.04, 0.04, 0.035, 12)),
			TM("#2c2f36"),
		)
		cup.rotation.z = Math.PI / 2
		cup.position.set(-0.18, y, 0.01)
		r.hairG.add(keep(cup))
		const boom = new T.Mesh(
			eqGeo("headsetboom", () => new T.BoxGeometry(0.012, 0.012, 0.13)),
			TM("#2c2f36"),
		)
		boom.position.set(-0.165, y - 0.055, 0.075)
		boom.rotation.y = -0.45
		boom.rotation.x = -0.35
		r.hairG.add(keep(boom))
		const mic = new T.Mesh(sphGeo(0.018, 8, 6), TM("#e8604a"))
		mic.position.set(-0.13, y - 0.075, 0.13)
		r.hairG.add(keep(mic))
	}
	if (acc.includes("witch")) {
		// a pointed hat: a wide brim, a cone and a gold band
		const brim = new T.Mesh(
			eqGeo("witchbrim", () => new T.CylinderGeometry(0.25, 0.25, 0.014, 18)),
			TM("#3b2a55"),
		)
		brim.position.set(0, y + 0.15, 0)
		r.hairG.add(keep(brim))
		const cone = new T.Mesh(
			eqGeo("witchcone", () => new T.ConeGeometry(0.14, 0.32, 14)),
			TM("#4b3470"),
		)
		cone.position.set(0, y + 0.31, 0)
		cone.rotation.x = -0.12
		r.hairG.add(keep(cone))
		const band = new T.Mesh(
			eqGeo("witchband", () => new T.CylinderGeometry(0.145, 0.15, 0.04, 14)),
			TM("#f2a03a"),
		)
		band.position.set(0, y + 0.18, 0)
		r.hairG.add(keep(band))
	}
	if (acc.includes("whistle") || acc.includes("lanyard")) {
		const cord = new T.Mesh(
			eqGeo("lanyard", () => new T.TorusGeometry(0.09, 0.006, 5, 18)),
			TM(acc.includes("whistle") ? "#e8604a" : "#4a78c8"),
		)
		cord.rotation.x = Math.PI / 2 - 0.55
		cord.position.set(0, 0.36, 0.03)
		r.torso.add(keep(cord))
		if (acc.includes("whistle")) {
			const w = new T.Mesh(
				eqGeo("whistle", () => new T.CylinderGeometry(0.022, 0.022, 0.05, 10)),
				TM("#c8ccd4"),
			)
			w.rotation.z = Math.PI / 2
			w.position.set(0, 0.29, 0.135)
			r.torso.add(keep(w))
		} else {
			const card = new T.Mesh(
				eqGeo("idcard", () => new T.BoxGeometry(0.06, 0.08, 0.012)),
				TM("#fff7ea"),
			)
			card.position.set(0, 0.27, 0.14)
			card.rotation.x = -0.15
			r.torso.add(keep(card))
		}
	}
	if (acc.includes("chain")) {
		const ch = new T.Mesh(
			eqGeo("chain", () => new T.TorusGeometry(0.075, 0.009, 6, 20)),
			a.mat(
				"chain",
				() =>
					new T.MeshStandardMaterial({
						color: "#e8c05a",
						metalness: 0.6,
						roughness: 0.3,
					}),
			),
		)
		ch.rotation.x = Math.PI / 2 - 0.45
		ch.position.set(0, 0.39, 0.02)
		r.torso.add(keep(ch))
	}
}

function paint(r: Rig, out: Outfit): void {
	r.out = out
	const col: Partial<Record<Role, string>> = {
		top: out.top,
		sleeve: out.sleeves ? out.top : out.skin,
		skin: out.skin,
		bottom: out.bottom,
		shin: out.shorts ? out.skin : out.bottom,
		shoes: out.shoes,
	}
	r.root.traverse((o) => {
		if (!(o instanceof T.Mesh) || o.userData.isOutline) return
		const c = col[o.userData.role as Role]
		if (c != null) o.material = TM(c)
	})
	clear(r.hairG)
	roundHair(r.hairG, out)
	roundFace(r.faceG, out)
	dress(r, out)
}

/** Merges every untextured mesh into one rigidly-skinned toon mesh whose
 * bones are the rig joints (+1 outline mesh sharing the skeleton). A person
 * drops from ~60 draw calls to 1-3. */
function bakeRig(r: Rig): Rig {
	r.root.updateMatrixWorld(true)
	const joints: T.Bone[] = [
		r.torso,
		r.neck,
		r.armL.sh,
		r.armL.el,
		r.armR.sh,
		r.armR.el,
		r.legL.hp,
		r.legL.kn,
		r.legR.hp,
		r.legR.kn,
	]
	const jset = new Set<T.Object3D>(joints)
	const skin = new T.Color(r.out.skin)
	const rootInv = new T.Matrix4().copy(r.root.matrixWorld).invert()
	const parts: Part[] = []
	const kill: T.Object3D[] = []
	const keep: [T.Mesh, T.Bone, T.Matrix4][] = []
	joints.forEach((j, bi) => {
		const inv = new T.Matrix4().copy(j.matrixWorld).invert()
		const walk = (o: T.Object3D) => {
			for (const c of o.children.slice()) {
				if (jset.has(c)) continue
				if (c instanceof T.Mesh) {
					if (c.userData.isOutline) {
						kill.push(c)
						continue
					}
					const mt = c.material as T.Material & {
						map?: T.Texture | null
						color?: T.Color
					}
					if (mt.map || !mt.color) keep.push([c, j, inv])
					else {
						let col = mt.color.clone()
						if (mt.transparent && mt.opacity < 1)
							col = skin.clone().lerp(mt.color, mt.opacity)
						parts.push({
							geo: c.geometry,
							m: new T.Matrix4().multiplyMatrices(rootInv, c.matrixWorld),
							c: col,
							ol: c.children.some((k) => k.userData?.isOutline),
							bone: bi,
						})
						kill.push(c)
					}
				}
				walk(c)
			}
		}
		walk(j)
	})
	for (const [c, j, inv] of keep) {
		const m = new T.Matrix4().multiplyMatrices(inv, c.matrixWorld)
		c.removeFromParent()
		m.decompose(c.position, c.quaternion, c.scale)
		j.add(c)
	}
	for (const k of kill) k.removeFromParent()
	if (!parts.length) return r
	const G = mergeParts(parts, true, true)
	G.boundingSphere = new T.Sphere(new T.Vector3(0, 0.55, 0), 1.25)
	r.baked.push(G)
	const a = ctx().assets
	const sk = new T.Skeleton(joints)
	const mesh = new T.SkinnedMesh(G, a.TOONS)
	mesh.frustumCulled = false
	mesh.userData.role = "baked"
	r.root.add(mesh)
	mesh.updateMatrixWorld(true)
	mesh.bind(sk, mesh.matrixWorld)
	r.skinMesh = mesh
	const outIndex = G.userData.outIndex as T.BufferAttribute | undefined
	if (outIndex) {
		const og = new T.BufferGeometry()
		for (const k of ["position", "normal", "skinIndex", "skinWeight"])
			og.setAttribute(k, G.attributes[k])
		og.setIndex(outIndex)
		og.boundingSphere = G.boundingSphere
		const o = new T.SkinnedMesh(og, a.OUTLINES)
		o.frustumCulled = false
		o.userData.isOutline = true
		r.root.add(o)
		o.updateMatrixWorld(true)
		o.bind(sk, o.matrixWorld)
		r.baked.push(og)
	}
	return r
}

export function makeRig(out: Outfit, pre?: (r: Rig) => void): Rig {
	const r = buildRound(out)
	paint(r, out)
	if (pre) pre(r)
	return bakeRig(r)
}

export function disposeRig(r: Rig): void {
	for (const g of r.baked) g.dispose()
	r.baked = []
	r.skinMesh?.skeleton.dispose()
	r.root.removeFromParent()
}

export function resetPose(r: Rig): void {
	r.body.rotation.set(0, 0, 0)
	r.body.position.set(0, 0, 0)
	r.hips.position.y = H0
	r.torso.rotation.set(0, 0, 0)
	r.neck.rotation.set(0, 0, 0)
	for (const a of [r.armL, r.armR]) {
		a.sh.rotation.set(0, 0, 0)
		a.el.rotation.set(0, 0, 0)
	}
	for (const l of [r.legL, r.legR]) {
		l.hp.rotation.set(0, 0, 0)
		l.kn.rotation.set(0, 0, 0)
	}
	for (const k in r.props) for (const o of r.props[k]) o.visible = false
}
