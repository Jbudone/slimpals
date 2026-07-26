/// <reference types="vite/client" />

declare global {
	interface Window {
		game?: import("phaser").Game
	}
}
