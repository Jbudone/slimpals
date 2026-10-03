// Equipment builders ported from the build lab. Each builder draws one piece
// around the local origin (a 2 x 2 footprint unless noted), registers its
// stations (where people work out) through wst(), and any per-frame
// animation through tick(). Pieces are built while a world is bound.
import * as T from "three"
import {
	box,
	boxGeo,
	C,
	canvasTex,
	cyl,
	DISPLAY_FONT,
	eqGeo,
	eqMat,
	fitText,
	group,
	lerp,
	M,
	sphGeo,
	star,
} from "../engine/helpers"
import { followHands } from "../people/poses"
import { ctx } from "../world/state"
import type { Person, Station } from "../world/types"

export type Builder = () => T.Group

// ── materials ────────────────────────────────────────────────────────────────

export const GLASS = (): T.Material =>
	eqMat(
		"glass",
		() =>
			new T.MeshStandardMaterial({
				color: "#cfeef4",
				transparent: true,
				opacity: 0.3,
				roughness: 0.15,
				depthWrite: false,
			}),
	)

export const MIRROR = (): T.MeshStandardMaterial =>
	eqMat("mirror", () => {
		const m = new T.MeshStandardMaterial({
			color: "#cfe7ee",
			roughness: 0.25,
			metalness: 0.25,
			flatShading: true,
		})
		m.userData.mergeable = true
		m.userData.vc = new T.Color("#bcdde6")
		return m
	})

export const GOLD = (): T.MeshStandardMaterial =>
	eqMat("gold", () => {
		const m = new T.MeshStandardMaterial({
			color: "#e8b83a",
			roughness: 0.35,
			metalness: 0.5,
			flatShading: true,
		})
		m.userData.mergeable = true
		m.userData.vc = new T.Color("#d9a52c")
		return m
	})

const LINEM = (): T.LineBasicMaterial =>
	eqMat("line", () => new T.LineBasicMaterial({ color: "#2c2f36" }))

export function glowM(
	c: string,
	op?: number,
	add = false,
): T.MeshBasicMaterial {
	return eqMat(
		`glow${c}${op ?? ""}${add}`,
		() =>
			new T.MeshBasicMaterial({
				color: c,
				transparent: op != null,
				opacity: op ?? 1,
				depthWrite: op == null,
				side: T.DoubleSide,
				blending: add ? T.AdditiveBlending : T.NormalBlending,
			}),
	)
}

// ── building helpers ─────────────────────────────────────────────────────────

type StationOpt = Partial<Station> & { label: string }

function station(
	o: StationOpt & { x: number; y: number; z: number; face: number },
): Station {
	const s: Station = {
		lx: o.x,
		lz: o.z,
		lface: o.face,
		busy: null,
		piece: null,
		...o,
	}
	const w = ctx()
	if (w.stations) w.stations.push(s)
	return s
}

/** A station at a point given in the piece's local space. */
function wst(
	g: T.Object3D,
	lx: number,
	ly: number,
	lz: number,
	face: number,
	o: StationOpt,
): Station {
	g.updateMatrixWorld(true)
	const p = g.localToWorld(new T.Vector3(lx, ly, lz))
	return station({ ...o, x: p.x, y: ly, z: p.z, face: face + g.rotation.y })
}

function tick(fn: (dt: number) => void): void {
	ctx().ticks?.push(fn)
}

function track<X extends { dispose(): void }>(x: X): X {
	return ctx().assets.track(x)
}

function eqMesh(
	geo: T.BufferGeometry,
	mat: T.Material,
	x: number,
	y: number,
	z: number,
	parent: T.Object3D,
	noCast = false,
): T.Mesh {
	const m = new T.Mesh(geo, mat)
	m.position.set(x, y, z)
	m.castShadow = !noCast
	m.receiveShadow = true
	parent.add(m)
	return m
}

function adopt(g: T.Object3D, child: T.Object3D, lx = 0, lz = 0): T.Object3D {
	g.add(child)
	child.position.set(lx, 0, lz)
	return child
}

function eqRug(
	w: number,
	d: number,
	c: string,
	x: number,
	z: number,
	g: T.Object3D,
	y = 0,
): T.Mesh {
	return box(w, 0.03, d, c, x, y + 0.015, z, g, { noCast: true })
}

function eqPic(
	w: number,
	h: number,
	tex: T.Texture,
	x: number,
	y: number,
	z: number,
	g: T.Object3D,
	basic = false,
): T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial | T.MeshStandardMaterial> {
	const m = new T.Mesh(
		eqGeo(`plane${w}_${h}`, () => new T.PlaneGeometry(w, h)),
		track(
			basic
				? new T.MeshBasicMaterial({ map: tex, transparent: true })
				: new T.MeshStandardMaterial({ map: tex, roughness: 1 }),
		),
	)
	m.position.set(x, y, z)
	g.add(m)
	return m
}

function eqLine(g: T.Object3D, pts: T.Vector3[], seg = false): T.Line {
	const geo = track(new T.BufferGeometry().setFromPoints(pts))
	const l = seg ? new T.LineSegments(geo, LINEM()) : new T.Line(geo, LINEM())
	g.add(l)
	return l
}

function eqSetLine(l: T.Line, i: number, v: T.Vector3): void {
	const a = l.geometry.attributes.position as T.BufferAttribute
	a.setXYZ(i, v.x, v.y, v.z)
	a.needsUpdate = true
}

function eqChair(
	g: T.Object3D,
	x: number,
	z: number,
	col: string,
	ry = 0,
	tall = false,
): T.Group {
	const c = group(x, 0, z, g)
	c.rotation.y = ry
	box(0.4, 0.06, 0.4, col, 0, 0.27, 0, c)
	box(0.4, tall ? 0.62 : 0.42, 0.07, col, 0, tall ? 0.6 : 0.5, -0.19, c)
	cyl(0.03, 0.24, C.steelD, 0, 0.12, 0, c, 6)
	box(0.36, 0.03, 0.05, C.steelD, 0, 0.015, 0, c)
	box(0.05, 0.03, 0.36, C.steelD, 0, 0.015, 0, c)
	return c
}

function eqDesk(
	g: T.Object3D,
	w: number,
	top: string,
	side: string,
	x: number,
	z: number,
): void {
	box(w, 0.05, 0.55, top, x, 0.565, z, g)
	for (const s of [-1, 1])
		box(0.05, 0.54, 0.5, side, x + s * (w / 2 - 0.04), 0.27, z, g)
	box(w - 0.1, 0.34, 0.03, side, x, 0.37, z + 0.25, g)
}

function eqKettle(
	g: T.Object3D,
	x: number,
	z: number,
	c: string,
	s = 1,
): T.Group {
	const k = group(x, 0, z, g)
	k.scale.setScalar(s)
	eqMesh(sphGeo(0.1, 10, 8), M(c), 0, 0.1, 0, k)
	eqMesh(
		eqGeo("ktor", () => new T.TorusGeometry(0.06, 0.017, 5, 12)),
		M(c),
		0,
		0.2,
		0,
		k,
	)
	return k
}

function eqPlate(
	g: T.Object3D,
	x: number,
	y: number,
	z: number,
	r: number,
	c: string,
	th = 0.05,
): T.Mesh {
	return cyl(r, th, c, x, y, z, g, 16, [0, 0, Math.PI / 2])
}

function eqBarbell(
	g: T.Object3D,
	x: number,
	y: number,
	z: number,
	cols: string[] = ["#2c2f36", "#3a3f4a"],
	len = 1.5,
): T.Group {
	const b = group(x, y, z, g)
	b.userData.dyn = 1
	cyl(0.02, len, C.steel, 0, 0, 0, b, 8, [0, 0, Math.PI / 2])
	const e = len / 2
	cols.forEach((c, i) => {
		for (const s of [-1, 1])
			eqPlate(b, s * (e - 0.2 + i * 0.06), 0, 0, i ? 0.16 : 0.2, c, 0.05)
	})
	for (const s of [-1, 1])
		eqPlate(b, s * (e - 0.26), 0, 0, 0.04, C.steelD, 0.03)
	return b
}

export function eqCup(
	g: T.Object3D,
	x: number,
	y: number,
	z: number,
	s: number,
	mat: T.Material,
): T.Group {
	const c = group(x, y, z, g)
	c.scale.setScalar(s)
	eqMesh(boxGeo(0.12, 0.04, 0.12), mat, 0, 0.02, 0, c)
	eqMesh(
		eqGeo(
			"cup",
			() =>
				new T.LatheGeometry(
					(
						[
							[0.001, 0.04],
							[0.025, 0.04],
							[0.014, 0.1],
							[0.03, 0.12],
							[0.07, 0.16],
							[0.08, 0.25],
							[0.072, 0.255],
							[0.001, 0.21],
						] as const
					).map(([a, b]) => new T.Vector2(a, b)),
					14,
				),
		),
		mat,
		0,
		0,
		0,
		c,
	)
	for (const sx of [-1, 1])
		eqMesh(
			eqGeo("cuph", () => new T.TorusGeometry(0.035, 0.01, 5, 10)),
			mat,
			sx * 0.085,
			0.2,
			0,
			c,
		)
	return c
}

