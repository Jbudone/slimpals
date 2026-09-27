// One WebGL2 renderer + iso orthographic camera for the 3D gym, with the
// build lab's quality ladder (auto steps down on slow frames and back up on
// headroom), a DPR cap, a ResizeObserver on the host element, and a render
// loop that pauses while the tab is hidden or the canvas is off screen.
import * as T from "three"

export type QualityLevel = {
	dpr: number
	/** Static shadow map on. */
	sh: boolean
	/** Toon outlines on. */
	ol: boolean
	name: string
	/** Most ambient members at this level. */
	crowd: number
}

export function isMobileDevice(): boolean {
	if (typeof window === "undefined") return false
	const coarse = window.matchMedia?.("(pointer:coarse)").matches ?? false
	const s = window.screen
	return coarse || Math.min(s?.width || 999, s?.height || 999) < 600
}

export function qualityLadder(mobile: boolean): QualityLevel[] {
	return [
		{ dpr: mobile ? 1.5 : 2, sh: true, ol: true, name: "High", crowd: 6 },
		{ dpr: 1.25, sh: true, ol: true, name: "Medium", crowd: 6 },
		{ dpr: 1, sh: false, ol: true, name: "Low+", crowd: 4 },
		{ dpr: 1, sh: false, ol: false, name: "Low", crowd: 4 },
		{ dpr: 0.8, sh: false, ol: false, name: "Lowest", crowd: 2 },
	]
}

/** True when this browser can create a WebGL2 context (three needs it). */
export function hasWebGL2(): boolean {
	try {
		const c = document.createElement("canvas")
		const gl = c.getContext("webgl2")
		if (!gl) return false
		gl.getExtension("WEBGL_lose_context")?.loseContext()
		return true
	} catch {
		return false
	}
}

export type FrameFn = (dt: number, raw: number) => void

export class GymRenderer {
	readonly renderer: T.WebGLRenderer
	readonly cam: T.OrthographicCamera
	readonly target = new T.Vector3(13, 0, 10)
	readonly mobile: boolean
	readonly QL: QualityLevel[]
	zoom = 1
	lvl: number
	private applied = -1
	private ft: number[] = []
	private hold = 0
	private upT = 0
	fps = 0
	ms = 0
	dprNow = 1
	private shadowDirty = 3
	private width = 1
	private height = 1
	private raf = 0
	private last = 0
	private running = false
	private visible = true
	private onscreen = true
	private frameFn: FrameFn | null = null
	private ro: ResizeObserver | null = null
	private io: IntersectionObserver | null = null
	private onVis = () => this.syncLoop()
	private disposed = false
	/** Called when the quality level changes (outlines, sun shadow, crowd). */
	onQuality: ((q: QualityLevel) => void) | null = null

	constructor(private host: HTMLElement) {
		// The build lab was tuned on r128's colour pipeline: no colour
		// management, linear output (light intensities are scaled by PI where
		// the lights are made).
		T.ColorManagement.enabled = false
		this.mobile = isMobileDevice()
		this.QL = qualityLadder(this.mobile)
		this.lvl = this.mobile ? 1 : 0
		this.renderer = new T.WebGLRenderer({
			antialias: !this.mobile,
			powerPreference: "high-performance",
		})
		this.renderer.outputColorSpace = T.LinearSRGBColorSpace
		this.renderer.shadowMap.enabled = true
		this.renderer.shadowMap.type = T.PCFShadowMap
		this.renderer.shadowMap.autoUpdate = false
		this.renderer.setClearColor(0xf2c9b4)
		const el = this.renderer.domElement
		el.style.display = "block"
		el.style.width = "100%"
		el.style.height = "100%"
		el.style.touchAction = "none"
		host.appendChild(el)
		this.cam = new T.OrthographicCamera(-1, 1, 1, -1, -100, 200)
		this.measure()
		if (typeof ResizeObserver !== "undefined") {
			this.ro = new ResizeObserver(() => this.measure())
			this.ro.observe(host)
		}
		if (typeof IntersectionObserver !== "undefined") {
			this.io = new IntersectionObserver((es) => {
				this.onscreen = es.some((e) => e.isIntersecting)
				this.syncLoop()
			})
			this.io.observe(host)
		}
		document.addEventListener("visibilitychange", this.onVis)
	}

	get quality(): QualityLevel {
		return this.QL[this.lvl]
	}

