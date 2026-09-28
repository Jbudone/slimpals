// The Slim Kitchen (gym home): a juice kiosk on the pavement to the right of
// the entrance (Layout Lab's buildKitchen). One batched body, a sign, a menu
// board redrawn when the menu changes and a cup per item on the counter.
// Everything goes through the gym's asset cache (freed on dispose).
import * as T from "three"
import { KITCHEN_MENU } from "../../../../shared/gym3d/economy"
import { PW } from "../../../../shared/gym3d/rooms"
import {
	batchMesh,
	canvasTex,
	cylGeo,
	DISPLAY_FONT,
	fitText,
	type Part,
	pBox,
	pGeo,
	releaseMesh,
	sphGeo,
	texPlane,
} from "../engine/helpers"
import type { GymWorld } from "./world"

const ITEM_COLOR: Record<string, string> = {
	green: "#7ac943",
	protein: "#c98b56",
	acai: "#7a3a8a",
	salad: "#4f9a3a",
}

export class Kitchen {
	readonly root = new T.Group()
	readonly x: number
	readonly z: number
	/** Invisible pick proxy (a tap opens the kitchen sheet). */
	readonly hit: T.Mesh
	/** Where customers stand. */
	readonly front: { x: number; z: number }
	private cups: T.Mesh | null = null
	private board: HTMLCanvasElement
	private boardTex: T.CanvasTexture
	private menu = ""
	private bounceT = 0

	constructor(private world: GymWorld) {
		this.x = world.lobby.x0 + PW + 2.2
		this.z = world.frontZ + 1.0
		this.front = { x: this.x, z: this.z + 1.3 }
		const a = world.ctx.assets
		this.root.position.set(this.x, 0, this.z)
		world.scene.add(this.root)

		const p: Part[] = []
		const GREEN = "#3f7c44"
		const CREAM = "#fff1dc"
		// cabinet, counter, back wall, posts, roof
		pBox(p, 2.4, 1.0, 1.0, GREEN, 0, 0.5, 0)
		pBox(p, 2.4, 0.18, 0.06, "#2f6034", 0, 0.12, 0.52)
		pBox(p, 2.64, 0.08, 1.24, CREAM, 0, 1.04, 0.06)
		pBox(p, 2.4, 1.3, 0.12, CREAM, 0, 1.7, -0.5)
		for (const sx of [-1.15, 1.15]) pBox(p, 0.1, 1.3, 0.1, GREEN, sx, 1.7, 0.5)
		pBox(p, 2.7, 0.12, 1.34, GREEN, 0, 2.38, 0.02)
		// striped awning over the counter
		for (let i = 0; i < 6; i++)
			pBox(
				p,
				0.46,
				0.05,
				0.72,
				i % 2 ? "#ffffff" : "#62b83f",
				-1.15 + 0.46 * i,
				2.28,
				0.78,
				0,
				0.42,
			)
		// two stools and a crate of fruit
		for (const sx of [-0.7, 0.55]) {
			pGeo(p, cylGeo(0.05, 0.62, 6), "#4a4050", sx, 0.31, 1.0)
			pGeo(p, cylGeo(0.2, 0.08, 10), "#e8743b", sx, 0.64, 1.0)
		}
		pBox(p, 0.6, 0.32, 0.44, "#c98b56", 1.62, 0.16, 0.55)
		for (let i = 0; i < 5; i++)
			pGeo(
				p,
				sphGeo(0.09, 6, 4),
				["#e8743b", "#f2c14a", "#d4463a", "#7ac943", "#f2c14a"][i],
				1.44 + (i % 3) * 0.16,
				0.36,
				0.46 + Math.floor(i / 3) * 0.16,
			)
		batchMesh(p, this.root)

		const sign = canvasTex(
			512,
			112,
			(g, w, h) => {
				g.fillStyle = "#fff7ea"
				g.beginPath()
				g.roundRect?.(4, 4, w - 8, h - 8, 26)
				g.fill()
				g.lineWidth = 8
				g.strokeStyle = "#3f7c44"
				g.stroke()
				g.fillStyle = "#3f7c44"
				g.textAlign = "center"
				g.textBaseline = "middle"
				fitText(g, "SLIM KITCHEN", w * 0.82, "800", DISPLAY_FONT)
				g.fillText("SLIM KITCHEN", w / 2, h / 2 + 4)
			},
			"kitchenSign",
		)
		texPlane(2.2, 0.48, sign, 0, 2.72, 0.66, 0, this.root, true)

		this.board = document.createElement("canvas")
		this.board.width = 256
		this.board.height = 160
		this.boardTex = a.track(new T.CanvasTexture(this.board))
		texPlane(1.2, 0.75, this.boardTex, 0.1, 1.72, -0.43, 0, this.root, true)

		this.hit = new T.Mesh(
			a.geo("kitchenHit", () => new T.BoxGeometry(2.9, 3, 1.8)),
			a.HIT,
		)
		this.hit.position.set(0, 1.5, 0.2)
		this.hit.userData.pick = { kind: "kitchen" }
		this.root.add(this.hit)
		this.root.updateMatrixWorld(true)
	}