function eqSign(
	txt: string,
	bg: string,
	fg: string,
	w = 256,
	h = 96,
): T.CanvasTexture {
	return canvasTex(
		w,
		h,
		(c, W, H) => {
			c.fillStyle = bg
			c.fillRect(0, 0, W, H)
			c.fillStyle = fg
			c.textAlign = "center"
			c.textBaseline = "middle"
			fitText(c, txt, W * 0.86, "800", DISPLAY_FONT)
			c.fillText(txt, W / 2, H / 2 + 3)
		},
		`sign_${txt}_${bg}_${fg}_${w}_${h}`,
	)
}

function waterTex(key: string, rx: number, ry: number): T.CanvasTexture {
	const rng = ctx().rng
	const t = canvasTex(
		256,
		256,
		(c, w) => {
			c.fillStyle = "#4fb6d6"
			c.fillRect(0, 0, w, w)
			c.strokeStyle = "rgba(255,255,255,.35)"
			c.lineWidth = 3
			for (let i = 0; i < 14; i++) {
				c.beginPath()
				const y0 = rng() * w
				for (let x = 0; x <= w; x += 16)
					c.lineTo(x, y0 + Math.sin(x * 0.05 + i) * 8)
				c.stroke()
			}
		},
		key,
	)
	t.wrapS = T.RepeatWrapping
	t.wrapT = T.RepeatWrapping
	t.repeat.set(rx, ry)
	return t
}

export function plant(
	x: number,
	z: number,
	s = 1,
	parent?: T.Object3D,
): T.Group {
	const g = group(x, 0, z, parent)
	cyl(0.22 * s, 0.36 * s, C.pot, 0, 0.18 * s, 0, g, 8)
	const l = eqMesh(
		eqGeo(`ico${0.34 * s}`, () => new T.IcosahedronGeometry(0.34 * s, 0)),
		M(C.leaf),
		0,
		0.62 * s,
		0,
		g,
	)
	l.castShadow = true
	eqMesh(
		eqGeo(`ico${0.24 * s}`, () => new T.IcosahedronGeometry(0.24 * s, 0)),
		M(C.leafD),
		0.15 * s,
		0.86 * s,
		0.05,
		g,
	)
	return g
}

// Treadmill: belt runs along z, console toward -z; the runner faces -z.
function treadmill(x: number, z: number): T.Group {
	const g = group(x, 0, z)
	box(0.82, 0.18, 1.7, C.steelD, 0, 0.09, 0, g)
	box(0.62, 0.05, 1.5, C.rubber, 0, 0.2, 0.05, g)
	const stripes = group(0, 0.23, 0, g)
	stripes.userData.dyn = 1
	for (let i = 0; i < 6; i++)
		box(0.6, 0.012, 0.06, "#4a4f5a", 0, 0, -0.7 + i * 0.27, stripes, {
			noCast: true,
		})
	ctx().belts.push(stripes)
	box(0.06, 0.95, 0.06, C.steelD, -0.36, 0.6, -0.72, g)
	box(0.06, 0.95, 0.06, C.steelD, 0.36, 0.6, -0.72, g)
	box(0.06, 0.05, 0.55, C.steel, -0.36, 0.95, -0.45, g)
	box(0.06, 0.05, 0.55, C.steel, 0.36, 0.95, -0.45, g)
	box(0.82, 0.32, 0.18, C.cream, 0, 1.12, -0.78, g)
	box(0.52, 0.2, 0.02, C.screen, 0, 1.14, -0.68, g, { noCast: true })
	box(0.14, 0.06, 0.02, C.glow, -0.08, 1.16, -0.668, g, { noCast: true })
	station({
		type: "run",
		x,
		z: z + 0.2,
		y: 0.22,
		face: Math.PI,
		dz: 1.1,
		label: "running on a treadmill",
	})
	return g
}

function dbRack(x: number, z: number): T.Group {
	const g = group(x, 0, z)
	box(0.5, 0.08, 2.4, C.steelD, 0, 0.5, 0, g)
	box(0.5, 0.08, 2.4, C.steelD, 0.08, 0.85, 0, g)
	for (const pz of [-1.1, 1.1]) {
		box(0.08, 0.9, 0.08, C.steelD, -0.2, 0.45, pz, g)
		box(0.08, 0.9, 0.08, C.steelD, 0.2, 0.45, pz, g)
	}
	for (let i = 0; i < 7; i++) {
		const z2 = -1 + i * 0.33
		const r = 0.07 + i * 0.012
		for (const [dx, y] of [
			[0, 0.6],
			[0.08, 0.95],
		]) {
			const d = group(dx, y, z2, g)
			const rx = [Math.PI / 2, 0, 0] as const
			cyl(0.02, 0.24, "#3a3f4a", 0, 0, 0, d, 6, rx)
			cyl(r, 0.06, "#2c2f36", 0, 0, -0.12, d, 10, rx)
			cyl(r, 0.06, "#2c2f36", 0, 0, 0.12, d, 10, rx)
		}
	}
	station({
		type: "curl",
		x: x + 1.0,
		z: z - 0.6,
		y: 0,
		face: -Math.PI / 2,
		dz: 0,
		label: "doing dumbbell curls",
	})
	station({
		type: "curl",
		x: x + 1.0,
		z: z + 0.7,
		y: 0,
		face: -Math.PI / 2,
		dz: 0,
		label: "doing dumbbell curls",
	})
	return g
}

function bike(x: number, z: number): T.Group {
	const g = group(x, 0, z)
	box(0.12, 0.08, 1.0, C.steelD, 0, 0.05, 0, g)
	box(0.08, 0.6, 0.08, C.steelD, 0, 0.35, -0.25, g)
	box(0.3, 0.08, 0.34, C.rubber, 0, 0.68, -0.28, g)
	box(0.08, 0.72, 0.08, C.steelD, 0, 0.4, 0.3, g)
	box(0.46, 0.05, 0.06, C.steel, 0, 0.8, 0.32, g)
	const w = cyl(0.26, 0.07, C.teal, 0, 0.36, 0.4, g, 14, [0, 0, Math.PI / 2])
	w.userData.dyn = 1
	ctx().wheels.push(w)
	w.userData.st = station({
		type: "bike",
		x,
		z: z - 0.28,
		y: 0.68,
		face: 0,
		dz: -0.7,
		label: "riding a bike",
	})
	return g
}

// ── catalog ─────────────────────────────────────────────────────────────────

const rz90 = [0, 0, Math.PI / 2] as const
const rx90 = [Math.PI / 2, 0, 0] as const

