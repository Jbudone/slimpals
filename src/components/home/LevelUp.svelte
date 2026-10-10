<script lang="ts">
// Level-up celebration (Layout Lab): a big level ball, confetti and what
// the level unlocked. "Place it" plays the claim build on the Home gym.
import { confetti } from "../../lib/fly.js"
import { gymGoals } from "../../lib/goals.svelte.js"
import { story } from "../../lib/story.svelte.js"
import { claimAsk, levelUp, wallet } from "../../lib/wallet.svelte.js"
import { nav, page } from "../../router.svelte.js"
import UnlockRail from "./UnlockRail.svelte"

const lv = $derived(levelUp.level)

$effect(() => {
	if (lv != null) {
		confetti(70)
		try {
			navigator.vibrate?.([20, 60, 30])
		} catch {
			// no haptics
		}
	}
})

function close() {
	levelUp.level = null
	levelUp.unlocked = []
}

/** The chapter this level opened plays next, on the gym. */
function startStory() {
	close()
	if (nav.path !== "/") page("/")
}

function place() {
	close()
	if (nav.path !== "/") page("/")
	claimAsk.n++
}
</script>

{#if lv != null}
	<div
		class="ov"
		role="dialog"
		aria-modal="true"
		aria-label="Level {lv}"
		data-testid="level-up"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) close()
		}}
		onkeydown={(e) => {
			if (e.key === "Escape") close()
		}}
	>
		<div class="rays" aria-hidden="true"></div>
		<div class="ball"><small>LEVEL</small><b>{lv}</b></div>
		<h2>Level {lv}!</h2>
		<p>Your gym levels up with you. Word is out: more members are on their way.</p>
		{#if story.data?.pending}
			<button type="button" class="primary story" onclick={startStory} data-testid="level-story">
				📖 Chapter{story.data.chapter ? ` ${story.data.chapter.n}` : ""} is ready · Continue the story
			</button>
		{/if}
		{#if gymGoals.locked.length}
			<div class="next" data-testid="level-next">
				<small>UP NEXT</small>
				<UnlockRail gear={gymGoals.locked} xp={wallet.data?.xp ?? 0} compact />
			</div>
		{/if}
		{#if levelUp.unlocked.length}
			<div class="unl">
				<small>UNLOCKED</small>
				{levelUp.unlocked.join(", ")}
			</div>
			<div class="acts">
				<button type="button" class="primary" onclick={place} data-testid="level-place">Place it in the gym</button>
				<button type="button" class="ghost" onclick={close}>Later</button>
			</div>
		{:else}
			<button type="button" class="primary" onclick={close} data-testid="level-ok">Keep going</button>
		{/if}
	</div>
{/if}

<style>
.ov {
	position: fixed;
	inset: 0;
	z-index: 60;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	padding: 24px;
	background: rgba(8, 18, 12, 0.78);
	color: #fff;
	text-align: center;
	animation: fade 0.25s;
	overflow: hidden;
}

@keyframes fade {
	from {
		opacity: 0;
	}
}

.rays {
	position: absolute;
	left: 50%;
	top: 38%;
	width: 900px;
	height: 900px;
	margin: -450px 0 0 -450px;
	background: repeating-conic-gradient(
		rgba(255, 255, 255, 0.09) 0 8deg,
		transparent 8deg 20deg
	);
	border-radius: 50%;
	mask: radial-gradient(circle, #000 20%, transparent 65%);
	animation: spin 14s linear infinite;
	pointer-events: none;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.ball {
	position: relative;
	width: 150px;
	height: 150px;
	border-radius: 50%;
	background: radial-gradient(circle at 35% 30%, #7de8a6, #34c973 55%, #1f9a55);
	box-shadow:
		0 0 0 8px rgba(255, 255, 255, 0.14),
		0 8px 0 #177a42;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	animation: pop 0.7s cubic-bezier(0.2, 1.8, 0.4, 1);
}

@keyframes pop {
	from {
		transform: scale(0.3);
	}
}

.ball small {
	font: 800 13px system-ui, sans-serif;
	letter-spacing: 0.2em;
	opacity: 0.85;
}

.ball b {
	font: 800 72px/1 ui-rounded, system-ui, sans-serif;
}

h2 {
	position: relative;
	margin: 6px 0 0;
	font: 700 32px/1.1 var(--font-display, Georgia, serif);
}

p {
	position: relative;
	margin: 0;
	max-width: 320px;
	font: 600 15px/1.45 system-ui, sans-serif;
	opacity: 0.9;
}

.unl {
	position: relative;
	padding: 10px 16px;
	border-radius: 16px;
	background: rgba(255, 255, 255, 0.12);
	font: 700 15px/1.35 system-ui, sans-serif;
	max-width: 320px;
}

.unl small {
	display: block;
	color: #9af0b9;
	font: 800 11px system-ui, sans-serif;
	letter-spacing: 0.14em;
	margin-bottom: 3px;
}

.acts {
	position: relative;
	display: flex;
	gap: 8px;
}

button {
	position: relative;
	border: 0;
	border-radius: 16px;
	padding: 14px 22px;
	font: 800 16px system-ui, sans-serif;
	cursor: pointer;
}

.primary {
	background: #34c973;
	color: #fff;
	box-shadow: 0 4px 0 #1f9a55;
}

.ghost {
	background: rgba(255, 255, 255, 0.14);
	color: #fff;
}
.next {
	width: min(100%, 380px);
	display: flex;
	flex-direction: column;
	gap: 6px;
	text-align: left;
}

.next small {
	font: 800 11px/1 system-ui, sans-serif;
	letter-spacing: 0.14em;
	color: #ffe28a;
}
</style>