	/** Footprint for the walk grid. */
	blockers(): { x: number; z: number; s: number }[] {
		return [
			{ x: this.x - 0.6, z: this.z, s: 1.4 },
			{ x: this.x + 0.6, z: this.z, s: 1.4 },
		]
	}

	/** Anchor of the kitchen's coin bubble. */
	anchor(): T.Vector3 {
		return new T.Vector3(this.x, 3.25, this.z)
	}

	/** Redraws the menu board and the cups for the items that are on. */
	setMenu(on: readonly string[]): void {
		const key = on.join(",")
		if (key === this.menu) return
		this.menu = key
		const g = this.board.getContext("2d")
		if (g) {
			const w = this.board.width
			const h = this.board.height
			g.fillStyle = "#2b3a30"
			g.fillRect(0, 0, w, h)
			g.strokeStyle = "#7ac943"
			g.lineWidth = 6
			g.strokeRect(3, 3, w - 6, h - 6)
			g.fillStyle = "#d9f5c8"
			g.font = '800 22px "Arial Black", sans-serif'
			g.textAlign = "center"
			g.fillText("MENU", w / 2, 30)
			g.textAlign = "left"
			g.font = "700 17px Arial, sans-serif"
			KITCHEN_MENU.forEach((m, i) => {
				const y = 58 + i * 25
				const lit = on.includes(m.key)
				g.fillStyle = lit ? (ITEM_COLOR[m.key] ?? "#7ac943") : "#556a5c"
				g.beginPath()
				g.arc(24, y - 6, 7, 0, 7)
				g.fill()
				g.fillStyle = lit ? "#fff7ea" : "#6f8676"
				g.fillText(lit ? m.name : "? ? ?", 40, y)
			})
		}
		this.boardTex.needsUpdate = true
		if (this.cups) releaseMesh(this.cups)
		const p: Part[] = []
		KITCHEN_MENU.filter((m) => on.includes(m.key)).forEach((m, i) => {
			const x = -0.95 + i * 0.42
			const z = 0.42
			const c = ITEM_COLOR[m.key] ?? "#7ac943"
			if (m.key === "acai" || m.key === "salad") {
				pGeo(
					p,
					cylGeo(0.14, 0.09, 10),
					m.key === "acai" ? c : "#f3e3cc",
					x,
					1.12,
					z,
				)
				pGeo(
					p,
					sphGeo(0.07, 6, 4),
					m.key === "acai" ? "#f2c14a" : c,
					x + 0.03,
					1.18,
					z,
				)
			} else {
				pGeo(p, cylGeo(0.07, 0.24, 8), c, x, 1.2, z)
				pBox(p, 0.02, 0.16, 0.02, "#ffffff", x + 0.03, 1.38, z, 0, 0, 0.3)
			}
		})
		this.cups = p.length ? batchMesh(p, this.root) : null
	}

	/** A little hop when tapped or when a sale lands. */
	bounce(): void {
		this.bounceT = 0.35
	}

	frame(dt: number): void {
		if (this.bounceT <= 0) return
		this.bounceT = Math.max(0, this.bounceT - dt)
		const k = this.bounceT / 0.35
		const s = 1 + Math.sin(k * Math.PI) * 0.06
		this.root.scale.set(s, 1 / s, s)
	}

	dispose(): void {
		this.root.removeFromParent()
		void this.world
	}
}
