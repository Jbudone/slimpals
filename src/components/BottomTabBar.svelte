<script lang="ts">
// Gym · Today · Progress · Social. The gym is home; Today carries a badge
// with the tasks left today.
import { checkinState } from "../lib/checkin.svelte.js"
import { today, todayCounts } from "../lib/today.svelte.js"
import { nav, page, type RoutePath } from "../router.svelte.js"

type Tab = {
	id: string
	label: string
	icon: string
	targetPath: RoutePath
	matchPaths: RoutePath[]
}

const TABS: Tab[] = [
	{
		id: "gym",
		label: "Gym",
		icon: '<path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M8.5 15h7M8.5 13.5v3M15.5 13.5v3"/>',
		targetPath: "/",
		matchPaths: ["/"],
	},
	{
		id: "today",
		label: "Today",
		icon: '<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 3v3M16 3v3M8.5 13l2.5 2.5 4.5-5"/>',
		targetPath: "/today",
		matchPaths: ["/today"],
	},
	{
		id: "progress",
		label: "Progress",
		icon: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>',
		targetPath: "/weight",
		matchPaths: ["/weight", "/food", "/upgrades"],
	},
	{
		id: "social",
		label: "Social",
		icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.4c1.9.8 3 2.8 3 5.6"/>',
		targetPath: "/social",
		matchPaths: ["/social", "/challenges", "/tournaments", "/badges"],
	},
]

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
			{#if tab.id === "today" && left > 0}
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
</style>
