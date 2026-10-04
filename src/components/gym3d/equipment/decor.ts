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
	// Challenge rewards (finishing a curated monthly challenge)
	arcade() {
		const g = group()
		box(0.5, 1.0, 0.4, "#4a2f7a", 0, 0.5, 0, g)
		box(0.5, 0.12, 0.46, "#3a2360", 0, 1.06, 0.03, g)
		box(0.4, 0.26, 0.03, "#1d2230", 0, 0.78, 0.2, g, { noCast: true })
		const screen = new T.Mesh(
			eqGeo("arcadescreen", () => new T.PlaneGeometry(0.34, 0.2)),
			glowM("#7af0c8"),
		)
		screen.position.set(0, 0.78, 0.216)
		g.add(screen)
		box(0.46, 0.06, 0.2, "#5a3b94", 0, 0.5, 0.26, g)
		cyl(0.015, 0.1, "#2c2f36", -0.1, 0.58, 0.28, g, 6)
		const ball = new T.Mesh(
			eqGeo("arcadeball", () => new T.SphereGeometry(0.035, 8, 6)),
			eqMat(
				"arcadeball",
				() => new T.MeshStandardMaterial({ color: "#ff5a6a" }),
			),
		)
		ball.position.set(-0.1, 0.65, 0.28)
		g.add(ball)
		for (const [x, c] of [
			[0.04, "#ffd35a"],
			[0.14, "#7ad0ff"],
		] as const)
			box(0.06, 0.03, 0.06, c, x, 0.54, 0.28, g, { noCast: true })
		return g
	},
	mural() {
		const g = group()
		box(0.7, 0.04, 0.2, C.rubber, 0, 0.02, 0, g)
		box(0.66, 0.9, 0.04, "#2a2f45", 0, 0.5, 0, g)
		const bands: [string, number, number][] = [
			["#ffb347", 0.16, 0.2],
			["#ff8a5a", 0.5, 0.2],
			["#f06a7a", 0.68, 0.16],
			["#8a5ad0", 0.82, 0.14],
		]
		for (const [c, y, h] of bands) {
			const m = new T.Mesh(
				eqGeo(`muralband${h}`, () => new T.PlaneGeometry(0.6, h)),
				glowM(c),
			)
			m.position.set(0, y + 0.1, 0.025)
			g.add(m)
		}
		const sun = new T.Mesh(
			eqGeo("muralsun", () => new T.CircleGeometry(0.1, 14)),
			glowM("#fff1a8"),
		)
		sun.position.set(0, 0.42, 0.03)
		g.add(sun)
		return g
	},
	planter() {
		const g = group()
		box(0.6, 0.22, 0.26, "#8a5a30", 0, 0.11, 0, g)
		box(0.56, 0.03, 0.22, "#3a2a1a", 0, 0.235, 0, g, { noCast: true })
		for (const [x, c, h] of [
			[-0.18, "#3f9a44", 0.22],
			[0, "#62b83f", 0.3],
			[0.18, "#2f7a3e", 0.2],
		] as const) {
			const m = new T.Mesh(
				eqGeo(`herb${h}`, () => new T.ConeGeometry(0.08, h, 6)),
				eqMat(`herb_${c}`, () => new T.MeshStandardMaterial({ color: c })),
			)
			m.position.set(x, 0.25 + h / 2, 0)
			g.add(m)
		}
		return g
	},
}
