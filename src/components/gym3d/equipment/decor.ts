// Small free-standing decor (half-unit footprint). plant / palm / poster /
// neon come from the build lab; mirror, studio_mirror and trophy are the
// free-standing takes on the catalog's wall decor, which has no wall spot in
// slice 1's rooms.
import * as T from "three"
import {
	box,
	C,
	canvasTex,
	cyl,
	DISPLAY_FONT,
	eqGeo,
	eqMat,
	fitText,
	group,
	pick,
	star,
} from "../engine/helpers"
import { eqCup, GOLD, glowM, MIRROR, plant } from "./builders"

function pic(
	w: number,
	h: number,
	tex: T.Texture,
	x: number,
	y: number,
	z: number,
	g: T.Object3D,
	basic: boolean,
	key: string,
): T.Mesh {
	const m = new T.Mesh(
		eqGeo(`plane${w}_${h}`, () => new T.PlaneGeometry(w, h)),
		eqMat(`decorpic_${key}`, () =>
			basic
				? new T.MeshBasicMaterial({ map: tex, transparent: true })
				: new T.MeshStandardMaterial({ map: tex, roughness: 1 }),
		),
	)
	m.position.set(x, y, z)
	g.add(m)
	return m
}

function mirrorGlint(g: T.Object3D, x: number, y: number, z: number): void {
	for (const [o, dy, h] of [
		[0, 0, 0.36],
		[0.07, 0.12, 0.2],
	] as const) {
		const s = box(0.02, h, 0.004, "#ffffff", x - 0.06 + o, y + dy, z, g, {
			noCast: true,
		})
		s.rotation.z = -0.6
	}
}

