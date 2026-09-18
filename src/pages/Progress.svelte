<script lang="ts">
import SegmentedTabs from "../components/ui/SegmentedTabs.svelte"
import { nav, page } from "../router.svelte.js"
import Food from "./Food.svelte"
import Weight from "./Weight.svelte"

const TABS = [
	{ id: "weight", label: "Weight" },
	{ id: "food", label: "Food" },
]

let activeTab = $derived(nav.path === "/food" ? "food" : "weight")

function selectTab(id: string) {
	page(id === "food" ? "/food" : "/weight")
}
</script>

<div class="progress-page">
	<h1>Progress</h1>
	<SegmentedTabs options={TABS} selected={activeTab} onselect={selectTab} />

	{#if activeTab === "weight"}
		<Weight />
	{:else}
		<Food />
	{/if}
</div>

<style>
.progress-page {
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
