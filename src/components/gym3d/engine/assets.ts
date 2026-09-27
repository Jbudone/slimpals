// Every shared geometry, material and texture of one 3D gym lives here, so a
// single dispose() frees them when the gym unmounts. The prototype kept these
// in module-level caches; one AssetCache per mounted gym replaces them.
import * as T from "three"

type Disposable = { dispose(): void }

const OUTLINE_FRAG = "uniform vec3 col;void main(){gl_FragColor=vec4(col,1.0);}"

export class AssetCache {
	private mats = new Map<string, T.MeshStandardMaterial>()
	private toon = new Map<string, T.MeshToonMaterial>()
	private basic = new Map<string, T.MeshBasicMaterial>()
	private geos = new Map<string, T.BufferGeometry>()
	private texs = new Map<string, T.Texture>()
	private others = new Map<string, T.Material>()
	private owned = new Set<Disposable>()
	private disposed = false

	/** 3-step toon ramp (RedFormat replaces r128's LuminanceFormat). */
	readonly grad: T.DataTexture
	/** Shared vertex-colour material: merged static geometry, one draw call. */
	readonly MV: T.MeshStandardMaterial
	/** Vertex-coloured toon material for baked (skinned) people. */
	readonly TOONS: T.MeshToonMaterial
	/** Inverted-hull outline for plain / instanced meshes. */
	readonly OUTLINE: T.ShaderMaterial
	/** Inverted-hull outline that follows a skeleton. */
	readonly OUTLINES: T.ShaderMaterial
	/** Invisible material for pick proxies. */
	readonly HIT: T.MeshBasicMaterial

	constructor() {
		const g = new T.DataTexture(
			new Uint8Array([120, 190, 255]),
			3,
			1,
			T.RedFormat,
		)
		g.minFilter = T.NearestFilter
		g.magFilter = T.NearestFilter
		g.needsUpdate = true
		this.grad = this.track(g)
		this.MV = this.track(
			new T.MeshStandardMaterial({
				vertexColors: true,
				roughness: 1,
				metalness: 0,
				flatShading: true,
			}),
		)
		this.TOONS = this.track(
			new T.MeshToonMaterial({ vertexColors: true, gradientMap: this.grad }),
		)
		const w = { value: 0.011 }
		const col = { value: new T.Color("#3a2622") }
		this.OUTLINE = this.track(
			new T.ShaderMaterial({
				side: T.BackSide,
				uniforms: { w, col },
				vertexShader:
					"uniform float w;void main(){vec4 p=vec4(position+normal*w,1.0);\n#ifdef USE_INSTANCING\np=instanceMatrix*p;\n#endif\ngl_Position=projectionMatrix*modelViewMatrix*p;}",
				fragmentShader: OUTLINE_FRAG,
			}),
		)
		this.OUTLINES = this.track(
			new T.ShaderMaterial({
				side: T.BackSide,
				uniforms: { w, col },
				vertexShader: [
					"#include <common>",
					"#include <skinning_pars_vertex>",
					"uniform float w;",
					"void main(){",
					"#include <skinbase_vertex>",
					"#include <beginnormal_vertex>",
					"#include <skinnormal_vertex>",
					"#include <begin_vertex>",
					"#include <skinning_vertex>",
					"transformed+=normalize(objectNormal)*w;",
					"gl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.0);}",
				].join("\n"),
				fragmentShader: OUTLINE_FRAG,
			}),
		)
		this.HIT = this.track(new T.MeshBasicMaterial({ visible: false }))
	}

	/** Flat-shaded standard material per colour; mergeable into MV batches. */
	M(c: string): T.MeshStandardMaterial {
		let m = this.mats.get(c)
		if (!m) {
			m = new T.MeshStandardMaterial({
				color: c,
				roughness: 1,
				metalness: 0,
				flatShading: true,
			})
			m.userData.mergeable = true
			this.mats.set(c, m)
		}
		return m
	}

	/** Toon material per colour (people). */
	TM(c: string): T.MeshToonMaterial {
		let m = this.toon.get(c)
		if (!m) {
			m = new T.MeshToonMaterial({ color: c, gradientMap: this.grad })
			this.toon.set(c, m)
		}
		return m
	}

	/** Unlit material per colour (and optional opacity). */
	BM(c: string, op?: number, doubleSide = false): T.MeshBasicMaterial {
		const k = `${c}_${op ?? ""}_${doubleSide ? 2 : 1}`
		let m = this.basic.get(k)
		if (!m) {
			m = new T.MeshBasicMaterial({
				color: c,
				transparent: op != null,
				opacity: op ?? 1,
				depthWrite: op == null,
				side: doubleSide ? T.DoubleSide : T.FrontSide,
			})
			this.basic.set(k, m)
		}
		return m
	}

	geo<G extends T.BufferGeometry>(key: string, mk: () => G): G {
		let g = this.geos.get(key)
		if (!g) {
			g = mk()
			this.geos.set(key, g)
		}
		return g as G
	}

	tex<X extends T.Texture>(key: string, mk: () => X): X {
		let t = this.texs.get(key)
		if (!t) {
			t = mk()
			this.texs.set(key, t)
		}
		return t as X
	}

	mat<X extends T.Material>(key: string, mk: () => X): X {
		let m = this.others.get(key)
		if (!m) {
			m = mk()
			this.others.set(key, m)
		}
		return m as X
	}

	/** Registers a one-off resource so dispose() frees it too. */
	track<X extends Disposable>(x: X): X {
		if (this.disposed) throw new Error("gym3d: asset cache already disposed")
		this.owned.add(x)
		return x
	}

	/** Frees a tracked one-off resource early (e.g. a rebuilt wall batch). */
	release(x: Disposable): void {
		if (this.owned.delete(x)) x.dispose()
	}

	get size(): number {
		return (
			this.mats.size +
			this.toon.size +
			this.basic.size +
			this.geos.size +
			this.texs.size +
			this.others.size +
			this.owned.size
		)
	}

	dispose(): void {
		if (this.disposed) return
		this.disposed = true
		const all: Disposable[] = [
			...this.mats.values(),
			...this.toon.values(),
			...this.basic.values(),
			...this.geos.values(),
			...this.texs.values(),
			...this.others.values(),
			...this.owned,
		]
		for (const d of all) d.dispose()
		this.mats.clear()
		this.toon.clear()
		this.basic.clear()
		this.geos.clear()
		this.texs.clear()
		this.others.clear()
		this.owned.clear()
	}
}
