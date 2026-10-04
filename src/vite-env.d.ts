/// <reference types="vite/client" />

export {}

declare global {
	interface Window {
		/** Dev only: remounts the Home gym (e2e leak checks). */
		spRemountGym?: () => void
		/** Set while the 3D gym is mounted (for e2e checks and tooling). */
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
			/** Keys of the people in a seasonal costume. */
			costumed(): string[]
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
			/** Coins waiting in every coin bubble now. */
			coinsWaiting(): number
			/** Coin bubbles holding coins: key (room:<id>, desk, kitchen), coins and screen point. */
			coinBubbles(): { key: string; coins: number; x: number; y: number }[]
			/** Taps "Collect all". */
			collectAll(): void
			/** Screen point of the Slim Kitchen kiosk. */
			kitchen(): { x: number; y: number }
			/** Bubbles on screen (chip, timers, coins, speech): kind and box. */
			bubbles(): {
				kind: string
				x: number
				y: number
				w: number
				h: number
				text: string
			}[]
			/** A line over a person as if the player caused it. */
			say(key: string, text: string): boolean
			/** What a tap at a canvas point would select, without selecting it. */
			pick(
				x: number,
				y: number,
			): import("./components/gym3d/app").Selection | null
			/** A long press on a person at a canvas point: opens their card. */
			press(
				x: number,
				y: number,
			): import("./components/gym3d/app").Selection | null
		}
	}
}
