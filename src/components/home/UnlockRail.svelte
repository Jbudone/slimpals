<script lang="ts">
// The road ahead as sticker cards: the next three unlocks in full (the first
// with a progress ring), a mystery card for the one after, nothing beyond, so
// there is always something about to be discovered. `compact` is the grid used
// in the level-up card and on Today; the default is the list on the rewards page.
import { roomIcon } from "../../lib/roomIcons"
import type { LockedGear } from "../../lib/unlocks"
import { unlockRail } from "../../lib/unlocks"

let {
	gear,
	xp,
	compact = false,
}: { gear: readonly LockedGear[]; xp: number; compact?: boolean } = $props()

const rail = $derived(unlockRail(gear, xp))
const RING = 113.1
const fmt = (n: number) => n.toLocaleString("en-US")
</script>

{#if rail.shown.length === 0}
	<p class="done">Everything is unlocked. Build, upgrade and decorate.</p>
{:else}
	<ol class="rail" class:compact data-testid="unlock-rail">
		{#each rail.shown as s, i (s.key)}
			<li class="card" class:first={i === 0} style="--fade:{1 - i * 0.16}" data-testid="unlock-{s.key}">
				<span class="pic" aria-hidden="true">
					{#if i === 0}
						<svg viewBox="0 0 42 42"
							><circle class="tr" cx="21" cy="21" r="18" /><circle
								class="fg"
								cx="21"
								cy="21"
								r="18"
								stroke-dasharray={RING}
								stroke-dashoffset={(RING * (1 - s.k)).toFixed(1)}
							/></svg
						>
					{/if}
					<span class="em">{roomIcon(s.roomType)}</span>
				</span>
				<span class="body">
					<b>{s.name}</b>
					<small>{fmt(s.toGo)} XP to go</small>
				</span>
			</li>
		{/each}
		{#if rail.hint}
			<li class="card mystery" data-testid="unlock-hint">
				<span class="pic" aria-hidden="true"><span class="em">❓</span></span>
				<span class="body">
					<b>A surprise</b>
					<small>Level {rail.hint.level}</small>
				</span>
			</li>
		{/if}
	</ol>
{/if}

<style>
.rail {
	margin: 0;
	padding: 0;
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.card {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px 10px;
	border-radius: 14px;
	background: #fff;
	box-shadow: 0 2px 0 rgba(58, 38, 34, 0.12);
	opacity: var(--fade, 1);
	font: 600 13px/1.3 system-ui, sans-serif;
	color: #241d15;
}

.card.first {
	background: #fff3c7;
	box-shadow:
		0 0 0 2px #f2b21a,
		0 2px 0 rgba(58, 38, 34, 0.12);
}

.pic {
	position: relative;
	flex: none;
	width: 42px;
	height: 42px;
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
	stroke: rgba(0, 0, 0, 0.1);
}

.pic .fg {
	stroke: #34c973;
	stroke-linecap: round;
}

.em {
	font-size: 22px;
}

.first .em {
	animation: wob 2.6s ease-in-out infinite;
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

.mystery {
	background: repeating-linear-gradient(135deg, #f1e7d6 0 8px, #ebdfca 8px 16px);
	box-shadow: none;
	filter: saturate(0.5);
	opacity: 0.7;
}

.mystery .em {
	filter: grayscale(1);
	opacity: 0.7;
}

.body {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

small {
	color: #6b5a47;
	font-weight: 600;
}

.done {
	margin: 0;
	color: #6b5a47;
	font: 500 13px/1.4 system-ui, sans-serif;
}

/* the compact grid: four small cards across */
.compact {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 6px;
}

.compact .card {
	flex-direction: column;
	text-align: center;
	gap: 4px;
	padding: 8px 4px;
	font-size: 11px;
}

.compact .body b {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.compact small {
	font-size: 10px;
}

@media (prefers-reduced-motion: reduce) {
	.first .em {
		animation: none;
	}
}
</style>
