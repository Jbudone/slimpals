<script lang="ts">
import Phaser from "phaser"
import { onMount } from "svelte"
import { GymScene, type GymSceneData } from "./scenes/GymScene.js"
import { PreloadScene } from "./scenes/PreloadScene.js"

type Props = {
	unlocked: GymSceneData["unlocked"]
	locked: GymSceneData["locked"]
}

let { unlocked, locked }: Props = $props()

let container: HTMLDivElement
let game: Phaser.Game | null = null

function createGame() {
	if (game) {
		game.destroy(true)
	}

	const gymData: GymSceneData = { unlocked, locked }

	game = new Phaser.Game({
		type: Phaser.AUTO,
		parent: container,
		width: container.clientWidth,
		height: container.clientHeight,
		backgroundColor: "#1e1b2e",
		scene: [PreloadScene, GymScene],
		scale: {
			mode: Phaser.Scale.RESIZE,
			autoCenter: Phaser.Scale.CENTER_BOTH,
		},
		input: {
			mouse: { preventDefaultWheel: false },
		},
		callbacks: {
			postBoot: (g) => {
				g.registry.set("gymData", gymData)
			},
		},
	})
}

$effect(() => {
	if (!game) return
	const gymData: GymSceneData = { unlocked, locked }
	const scene = game.scene.getScene("GymScene") as GymScene | null
	if (scene) {
		scene.updateGymData(gymData)
	}
})

onMount(() => {
	createGame()
	return () => {
		if (game) {
			game.destroy(true)
			game = null
		}
	}
})
</script>

<div class="phaser-container" bind:this={container}></div>

<style>
.phaser-container {
	width: 100%;
	height: 100%;
	min-height: 400px;
}

.phaser-container :global(canvas) {
	display: block;
	border-radius: 0.5rem;
}
</style>
