<script lang="ts">
// The month's reward track as a path you walk: one node a day, big chests
// on the milestone days with their rewards on show, the step you can take
// today glowing. Scrolls sideways and opens on the step that is next.
import type { GymRewardTrackDto } from "../../../shared/types"
import { chipHtml } from "./icons"

let {
	track,
	error = "",
	onclaim,
}: {
	track: GymRewardTrackDto
	error?: string
	onclaim: (el: HTMLElement) => void
} = $props()

const nextN = $derived(track.claimed + 1)
const nextStep = $derived(track.steps.find((s) => !s.claimed) ?? null)
const nextBig = $derived(
	track.steps.find((s) => !s.claimed && s.milestone) ?? null,
)
const done = $derived(track.claimed >= track.steps.length)
const fill = $derived(
	track.steps.length > 1
		? Math.min(1, track.claimed / (track.steps.length - 1))
		: 0,
)

let scroller = $state<HTMLElement | null>(null)

// open on the next step, in the middle of the strip
$effect(() => {
	const sc = scroller
	void nextN
	if (!sc) return
	const el = sc.querySelector<HTMLElement>('[data-next="true"]')
	if (el)
		sc.scrollLeft = el.offsetLeft - sc.clientWidth / 2 + el.clientWidth / 2
})

function chips(r: { coins: number; sweat: number; greens: number }): string[] {
	return [
		chipHtml("co", r.coins),
		...(r.sweat ? [chipHtml("sw", r.sweat)] : []),
		...(r.greens ? [chipHtml("gr", r.greens)] : []),
	]
}
</script>

