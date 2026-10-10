// Vibe vfx: motes rising out of the floor of rooms with a vibe (Chill: slow
// soft bits, Hype: quick sparks, Focus: still cool dust). One instanced mesh
// for the whole gym, capped, nothing built with reduced motion. The rules of
// a mote are pure (shared/gym3d/vibes.ts); this only draws them.
import * as T from "three"
import {
	type Mote,
	moteScale,
	spawnMote,
	stepMote,
	VIBE_FX,
} from "../../../../shared/gym3d/vibes"
import { eqGeo } from "../engine/helpers"
import { ctx } from "./state"
import type { GymWorld } from "./world"

const MAX = 120

export class VibeFx {
	private mesh: T.InstancedMesh | null = null
	private motes: Mote[] = []
	private timers = new Map<string, number>()
	private rng = Math.random
	private m = new T.Matrix4()
	private q = new T.Quaternion()
	private p = new T.Vector3()
	private s = new T.Vector3()
	private col = new T.Color()

	constructor(
		private world: GymWorld,
		calm: boolean,
	) {
		if (calm) return
		const a = ctx().assets
		const mesh = new T.InstancedMesh(
			eqGeo("vibeMote", () => new T.OctahedronGeometry(1, 0)),
			a.track(
				new T.MeshBasicMaterial({
					color: "#ffffff",
					transparent: true,
					opacity: 0.85,
					depthWrite: false,
				}),
			),
			MAX,
		)
		mesh.setColorAt(0, this.col.set("#ffffff"))
		mesh.frustumCulled = false
		mesh.count = 0
		mesh.renderOrder = 2
		mesh.raycast = () => {}
		world.scene.add(mesh)
		this.mesh = mesh
	}

	get count(): number {
		return this.motes.length
	}

	frame(dt: number): void {
		const mesh = this.mesh
		if (!mesh) return
		const spots = this.world.vibeSpots
		const keys = new Set<string>()
		for (const sp of spots) {
			const fx = VIBE_FX[sp.vibe]
			if (!fx) continue
			const key = `${sp.x}_${sp.z}`
			keys.add(key)
			let t = (this.timers.get(key) ?? this.rng() * fx.every) - dt
			while (t <= 0) {
				t += fx.every
				if (this.motes.length < MAX) {
					const mote = spawnMote(sp.vibe, sp, this.rng)
					if (mote) this.motes.push(mote)
				}
			}
			this.timers.set(key, t)
		}
		for (const k of this.timers.keys()) if (!keys.has(k)) this.timers.delete(k)
		this.motes = this.motes.filter((m) => stepMote(m, dt))
		let n = 0
		for (const m of this.motes) {
			const sc = moteScale(m)
			this.p.set(m.x, m.y, m.z)
			this.s.set(sc, sc, sc)
			this.m.compose(this.p, this.q, this.s)
			mesh.setMatrixAt(n, this.m)
			mesh.setColorAt(n, this.col.set(VIBE_FX[m.vibe]?.color ?? "#ffffff"))
			n++
		}
		mesh.count = n
		mesh.instanceMatrix.needsUpdate = true
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
	}

	dispose(): void {
		const mesh = this.mesh
		if (!mesh) return
		mesh.removeFromParent()
		mesh.dispose()
		ctx().assets.release(mesh.geometry)
		this.mesh = null
	}
}
