// The prototype's globals (current scene, station / tick collectors, the
// clock, animated belts and wheels) as one explicitly bound context. A mounted
// gym binds its context while it builds and animates, and unbinds it on
// dispose, so nothing outlives the component.
import type * as T from "three"
import type { AssetCache } from "../engine/assets"
import type { Station, TickFn } from "./types"

export type WorldCtx = {
	scene: T.Scene
	assets: AssetCache
	/** Seconds since the world started (the prototype's clock.elapsedTime). */
	time: { t: number }
	/** Collects stations while a piece is being built (the prototype's SHOW_BUILD). */
	stations: Station[] | null
	/** Collects per-piece animation ticks while a piece is being built (srTick). */
	ticks: TickFn[] | null
	/** Treadmill belt stripes, animated every frame. */
	belts: T.Group[]
	/** Bike wheels, spun while someone rides. */
	wheels: T.Mesh[]
	/** Random numbers for anything cosmetic (seeded per piece while building). */
	rng: () => number
}

let current: WorldCtx | null = null

export function bindWorld(c: WorldCtx): void {
	current = c
}

export function unbindWorld(c?: WorldCtx): void {
	if (!c || current === c) current = null
}

export function isBound(c: WorldCtx): boolean {
	return current === c
}

export function ctx(): WorldCtx {
	if (!current) throw new Error("gym3d: no world bound")
	return current
}
