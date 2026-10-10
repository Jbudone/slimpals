<script lang="ts">
// What the gym unlocks next, on the rewards page: the road ahead as sticker
// cards (see UnlockRail: three in full, one hinted, the rest a surprise).
import type { LockedGear } from "../../lib/unlocks"
import UnlockRail from "./UnlockRail.svelte"

let { gear, xp }: { gear: readonly LockedGear[]; xp: number } = $props()
</script>

<section class="unlocks" aria-label="Coming up in your gym" data-testid="unlock-track">
	<h3>Coming up</h3>
	<UnlockRail {gear} {xp} />
	<p class="hint">
		You have {xp.toLocaleString("en-US")} XP. Tasks, check-ins and challenges all earn it. What
		comes after the surprise stays a surprise until you get there.
	</p>
</section>

<style>

.unlocks {
	padding: 14px 16px;
	border-radius: 18px;
	background: #fff7ea;
	color: #241d15;
	box-shadow: 0 2px 0 rgba(58, 38, 34, 0.12);
}

h3 {
	margin: 0 0 8px;
	font: 800 12px/1.2 system-ui, sans-serif;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: #1f9a55;
}

.hint {
	margin: 8px 0 0;
	color: #6b5a47;
	font: 500 12px/1.4 system-ui, sans-serif;
}
</style>
