<script lang="ts">
import { onDestroy, onMount } from "svelte"
import { Gym3DApp, type Selection } from "./app"

type Props = {
	/** Opens the NPC dialog for a named NPC. */
	onNpcClick?: (npcKey: string) => void
	/** The 3D gym could not start (no WebGL2, load or build failure). */
	onFallback?: (reason: string) => void
}

let { onNpcClick, onFallback }: Props = $props()

let host: HTMLDivElement
let chipEl = $state<HTMLDivElement | null>(null)
let app: Gym3DApp | null = null
let destroyed = false
let loading = $state(true)
let selection = $state<Selection | null>(null)

$effect(() => {
	// read chipEl first so the effect tracks it even before the app exists
	const el = chipEl
	app?.setChipElement(el)
})

onMount(() => {
	Gym3DApp.create(host, {
		onSelect: (s) => {
			selection = s
		},
	})
		.then((a) => {
			if (destroyed) {
				a.dispose()
				return
			}
			app = a
			app.setChipElement(chipEl)
			loading = false
			window.gym3d = {
				ready: true,
				stats: () => a.stats(),
				tap: (x, y) => a.tapAt(x, y),
				screenOf: (key) => a.screenOf(key),
				people: () => a.personKeys(),
			}
		})
		.catch((e: unknown) => {
			if (destroyed) return
			loading = false
			onFallback?.(e instanceof Error ? e.message : String(e))
		})
})

onDestroy(() => {
	destroyed = true
	app?.dispose()
	app = null
	if (typeof window !== "undefined") window.gym3d = undefined
})

function talk() {
	if (selection?.kind === "person" && selection.npcKey)
		onNpcClick?.(selection.npcKey)
}
</script>

<div class="g3d" bind:this={host} data-testid="gym3d">
	{#if loading}
		<p class="g3d-loading">Building your gym...</p>
	{/if}
	{#if selection}
		<div class="g3d-chip" bind:this={chipEl} role="status">
			<span class="g3d-chip-name">{selection.name}</span>
			{#if selection.kind === "person" && selection.npcKey}
				<button type="button" class="g3d-talk" onclick={talk}>Talk</button>
			{/if}
		</div>
	{/if}
</div>

<style>
.g3d {
	position: relative;
	width: 100%;
	height: 100%;
	/* in flow like the 2D gym (which is min 400px); fill a phone screen
	   below the gym header when there is room */
	min-height: max(400px, calc(100dvh - 250px));
	overflow: hidden;
	background: #f2c9b4;
	-webkit-user-select: none;
	user-select: none;
	-webkit-tap-highlight-color: transparent;
}

.g3d-loading {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	margin: 0;
	color: #3a2622;
	font-weight: 700;
	font-size: 0.9rem;
}

.g3d-chip {
	position: absolute;
	left: 0;
	top: 0;
	z-index: 4;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 5px 6px 5px 12px;
	border: 2px solid #3a2622;
	border-radius: 999px;
	background: #fff;
	box-shadow: 0 3px 0 #3a2622;
	color: #3a2622;
	font-weight: 800;
	font-size: 13px;
	white-space: nowrap;
	margin-bottom: 8px;
	will-change: transform;
}

.g3d-chip-name {
	padding-right: 6px;
}

.g3d-talk {
	border: 2px solid #3a2622;
	border-radius: 999px;
	background: #e8743b;
	color: #fff;
	font-weight: 800;
	font-size: 12px;
	padding: 3px 10px;
	cursor: pointer;
	min-height: 28px;
}

.g3d-talk:focus-visible {
	outline: 3px solid #3aa89a;
	outline-offset: 2px;
}

.g3d :global(.g3d-badge) {
	background: #3a2622;
	color: #fff7ef;
	border-radius: 999px;
	padding: 3px 9px 4px;
	font-size: 11px;
	line-height: 1.2;
	opacity: 0.92;
	box-shadow: 0 3px 0 rgba(58, 38, 34, 0.35);
	margin-bottom: 4px;
}

.g3d :global(.g3d-badge-l1) {
	display: flex;
	gap: 6px;
	align-items: center;
	white-space: nowrap;
}

.g3d :global(.g3d-stars) {
	color: #f2c14a;
}
</style>
