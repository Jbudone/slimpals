<script lang="ts">
import Phaser from "phaser"
import { onMount } from "svelte"
import { GalleryScene } from "../components/gym/scenes/GalleryScene.js"

let container: HTMLDivElement
let game: Phaser.Game | null = null

onMount(() => {
	game = new Phaser.Game({
		type: Phaser.AUTO,
		parent: container,
		width: container.clientWidth,
		height: container.clientHeight,
		backgroundColor: "#1e1b2e",
		scene: [GalleryScene],
		scale: {
			mode: Phaser.Scale.RESIZE,
			autoCenter: Phaser.Scale.CENTER_BOTH,
		},
	})
	window.game = game

	return () => {
		if (game) {
			game.destroy(true)
			game = null
		}
		window.game = undefined
	}
})
</script>

<div class="gallery-container" bind:this={container}></div>

<style>
.gallery-container {
	width: 100%;
	height: 100vh;
}

.gallery-container :global(canvas) {
	display: block;
}
</style>