export const DECOR: Readonly<Record<string, () => T.Group>> = {
	plant: () => plant(0, 0, 1.15),
	palm() {
		const g = group()
		cyl(0.2, 0.42, "#fff7ea", 0, 0.21, 0, g, 10)
		cyl(0.21, 0.05, C.trim, 0, 0.4, 0, g, 10)
		for (let i = 0; i < 8; i++) {
			const a = (i / 8) * Math.PI * 2
			const l = box(
				0.09,
				0.62 + (i % 3) * 0.15,
				0.03,
				i % 2 ? C.leaf : C.leafD,
				Math.cos(a) * 0.08,
				0.72 + (i % 3) * 0.07,
				Math.sin(a) * 0.08,
				g,
			)
			l.rotation.set(Math.sin(a) * 0.45, a, -Math.cos(a) * 0.45)
		}
		return g
	},
	poster() {
		const g = group()
		for (const sx of [-0.28, 0.28])
			box(0.05, 1.25, 0.05, C.woodD, sx, 0.62, -0.05, g)
		box(0.3, 0.04, 0.36, C.woodD, 0, 0.02, 0, g)
		const col = pick(["#e8743b", "#3aa89a", "#9b6bc4", "#d4463a"])
		const word = pick(["PUSH", "LIFT", "FLOW", "GRIT"])
		const key = `poster_${col}_${word}`
		const tex = canvasTex(
			128,
			160,
			(c, w, h) => {
				c.fillStyle = col
				c.fillRect(0, 0, w, h)
				c.fillStyle = "#fff7ea"
				c.fillRect(8, 8, w - 16, h - 16)
				c.fillStyle = col
				c.fillRect(14, 14, w - 28, h - 60)
				c.fillStyle = "#fff7ea"
				star(c, 64, 58, 28, 12)
				c.fill()
				c.fillStyle = "#3a2622"
				c.textAlign = "center"
				fitText(c, word, w - 28, "bold", "sans-serif")
				c.fillText(word, w / 2, h - 22)
			},
			key,
		)
		box(0.66, 0.84, 0.04, C.cream, 0, 1.02, 0, g)
		pic(0.56, 0.72, tex, 0, 1.02, 0.025, g, false, key)
		return g
	},
	neon() {
		const g = group()
		box(0.05, 0.9, 0.05, "#2a2230", 0, 0.45, 0, g)
		box(0.36, 0.04, 0.3, "#2a2230", 0, 0.02, 0, g)
		box(0.84, 0.62, 0.05, "#2a2230", 0, 1.18, 0, g)
		const word = pick(["GO!", "YES", "PUMP"])
		const colA = pick(["#ff6fae", "#5ff0dc", "#ffd35a"])
		const key = `neon_${word}_${colA}`
		const tex = canvasTex(
			256,
			192,
			(c, w, h) => {
				c.textAlign = "center"
				c.textBaseline = "middle"
				fitText(c, word, w * 0.78, "800", DISPLAY_FONT)
				c.shadowColor = colA
				c.shadowBlur = 22
				c.strokeStyle = colA
				c.lineWidth = 10
				c.strokeText(word, w / 2, h / 2)
				c.shadowBlur = 6
				c.lineWidth = 3
				c.strokeStyle = "#fff"
				c.strokeText(word, w / 2, h / 2)
			},
			key,
		)
		pic(0.8, 0.58, tex, 0, 1.18, 0.03, g, true, key)
		const pool = new T.Mesh(
			eqGeo("neonpoolS", () => new T.CircleGeometry(0.4, 20)),
			glowM(colA, 0.14, true),
		)
		pool.rotation.x = -Math.PI / 2
		pool.position.set(0, 0.01, 0.2)
		g.add(pool)
		return g
	},
	mirror() {
		const g = group()
		box(0.72, 1.62, 0.06, C.cream, 0, 0.87, -0.05, g)
		const m = new T.Mesh(
			eqGeo("standmirror", () => new T.BoxGeometry(0.6, 1.46, 0.02)),
			MIRROR(),
		)
		m.position.set(0, 0.88, -0.01)
		g.add(m)
		mirrorGlint(g, 0, 1.0, 0.002)
		for (const sx of [-0.3, 0.3])
			box(0.06, 0.05, 0.36, C.steelD, sx, 0.025, 0, g)
		return g
	},
	studio_mirror() {
		const g = group()
		box(0.8, 1.7, 0.06, "#efe3d6", 0, 0.9, -0.1, g)
		const m = new T.Mesh(
			eqGeo("studiomirror", () => new T.BoxGeometry(0.68, 1.2, 0.02)),
			MIRROR(),
		)
		m.position.set(0, 1.05, -0.06)
		g.add(m)
		mirrorGlint(g, 0, 1.1, -0.048)
		// ballet barre in front
		cyl(0.022, 0.8, C.wood, 0, 0.72, 0.12, g, 8, [0, 0, Math.PI / 2])
		for (const sx of [-0.34, 0.34])
			box(0.03, 0.72, 0.03, C.steel, sx, 0.36, 0.12, g)
		return g
	},
	trophy() {
		const g = group()
		box(0.45, 0.55, 0.45, C.cream, 0, 0.275, 0, g)
		box(0.47, 0.04, 0.47, C.trim, 0, 0.56, 0, g)
		box(0.3, 0.08, 0.02, "#2c2f36", 0, 0.34, 0.226, g, { noCast: true })
		eqCup(g, 0, 0.58, 0, 1.9, GOLD())
		return g
	},
	// Halloween cosmetics (the monthly track)
	lantern() {
		const g = group()
		cyl(0.22, 0.3, "#e8743b", 0, 0.2, 0, g, 12)
		cyl(0.16, 0.34, "#d9622b", 0, 0.21, 0, g, 12)
		cyl(0.03, 0.1, "#3f7c44", 0.02, 0.43, 0, g, 6)
		for (const [x, y, w, h] of [
			[-0.08, 0.26, 0.07, 0.07],
			[0.08, 0.26, 0.07, 0.07],
			[0, 0.15, 0.2, 0.05],
		] as const) {
			const m = new T.Mesh(
				eqGeo(`lantern${w}_${h}`, () => new T.BoxGeometry(w, h, 0.03)),
				glowM("#ffd35a"),
			)
			m.position.set(x, y, 0.21)
			g.add(m)
		}
		return g
	},
	cobwebs() {
		const g = group()
		box(0.5, 0.04, 0.12, C.rubber, 0, 0.02, 0, g)
		for (const x of [-0.24, 0.24])
			box(0.03, 0.62, 0.03, C.rubber, x, 0.33, 0, g)
		const web = (w: number, h: number, x: number, y: number, rz = 0) => {
			const m = new T.Mesh(
				eqGeo(`web${w}_${h}`, () => new T.BoxGeometry(w, h, 0.02)),
				glowM("#d9d2ff"),
			)
			m.position.set(x, y, 0)
			m.rotation.z = rz
			g.add(m)
		}
		web(0.46, 0.02, 0, 0.2)
		web(0.46, 0.02, 0, 0.4)
		web(0.46, 0.02, 0, 0.58)
		web(0.02, 0.56, 0, 0.33)
		web(0.02, 0.6, 0, 0.33, 0.78)
		web(0.02, 0.6, 0, 0.33, -0.78)
		return g
	},
	// Gratitude (November) cosmetics
	basket() {
		const g = group()
		cyl(0.2, 0.2, "#b9824f", 0, 0.1, 0, g, 10)
		cyl(0.17, 0.04, "#8a5a30", 0, 0.21, 0, g, 10)
		for (const [x, z, c] of [
			[-0.07, 0.03, "#e8743b"],
			[0.07, -0.02, "#d4463a"],
			[0, 0.08, "#f2c14a"],
			[0.02, -0.06, "#8a3a2a"],
		] as const) {
			const m = new T.Mesh(
				eqGeo("basketfruit", () => new T.SphereGeometry(0.075, 8, 6)),
				eqMat(
					`basketfruit_${c}`,
					() => new T.MeshStandardMaterial({ color: c }),
				),
			)
			m.position.set(x, 0.27, z)
			g.add(m)
		}
		return g
	},
	hay() {
		const g = group()
		box(0.46, 0.26, 0.3, "#d9b04a", 0, 0.13, 0, g)
		for (const x of [-0.12, 0.12])
			box(0.03, 0.27, 0.31, "#8a5a30", x, 0.135, 0, g)
		box(0.4, 0.04, 0.2, "#e6c262", 0, 0.28, 0.02, g, { noCast: true })
		return g
	},
	// Winter cosmetics (December)
	tree() {
		const g = group()
		cyl(0.05, 0.12, "#6b4a2a", 0, 0.06, 0, g, 6)
		for (const [r, h, y] of [
			[0.26, 0.28, 0.24],
			[0.2, 0.26, 0.46],
			[0.14, 0.24, 0.66],
		] as const) {
			const m = new T.Mesh(
				eqGeo(`treecone${r}`, () => new T.ConeGeometry(r, h, 10)),
				eqMat(
					"treegreen",
					() => new T.MeshStandardMaterial({ color: "#2f7a3e" }),
				),
			)
			m.position.set(0, y, 0)
			g.add(m)
		}
		for (const [x, y, z, c] of [
			[0.12, 0.3, 0.14, "#ffd35a"],
			[-0.14, 0.34, 0.08, "#ff6a5a"],
			[0.05, 0.52, 0.12, "#7ad0ff"],
			[-0.08, 0.6, -0.06, "#ffd35a"],
			[0.08, 0.72, 0.02, "#ff6a5a"],
		] as const) {
			const m = new T.Mesh(
				eqGeo("treelight", () => new T.SphereGeometry(0.03, 6, 5)),
				glowM(c),
			)
			m.position.set(x, y, z)
			g.add(m)
		}
		const star = new T.Mesh(
			eqGeo("treestar", () => new T.OctahedronGeometry(0.05)),
			glowM("#ffe27a"),
		)
		star.position.set(0, 0.82, 0)
		g.add(star)
		return g
	},
	lights() {
		const g = group()
		box(0.5, 0.04, 0.12, C.rubber, 0, 0.02, 0, g)
		for (const x of [-0.24, 0.24])
			box(0.03, 0.62, 0.03, C.rubber, x, 0.33, 0, g)
		const cols = ["#ff6a5a", "#ffd35a", "#7ad0ff", "#8ae07a"]
		for (let i = 0; i < 8; i++) {
			const x = -0.22 + (i / 7) * 0.44
			const y = 0.58 - Math.sin((i / 7) * Math.PI) * 0.1
			const m = new T.Mesh(
				eqGeo("stringlight", () => new T.SphereGeometry(0.03, 6, 5)),
				glowM(cols[i % cols.length]),
			)
			m.position.set(x, y, 0)
			g.add(m)
		}
		return g
	},
}
