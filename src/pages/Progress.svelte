<script lang="ts">
// The Progress tab: weight and eaten-today tiles, then Weight, Food and
// Gym levels (the upgrade list that used to sit under Compete).
import ProgressTiles from "../components/ProgressTiles.svelte"
import SegmentedTabs from "../components/ui/SegmentedTabs.svelte"
import { nav, page } from "../router.svelte.js"
import Food from "./Food.svelte"
import GymUpgrades from "./GymUpgrades.svelte"
import Weight from "./Weight.svelte"

const TABS = [
	{ id: "weight", label: "Weight" },
	{ id: "food", label: "Food" },
	{ id: "gym", label: "Gym levels" },
]

let activeTab = $derived(
	nav.path === "/food" ? "food" : nav.path === "/upgrades" ? "gym" : "weight",
)

function selectTab(id: string) {
	page(id === "food" ? "/food" : id === "gym" ? "/upgrades" : "/weight")
}
</script>

<div class="progress-page">
	<h1>Progress</h1>
	<ProgressTiles />
	<SegmentedTabs options={TABS} selected={activeTab} onselect={selectTab} fullWidth />

	{#if activeTab === "weight"}
		<Weight />
	{:else if activeTab === "gym"}
		<GymUpgrades />
	{:else}
		<Food />
	{/if}
</div>

<style>
.progress-page {
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
