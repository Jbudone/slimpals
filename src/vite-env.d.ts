/// <reference types="vite/client" />

export {}

declare global {
	interface Window {
		game?: import("phaser").Game
	}
}
