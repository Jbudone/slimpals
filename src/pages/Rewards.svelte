<script lang="ts">
// Rewards: the month's reward track as a path you walk, and what your gym
// unlocks next. Reached from the stars card and from Today.
import { onMount } from "svelte"
import RewardTrack from "../components/home/RewardTrack.svelte"
import UnlockTrack from "../components/home/UnlockTrack.svelte"
import { gymGoals } from "../lib/goals.svelte.js"
import {
	claimRewardStep,
	loadRewardTrack,
	rewardTrack,
} from "../lib/rewardTrack.svelte.js"
import { loadWallet, wallet } from "../lib/wallet.svelte.js"

onMount(() => {
	void loadRewardTrack()
	void loadWallet()
})
</script>

<div class="rewards-page">
	<h1>Rewards</h1>
	{#if rewardTrack.data}
		<RewardTrack
			track={rewardTrack.data}
			error={rewardTrack.error}
			onclaim={(el) => void claimRewardStep(el)}
		/>
	{/if}
	<UnlockTrack gear={gymGoals.locked} xp={wallet.data?.xp ?? 0} />
</div>

<style>
.rewards-page {
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
