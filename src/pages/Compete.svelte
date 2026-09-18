<script lang="ts">
import SegmentedTabs from "../components/ui/SegmentedTabs.svelte"
import { nav, page } from "../router.svelte.js"
import Badges from "./Badges.svelte"
import Challenges from "./Challenges.svelte"
import Tournaments from "./Tournaments.svelte"

const TABS = [
	{ id: "tournaments", label: "Tournaments" },
	{ id: "challenge", label: "Challenge" },
	{ id: "badges", label: "Badges" },
	{ id: "gym", label: "Gym" },
]

const TAB_TO_PATH = {
	tournaments: "/tournaments",
	challenge: "/challenges",
	badges: "/badges",
	gym: "/gym",
} as const

// "Gym" isn't wired into this shell yet (gh-80/81) — clicking it just
// navigates to the existing plain /gym route, leaving this shell entirely,
// same as any other deep link. It can never be the *active* tab here since
// Compete.svelte doesn't mount for /gym.
let activeTab = $derived(
	nav.path === "/challenges"
		? "challenge"
		: nav.path === "/badges"
			? "badges"
			: "tournaments",
)

function selectTab(id: string) {
	page(TAB_TO_PATH[id as keyof typeof TAB_TO_PATH])
}
</script>

<div class="compete-page">
	<h1>Compete</h1>
	<SegmentedTabs options={TABS} selected={activeTab} onselect={selectTab} fullWidth />

	{#if activeTab === "challenge"}
		<Challenges />
	{:else if activeTab === "badges"}
		<Badges />
	{:else}
		<Tournaments />
	{/if}
</div>

<style>
.compete-page {
	max-width: 480px;
	margin: 0 auto;
	padding: var(--space-8) var(--space-6);
	display: flex;
	flex-direction: column;
	gap: var(--space-5);
}

h1 {
	font-family: var(--font-display);
	font-size: var(--font-size-xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
	margin: 0;
}
</style>