	get size(): { w: number; h: number } {
		return { w: this.width, h: this.height }
	}

	private measure(): void {
		const r = this.host.getBoundingClientRect()
		this.width = Math.max(1, Math.round(r.width))
		this.height = Math.max(1, Math.round(r.height))
		this.renderer.setSize(this.width, this.height, false)
		this.placeCam()
		this.dirtyShadow()
	}

	placeCam(): void {
		const d = 30
		const t = this.target
		this.cam.position.set(t.x + d, t.y + d * 0.95, t.z + d)
		this.cam.lookAt(t)
		// Portrait phones see less width: widen the view so a 3-plot-wide gym
		// still fits (the prototype was tuned for landscape).
		const a = this.width / this.height
		const s = (a < 1 ? 8.5 / Math.max(0.55, a) : 8.5) / this.zoom
		this.cam.left = -s * a
		this.cam.right = s * a
		this.cam.top = s
		this.cam.bottom = -s
		this.cam.updateProjectionMatrix()
	}

	applyQuality(): void {
		if (this.applied === this.lvl) return
		this.applied = this.lvl
		const L = this.quality
		this.dprNow = Math.min(window.devicePixelRatio || 1, L.dpr)
		this.renderer.setPixelRatio(this.dprNow)
		this.measure()
		this.onQuality?.(L)
	}

	/** Auto quality: step down when frames stay slow, creep back up when there
	 * is lots of headroom. */
	private qualityTick(raw: number): void {
		this.ft.push(raw * 1000)
		if (this.ft.length < 45) return
		const a = this.ft.slice().sort((x, y) => x - y)
		const med = a[a.length >> 1]
		this.ft.length = 0
		this.ms = med
		this.fps = 1000 / med
		this.hold -= 0.75
		if (med > 26 && this.lvl < this.QL.length - 1) {
			this.lvl++
			this.hold = 12
			this.applyQuality()
		} else if (med < 13 && this.hold <= 0 && this.lvl > 0) {
			this.upT++
			if (this.upT >= 6) {
				this.upT = 0
				this.lvl--
				this.hold = 20
				this.applyQuality()
			}
		} else this.upT = 0
	}

	dirtyShadow(): void {
		this.shadowDirty = Math.max(this.shadowDirty, 2)
	}

	render(scene: T.Scene): void {
		if (this.quality.sh && this.shadowDirty > 0) {
			this.renderer.shadowMap.needsUpdate = true
			this.shadowDirty--
		}
		this.renderer.render(scene, this.cam)
	}

	start(fn: FrameFn): void {
		this.frameFn = fn
		this.applyQuality()
		this.syncLoop()
	}

	private syncLoop(): void {
		this.visible = document.visibilityState !== "hidden"
		const want =
			!this.disposed && !!this.frameFn && this.visible && this.onscreen
		if (want && !this.running) {
			this.running = true
			this.last = performance.now()
			this.raf = requestAnimationFrame(this.tick)
		} else if (!want && this.running) {
			this.running = false
			cancelAnimationFrame(this.raf)
			this.raf = 0
		}
	}

	get isRunning(): boolean {
		return this.running
	}

	private tick = (now: number) => {
		if (!this.running || !this.frameFn) return
		const raw = Math.max(0, (now - this.last) / 1000)
		this.last = now
		const dt = Math.min(0.05, raw)
		this.qualityTick(raw)
		this.frameFn(dt, raw)
		if (this.running) this.raf = requestAnimationFrame(this.tick)
	}

	/** Screen position (CSS px inside the host) of a world point. */
	toScreen(
		v: T.Vector3,
		out: { x: number; y: number },
	): { x: number; y: number } {
		_p.copy(v).project(this.cam)
		out.x = ((_p.x + 1) / 2) * this.width
		out.y = ((1 - _p.y) / 2) * this.height
		return out
	}

	dispose(): void {
		if (this.disposed) return
		this.disposed = true
		this.running = false
		cancelAnimationFrame(this.raf)
		this.frameFn = null
		this.onQuality = null
		this.ro?.disconnect()
		this.io?.disconnect()
		document.removeEventListener("visibilitychange", this.onVis)
		this.renderer.renderLists.dispose()
		this.renderer.dispose()
		this.renderer.forceContextLoss()
		this.renderer.domElement.remove()
	}
}

const _p = new T.Vector3()
