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
			/** The layout the gym is showing (coins, lots, jobs, pieces). */
			layout(): import("../shared/types").GymLayoutDto
			/** Screen point (CSS px inside the gym) of a world point. */
			screenAt(x: number, y: number, z: number): { x: number; y: number }
			/** Glides the camera to a world point. */
			panTo(x: number, z: number): void
			/** Where the piece being moved can go (move mode), in screen px. */
			moveTargets(): { roomId: number; spot: number; x: number; y: number }[]
			/** Every cast look lined up on the pavement (false clears it). */
			lineup(on?: boolean): string[]
			/** What the tap chip would show for a person by key. */
			info(key: string): import("./components/gym3d/app").PersonInfo | null
			/** The dialog picture of a named NPC's 3D look (data URL). */
			portrait(npcKey: string): string | null
			/** An upgrade claim ceremony is running. */
			claiming(): boolean
		}
	}
}
