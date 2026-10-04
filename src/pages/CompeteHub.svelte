<script lang="ts">
// The Compete tab: this month's challenge and the tournaments, one tap from
// the tab bar (and a swipe apart).
import SegmentedTabs from "../components/ui/SegmentedTabs.svelte"
import { swipe } from "../lib/swipe.js"
import { nav, page } from "../router.svelte.js"
import Challenges from "./Challenges.svelte"
import Tournaments from "./Tournaments.svelte"

const TABS = [
	{ id: "challenge", label: "Challenges" },
	{ id: "tournaments", label: "Tournaments" },
]

const TAB_TO_PATH = {
	challenge: "/challenges",
	tournaments: "/tournaments",
} as const

let activeTab = $derived(
	nav.path === "/tournaments" ? "tournaments" : "challenge",
)

function selectTab(id: string) {
	page(TAB_TO_PATH[id as keyof typeof TAB_TO_PATH])
}
</script>

<div
	class="hub-page"
	use:swipe={{
		left: () => {
			if (activeTab !== "challenge") return false
			selectTab("tournaments")
			return true
		},
		right: () => {
			if (activeTab !== "tournaments") return false
			selectTab("challenge")
			return true
		},
	}}
>
	<h1>Compete</h1>
	<SegmentedTabs options={TABS} selected={activeTab} onselect={selectTab} fullWidth />

	{#if activeTab === "tournaments"}
		<Tournaments />
	{:else}
		<Challenges />
	{/if}
</div>

<style>
.hub-page {
	max-width: 480px;
	margin: 0 auto;
	padding: var(--space-6) var(--space-4) var(--space-8);
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
