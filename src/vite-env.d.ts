/// <reference types="vite/client" />

export {}

declare global {
	interface Window {
		game?: import("phaser").Game
		/** Set while the beta 3D gym is mounted (for e2e checks and tooling). */
		gym3d?: {
			ready: boolean
			stats(): import("./components/gym3d/app").Gym3DStats
			/** Taps a canvas point (CSS px inside the gym); returns what it hit. */
			tap(
				x: number,
				y: number,
			): import("./components/gym3d/app").Selection | null
			/** Screen point of a person by key (npc:<npcKey>, staff:..., member:n). */
			screenOf(key: string): { x: number; y: number } | null
			people(): string[]
		}
	}
}
