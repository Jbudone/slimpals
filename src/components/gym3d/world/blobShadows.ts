// Blob shadows: one instanced draw call for every person (and every piece
// when the shadow map is off at low quality).
import * as T from "three"
import { canvasTex } from "../engine/helpers"
import { ctx } from "./state"

export class BlobShadows {
	readonly mesh: T.InstancedMesh
	private n = 0

	constructor(
		scene: T.Scene,
		private max = 160,
	) {
		const a = ctx().assets
		const tex = canvasTex(
			64,
			64,
			(g, w) => {
				const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31)
				gr.addColorStop(0, "rgba(60,30,24,.46)")
				gr.addColorStop(0.55, "rgba(60,30,24,.26)")
				gr.addColorStop(1, "rgba(60,30,24,0)")
				g.fillStyle = gr
				g.fillRect(0, 0, w, w)
			},
			"blob",
		)
		const geo = a.track(new T.PlaneGeometry(1, 1))
		geo.rotateX(-Math.PI / 2)
		const mat = a.track(
			new T.MeshBasicMaterial({
				map: tex,
				transparent: true,
				depthWrite: false,
			}),
		)
		const m = new T.InstancedMesh(geo, mat, max)
		m.frustumCulled = false
		m.renderOrder = 1
		m.instanceMatrix.setUsage(T.DynamicDrawUsage)
		m.raycast = () => {}
		scene.add(m)
		this.mesh = m
	}

	begin(): void {
		this.n = 0
	}

	add(x: number, y: number, z: number, sx: number, sz: number): void {
		if (this.n >= this.max) return
		const e = this.mesh.instanceMatrix.array as Float32Array
		const o = this.n * 16
		e.fill(0, o, o + 16)
		e[o] = sx
		e[o + 5] = 1
		e[o + 10] = sz
		e[o + 12] = x
		e[o + 13] = y
		e[o + 14] = z
		e[o + 15] = 1
		this.n++
	}

	end(): void {
		this.mesh.count = this.n
		this.mesh.instanceMatrix.needsUpdate = true
	}

	dispose(): void {
		this.mesh.removeFromParent()
		this.mesh.dispose()
	}
}
