<script lang="ts">
import Phaser from "phaser"
import { onMount } from "svelte"
import { listNpcAnimationOptions } from "../components/gym/npcAnimation.js"
import { GalleryScene } from "../components/gym/scenes/GalleryScene.js"

let container: HTMLDivElement
let game: Phaser.Game | null = null

const options = listNpcAnimationOptions()
const npcKeys = [...new Set(options.map((o) => o.npcKey))]

let selectedNpcKey = $state(npcKeys[0] ?? "")
let animationsForNpc = $derived(
	options.filter((o) => o.npcKey === selectedNpcKey),
)
let selectedAnimation = $state(animationsForNpc[0]?.animation ?? "")

function currentScene(): GalleryScene | undefined {
	return game?.scene.getScene("GalleryScene") as GalleryScene | undefined
}

function jumpToSelection() {
	const option = options.find(
		(o) => o.npcKey === selectedNpcKey && o.animation === selectedAnimation,
	)
	if (option) currentScene()?.focusOn(option.textureKey)
}

function resetView() {
	currentScene()?.resetView()
}

function onNpcChange() {
	selectedAnimation = animationsForNpc[0]?.animation ?? ""
	jumpToSelection()
}

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

<div class="toolbar">
	<label>
		NPC
		<select class="inp" bind:value={selectedNpcKey} onchange={onNpcChange}>
			{#each npcKeys as key (key)}
				<option value={key}>{key}</option>
			{/each}
		</select>
	</label>
	<label>
		Animation / pose
		<select class="inp" bind:value={selectedAnimation} onchange={jumpToSelection}>
			{#each animationsForNpc as option (option.animation)}
				<option value={option.animation}>{option.animation}</option>
			{/each}
		</select>
	</label>
	<button class="btn" onclick={jumpToSelection}>Jump</button>
	<button class="btn" onclick={resetView}>Show all</button>
</div>

<div class="gallery-container" bind:this={container}></div>

<style>
.toolbar {
	display: flex;
	align-items: flex-end;
	gap: 0.75rem;
	padding: 0.5rem 0.75rem;
	background: #1e1b2e;
	color: #e2e8f0;
	font-size: 0.8rem;
	position: relative;
	z-index: 1;
}

.toolbar label {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
}

.inp {
	padding: 0.25rem 0.4rem;
	font-size: 0.8rem;
}

.btn {
	padding: 0.3rem 0.6rem;
	font-size: 0.8rem;
	cursor: pointer;
}

.gallery-container {
	width: 100%;
	height: 100%;
}

.gallery-container :global(canvas) {
	display: block;
}
</style>