<section class="track" aria-label="{track.theme} reward track" data-testid="reward-track">
	<header>
		<h3>{track.theme}</h3>
		<span class="count" data-testid="track-count">{track.claimed} / {track.steps.length}</span>
	</header>

	<div class="strip" bind:this={scroller} data-noswipe>
		<div class="path" style="--n:{track.steps.length}">
			<i class="rail" aria-hidden="true"></i>
			<i class="railfill" aria-hidden="true" style="--k:{fill}"></i>
			{#each track.steps as s (s.n)}
				<div
					class="node"
					class:big={s.milestone}
					class:claimed={s.claimed}
					class:next={s.n === nextN && !done}
					class:ready={s.n === nextN && track.canClaim}
					data-next={s.n === nextN && !done}
					data-testid="track-node-{s.n}"
				>
					<span class="orb">
						{#if s.claimed}
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						{:else if s.milestone}
							<span class="gift" aria-hidden="true">{s.reward.cosmetic ? "🎁" : "🎉"}</span>
						{:else}
							<b>{s.n}</b>
						{/if}
					</span>
					<span class="day">Day {s.n}</span>
					<span class="prize">
						{#each chips(s.reward) as c}<em>{@html c}</em>{/each}
					</span>
					{#if s.cosmeticName}<span class="cos">★ {s.cosmeticName}</span>{/if}
				</div>
			{/each}
		</div>
	</div>

	<div class="today">
		{#if done}
			<p class="line">Every step taken this month. See you next month.</p>
		{:else if nextStep}
			<p class="line" data-testid="track-progress">
				{#if track.canClaim}Today's step is ready:{:else}Next step:{/if}
				{#each chips(nextStep.reward) as c}<em class="inl">{@html c}</em>{/each}
				{#if nextStep.cosmeticName}<span class="cos inl">★ {nextStep.cosmeticName}</span>{/if}
			</p>
			{#if nextBig && nextBig !== nextStep}
				<p class="sub">
					Big reward on day {nextBig.n} ({nextBig.n - track.claimed} step{nextBig.n - track.claimed === 1 ? "" : "s"} away):
					{#each chips(nextBig.reward) as c}<em class="inl">{@html c}</em>{/each}
					{#if nextBig.cosmeticName}<span class="cos inl">★ {nextBig.cosmeticName}</span>{/if}
				</p>
			{/if}
		{/if}
		<button
			type="button"
			class="claim"
			disabled={!track.canClaim}
			onclick={(e) => onclaim(e.currentTarget)}
			data-testid="track-claim-big"
		>
			{track.canClaim ? "Take today's step" : done ? "All done" : "Come back tomorrow"}
		</button>
		{#if error || (!track.canClaim && track.blockedReason && !done)}
			<p class="sub">{error || track.blockedReason}</p>
		{/if}
	</div>
</section>

<style>
.track {
	padding: 14px 0 12px;
	border-radius: 18px;
	background: linear-gradient(180deg, var(--color-surface-2, #1c3b27), var(--color-surface, #14291c));
	color: #eaf7ee;
	box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.06);
}

header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	padding: 0 16px;
}

h3 {
	margin: 0;
	font: 800 15px/1.2 system-ui, sans-serif;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: #9af0b9;
}

.count {
	font: 800 13px system-ui, sans-serif;
	color: #f2c14a;
}

.strip {
	overflow-x: auto;
	overscroll-behavior-x: contain;
	scroll-snap-type: x proximity;
	padding: 18px 16px 10px;
	scrollbar-width: none;
}

.strip::-webkit-scrollbar {
	display: none;
}

.path {
	position: relative;
	display: flex;
	align-items: flex-start;
	gap: 8px;
	width: max-content;
}

.rail,
.railfill {
	position: absolute;
	left: 28px;
	top: 27px;
	height: 6px;
	border-radius: 3px;
}

.rail {
	right: 28px;
	background: rgba(255, 255, 255, 0.12);
}

.railfill {
	width: calc((100% - 56px) * var(--k));
	background: linear-gradient(90deg, #34c973, #f2c14a);
}

.node {
	position: relative;
	flex: none;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 3px;
	width: 58px;
	scroll-snap-align: center;
	font: 700 11px/1.15 system-ui, sans-serif;
	text-align: center;
}

.node.big {
	width: 92px;
}

.orb {
	position: relative;
	display: grid;
	place-items: center;
	width: 38px;
	height: 38px;
	margin-top: 8px;
	border: 3px solid #3c5c47;
	border-radius: 50%;
	background: #20402c;
	color: #b9d8c4;
	font: 800 14px system-ui, sans-serif;
}

.big .orb {
	width: 52px;
	height: 52px;
	margin-top: 1px;
	border-color: #f2c14a;
	background: radial-gradient(circle at 35% 30%, #5a4a1a, #2e2610);
}

.gift {
	font-size: 26px;
}

.claimed .orb {
	border-color: #34c973;
	background: #1f9a55;
}

.claimed .orb svg {
	width: 22px;
	height: 22px;
}

.next .orb {
	border-color: #f2c14a;
	background: #2c5a3a;
	color: #fff;
}

.ready .orb {
	animation: orb-pulse 1.4s ease-in-out infinite;
	box-shadow: 0 0 0 4px rgba(242, 193, 74, 0.35), 0 0 18px rgba(242, 193, 74, 0.7);
}

@keyframes orb-pulse {
	50% {
		transform: scale(1.12);
	}
}

.day {
	color: #8fb39c;
	font-size: 10px;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.next .day {
	color: #f2c14a;
}

.prize {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1px;
	color: #d9f0e0;
}

.prize em,
.inl {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	font-style: normal;
	font-weight: 800;
}

.prize :global(svg),
.inl :global(svg) {
	width: 13px;
	height: 13px;
}

.cos {
	max-width: 88px;
	color: #f2c14a;
	font-weight: 800;
}

.cos.inl {
	max-width: none;
}

.today {
	padding: 4px 16px 0;
}

.line,
.sub {
	margin: 4px 0;
	font: 600 13px/1.4 system-ui, sans-serif;
}

.sub {
	color: #a9c6b3;
	font-size: 12px;
}

.claim {
	width: 100%;
	margin-top: 8px;
	padding: 13px 14px;
	border: 0;
	border-radius: 14px;
	background: linear-gradient(180deg, #ffd35a, #f2a81a);
	color: #3a2600;
	font: 900 15px system-ui, sans-serif;
	box-shadow: 0 3px 0 #b07a10;
	cursor: pointer;
}

.claim:disabled {
	background: #2c4a37;
	color: #8fb39c;
	box-shadow: none;
	cursor: default;
}

@media (prefers-reduced-motion: reduce) {
	.ready .orb {
		animation: none;
	}
}
</style>
