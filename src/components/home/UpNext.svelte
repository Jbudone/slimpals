<script lang="ts">
// The gym home's "next unlock" bubble under the account avatar: the next
// piece of gear, a ring for how close it is and the XP to go. One tap opens the
// rewards tab of the drawer with the whole road ahead. Only the next one shows here; the
// rest of the road is on that page (three in full, one hinted).

import { openDrawer } from "../../lib/drawer.svelte.js"
import { gymGoals } from "../../lib/goals.svelte.js"
import { roomIcon } from "../../lib/roomIcons.js"
import { upcomingUnlocks } from "../../lib/unlocks.js"
import { wallet } from "../../lib/wallet.svelte.js"

let { top }: { top: number } = $props()

const next = $derived(
	upcomingUnlocks(gymGoals.locked, wallet.data?.xp ?? 0, 1)[0],
)
const RING = 113.1
</script>

{#if next}
	<button
		type="button"
		class="upnext"
		style="top:{top}px"
		onclick={() => openDrawer("rewards")}
		aria-label="Next unlock: {next.name}, {next.toGo} XP to go"
		data-testid="upnext"
	>
		<span class="pic" aria-hidden="true">
			<svg viewBox="0 0 42 42"
				><circle class="tr" cx="21" cy="21" r="18" /><circle
					class="fg"
					cx="21"
					cy="21"
					r="18"
					stroke-dasharray={RING}
					stroke-dashoffset={(RING * (1 - next.k)).toFixed(1)}
				/></svg
			>
			<span class="em">{roomIcon(next.roomType)}</span>
		</span>
		<b>{next.toGo.toLocaleString("en-US")}</b>
		<small>XP</small>
	</button>
{/if}

<style>
.upnext {
	position: absolute;
	right: 10px;
	z-index: 9;
	width: 52px;
	padding: 5px 0 4px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0;
	border: 0;
	border-radius: 16px;
	background: #fff3c7;
	color: #241d15;
	box-shadow:
		0 0 0 2px #f2b21a,
		0 3px 10px rgba(30, 20, 10, 0.25);
	font: inherit;
	cursor: pointer;
}

.pic {
	position: relative;
	width: 36px;
	height: 36px;
	display: grid;
	place-items: center;
}

.pic svg {
	position: absolute;
	inset: 0;
	transform: rotate(-90deg);
}

.pic circle {
	fill: none;
	stroke-width: 4;
}

.pic .tr {
	stroke: rgba(0, 0, 0, 0.12);
}

.pic .fg {
	stroke: #34c973;
	stroke-linecap: round;
}

.em {
	font-size: 18px;
	animation: wob 3s ease-in-out infinite;
}

@keyframes wob {
	0%,
	100% {
		transform: rotate(0);
	}
	45% {
		transform: rotate(-9deg) scale(1.08);
	}
	55% {
		transform: rotate(9deg) scale(1.08);
	}
}

b {
	font: 800 12px/1.1 ui-rounded, system-ui, sans-serif;
}

small {
	font: 700 8.5px/1 system-ui, sans-serif;
	letter-spacing: 0.06em;
	color: #6b5a47;
}

@media (prefers-reduced-motion: reduce) {
	.em {
		animation: none;
	}
}
</style>