export const EQUIP: Readonly<Record<string, Builder>> = {
	// ----- cardio -----
	cardio_treadmill() {
		const g = group()
		adopt(g, treadmill(0, 0), 0, 0)
		eqRug(1.4, 2.1, C.mat, 0, 0.1, g)
		return g
	},
	cardio_bikes() {
		const g = group()
		adopt(g, bike(-0.5, 0), -0.5, 0)
		adopt(g, bike(0.5, 0), 0.5, 0)
		eqRug(1.9, 1.5, C.mat, 0, 0, g)
		return g
	},
	cardio_cinema() {
		const g = group()
		adopt(g, treadmill(0, 0.4), 0, 0.4)
		for (const sx of [-0.85, 0.85]) {
			box(0.07, 2.0, 0.07, C.steelD, sx, 1.0, -0.95, g)
			box(0.12, 0.05, 0.5, C.steelD, sx, 0.025, -0.8, g)
		}
		box(1.84, 1.04, 0.08, "#1d2230", 0, 1.55, -0.95, g)
		const tex = canvasTex(512, 256, (c, w, h) => {
			const sky = c.createLinearGradient(0, 0, 0, h)
			sky.addColorStop(0, "#f2a86a")
			sky.addColorStop(0.6, "#f7d59a")
			c.fillStyle = sky
			c.fillRect(0, 0, w, h)
			c.fillStyle = "#fff1c8"
			c.beginPath()
			c.arc(360, 90, 34, 0, 7)
			c.fill()
			for (const [col, base, f] of [
				["#b0707a", 150, 0.012],
				["#8a5a70", 175, 0.02],
			] as const) {
				c.fillStyle = col
				c.beginPath()
				c.moveTo(0, h)
				for (let x = 0; x <= w; x += 8)
					c.lineTo(
						x,
						base - Math.abs(Math.sin(x * f)) * 70 - Math.sin(x * f * 2.7) * 14,
					)
				c.lineTo(w, h)
				c.fill()
			}
			c.fillStyle = "#6fa35a"
			c.fillRect(0, 200, w, 56)
			c.fillStyle = "#e8c89a"
			c.beginPath()
			c.moveTo(200, 256)
			c.lineTo(250, 200)
			c.lineTo(270, 200)
			c.lineTo(330, 256)
			c.fill()
			for (let i = 0; i < 12; i++) {
				const tx = i * 44 + 10
				c.fillStyle = "#3f7c44"
				c.beginPath()
				c.moveTo(tx, 212)
				c.lineTo(tx + 12, 172)
				c.lineTo(tx + 24, 212)
				c.fill()
			}
		})
		tex.wrapS = T.RepeatWrapping
		const scr = eqPic(1.72, 0.94, tex, 0, 1.55, -0.905, g, true)
		scr.material.transparent = false
		tick((dt) => {
			tex.offset.x = (tex.offset.x + dt * 0.03) % 1
		})
		return g
	},
	cardio_rowing() {
		const g = group()
		g.rotation.y = -Math.PI / 2 // side-on so the slide reads in iso
		box(0.16, 0.08, 1.6, C.steelD, 0, 0.2, 0.12, g)
		box(0.5, 0.05, 0.12, C.steelD, 0, 0.025, -0.62, g)
		box(0.08, 0.16, 0.08, C.steelD, 0, 0.1, -0.6, g)
		box(0.55, 0.08, 0.34, C.steelD, 0, 0.04, 0.82, g)
		box(0.12, 0.24, 0.2, C.steelD, 0, 0.16, 0.72, g)
		const fw = cyl(0.3, 0.16, C.teal, 0, 0.42, 0.82, g, 16, rz90)
		fw.userData.dyn = 1
		cyl(0.13, 0.17, C.tealD, 0, 0.42, 0.82, g, 10, rz90)
		const arm = box(0.04, 0.46, 0.04, C.steelD, 0, 0.88, 0.72, g)
		arm.rotation.x = -0.3
		box(0.24, 0.17, 0.04, C.cream, 0, 1.1, 0.64, g)
		box(0.18, 0.11, 0.01, C.screen, 0, 1.1, 0.618, g, { noCast: true })
		for (const fx of [-0.11, 0.11]) {
			const f = box(0.12, 0.03, 0.24, C.rubber, fx, 0.3, 0.6, g)
			f.rotation.x = -0.9
		}
		const seat = box(0.3, 0.06, 0.3, C.rubber, 0, 0.27, 0.2, g)
		const handle = group(0, 0.5, 0.5, g)
		seat.userData.dyn = 1
		handle.userData.dyn = 1
		cyl(0.02, 0.42, C.rubber, 0, 0, 0, handle, 6, rz90)
		const chain = eqLine(g, [
			new T.Vector3(0, 0.45, 0.6),
			new T.Vector3(0, 0.5, 0.5),
		])
		wst(g, 0, 0.26, -0.05, 0, {
			pose: "row",
			footZ: 0.62,
			label: "rowing",
			tick(p: Person) {
				const r = p.rig
				seat.position.z = -0.05 + r.body.position.z
				followHands(r, handle)
				eqSetLine(chain, 1, handle.position)
				fw.rotation.x += 0.1
			},
		})
		return g
	},
	cardio_stairs() {
		const g = group()
		box(0.9, 0.12, 1.3, C.steelD, 0, 0.06, 0.05, g)
		for (const sx of [-0.42, 0.42])
			box(0.05, 0.34, 1.2, "#3a3f4a", sx, 0.29, 0, g)
		const steps = group(0, 0, 0, g)
		steps.userData.dyn = 1
		const N = 6
		const dy = 0.12
		const dz = 0.22
		for (let i = 0; i < N; i++) {
			const s = group(0, 0, 0, steps)
			box(0.76, 0.05, 0.24, C.rubber, 0, 0, 0, s)
			box(0.76, 0.12, 0.03, C.steelD, 0, -0.08, 0.11, s)
		}
		for (const sx of [-0.4, 0.4]) {
			box(0.08, 1.25, 0.08, C.steelD, sx, 0.72, -0.66, g)
			box(0.04, 0.04, 0.95, C.steel, sx, 1.02, -0.2, g)
			box(0.04, 0.5, 0.04, C.steel, sx, 0.78, 0.26, g)
		}
		box(0.74, 0.3, 0.14, C.cream, 0, 1.42, -0.66, g)
		box(0.46, 0.18, 0.02, C.screen, 0, 1.44, -0.585, g, { noCast: true })
		box(0.12, 0.05, 0.02, C.glow, -0.1, 1.46, -0.572, g, { noCast: true })
		let u = 0
		const place = () =>
			steps.children.forEach((s, i) => {
				const k = i + u - 0.5
				s.position.set(0, 0.2 + k * dy, 0.5 - k * dz)
				s.visible = k > -0.3 && k < N - 1.2
			})
		place()
		tick((dt) => {
			u -= dt * 0.55
			if (u < 0) u += 1
			place()
		})
		wst(g, 0, 0.2 + 1.5 * dy + 0.025, 0.5 - 1.5 * dz + 0.02, Math.PI, {
			pose: "climb",
			label: "climbing the stair machine",
		})
		return g
	},

	// ----- weights -----
	weights_dumbbells() {
		const g = group()
		const w = ctx()
		const n = w.stations?.length ?? 0
		adopt(g, dbRack(-0.6, 0), -0.6, 0)
		eqRug(1.4, 2.2, C.mat, 0.35, 0, g)
		// The prototype keeps one of the two curl spots free.
		const second = w.stations?.[n + 1]
		if (second) second.skip = true
		return g
	},
	weights_barbell() {
		const g = group()
		eqRug(2, 1.7, C.mat, 0, 0.05, g)
		box(0.5, 0.06, 0.5, C.steelD, 0.65, 0.03, -0.72, g)
		cyl(0.03, 0.9, C.steelD, 0.65, 0.48, -0.72, g, 8)
		for (const [y, r2] of [
			[0.3, 0.2],
			[0.6, 0.16],
			[0.85, 0.12],
		]) {
			cyl(0.012, 0.14, C.steel, 0.65, y, -0.66, g, 6, rx90)
			cyl(r2, 0.04, "#2c2f36", 0.65, y, -0.62, g, 14, rx90)
		}
		const d1 = group(-0.75, 0.05, -0.65, g)
		cyl(0.015, 0.24, "#3a3f4a", 0, 0, 0, d1, 6, rz90)
		for (const dx of [-0.1, 0.1])
			cyl(0.05, 0.04, "#2c2f36", dx, 0, 0, d1, 10, rz90)
		const bar = eqBarbell(g, 0, 0.23, 0.12, ["#2c2f36", "#d4463a"])
		wst(g, 0, 0.03, 0.04, 0, {
			pose: "lift",
			lift: "dead",
			bar,
			label: "deadlifting",
		})
		return g
	},
	weights_olympic() {
		const g = group()
		box(2, 0.06, 2, "#2c2f36", 0, 0.03, 0, g, { noCast: true })
		box(1.1, 0.064, 1.96, C.wood, 0, 0.032, 0, g, { noCast: true })
		const bar = eqBarbell(g, 0, 1.0, 0, ["#d4463a", "#4a78c8", "#f2c14a"], 1.6)
		box(0.28, 0.5, 0.12, C.steelD, -0.75, 0.3, -0.82, g)
		;["#5fa35a", "#f2c14a", "#4a78c8"].forEach((c, i) => {
			const p = eqPlate(
				g,
				-0.75,
				0.26 - i * 0.02,
				-0.72 + i * 0.06,
				0.2 - i * 0.03,
				c,
				0.05,
			)
			p.rotation.set(0, Math.PI / 2, Math.PI / 2)
		})
		cyl(0.05, 0.62, C.steelD, 0.78, 0.34, -0.78, g, 8)
		cyl(0.17, 0.1, C.cream, 0.78, 0.68, -0.78, g, 12)
		cyl(0.14, 0.02, "#ffffff", 0.78, 0.735, -0.78, g, 12)
		cyl(0.2, 0.04, C.steelD, 0.78, 0.08, -0.78, g, 12)
		wst(g, 0, 0.064, 0.08, 0, {
			pose: "lift",
			lift: "squat",
			bar,
			label: "back squatting on the platform",
		})
		return g
	},
	weights_smith() {
		const g = group()
		box(1.7, 0.06, 0.9, C.steelD, 0, 0.03, -0.2, g)
		for (const sx of [-0.72, 0.72]) {
			cyl(0.03, 2.0, C.steel, sx, 1.05, -0.3, g, 8)
			box(0.07, 2.05, 0.07, C.steelD, sx, 1.05, -0.62, g)
			box(0.07, 2.05, 0.07, C.steelD, sx, 1.05, 0.1, g)
			box(0.1, 0.04, 0.12, "#d4463a", sx, 0.42, -0.3, g)
		}
		box(1.6, 0.08, 0.8, C.steelD, 0, 2.08, -0.26, g)
		eqRug(1.3, 0.8, C.mat, 0, 0.25, g)
		const bar = group(0, 1.0, -0.3, g)
		bar.userData.dyn = 1
		cyl(0.022, 1.7, C.steel, 0, 0, 0, bar, 8, rz90)
		for (const sx of [-0.72, 0.72]) box(0.1, 0.12, 0.1, C.steelD, sx, 0, 0, bar)
		for (const s of [-1, 1]) {
			eqPlate(bar, s * 0.52, 0, 0, 0.2, "#2c2f36")
			eqPlate(bar, s * 0.58, 0, 0, 0.15, "#3a3f4a")
		}
		wst(g, 0, 0.06, -0.2, 0, {
			pose: "lift",
			lift: "squat",
			bar,
			barAxis: "y",
			label: "squatting in the Smith machine",
		})
		return g
	},
	weights_cable() {
		const g = group()
		box(2, 0.06, 0.5, C.steelD, 0, 0.03, -0.55, g)
		box(2.0, 0.08, 0.08, C.steelD, 0, 2.02, -0.55, g)
		const stacks: T.Group[] = []
		for (const s of [-1, 1]) {
			const tx = s * 0.82
			for (const o of [-0.12, 0.12])
				box(0.05, 2.0, 0.05, C.steelD, tx + o, 1.0, -0.55, g)
			box(0.32, 0.08, 0.3, C.steelD, tx, 2.0, -0.55, g)
			for (let i = 0; i < 8; i++)
				box(
					0.19,
					0.05,
					0.16,
					i % 2 ? "#3a3f4a" : "#2c2f36",
					tx,
					0.09 + i * 0.055,
					-0.55,
					g,
				)
			const top = group(tx, 0.55, -0.55, g)
			top.userData.dyn = 1
			box(0.19, 0.05, 0.16, "#d4463a", 0, 0, 0, top)
			box(0.02, 1.3, 0.02, C.steel, 0, 0.65, 0, top)
			stacks.push(top)
			cyl(0.06, 0.04, C.steel, s * 0.78, 1.75, -0.42, g, 10, rz90)
		}
		const cables = eqLine(
			g,
			[
				new T.Vector3(-0.78, 1.72, -0.42),
				new T.Vector3(),
				new T.Vector3(0.78, 1.72, -0.42),
				new T.Vector3(),
			],
			true,
		)
		const a = new T.Vector3()
		const b = new T.Vector3()
		wst(g, 0, 0.06, 0.05, 0, {
			pose: "fly",
			label: "doing cable flyes",
			tick(p: Person) {
				const r = p.rig
				r.armL.hand.getWorldPosition(a)
				r.armR.hand.getWorldPosition(b)
				g.worldToLocal(a)
				g.worldToLocal(b)
				eqSetLine(cables, 1, a)
				eqSetLine(cables, 3, b)
				const k = (1 - Math.cos(p.t * 2.2)) / 2
				for (const s of stacks) s.position.y = 0.55 + k * 0.25
			},
		})
		return g
	},

	// ----- boxing -----
	boxing_mitts_station() {
		const g = group()
		box(2, 0.03, 2, "#2c2f36", 0, 0.015, 0, g, { noCast: true })
		box(1.7, 0.034, 1.7, "#d4463a", 0, 0.017, 0.05, g, { noCast: true })
		box(1.3, 0.06, 0.2, C.steelD, 0, 1.05, -0.9, g)
		for (const sx of [-0.6, 0.6])
			box(0.06, 1.05, 0.06, C.steelD, sx, 0.52, -0.9, g)
		;["#d4463a", "#4a78c8", "#2c2f36", "#f2c14a"].forEach((c, i) => {
			for (const o of [-0.05, 0.05]) {
				const m = eqMesh(
					sphGeo(0.07, 10, 8),
					M(c),
					-0.45 + i * 0.3 + o * 1.4,
					0.9,
					-0.86,
					g,
				)
				m.scale.set(0.8, 1.2, 1)
			}
		})
		wst(g, -0.48, 0.034, 0.1, Math.PI / 2, {
			pose: "punch",
			sync: 0,
			label: "hitting the pads",
		})
		wst(g, 0.45, 0.034, 0.1, -Math.PI / 2, {
			pose: "mitts",
			sync: 0,
			label: "holding the pads",
			staff: true,
		})
		return g
	},
	boxing_ring() {
		const g = group()
		const H = 0.42
		const P = 1.36
		const top = H + 0.04
		box(3, H, 3, "#2c2f36", 0, H / 2, 0, g)
		box(3.04, 0.14, 3.04, "#d4463a", 0, H - 0.12, 0, g)
		box(2.9, 0.04, 2.9, "#efe6d6", 0, H + 0.02, 0, g, { noCast: true })
		const logo = canvasTex(
			256,
			256,
			(c, w) => {
				c.fillStyle = "#e8743b"
				c.beginPath()
				c.arc(w / 2, w / 2, 110, 0, 7)
				c.fill()
				c.fillStyle = "#fff7ea"
				c.beginPath()
				c.arc(w / 2, w / 2, 92, 0, 7)
				c.fill()
				c.fillStyle = "#e8743b"
				c.textAlign = "center"
				c.textBaseline = "middle"
				fitText(c, "SLIMPALS", 160, "800", DISPLAY_FONT)
				c.fillText("SLIMPALS", w / 2, w / 2 + 4)
			},
			"ringlogo",
		)
		const lg = eqPic(1.3, 1.3, logo, 0, top + 0.002, 0, g, true)
		lg.rotation.x = -Math.PI / 2
		for (const [sx, sz, c] of [
			[-1, -1, "#d4463a"],
			[1, 1, "#4a78c8"],
			[1, -1, "#fff7ea"],
			[-1, 1, "#fff7ea"],
		] as const) {
			cyl(0.05, 0.95, C.steelD, sx * P, top + 0.47, sz * P, g, 8)
			box(0.13, 0.62, 0.13, c, sx * P * 0.985, top + 0.52, sz * P * 0.985, g)
		}
		for (const h of [0.3, 0.55, 0.8]) {
			const y = top + h
			box(2 * P, 0.03, 0.03, "#fff7ea", 0, y, -P, g, { noCast: true })
			box(2 * P, 0.03, 0.03, "#fff7ea", 0, y, P, g, { noCast: true })
			box(0.03, 0.03, 2 * P, "#fff7ea", -P, y, 0, g, { noCast: true })
			box(0.03, 0.03, 2 * P, "#fff7ea", P, y, 0, g, { noCast: true })
		}
		for (const i of [0, 1])
			box(
				0.5,
				0.14 * (i + 1),
				0.2,
				C.steelD,
				0.9,
				0.07 * (i + 1),
				1.7 - i * 0.2,
				g,
			)
		wst(g, -0.5, top, 0.05, Math.PI / 2, {
			pose: "punch",
			sync: 0,
			label: "sparring in the ring",
		})
		wst(g, 0.5, top, -0.05, -Math.PI / 2, {
			pose: "punch",
			sync: 0.57,
			label: "sparring in the ring",
		})
		return g
	},
	punching_bags_double_end() {
		const g = group()
		eqRug(1.8, 1.7, "#3a3f4a", 0, 0.1, g)
		for (const fx of [-0.75, 0.75]) {
			box(0.08, 2.0, 0.08, C.steelD, fx, 1.0, -0.3, g)
			box(0.1, 0.04, 0.6, C.steelD, fx, 0.02, -0.3, g)
		}
		box(1.6, 0.08, 0.1, C.steelD, 0, 2.0, -0.3, g)
		cyl(0.08, 0.03, C.steelD, 0, 0.03, -0.3, g, 10)
		const bag = group(0, 0.85, -0.3, g)
		bag.userData.dyn = 1
		eqMesh(sphGeo(0.11, 12, 10), M("#d4463a"), 0, 0, 0, bag).scale.set(
			1,
			1.3,
			1,
		)
		box(0.225, 0.03, 0.225, "#fff7ea", 0, 0, 0, bag, { noCast: true })
		const cord = eqLine(
			g,
			[
				new T.Vector3(0, 1.96, -0.3),
				new T.Vector3(0, 1, -0.3),
				new T.Vector3(0, 0.7, -0.3),
				new T.Vector3(0, 0.04, -0.3),
			],
			true,
		)
		let sw = 0
		const v = new T.Vector3()
		wst(g, 0, 0.03, 0.2, Math.PI, {
			pose: "punch",
			label: "working the double-end bag",
			tick(p: Person, t: number) {
				sw = lerp(sw, p.station?.hit ?? 0, 0.25)
				bag.position.z = -0.3 - sw * 0.1 + Math.sin(t * 9) * 0.015
				bag.position.x = Math.sin(t * 7) * 0.02
				eqSetLine(
					cord,
					1,
					v.set(bag.position.x, bag.position.y + 0.14, bag.position.z),
				)
				eqSetLine(
					cord,
					2,
					v.set(bag.position.x, bag.position.y - 0.14, bag.position.z),
				)
			},
		})
		return g
	},
	punching_bags_heavy_bag_row() {
		const g = group()
		eqRug(2, 1.4, C.mat, 0, 0.25, g)
		for (const fx of [-0.95, 0.95]) {
			box(0.1, 1.85, 0.1, C.steelD, fx, 0.92, -0.4, g)
			box(0.12, 0.04, 0.7, C.steelD, fx, 0.02, -0.4, g)
		}
		box(2.0, 0.1, 0.14, C.steelD, 0, 1.85, -0.4, g)
		const bags = (
			[
				["#2c2f36", -0.6],
				["#d4463a", 0],
				["#4a78c8", 0.6],
			] as const
		).map(([c, bx]) => {
			const pv = group(bx, 1.8, -0.4, g)
			pv.userData.dyn = 1
			box(0.02, 0.3, 0.02, C.steel, 0, -0.15, 0, pv)
			cyl(0.17, 0.85, c, 0, -0.73, 0, pv, 12)
			cyl(0.176, 0.08, "#fff7ea", 0, -0.55, 0, pv, 12)
			cyl(0.176, 0.08, "#fff7ea", 0, -0.95, 0, pv, 12)
			return pv
		})
		let sw = 0
		const time = ctx().time
		tick(() => {
			const t = time.t
			bags[0].rotation.x = Math.sin(t * 1.7) * 0.04
			bags[2].rotation.z = Math.sin(t * 1.3) * 0.04
		})
		wst(g, 0, 0.03, 0.17, Math.PI, {
			pose: "punch",
			label: "hitting the heavy bag",
			tick(p: Person) {
				sw = lerp(sw, p.station?.hit ?? 0, 0.2)
				bags[1].rotation.x = sw * 0.16
			},
		})
		return g
	},

	// ----- lagree -----
	lagree_megaformer() {
		const g = group()
		for (const rx of [-0.32, 0.32]) {
			box(0.06, 0.08, 2.0, C.steelD, rx, 0.26, 0, g)
			for (const lz of [-0.92, 0.92])
				box(0.08, 0.22, 0.08, C.steelD, rx, 0.11, lz, g)
		}
		for (const pz of [-0.8, 0.8]) {
			box(0.72, 0.07, 0.36, "#3a3f4a", 0, 0.395, pz, g)
			for (const sx of [-0.3, 0.3])
				box(0.05, 0.5, 0.05, C.steel, sx, 0.65, pz + Math.sign(pz) * 0.15, g)
			cyl(0.025, 0.66, C.rubber, 0, 0.9, pz + Math.sign(pz) * 0.15, g, 8, rz90)
		}
		;["#f2c14a", "#d4463a", "#4a78c8", "#5fa35a"].forEach((c, i) => {
			box(0.025, 0.025, 0.8, c, -0.15 + i * 0.1, 0.25, -0.25, g, {
				noCast: true,
			})
		})
		const car = group(0, 0.36, 0.05, g)
		car.userData.dyn = 1
		box(0.68, 0.03, 0.82, "#2c2f36", 0, 0.015, 0, car)
		box(0.64, 0.05, 0.78, C.pad, 0, 0.05, 0, car)
		const f = new T.Vector3()
		wst(g, 0, 0.43, 0.28, 0, {
			pose: "lunge",
			frontZ: 0.42,
			label: "lunging on the Megaformer",
			tick(p: Person) {
				p.rig.legR.kn.localToWorld(f.set(0, -0.2, 0.03))
				g.worldToLocal(f)
				car.position.z = Math.min(0.2, Math.max(-0.4, f.z))
			},
		})
		return g
	},

	// ----- hero -----
	hero_spotlight_stage() {
		const g = group()
		cyl(0.92, 0.22, C.trim, 0, 0.11, 0.05, g, 24)
		cyl(0.84, 0.03, C.cream, 0, 0.235, 0.05, g, 24)
		const st = canvasTex(
			256,
			256,
			(c, w) => {
				c.fillStyle = "#f2c14a"
				star(c, w / 2, w / 2, 110, 46)
				c.fill()
				c.lineWidth = 8
				c.strokeStyle = "#e8743b"
				c.stroke()
			},
			"stagestar",
		)
		const sd = eqPic(1.1, 1.1, st, 0, 0.252, 0.05, g, true)
		sd.rotation.x = -Math.PI / 2
		box(2, 1.9, 0.06, "#2a2230", 0, 0.95, -0.97, g)
		const rng = ctx().rng
		const bt = canvasTex(
			512,
			256,
			(c, w, h) => {
				c.fillStyle = "#2a2230"
				c.fillRect(0, 0, w, h)
				for (let i = 0; i < 40; i++) {
					c.fillStyle = i % 3 ? "#f2c14a" : "#fff7ea"
					c.globalAlpha = 0.5 + rng() * 0.5
					star(c, rng() * w, rng() * h, 6, 2.5)
					c.fill()
				}
				c.globalAlpha = 1
				c.shadowColor = "#f2a03a"
				c.shadowBlur = 24
				c.fillStyle = "#f2c14a"
				c.textAlign = "center"
				c.textBaseline = "middle"
				fitText(c, "HERO OF THE WEEK", 440, "800", DISPLAY_FONT)
				c.fillText("HERO OF THE WEEK", w / 2, h / 2)
			},
			"herobanner",
		)
		eqPic(1.9, 0.95, bt, 0, 1.3, -0.935, g, true)
		const aim = new T.Vector3(0, 0.25, 0.05)
		for (const s of [-1, 1]) {
			const lp = new T.Vector3(s * 0.9, 2.1, -0.75)
			box(0.07, 2.1, 0.07, "#2c2f36", s * 0.9, 1.05, -0.8, g)
			const can = group(lp.x, lp.y, lp.z, g)
			g.updateMatrixWorld(true)
			can.lookAt(g.localToWorld(aim.clone()))
			cyl(0.1, 0.22, "#2c2f36", 0, 0, 0, can, 10, rx90)
			eqMesh(
				eqGeo("lens", () => new T.CircleGeometry(0.085, 12)),
				glowM("#fff4c8"),
				0,
				0,
				0.112,
				can,
				true,
			)
			const d = lp.clone().sub(aim)
			const L = d.length()
			const cone = eqMesh(
				eqGeo(
					`beam${L.toFixed(2)}`,
					() => new T.ConeGeometry(0.5, L, 16, 1, true),
				),
				glowM("#fff1b8", 0.13, true),
				(lp.x + aim.x) / 2,
				(lp.y + aim.y) / 2,
				(lp.z + aim.z) / 2,
				g,
				true,
			)
			cone.quaternion.setFromUnitVectors(
				new T.Vector3(0, -1, 0),
				d.clone().normalize().negate(),
			)
			cone.renderOrder = 2
		}
		wst(g, 0, 0.25, 0.1, Math.PI / 4, {
			pose: "flex",
			label: "striking a pose in the spotlight",
		})
		return g
	},

	// ----- swimming -----
	swimming_lap_pool() {
		const g = group()
		const E = 1.5
		const H = 0.36
		box(3, H, 0.22, C.cream, 0, H / 2, -E + 0.11, g)
		box(3, H, 0.22, C.cream, 0, H / 2, E - 0.11, g)
		box(0.22, H, 2.56, C.cream, -E + 0.11, H / 2, 0, g)
		box(0.22, H, 2.56, C.cream, E - 0.11, H / 2, 0, g)
		for (const [w, d, px, pz] of [
			[3.04, 0.26, 0, -E + 0.11],
			[3.04, 0.26, 0, E - 0.11],
			[0.26, 2.52, -E + 0.11, 0],
			[0.26, 2.52, E - 0.11, 0],
		])
			box(w, 0.04, d, "#e8743b", px, H + 0.02, pz, g, { noCast: true })
		box(2.56, 0.04, 2.56, "#5fb8d0", 0, 0.02, 0, g, { noCast: true })
		for (const lx of [-0.85, 0, 0.85])
			box(0.1, 0.01, 2.3, "#2a6f8a", lx, 0.045, 0, g, { noCast: true })
		// inner walls read as tiles through the water
		for (const [w, h, d, px, pz] of [
			[2.56, 0.3, 0.02, 0, -E + 0.23],
			[2.56, 0.3, 0.02, 0, E - 0.23],
			[0.02, 0.3, 2.56, -E + 0.23, 0],
			[0.02, 0.3, 2.56, E - 0.23, 0],
		])
			box(w, h, d, "#7cc6db", px, 0.18, pz, g, { noCast: true })
		const wt = waterTex("water_lap", 2, 2)
		const water = eqMesh(
			eqGeo("lapwater", () => new T.PlaneGeometry(2.56, 2.56)),
			eqMat(
				"lapwaterM",
				() =>
					new T.MeshStandardMaterial({
						map: wt,
						color: "#bfeaf5",
						transparent: true,
						opacity: 0.74,
						roughness: 0.3,
						depthWrite: false,
					}),
			),
			0,
			0.3,
			0,
			g,
			true,
		)
		water.rotation.x = -Math.PI / 2
		tick((dt) => {
			wt.offset.x = (wt.offset.x + dt * 0.02) % 1
			wt.offset.y = (wt.offset.y + dt * 0.013) % 1
		})
		for (const rx of [-0.43, 0.43]) {
			cyl(0.012, 2.56, "#fff7ea", rx, 0.31, 0, g, 4, rx90)
			for (let i = 0; i < 13; i++)
				cyl(
					0.035,
					0.12,
					i % 4 < 2 ? "#d4463a" : "#fff7ea",
					rx,
					0.31,
					-1.2 + i * 0.2,
					g,
					8,
					rx90,
				)
		}
		for (const lx of [-0.85, 0, 0.85]) {
			box(0.3, 0.1, 0.26, C.cream, lx, H + 0.09, -E + 0.12, g)
			box(0.3, 0.03, 0.26, C.teal, lx, H + 0.155, -E + 0.12, g)
		}
		for (const o of [-0.12, 0.12]) {
			cyl(0.02, 0.5, C.steel, E - 0.28, 0.5, 0.7 + o, g, 6)
			box(0.02, 0.02, 0.18, C.steel, E - 0.19, 0.75, 0.7 + o, g)
		}
		wst(g, 0, 0.27, 0, 0, {
			pose: "swim",
			label: "swimming laps",
			tick(p: Person, t: number) {
				const r = p.rig.root
				const st = p.station
				if (!st) return
				if (st.z0 == null) st.z0 = st.z
				const w = t * 0.4
				r.position.z = st.z0 + Math.sin(w) * 0.32
				r.rotation.y = Math.cos(w) >= 0 ? 0 : Math.PI
			},
		})
		return g
	},
	swimming_poolside_loungers() {
		const g = group()
		const lounger = (lx: number, col: string) => {
			const l = group(lx, 0, 0.1, g)
			for (const fx of [-0.2, 0.2])
				for (const fz of [-0.5, 0.7])
					box(0.05, 0.26, 0.05, C.cream, fx, 0.13, fz, l)
			box(0.5, 0.05, 1.15, C.cream, 0, 0.28, 0.12, l)
			box(0.46, 0.04, 1.1, col, 0, 0.32, 0.13, l)
			const bk = group(0, 0.3, -0.45, l)
			bk.rotation.x = 0.75
			box(0.5, 0.05, 0.62, C.cream, 0, 0, -0.31, bk)
			box(0.46, 0.04, 0.6, col, 0, 0.04, -0.3, bk)
			return l
		}
		lounger(-0.5, C.teal)
		lounger(0.5, C.trim)
		box(0.44, 0.02, 0.5, "#fff7ea", 0.5, 0.35, 0.35, g)
		cyl(0.025, 1.75, C.cream, 0, 0.87, -0.75, g, 6)
		eqMesh(
			eqGeo("umb", () => new T.ConeGeometry(0.85, 0.32, 8)),
			M("#f2c14a"),
			0,
			1.78,
			-0.75,
			g,
		)
		cyl(0.03, 0.08, C.cream, 0, 1.97, -0.75, g, 6)
		box(0.3, 0.05, 0.3, C.cream, 0, 0.025, -0.75, g)
		cyl(0.14, 0.03, C.cream, 0, 0.4, -0.1, g, 12)
		cyl(0.02, 0.4, C.cream, 0, 0.2, -0.1, g, 6)
		cyl(0.035, 0.12, "#f2a03a", 0.04, 0.47, -0.1, g, 8)
		wst(g, -0.5, 0.34, -0.33, 0, {
			pose: "lie",
			recline: 0.75,
			label: "lounging by the pool",
		})
		return g
	},

	// ----- sports court -----
	court_hoop() {
		const g = group()
		box(1.1, 0.03, 1.1, "#d9a35f", 0, 0.015, 0.1, g, { noCast: true })
		cyl(0.05, 2.3, C.steelD, 0, 1.15, -0.7, g, 8)
		box(0.05, 0.05, 0.5, C.steelD, 0, 2.2, -0.45, g)
		box(1.0, 0.65, 0.05, C.cream, 0, 2.3, -0.7, g)
		box(0.4, 0.3, 0.02, "#d4463a", 0, 2.2, -0.66, g, { noCast: true })
		cyl(0.2, 0.03, "#f2743b", 0, 2.1, -0.2, g, 14)
		cyl(0.16, 0.2, C.cream, 0, 1.98, -0.2, g, 10)
		const ball = eqMesh(
			eqGeo("bball", () => new T.SphereGeometry(0.12, 12, 8)),
			M("#e8743b"),
			0.5,
			0.12,
			0.5,
			g,
		)
		ball.userData.dyn = 1
		wst(g, 0, 0.03, 0.4, Math.PI, {
			pose: "lunge",
			label: "shooting hoops",
		})
		return g
	},
	court_pickle() {
		const g = group()
		box(1.7, 0.02, 1.2, "#3a8f6a", 0, 0.01, 0, g, { noCast: true })
		for (const sx of [-0.85, 0.85]) cyl(0.03, 0.9, C.steelD, sx, 0.45, 0, g, 6)
		box(1.7, 0.3, 0.02, "#2c2f36", 0, 0.7, 0, g, { noCast: true })
		box(1.7, 0.05, 0.03, C.cream, 0, 0.86, 0, g)
		box(1.4, 0.02, 0.02, C.cream, 0, 0.022, 0.35, g, { noCast: true })
		cyl(0.05, 0.02, "#f2c14a", 0.4, 0.03, 0.3, g, 8)
		wst(g, 0, 0.02, 0.5, Math.PI, {
			pose: "lunge",
			label: "playing pickleball",
		})
		return g
	},

	// ----- amenities -----
	amenity_juice() {
		const g = group()
		box(1.8, 0.56, 0.5, C.teal, 0, 0.28, 0.15, g)
		box(1.9, 0.06, 0.62, C.cream, 0, 0.59, 0.15, g)
		box(1.82, 0.1, 0.52, C.tealD, 0, 0.05, 0.16, g, { noCast: true })
		box(1.8, 1.6, 0.08, C.woodD, 0, 0.8, -0.92, g)
		for (const y of [0.75, 1.2]) box(1.7, 0.05, 0.24, C.wood, 0, y, -0.78, g)
		;["#f2a03a", "#5fa35a", "#d4463a", "#9b6bc4", "#f2c14a"].forEach((c, i) => {
			cyl(0.06, 0.2, c, -0.6 + i * 0.3, 0.875, -0.78, g, 8)
			cyl(0.05, 0.16, c, -0.5 + i * 0.25, 1.305, -0.78, g, 8)
		})
		eqPic(
			0.9,
			0.34,
			eqSign("JUICE BAR", "#2a2230", "#f2c14a"),
			0,
			1.58,
			-0.875,
			g,
		)
		cyl(0.1, 0.28, C.cream, 0.55, 0.76, 0.05, g, 10)
		cyl(0.075, 0.12, "#5fa35a", 0.55, 0.96, 0.05, g, 10)
		for (const dx of [-0.5, -0.3])
			cyl(0.045, 0.14, "#f2a03a", dx, 0.69, 0.25, g, 8)
		for (const sx of [-0.55, 0.55]) {
			cyl(0.17, 0.06, C.trim, sx, 0.47, 0.88, g, 12)
			cyl(0.035, 0.45, C.steelD, sx, 0.23, 0.88, g, 6)
			const ring = eqMesh(
				eqGeo("stoolring", () => new T.TorusGeometry(0.13, 0.015, 5, 14)),
				M(C.steelD),
				sx,
				0.2,
				0.88,
				g,
			)
			ring.rotation.x = Math.PI / 2
			cyl(0.14, 0.03, C.steelD, sx, 0.015, 0.88, g, 10)
		}
		wst(g, 0, 0, -0.45, 0, {
			type: "sit",
			stand: true,
			label: "blending smoothies",
			staff: true,
		})
		wst(g, 0.55, 0.58, 0.9, Math.PI, {
			type: "sitstool",
			label: "drinking a protein shake",
		})
		return g
	},
	amenity_lockers() {
		const g = group()
		const cols = ["#4a78c8", "#3aa89a", "#4a78c8", "#3aa89a"]
		box(1.8, 1.5, 0.45, "#35507f", 0, 0.8, -0.72, g)
		box(1.86, 0.06, 0.5, C.cream, 0, 1.58, -0.72, g)
		box(1.84, 0.06, 0.48, "#2c2f36", 0, 0.03, -0.72, g)
		for (let i = 0; i < 4; i++)
			for (let j = 0; j < 2; j++) {
				const dx = -0.675 + i * 0.45
				const dy = 0.44 + j * 0.72
				if (i === 2 && j === 0) {
					box(0.39, 0.66, 0.02, "#1b2438", dx, dy, -0.49, g, { noCast: true })
					box(0.3, 0.2, 0.2, C.pad, dx, dy - 0.2, -0.6, g)
					continue
				}
				box(0.41, 0.68, 0.03, cols[i], dx, dy, -0.48, g)
				for (const k of [0, 1, 2])
					box(
						0.18,
						0.018,
						0.01,
						"#22324f",
						dx,
						dy + 0.22 - k * 0.04,
						-0.462,
						g,
						{ noCast: true },
					)
				box(0.03, 0.08, 0.02, C.steel, dx + 0.15, dy - 0.05, -0.455, g, {
					noCast: true,
				})
			}
		const hinge = group(0.02, 0.44, -0.48, g)
		hinge.rotation.y = -1.9
		box(0.41, 0.68, 0.03, cols[2], 0.205, 0, 0, hinge)
		box(1.4, 0.07, 0.34, C.wood, 0, 0.3, 0.35, g)
		for (const sx of [-0.6, 0.6])
			box(0.06, 0.27, 0.28, C.steelD, sx, 0.135, 0.35, g)
		box(0.3, 0.06, 0.24, "#fff7ea", -0.4, 0.365, 0.35, g)
		box(0.45, 0.22, 0.24, C.teal, 0.45, 0.11, 0.8, g)
		return g
	},
	amenity_sauna() {
		const g = group()
		const W = "#c98b56"
		const D = "#9a6238"
		box(2, 0.06, 2, D, 0, 0.03, 0, g, { noCast: true })
		box(2, 1.9, 0.1, W, 0, 1.01, -0.95, g)
		box(0.1, 1.9, 1.9, W, -0.95, 1.01, 0.05, g)
		for (let i = 1; i < 9; i++) {
			box(1.88, 0.015, 0.01, D, 0.03, 0.06 + i * 0.21, -0.897, g, {
				noCast: true,
			})
			box(0.01, 0.015, 1.8, D, -0.897, 0.06 + i * 0.21, 0.05, g, {
				noCast: true,
			})
		}
		box(2, 0.45, 0.1, W, 0, 0.285, 0.95, g)
		box(0.1, 0.45, 1.3, W, 0.95, 0.285, -0.3, g)
		box(0.1, 1.9, 0.1, W, 0.95, 1.01, 0.95, g)
		box(0.1, 1.9, 0.1, W, 0.95, 1.01, 0.33, g)
		box(2, 0.1, 0.1, W, 0, 1.95, 0.95, g)
		box(0.1, 0.1, 2, W, 0.95, 1.95, 0, g)
		eqMesh(boxGeo(0.03, 1.4, 0.55), GLASS(), 0.95, 0.75, 0.64, g, true)
		box(1.8, 0.07, 0.4, W, -0.02, 0.305, -0.3, g)
		box(1.8, 0.27, 0.04, D, -0.02, 0.135, -0.2, g)
		box(1.8, 0.07, 0.38, W, -0.02, 0.63, -0.72, g)
		box(1.8, 0.28, 0.04, D, -0.02, 0.46, -0.51, g)
		box(0.36, 0.4, 0.32, C.steelD, 0.55, 0.26, 0.55, g)
		for (let i = 0; i < 6; i++)
			eqMesh(
				eqGeo("stone", () => new T.IcosahedronGeometry(0.07, 0)),
				M(i % 2 ? "#7d828d" : "#5a5f6a"),
				0.45 + (i % 3) * 0.1,
				0.5,
				0.49 + Math.floor(i / 3) * 0.12,
				g,
			)
		cyl(0.09, 0.14, W, -0.55, 0.13, 0.6, g, 10)
		box(0.06, 0.18, 0.03, "#fff7ea", -0.5, 1.35, -0.89, g, { noCast: true })
		const puffs = [0, 1, 2].map(() => {
			const m = eqMesh(
				sphGeo(0.1, 8, 6),
				glowM("#ffffff", 0.35),
				0.55,
				0.8,
				0.55,
				g,
				true,
			)
			m.userData.dyn = 1
			return m
		})
		const time = ctx().time
		tick(() => {
			const t = time.t
			puffs.forEach((m, i) => {
				const k = (t * 0.35 + i / 3) % 1
				m.position.set(0.55 + Math.sin(k * 6 + i) * 0.08, 0.55 + k * 1.1, 0.55)
				m.scale.setScalar(0.5 + k * 1.2)
			})
		})
		wst(g, -0.3, 0.04, -0.3, 0, {
			pose: "seated",
			label: "sweating it out in the sauna",
		})
		return g
	},
	amenity_showers() {
		const g = group()
		const tm = eqMat(
			"tile",
			() =>
				new T.MeshStandardMaterial({
					roughness: 0.7,
					map: canvasTex(
						128,
						128,
						(c, w) => {
							c.fillStyle = "#e8f1f2"
							c.fillRect(0, 0, w, w)
							c.strokeStyle = "#b9d3d8"
							c.lineWidth = 3
							for (let i = 0; i <= 6; i++) {
								c.beginPath()
								c.moveTo((i * w) / 6, 0)
								c.lineTo((i * w) / 6, w)
								c.stroke()
								c.beginPath()
								c.moveTo(0, (i * w) / 6)
								c.lineTo(w, (i * w) / 6)
								c.stroke()
							}
						},
						"tileTex",
					),
				}),
		)
		eqMesh(boxGeo(2, 2, 0.1), tm, 0, 1, -0.95, g)
		eqMesh(boxGeo(0.1, 2, 1.9), tm, -0.95, 1, 0.05, g)
		box(1.9, 0.04, 1.9, "#cfe3e6", 0.05, 0.02, 0.05, g, { noCast: true })
		;[-0.4, 0.45].forEach((sx, i) => {
			box(0.04, 1.4, 0.04, C.steel, sx, 1.0, -0.88, g)
			box(0.04, 0.04, 0.2, C.steel, sx, 1.72, -0.8, g)
			cyl(0.09, 0.03, C.steel, sx, 1.7, -0.7, g, 12)
			cyl(0.05, 0.03, i ? "#4a78c8" : "#d4463a", sx, 1.0, -0.86, g, 10, rx90)
			cyl(0.06, 0.01, C.steelD, sx, 0.045, -0.4, g, 10)
		})
		eqMesh(boxGeo(0.03, 1.6, 0.8), GLASS(), 0.02, 0.85, -0.5, g, true)
		eqMesh(
			eqGeo(
				"stream",
				() => new T.CylinderGeometry(0.07, 0.2, 1.62, 10, 1, true),
			),
			glowM("#bfe9f5", 0.35),
			-0.4,
			0.88,
			-0.7,
			g,
			true,
		)
		box(0.04, 0.5, 0.35, "#f2c14a", -0.88, 1.1, 0.4, g)
		box(0.02, 0.02, 0.4, C.steel, -0.89, 1.36, 0.4, g)
		box(0.5, 0.02, 0.35, C.teal, 0.3, 0.05, 0.5, g, { noCast: true })
		return g
	},
	amenity_water() {
		const g = group()
		const cx = 0
		const cz = -0.3
		box(0.42, 0.75, 0.38, C.cream, cx, 0.375, cz, g)
		box(0.3, 0.24, 0.03, "#2c2f36", cx, 0.6, cz + 0.18, g, { noCast: true })
		cyl(0.02, 0.05, "#d4463a", cx - 0.06, 0.68, cz + 0.21, g, 6, rx90)
		cyl(0.02, 0.05, "#4a78c8", cx + 0.06, 0.68, cz + 0.21, g, 6, rx90)
		box(0.3, 0.03, 0.1, C.steelD, cx, 0.5, cz + 0.22, g)
		cyl(0.07, 0.06, "#8fd0ea", cx, 0.78, cz, g, 10)
		cyl(0.17, 0.36, "#8fd0ea", cx, 0.99, cz, g, 14)
		cyl(0.1, 0.04, "#bfe6f2", cx, 1.19, cz, g, 12)
		cyl(0.045, 0.24, C.steel, cx + 0.26, 0.55, cz, g, 8)
		cyl(0.04, 0.06, "#fff7ea", cx + 0.26, 0.7, cz, g, 8)
		box(0.34, 0.03, 0.26, C.teal, cx, 0.015, cz + 0.35, g, { noCast: true })
		return g
	},

	// ----- staff -----
	staff_reception() {
		const g = group()
		box(1.8, 0.5, 0.4, C.cream, 0, 0.25, 0.25, g)
		box(1.9, 0.05, 0.5, C.teal, 0, 0.525, 0.25, g)
		box(1.82, 0.1, 0.42, C.trim, 0, 0.16, 0.26, g)
		eqPic(
			1.0,
			0.2,
			eqSign("WELCOME", "#e8743b", "#fff7ea", 256, 52),
			0,
			0.34,
			0.452,
			g,
		)
		box(1.2, 0.04, 0.35, C.wood, 0, 0.44, -0.1, g)
		box(0.4, 0.28, 0.04, C.screen, -0.3, 0.66, -0.12, g)
		box(0.05, 0.18, 0.05, C.steelD, -0.3, 0.52, -0.1, g)
		cyl(0.05, 0.04, "#f2c14a", 0.6, 0.57, 0.3, g, 10)
		eqChair(g, 0, -0.45, C.trim)
		plant(0.85, -0.75, 0.6, g)
		wst(g, 0, 0, -0.45, 0, {
			pose: "seated",
			work: true,
			label: "working the front desk",
			staff: true,
		})
		return g
	},
	staff_trainer() {
		const g = group()
		eqRug(2, 2, C.mat, 0, 0, g)
		box(0.5, 0.3, 0.4, C.wood, -0.55, 0.18, -0.6, g)
		box(0.45, 0.25, 0.35, C.woodD, -0.55, 0.455, -0.6, g)
		box(0.4, 0.3, 0.4, C.wood, 0.05, 0.18, -0.7, g)
		for (const [cx, cz] of [
			[-0.7, 0.6],
			[-0.3, 0.75],
			[0.7, 0.65],
		])
			eqMesh(
				eqGeo("cone", () => new T.ConeGeometry(0.08, 0.2, 8)),
				M("#f2a03a"),
				cx,
				0.13,
				cz,
				g,
			)
		eqKettle(g, 0.65, -0.6, "#d4463a")
		eqKettle(g, 0.82, -0.35, "#2c2f36", 1.2)
		wst(g, 0.15, 0.03, 0.1, Math.PI / 4, {
			pose: "coach",
			label: "running a personal training session",
			staff: true,
		})
		return g
	},
	staff_assistant_trainer() {
		const g = group()
		const cx = -0.45
		const cz = -0.45
		for (const y of [0.22, 0.62]) box(0.9, 0.04, 0.5, C.steel, cx, y, cz, g)
		for (const [a, b] of [
			[-1, -1],
			[1, -1],
			[-1, 1],
			[1, 1],
		]) {
			box(0.04, 0.7, 0.04, C.steelD, cx + a * 0.43, 0.41, cz + b * 0.23, g)
			cyl(0.05, 0.04, C.rubber, cx + a * 0.43, 0.05, cz + b * 0.23, g, 8, rz90)
		}
		;["#fff7ea", "#3aa89a", "#fff7ea", "#e8743b"].forEach((c, i) => {
			box(
				0.36,
				0.06,
				0.22,
				c,
				cx - 0.2 + (i % 2) * 0.4,
				0.27 + Math.floor(i / 2) * 0.06,
				cz,
				g,
			)
		})
		for (let i = 0; i < 4; i++)
			cyl(0.04, 0.16, "#8fd0ea", cx - 0.3 + i * 0.2, 0.72, cz, g, 8)
		cyl(0.035, 0.14, "#5fa35a", cx + 0.3, 0.71, cz + 0.15, g, 8)
		wst(g, 0.35, 0, 0.2, Math.PI / 4, {
			pose: "coach",
			prop: "tablet",
			label: "helping out on the floor",
			staff: true,
		})
		return g
	},
	// A compact office nook for the lobby's back corner (1.5 x 1.5): the
	// manager's desk, a filing cabinet and a goals board. Kept for Alex.
	staff_manager_office() {
		const g = group()
		eqRug(1.4, 1.4, "#cdd6e4", 0, 0, g)
		eqDesk(g, 1.0, C.wood, C.woodD, -0.05, 0.12)
		eqPic(
			0.62,
			0.14,
			eqSign("MANAGER", "#4a78c8", "#fff7ea", 256, 58),
			-0.05,
			0.42,
			0.382,
			g,
		)
		box(0.34, 0.24, 0.03, C.screen, -0.25, 0.72, 0.0, g)
		box(0.05, 0.14, 0.05, C.steelD, -0.25, 0.63, 0.02, g)
		box(0.2, 0.02, 0.26, "#fff7ea", 0.2, 0.6, 0.12, g)
		box(0.2, 0.03, 0.26, "#c98b56", 0.2, 0.585, 0.12, g)
		cyl(0.04, 0.08, "#e8743b", 0.36, 0.63, 0.25, g, 10)
		eqChair(g, -0.05, -0.38, "#2c2f36", 0, true)
		// filing cabinet and a goals board against the wall
		box(0.36, 0.72, 0.4, "#9aa3b4", 0.5, 0.36, -0.42, g)
		for (const y of [0.2, 0.45, 0.66])
			box(0.2, 0.03, 0.02, C.steelD, 0.5, y, -0.215, g)
		const board = eqPic(
			0.7,
			0.46,
			canvasTex(
				192,
				128,
				(c, w, h) => {
					c.fillStyle = "#fff7ea"
					c.fillRect(0, 0, w, h)
					c.strokeStyle = "#3a2622"
					c.lineWidth = 6
					c.strokeRect(3, 3, w - 6, h - 6)
					c.fillStyle = "#3a2622"
					c.font = `800 22px ${DISPLAY_FONT}`
					c.textAlign = "left"
					c.fillText("GOALS", 14, 30)
					const bars = [0.45, 0.62, 0.8, 0.95]
					bars.forEach((k, i) => {
						c.fillStyle = ["#3aa89a", "#f2c14a", "#e8743b", "#4a78c8"][i]
						const bh = k * 70
						c.fillRect(20 + i * 40, h - 14 - bh, 26, bh)
					})
				},
				"goalsBoard",
			),
			-0.35,
			1.05,
			-0.6,
			g,
		)
		void board
		for (const sx of [-0.66, -0.04])
			box(0.04, 1.3, 0.04, C.steelD, sx, 0.65, -0.62, g)
		wst(g, -0.05, 0, -0.38, 0, {
			pose: "seated",
			work: true,
			label: "running the gym from the office",
			staff: true,
		})
		return g
	},
	// The owner's lounge suite: velvet sofa, a gold-trimmed desk and the
	// owner's (your) tall chair. Members drop by for the sofa.
	staff_ownership_suite() {
		const g = group()
		eqRug(1.9, 1.9, "#7a2e3f", 0, 0, g)
		eqRug(1.6, 1.6, "#a8434f", 0, 0, g, 0.01)
		// desk with gold trim
		box(1.25, 0.06, 0.55, "#4a2c22", 0, 0.58, -0.45, g)
		box(1.28, 0.03, 0.58, "#e8b83a", 0, 0.545, -0.45, g)
		for (const sx of [-0.55, 0.55])
			box(0.12, 0.54, 0.5, "#5a3426", sx, 0.27, -0.45, g)
		box(1.0, 0.32, 0.03, "#5a3426", 0, 0.37, -0.2, g)
		eqPic(
			0.5,
			0.13,
			eqSign("OWNER", "#e8b83a", "#4a2c22", 256, 64),
			0,
			0.4,
			-0.183,
			g,
		)
		// trophy and laptop on the desk
		cyl(0.06, 0.03, "#4a2c22", -0.4, 0.625, -0.5, g, 10)
		cyl(0.02, 0.1, "#e8b83a", -0.4, 0.68, -0.5, g, 6)
		cyl(0.06, 0.08, "#e8b83a", -0.4, 0.76, -0.5, g, 10)
		box(0.36, 0.02, 0.24, "#c8ccd4", 0.25, 0.62, -0.45, g)
		box(0.36, 0.22, 0.02, "#2c2f36", 0.25, 0.73, -0.57, g)
		eqChair(g, 0, -0.85, "#5a2a2a", 0, true)
		// velvet sofa facing the desk
		box(1.3, 0.2, 0.5, "#8a3a6a", 0, 0.2, 0.55, g)
		box(1.3, 0.1, 0.44, "#a04a7c", 0, 0.34, 0.53, g)
		box(1.34, 0.45, 0.14, "#8a3a6a", 0, 0.42, 0.82, g)
		for (const sx of [-0.66, 0.66])
			box(0.12, 0.3, 0.52, "#7a2e5a", sx, 0.3, 0.57, g)
		plant(-0.82, -0.82, 0.6, g)
		plant(0.82, 0.85, 0.5, g)
		wst(g, -0.3, 0.04, 0.5, Math.PI, {
			pose: "seated",
			label: "lounging in the owner's suite",
		})
		wst(g, 0.3, 0.04, 0.5, Math.PI, {
			pose: "seated",
			talk: true,
			label: "chatting in the owner's suite",
		})
		return g
	},
	staff_massage() {
		const g = group()
		eqRug(1.9, 1.9, "#d9c2a8", 0, 0, g)
		for (const [a, b] of [
			[-1, -1],
			[1, -1],
			[-1, 1],
			[1, 1],
		])
			box(0.06, 0.4, 0.06, C.woodD, 0.15 + a * 0.25, 0.2, b * 0.68, g)
		box(0.64, 0.1, 1.55, "#f3ead8", 0.15, 0.4, 0, g)
		box(0.66, 0.03, 0.6, "#fff7ea", 0.15, 0.46, -0.35, g)
		box(0.25, 0.6, 0.35, C.wood, 0.75, 0.3, -0.75, g)
		for (const y of [0.35, 0.55])
			box(0.2, 0.08, 0.28, "#fff7ea", 0.75, y + 0.08, -0.75, g)
		cyl(0.035, 0.12, "#9b6bc4", 0.7, 0.66, -0.7, g, 8)
		cyl(0.04, 0.06, "#fff1c8", 0.8, 0.63, -0.8, g, 8)
		cyl(0.15, 0.04, "#2c2f36", -0.7, 0.42, -0.7, g, 12)
		cyl(0.03, 0.4, C.steelD, -0.7, 0.2, -0.7, g, 6)
		wst(g, 0.15, 0.45, -0.05, 0, {
			pose: "lie",
			prone: true,
			label: "getting a massage",
		})
		wst(g, -0.45, 0.03, 0, Math.PI / 2, {
			type: "sit",
			stand: true,
			label: "giving a massage",
			staff: true,
		})
		return g
	},
	staff_nutrition() {
		const g = group()
		eqRug(1.9, 1.9, "#cfe3c4", 0, 0, g)
		box(2, 1.5, 0.08, "#f3ead8", 0, 0.75, -0.96, g)
		eqDesk(g, 1.2, C.cream, C.teal, 0, -0.1)
		eqMesh(
			sphGeo(0.13, 12, 8, Math.PI / 2, Math.PI / 2),
			M("#fff7ea"),
			0.35,
			0.72,
			-0.15,
			g,
		)
		;["#d4463a", "#f2c14a", "#5fa35a", "#f2a03a"].forEach((c, i) => {
			eqMesh(
				sphGeo(0.045, 8, 6),
				M(c),
				0.3 + (i % 2) * 0.08,
				0.64,
				-0.18 + Math.floor(i / 2) * 0.07,
				g,
			)
		})
		box(0.3, 0.02, 0.22, "#fff7ea", -0.3, 0.6, -0.05, g)
		eqPic(
			0.7,
			0.7,
			canvasTex(
				128,
				128,
				(c) => {
					c.fillStyle = "#fff7ea"
					c.fillRect(0, 0, 128, 128)
					;["#5fa35a", "#f2a03a", "#d4463a", "#f2c14a"].forEach((col, i) => {
						c.fillStyle = col
						c.beginPath()
						c.moveTo(64, 64)
						c.arc(64, 64, 48, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2)
						c.fill()
					})
					c.strokeStyle = "#3a2622"
					c.lineWidth = 4
					c.beginPath()
					c.arc(64, 64, 48, 0, 7)
					c.stroke()
				},
				"nutriChart",
			),
			0,
			1.1,
			-0.915,
			g,
		)
		eqChair(g, 0, -0.6, C.teal)
		eqChair(g, 0, 0.65, C.trim, Math.PI)
		plant(-0.75, -0.7, 0.7, g)
		wst(g, 0, 0, -0.6, 0, {
			pose: "seated",
			talk: true,
			label: "planning meals",
			staff: true,
		})
		return g
	},
	staff_physio() {
		const g = group()
		eqRug(1.9, 1.9, "#d6e6ea", 0, 0, g)
		box(0.5, 0.35, 1.3, "#2c2f36", 0.25, 0.18, 0, g)
		box(0.62, 0.1, 1.55, C.teal, 0.25, 0.4, 0, g)
		box(0.5, 0.06, 0.3, "#fff7ea", 0.25, 0.47, -0.6, g)
		for (const sx of [-0.35, 0.35])
			box(0.06, 1.8, 0.06, C.wood, -0.3 + sx, 0.9, -0.92, g)
		for (let i = 0; i < 9; i++)
			cyl(0.02, 0.7, C.wood, -0.3, 0.2 + i * 0.18, -0.92, g, 6, rz90)
		eqMesh(sphGeo(0.28, 14, 10), M("#9b6bc4"), -0.72, 0.28, 0.65, g)
		cyl(0.08, 0.45, C.trim, 0.65, 0.08, 0.8, g, 10, rz90)
		wst(g, 0.25, 0.45, 0.1, 0, {
			pose: "lie",
			legLift: true,
			label: "doing rehab exercises",
		})
		wst(g, -0.4, 0.03, 0.35, Math.PI / 2, {
			type: "sit",
			stand: true,
			label: "guiding a rehab session",
			staff: true,
		})
		return g
	},
}
