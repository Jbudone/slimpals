<script lang="ts">
// Gym · Compete · Progress · Social. The gym is home (Today is its drawer) and carries
// a badge with the tasks left today.
import { checkinState } from "../lib/checkin.svelte.js"
import { story } from "../lib/story.svelte.js"
import { TABS, type Tab } from "../lib/tabs.js"
import { today, todayCounts } from "../lib/today.svelte.js"
import { nav, page } from "../router.svelte.js"

let currentPath = $derived(nav.path)

const left = $derived.by(() => {
	void checkinState.data
	void today.daily
	if (!today.loaded) return 0
	const c = todayCounts()
	return Math.max(0, c.all - c.done)
})

function isActive(tab: Tab): boolean {
	return tab.matchPaths.includes(currentPath)
}
</script>

<nav class="bottom-tab-bar" aria-label="Primary">
	{#each TABS as tab (tab.id)}
		<button
			type="button"
			class="tab"
			class:active={isActive(tab)}
			aria-current={isActive(tab) ? "page" : undefined}
			onclick={() => page(tab.targetPath)}
			data-testid="tab-{tab.id}"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true">{@html tab.icon}</svg
			>
			<span class="tab-label">{tab.label}</span>
			{#if tab.id === "gym" && story.data?.pending}
				<span class="nb story-dot" aria-label="A story chapter is waiting" data-testid="story-dot"></span>
			{/if}
			{#if tab.id === "gym" && left > 0 && !story.data?.pending}
				<span class="nb" aria-label="{left} left">{left}</span>
			{/if}
		</button>
	{/each}
</nav>

<style>
.bottom-tab-bar {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	height: var(--tab-h);
	box-sizing: border-box;
	display: flex;
	background: #17301f;
	box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.06);
	padding-bottom: env(safe-area-inset-bottom, 0px);
	z-index: 25;
}

.tab {
	position: relative;
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 4px;
	background: none;
	border: none;
	color: #9bb5a2;
	font: 600 11px/1 var(--font-sans);
	cursor: pointer;
	padding: 0;
	-webkit-tap-highlight-color: transparent;
}

.tab svg {
	width: 24px;
	height: 24px;
	transition: transform 0.3s cubic-bezier(0.2, 1.8, 0.4, 1);
}

.tab.active {
	color: #34c973;
	font-weight: 800;
}

.tab.active svg {
	transform: translateY(-1px) scale(1.08);
}

.tab.active::before {
	content: "";
	position: absolute;
	top: 0;
	left: 30%;
	right: 30%;
	height: 3px;
	border-radius: 0 0 4px 4px;
	background: #34c973;
}

.nb {
	position: absolute;
	top: 7px;
	left: calc(50% + 6px);
	min-width: 18px;
	height: 18px;
	box-sizing: border-box;
	border-radius: 9px;
	padding: 0 5px;
	background: #ff8a3d;
	color: #fff;
	font: 800 11px/18px ui-rounded, system-ui, sans-serif;
	box-shadow: 0 0 0 2px #17301f;
}

.tab-label {
	line-height: 1;
}
.story-dot {
	min-width: 0;
	width: 10px;
	height: 10px;
	padding: 0;
	background: #f2b21a;
	animation: sdot 1.6s ease-in-out infinite;
}

@keyframes sdot {
	50% {
		transform: scale(1.35);
		opacity: 0.7;
	}
}

@media (prefers-reduced-motion: reduce) {
	.story-dot {
		animation: none;
	}
}
</style>
