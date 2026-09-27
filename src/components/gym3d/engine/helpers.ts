// Geometry / material helpers ported from the prototype. They build into the
// bound world's scene and cache shared resources in its AssetCache.
import * as T from "three"
import { ctx } from "../world/state"

/** Prototype palette. */
export const C = {
	wallIn: "#f4c9a0",
	wallTop: "#fff1e0",
	wallOut: "#c85a3c",
	trim: "#e8743b",
	floorA: "#f3e3cc",
	floorB: "#ead3b6",
	mat: "#3a3f4a",
	rubber: "#2c2f36",
	steel: "#b9bcc4",
	steelD: "#7d828d",
	pad: "#d4463a",
	teal: "#3aa89a",
	tealD: "#2a7f75",
	wood: "#c98b56",
	woodD: "#9a6238",
	leaf: "#5fa35a",
	leafD: "#3f7c44",
	pot: "#d97a4a",
	ground: "#e0907a",
	walk: "#f0b39c",
	road: "#6a5a63",
	cream: "#fff7ea",
	screen: "#2b3440",
	glow: "#7fe0d0",
} as const

// ── random numbers (seeded, so the same gym looks the same every visit) ────

export type Rng = () => number

export function mulberry32(seed: number): Rng {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export function hashString(s: string): number {
	let h = 2166136261
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	return h >>> 0
}

export function pick<X>(a: readonly X[], rng: Rng = ctx().rng): X {
	return a[Math.floor(rng() * a.length)]
}

// ── materials & geometry caches ──────────────────────────────────────────────

export function M(c: string): T.MeshStandardMaterial {
	return ctx().assets.M(c)
}

export function TM(c: string): T.MeshToonMaterial {
	return ctx().assets.TM(c)
}

export function eqGeo<G extends T.BufferGeometry>(key: string, mk: () => G): G {
	return ctx().assets.geo(key, mk)
}

export function eqMat<X extends T.Material>(key: string, mk: () => X): X {
	return ctx().assets.mat(key, mk)
}

export function boxGeo(w: number, h: number, d: number): T.BoxGeometry {
	return eqGeo(`b${w}_${h}_${d}`, () => new T.BoxGeometry(w, h, d))
}

export function cylGeo(r: number, h: number, seg: number): T.CylinderGeometry {
	return eqGeo(`c${r}_${h}_${seg}`, () => new T.CylinderGeometry(r, r, h, seg))
}

export function sphGeo(
	r: number,
	ws = 16,
	hs = 12,
	ts = 0,
	tl = Math.PI,
): T.SphereGeometry {
	return eqGeo(
		`s${r}_${ws}_${hs}_${ts}_${tl}`,
		() => new T.SphereGeometry(r, ws, hs, 0, Math.PI * 2, ts, tl),
	)
}

export function capsuleGeo(r: number, len: number, seg = 6): T.LatheGeometry {
	return eqGeo(`cap${r}_${len}`, () => {
		const pts: T.Vector2[] = []
		for (let i = 0; i <= seg; i++) {
			const a = -Math.PI / 2 + (i / seg) * (Math.PI / 2)
			pts.push(
				new T.Vector2(Math.cos(a) * r + 0.0001, Math.sin(a) * r - len / 2),
			)
		}
		for (let i = 0; i <= seg; i++) {
			const a = (i / seg) * (Math.PI / 2)
			pts.push(
				new T.Vector2(Math.cos(a) * r + 0.0001, Math.sin(a) * r + len / 2),
			)
		}
		return new T.LatheGeometry(pts, 10)
	})
}

export function latheGeo(
	key: string,
	prof: readonly (readonly [number, number])[],
): T.LatheGeometry {
	return eqGeo(
		`l${key}`,
		() =>
			new T.LatheGeometry(
				prof.map(([x, y]) => new T.Vector2(x, y)),
				14,
			),
	)
}

// ── scene-building helpers ──────────────────────────────────────────────────

export type BoxOpt = { noCast?: boolean }

export function group(x = 0, y = 0, z = 0, parent?: T.Object3D): T.Group {
	const g = new T.Group()
	g.position.set(x, y, z)
	;(parent ?? ctx().scene).add(g)
	return g
}

export function box(
	w: number,
	h: number,
	d: number,
	c: string,
	x: number,
	y: number,
	z: number,
	parent?: T.Object3D,
	opt?: BoxOpt,
): T.Mesh {
	const m = new T.Mesh(boxGeo(w, h, d), M(c))
	m.position.set(x, y, z)
	m.castShadow = !opt?.noCast
	m.receiveShadow = true
	;(parent ?? ctx().scene).add(m)
	return m
}

export function cyl(
	r: number,
	h: number,
	c: string,
	x: number,
	y: number,
	z: number,
	parent?: T.Object3D,
	seg = 12,
	rot?: readonly [number, number, number],
): T.Mesh {
	const m = new T.Mesh(cylGeo(r, h, seg), M(c))
	m.position.set(x, y, z)
	if (rot) m.rotation.set(rot[0], rot[1], rot[2])
	m.castShadow = true
	m.receiveShadow = true
	;(parent ?? ctx().scene).add(m)
	return m
}

/** A canvas texture drawn once. `key` caches it for the gym's lifetime;
 * without a key the texture is still tracked for disposal. */
export function canvasTex(
	w: number,
	h: number,
	draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
	key?: string,
): T.CanvasTexture {
	const mk = () => {
		const c = document.createElement("canvas")
		c.width = w
		c.height = h
		const g = c.getContext("2d")
		if (g) draw(g, w, h)
		const t = new T.CanvasTexture(c)
		t.anisotropy = 4
		return t
	}
	const a = ctx().assets
	return key ? a.tex(key, mk) : a.track(mk())
}

export function texPlane(
	w: number,
	h: number,
	tex: T.Texture,
	x: number,
	y: number,
	z: number,
	ry: number,
	parent: T.Object3D,
	basic = false,
): T.Mesh {
	const a = ctx().assets
	const m = new T.Mesh(
		a.track(new T.PlaneGeometry(w, h)),
		a.track(
			basic
				? new T.MeshBasicMaterial({ map: tex })
				: new T.MeshStandardMaterial({ map: tex, roughness: 1 }),
		),
	)
	m.position.set(x, y, z)
	m.rotation.y = ry
	m.receiveShadow = true
	parent.add(m)
	return m
}

// ── static batching: many parts -> one vertex-coloured mesh ──────────────────

export type Part = {
	geo: T.BufferGeometry
	m: T.Matrix4
	c: T.Color
	ol?: boolean
	bone?: number
}

const _n3 = new T.Matrix3()
const _mv = new T.Vector3()

export function colOf(c: string | T.Color): T.Color {
	return typeof c === "string" ? new T.Color(c) : c.clone()
}

/** parts -> one indexed BufferGeometry (position, colour, [normal], [skin]);
 * `ol` parts also land in geometry.userData.outIndex for an outline mesh. */
export function mergeParts(
	parts: readonly Part[],
	withNormals: boolean,
	wantOut = false,
): T.BufferGeometry {
	let nv = 0
	let ni = 0
	let no = 0
	for (const p of parts) {
		const g = p.geo
		const n = g.attributes.position.count
		const k = g.index ? g.index.count : n
		nv += n
		ni += k
		if (p.ol) no += k
	}
	const pos = new Float32Array(nv * 3)
	const col = new Float32Array(nv * 3)
	const nor = withNormals ? new Float32Array(nv * 3) : null
	const skinned = parts.length > 0 && parts[0].bone != null
	const sk = skinned ? new Float32Array(nv * 4) : null
	const sw = skinned ? new Float32Array(nv * 4) : null
	const big = nv > 65000
	const idx = big ? new Uint32Array(ni) : new Uint16Array(ni)
	const oidx =
		wantOut && no ? (big ? new Uint32Array(no) : new Uint16Array(no)) : null
	let vo = 0
	let io = 0
	let oo = 0
	for (const p of parts) {
		const g = p.geo
		const P = g.attributes.position.array
		const N = g.attributes.normal?.array
		const e = p.m.elements
		const c = p.c
		const n = g.attributes.position.count
		if (nor) _n3.getNormalMatrix(p.m)
		for (let i = 0; i < n; i++) {
			const x = P[i * 3]
			const y = P[i * 3 + 1]
			const z = P[i * 3 + 2]
			const k = (vo + i) * 3
			pos[k] = e[0] * x + e[4] * y + e[8] * z + e[12]
			pos[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
			pos[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
			col[k] = c.r
			col[k + 1] = c.g
			col[k + 2] = c.b
			if (nor && N) {
				_mv
					.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2])
					.applyMatrix3(_n3)
					.normalize()
				nor[k] = _mv.x
				nor[k + 1] = _mv.y
				nor[k + 2] = _mv.z
			}
		}
		const s0 = io
		const flip = p.m.determinant() < 0
		if (g.index) {
			const I = g.index.array
			for (let i = 0; i < I.length; i++) idx[io++] = I[i] + vo
		} else for (let i = 0; i < n; i++) idx[io++] = vo + i
		if (flip)
			for (let t = s0; t < io; t += 3) {
				const a = idx[t + 1]
				idx[t + 1] = idx[t + 2]
				idx[t + 2] = a
			}
		if (oidx && p.ol) for (let t = s0; t < io; t++) oidx[oo++] = idx[t]
		if (sk && sw)
			for (let i = 0; i < n; i++) {
				sk[(vo + i) * 4] = p.bone ?? 0
				sw[(vo + i) * 4] = 1
			}
		vo += n
	}
	const G = new T.BufferGeometry()
	if (sk && sw) {
		G.setAttribute("skinIndex", new T.BufferAttribute(sk, 4))
		G.setAttribute("skinWeight", new T.BufferAttribute(sw, 4))
	}
	G.setAttribute("position", new T.BufferAttribute(pos, 3))
	G.setAttribute("color", new T.BufferAttribute(col, 3))
	if (nor) G.setAttribute("normal", new T.BufferAttribute(nor, 3))
	G.setIndex(new T.BufferAttribute(idx, 1))
	G.computeBoundingSphere()
	if (oidx) G.userData.outIndex = new T.BufferAttribute(oidx, 1)
	return G
}

const _tq = new T.Quaternion()
const _te = new T.Euler()
const _ts = new T.Vector3()
const _tp = new T.Vector3()

export function pBox(
	parts: Part[],
	w: number,
	h: number,
	d: number,
	c: string,
	x: number,
	y: number,
	z: number,
	ry = 0,
	rx = 0,
	rz = 0,
): void {
	_te.set(rx, ry, rz)
	parts.push({
		geo: boxGeo(w, h, d),
		m: new T.Matrix4().compose(
			_tp.set(x, y, z),
			_tq.setFromEuler(_te),
			_ts.set(1, 1, 1),
		),
		c: colOf(c),
	})
}

export function pGeo(
	parts: Part[],
	geo: T.BufferGeometry,
	c: string,
	x: number,
	y: number,
	z: number,
	rx = 0,
	ry = 0,
	rz = 0,
	sx = 1,
	sy?: number,
	sz?: number,
): void {
	_te.set(rx, ry, rz)
	parts.push({
		geo,
		m: new T.Matrix4().compose(
			_tp.set(x, y, z),
			_tq.setFromEuler(_te),
			_ts.set(sx, sy ?? sx, sz ?? sx),
		),
		c: colOf(c),
	})
}

/** Merges parts into one mesh with the shared vertex-colour material. The
 * merged geometry is tracked; call releaseMesh() to free it early. */
export function batchMesh(
	parts: readonly Part[],
	parent?: T.Object3D,
	o?: { noCast?: boolean; static?: boolean },
): T.Mesh {
	const a = ctx().assets
	const m = new T.Mesh(a.track(mergeParts(parts, false)), a.MV)
	m.castShadow = !o?.noCast
	m.receiveShadow = true
	if (o?.static !== false) {
		m.matrixAutoUpdate = false
		m.updateMatrix()
	}
	;(parent ?? ctx().scene).add(m)
	return m
}

/** Removes a mesh and frees its (tracked, unshared) geometry. */
export function releaseMesh(m: T.Mesh): void {
	m.removeFromParent()
	ctx().assets.release(m.geometry)
}

// ── canvas drawing helpers ──────────────────────────────────────────────────

export function shade(hex: string, k: number): string {
	const c = new T.Color(hex)
	c.offsetHSL(0, 0, k)
	return `#${c.getHexString()}`
}

export function isLight(hex: string): boolean {
	const c = new T.Color(hex)
	return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b > 0.55
}

/** Picks a font size that fits `txt` into width `w`. No remote fonts: the
 * families fall back to system faces. */
export function fitText(
	x: CanvasRenderingContext2D,
	txt: string,
	w: number,
	weight: string,
	family: string,
): void {
	let s = 110
	do {
		x.font = `${weight} ${s}px ${family}`
		s -= 4
	} while (x.measureText(txt).width > w && s > 10)
}

export const DISPLAY_FONT = '"Arial Black", "Arial Rounded MT Bold", sans-serif'

export function star(
	x: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	R: number,
	r: number,
): void {
	x.beginPath()
	for (let i = 0; i < 10; i++) {
		const a = -Math.PI / 2 + (i * Math.PI) / 5
		const k = i % 2 ? r : R
		x.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k)
	}
	x.closePath()
}

export function heart(
	x: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	s: number,
): void {
	x.beginPath()
	x.moveTo(cx, cy + s * 0.9)
	x.bezierCurveTo(
		cx - s * 1.6,
		cy - s * 0.1,
		cx - s * 0.8,
		cy - s * 1.3,
		cx,
		cy - s * 0.45,
	)
	x.bezierCurveTo(
		cx + s * 0.8,
		cy - s * 1.3,
		cx + s * 1.6,
		cy - s * 0.1,
		cx,
		cy + s * 0.9,
	)
	x.closePath()
}

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
export const clamp01 = (k: number): number => Math.max(0, Math.min(1, k))

export function angLerp(a: number, b: number, k: number): number {
	const d =
		((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
		Math.PI
	return a + d * k
}
