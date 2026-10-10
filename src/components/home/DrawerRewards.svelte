<script lang="ts">
// The drawer's Rewards segment: the month's track (take today's step right
// here) and the road ahead, no page to open.
import { onMount } from "svelte"
import { gymGoals } from "../../lib/goals.svelte.js"
import {
	claimRewardStep,
	loadRewardTrack,
	rewardTrack,
} from "../../lib/rewardTrack.svelte.js"
import { loadWallet, wallet } from "../../lib/wallet.svelte.js"
import RewardTrack from "./RewardTrack.svelte"
import UnlockTrack from "./UnlockTrack.svelte"

onMount(() => {
	void loadRewardTrack()
	void loadWallet()
})
</script>

<div class="rw" data-testid="drawer-rewards">
	{#if rewardTrack.data}
		<div class="dark">
			<RewardTrack
				track={rewardTrack.data}
				error={rewardTrack.error}
				onclaim={(el) => void claimRewardStep(el)}
			/>
		</div>
	{/if}
	<UnlockTrack gear={gymGoals.locked} xp={wallet.data?.xp ?? 0} />
</div>

<style>
.dark {
	border-radius: 20px;
	/* the track is drawn for a dark card: keep its palette inside the cream drawer */
	--color-surface: #14291c;
	--color-surface-2: #1c3b27;
	--color-text: #eaf7ee;
	--color-text-muted: #9fc3ab;
	--color-border: #2c5a3c;
}

.rw {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding-top: 4px;
}
</style>
