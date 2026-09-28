<script lang="ts">
// The Social tab: the pals' feed, challenges, tournaments and badges (the
// old Compete tabs fold in here; gym levels moved to Progress).
import SegmentedTabs from "../components/ui/SegmentedTabs.svelte"
import { nav, page } from "../router.svelte.js"
import Badges from "./Badges.svelte"
import Challenges from "./Challenges.svelte"
import Social from "./Social.svelte"
import Tournaments from "./Tournaments.svelte"

const TABS = [
	{ id: "feed", label: "Feed" },
	{ id: "challenge", label: "Challenge" },
	{ id: "tournaments", label: "Tourneys" },
	{ id: "badges", label: "Badges" },
]

const TAB_TO_PATH = {
	feed: "/social",
	challenge: "/challenges",
	tournaments: "/tournaments",
	badges: "/badges",
} as const

let activeTab = $derived(
	nav.path === "/challenges"
		? "challenge"
		: nav.path === "/badges"
			? "badges"
			: nav.path === "/tournaments"
				? "tournaments"
				: "feed",
)

function selectTab(id: string) {
	page(TAB_TO_PATH[id as keyof typeof TAB_TO_PATH])
}
</script>

<div class="hub-page">
	<h1>Social</h1>
	<SegmentedTabs options={TABS} selected={activeTab} onselect={selectTab} fullWidth />

	{#if activeTab === "challenge"}
		<Challenges />
	{:else if activeTab === "badges"}
		<Badges />
	{:else if activeTab === "tournaments"}
		<Tournaments />
	{:else}
		<Social embedded />
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

/* four segments on a phone */
.hub-page :global(.ui-segmented-tabs.full-width .segment.segment) {
	padding-inline: 4px;
	font-size: 0.875rem;
}

h1 {
	font-family: var(--font-display);
	font-size: var(--font-size-xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
	margin: 0;
}
</style>
