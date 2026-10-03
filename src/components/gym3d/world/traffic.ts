// Traffic on the road across the street (#131): a few blocky cars drive
// along it in both lanes and wrap around at the edges. One batched mesh per
// car (freed on dispose); nothing is built with reduced motion.
import * as T from "three"
import { PW } from "../../../../shared/gym3d/rooms"
import {
	batchMesh,
	cylGeo,
	type Part,
	pBox,
	pGeo,
	releaseMesh,
} from "../engine/helpers"
import { APRON, BUS_STOP_DX } from "./paths"
import type { GymWorld } from "./world"

const COLORS = [
	"#e8743b",
	"#4a78c8",
	"#d4463a",
	"#f2c14a",
	"#5fa35a",
	"#9b6bc4",
]

type Car = {
	mesh: T.Mesh
	dir: 1 | -1
	speed: number
	// the bus waits at the stop for a while on each pass
	stopX?: number
	wait?: number
}

export class Traffic {
	readonly root = new T.Group()
	private cars: Car[] = []
	private x0: number
	private x1: number

	constructor(world: GymWorld, calm: boolean) {
		this.x0 = -24
		this.x1 = Math.max(world.cols, 5) * PW + 24
		if (calm) return
		world.scene.add(this.root)
		const roadZ = world.frontZ + APRON + 3.3
		for (let i = 0; i < 4; i++) {
			const dir: 1 | -1 = i % 2 ? -1 : 1
			const p: Part[] = []
			const body = COLORS[i % COLORS.length]
			pBox(p, 1.9, 0.42, 0.92, body, 0, 0.42, 0)
			pBox(p, 1.0, 0.36, 0.84, body, -0.1, 0.8, 0)
			pBox(p, 0.9, 0.26, 0.86, "#2b3440", -0.1, 0.82, 0)
			pBox(p, 0.06, 0.12, 0.7, "#fff1b8", 0.95, 0.46, 0)
			pBox(p, 0.06, 0.1, 0.7, "#d4463a", -0.95, 0.46, 0)
			for (const [wx, wz] of [
				[0.6, 0.46],
				[0.6, -0.46],
				[-0.6, 0.46],
				[-0.6, -0.46],
			] as const)
				pGeo(p, cylGeo(0.2, 0.14, 8), "#2c2f36", wx, 0.2, wz, Math.PI / 2)
			const mesh = batchMesh(p, this.root, { static: false, noCast: true })
			// two lanes: east-bound on the near side, west-bound on the far side
			mesh.position.set(
				this.x0 + ((i + 1) / 5) * (this.x1 - this.x0),
				0,
				roadZ + dir * -0.95,
			)
			mesh.rotation.y = dir === 1 ? 0 : Math.PI
			this.cars.push({ mesh, dir, speed: 3.5 + (i % 3) * 1.4 })
		}
		this.addBus(world, roadZ)
	}

	frame(dt: number): void {
		for (const c of this.cars) {
			if (c.stopX !== undefined) {
				if ((c.wait ?? 0) > 0) {
					c.wait = (c.wait ?? 0) - dt
					continue
				}
				const x = c.mesh.position.x
				if (x < c.stopX && x + c.speed * dt >= c.stopX) {
					c.mesh.position.x = c.stopX
					c.wait = 5
					continue
				}
			}
			c.mesh.position.x += c.dir * c.speed * dt
			if (c.dir === 1 && c.mesh.position.x > this.x1)
				c.mesh.position.x = this.x0
			if (c.dir === -1 && c.mesh.position.x < this.x0)
				c.mesh.position.x = this.x1
		}
	}

	private addBus(world: GymWorld, roadZ: number): void {
		const p: Part[] = []
		pBox(p, 4.2, 0.9, 1.1, "#f2c14a", 0, 0.75, 0)
		pBox(p, 4.0, 0.5, 1.12, "#2b3440", 0, 1.35, 0)
		pBox(p, 4.2, 0.12, 1.1, "#f2c14a", 0, 1.66, 0)
		pBox(p, 0.06, 0.16, 0.8, "#fff1b8", 2.1, 0.5, 0)
		for (const wx of [-1.3, 1.3])
			for (const wz of [0.55, -0.55])
				pGeo(p, cylGeo(0.26, 0.16, 8), "#2c2f36", wx, 0.26, wz, Math.PI / 2)
		const mesh = batchMesh(p, this.root, { static: false, noCast: true })
		mesh.position.set(world.doorX - 14, 0, roadZ - 0.95)
		this.cars.push({
			mesh,
			dir: 1,
			speed: 3,
			stopX: world.doorX + BUS_STOP_DX,
		})
	}

	/** The bus is standing at the stop right now. */
	get busAtStop(): boolean {
		return this.cars.some((c) => c.stopX !== undefined && (c.wait ?? 0) > 0)
	}

	get count(): number {
		return this.cars.length
	}

	dispose(): void {
		for (const c of this.cars) releaseMesh(c.mesh)
		this.cars = []
		this.root.removeFromParent()
	}
}
