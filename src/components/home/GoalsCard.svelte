<script lang="ts">
// The gym's star rating and the next few goals: a round star button under
// the coach (the account avatar owns the top-right corner) that opens a
// small card. The server computes both; finishing a
// goal pays Sweat or Greens once.
import { onMount } from "svelte"
import { api } from "../../lib/api.js"
import {
	beginNextCampaign,
	campaign,
	loadCampaign,
} from "../../lib/campaign.svelte.js"
import { playClaimChime, setSound, soundOn } from "../../lib/chime.js"
import { cosmetics, wearOutfit } from "../../lib/cosmetics.svelte.js"
import { gymGoals, openGoals, rewardText } from "../../lib/goals.svelte.js"
import {
	claimRewardStep,
	loadRewardTrack,
	rewardTrack,
	stepText,
} from "../../lib/rewardTrack.svelte.js"
import { story } from "../../lib/story.svelte.js"
import { loadWallet } from "../../lib/wallet.svelte.js"
import { page } from "../../router.svelte.js"

let { top = 64, onBought }: { top?: number; onBought?: () => void } = $props()

let sound = $state(soundOn())
let open = $state(false)

const rating = $derived(gymGoals.rating)
const next = $derived(openGoals(gymGoals.goals))
const doneCount = $derived(gymGoals.goals.filter((g) => g.done).length)
const stars = $derived(rating?.stars ?? 1)
const track = $derived(rewardTrack.data)
const upNext = $derived(track?.steps.find((s) => !s.claimed) ?? null)
const nextBig = $derived(
	track?.steps.find((s) => !s.claimed && s.milestone) ?? null,
)

onMount(() => {
	void loadRewardTrack()
	void loadCampaign()
})

const outfits = $derived(cosmetics.owned.filter((c) => c.kind === "outfit"))
const burger = $derived(gymGoals.burger)
let beginning = $state(false)
async function nextCampaign() {
	if (
		!confirm(
			"Begin the next campaign? Your gym goes to the Hall of fame and you start a fresh one. Your cosmetics and trophies come with you.",
		)
	)
		return
	beginning = true
	if (await beginNextCampaign()) location.reload()
	beginning = false
}
let buying = $state(false)
let burgerError = $state("")
async function buyBurger() {
	buying = true
	burgerError = ""
	try {
		await api.post("/gym/layout/burger/buy", {})
		await loadWallet()
		onBought?.()
	} catch (e) {
		burgerError = e instanceof Error ? e.message : "Could not buy it"
	} finally {
		buying = false
	}
}
</script>

{#if rating}
	<button
		type="button"
		class="star"
		style="top:{top}px"
		aria-label="Gym rating {stars} of 5 stars. Goals{track?.canClaim
			? ". Today's reward track step is ready"
			: ''}"
		aria-expanded={open}
		onclick={() => (open = !open)}
		data-testid="gym-stars"
	>
		<span aria-hidden="true">★</span><b>{stars}</b>
		{#if track?.canClaim}
			<i class="dot" data-testid="track-dot" aria-hidden="true"></i>
		{/if}
	</button>
	{#if open}
		<div class="card" style="top:{top + 56}px; max-height: calc(100% - {top + 56 + 170}px)" role="dialog" aria-label="Gym goals" data-testid="goals-card">
			<div class="row" aria-hidden="true">
				{#each [1, 2, 3, 4, 5] as n}
					<span class="s" class:on={n <= stars}>★</span>
				{/each}
			</div>
			{#if rating.next != null}
				<div class="bar" aria-hidden="true"><i style="width:{(rating.k * 100).toFixed(0)}%"></i></div>
				<p class="hint">
					Score {rating.score.toFixed(rating.score % 1 ? 1 : 0)} of {rating.next} for star {stars + 1}.
					Rooms, levels, variety, decor and staff all count.
				</p>
			{:else}
				<p class="hint">Five stars. The best gym around.</p>
			{/if}
			{#if next.length}
				<h3>Next goals</h3>
				<ul>
					{#each next as g (g.id)}
						<li data-testid="goal-{g.id}">
							<span class="t">{g.title}</span>
							<span class="r">{rewardText(g.reward)}</span>
							{#if g.target > 1}
								<span class="p">{g.value}/{g.target}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="hint">Every goal is done.</p>
			{/if}
			{#if burger && burger.state !== "closed"}
				<h3>Burger Baron</h3>
				{#if burger.state === "forSale"}
					<p class="hint" data-testid="burger-forsale">
						Burger Baron is downsizing! Your gym is the best in town, so the building is yours for {burger.cost} coins.
					</p>
					<button
						type="button"
						class="claim"
						disabled={buying}
						onclick={() => void buyBurger()}
						data-testid="burger-buy"
					>
						Buy the Burger Baron
					</button>
					{#if burgerError}<p class="hint">{burgerError}</p>{/if}
				{:else}
					<p class="hint" data-testid="burger-bought">
						BURGER BARON Jr. (now smaller!) is yours.
					</p>
				{/if}
			{/if}
			{#if track}
				<h3>{track.theme} track</h3>
				<div class="bar" aria-hidden="true">
					<i style="width:{((track.claimed / track.steps.length) * 100).toFixed(0)}%"></i>
				</div>
				<p class="hint" data-testid="track-progress">
					Step {track.claimed} of {track.steps.length}.
					{#if upNext}Next: {stepText(upNext.reward, upNext.cosmeticName)}.{/if}
					{#if nextBig && nextBig !== upNext}Big one on day {nextBig.n}: {stepText(nextBig.reward, nextBig.cosmeticName)}.{/if}
				</p>
				<button
					type="button"
					class="claim"
					disabled={!track.canClaim}
					onclick={(e) => void claimRewardStep(e.currentTarget)}
					data-testid="track-claim"
				>
					{track.canClaim ? "Take today's step" : "Come back tomorrow"}
				</button>
				{#if rewardTrack.error || (!track.canClaim && track.blockedReason)}
					<p class="hint">{rewardTrack.error || track.blockedReason}</p>
				{/if}
				<button
					type="button"
					class="link"
					data-testid="rewards-open"
					onclick={() => {
						open = false
						page("/rewards")
					}}
				>
					See the whole track and what unlocks next
				</button>
			{/if}
			<h3>Sound</h3>
			<p class="hint">
				<button
					type="button"
					class="claim"
					data-testid="sound-toggle"
					onclick={() => {
						sound = !sound
						setSound(sound)
						if (sound) playClaimChime()
					}}
				>
					{sound ? "Sound on" : "Sound off"}
				</button>
			</p>
			{#if outfits.length}
				<h3>Coach outfit</h3>
				<ul class="outfits" data-testid="outfits">
					{#each outfits as o (o.key)}
						<li>
							<span>{o.name}</span>
							<button
								type="button"
								class="claim"
								onclick={() => void wearOutfit(o.key, !o.worn)}
								data-testid="outfit-{o.key}"
							>
								{o.worn ? "Take off" : "Put on"}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if story.data && (story.data.log.length > 0 || story.data.nextLevel !== null)}
				<h3>Story so far</h3>
				<ul class="outfits" data-testid="story-log">
					{#each story.data.log as c (c.id)}
						<li>
							<span><b>{c.title}.</b> {c.recap}</span>
						</li>
					{/each}
				</ul>
				{#if story.data.open && story.data.open.phase === "running"}
					<p class="hint" data-testid="open-score">
						The Pavement Street Open: you {story.data.open.you} XP, MaxOut {story.data.open.rival}
						of {story.data.open.rivalFinal}. {story.data.open.daysLeft} day{story.data.open.daysLeft === 1 ? "" : "s"} left.
					</p>
				{:else if story.data.open && story.data.open.phase === "ended"}
					<p class="hint" data-testid="open-result">
						The Open ended: you {story.data.open.you} XP against MaxOut's {story.data.open.rivalFinal}.
						{story.data.open.result === "win" ? "You took the better sign." : "MaxOut took it this time."}
					</p>
				{/if}
				{#if story.data.waitingForOpen}
					<p class="hint" data-testid="story-next-level">
						The next chapter opens when the Open ends.
					</p>
				{:else if story.data.nextLevel !== null}
					<p class="hint" data-testid="story-next-level">
						The next chapter opens at gym level {story.data.nextLevel}.
					</p>
				{/if}
			{/if}
			{#if campaign.data && (campaign.data.canFinish || campaign.data.hall.length > 0 || campaign.data.campaign > 1)}
				<h3>Campaign {campaign.data.campaign}</h3>
				{#if campaign.data.canFinish}
					<p class="hint" data-testid="campaign-done">
						The story of this campaign is finished. You can begin the next one whenever you like.
					</p>
					<button
						type="button"
						class="claim"
						disabled={beginning}
						onclick={() => void nextCampaign()}
						data-testid="campaign-next"
					>
						Begin the next campaign
					</button>
					{#if campaign.error}<p class="hint">{campaign.error}</p>{/if}
				{/if}
				{#if campaign.data.hall.length > 0}
					<p class="hint">Hall of fame</p>
					<ul class="outfits" data-testid="campaign-hall">
						{#each campaign.data.hall as h (h.campaign)}
							<li>
								<span>
									<b>Campaign {h.campaign}.</b>
									{#if h.summary}Level {h.summary.level}, {h.summary.days} days, {h.summary.pieces} pieces.{/if}
								</span>
							</li>
						{/each}
					</ul>
					<button
						type="button"
						class="link"
						data-testid="campaign-hall-open"
						onclick={() => {
							open = false
							page("/hall")
						}}
					>
						Open the Hall of fame
					</button>
				{/if}
			{/if}
			<small>{doneCount} of {gymGoals.goals.length} goals done</small>
		</div>
	{/if}
{/if}

<style>
.star {
	position: absolute;
	left: 10px;
	z-index: 9;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 2px;
	width: 50px;
	height: 50px;
	padding: 0;
	border: 3px solid #f2b21a;
	border-radius: 50%;
	background: #fff;
	color: #c4521f;
	font: 800 16px system-ui, sans-serif;
	box-shadow: 0 3px 10px rgba(30, 20, 10, 0.25);
	cursor: pointer;
	-webkit-tap-highlight-color: transparent;
}

.outfits {
	margin: 0;
	padding: 0;
	list-style: none;
}

.outfits li {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin: 4px 0;
}

.dot {
	position: absolute;
	top: -3px;
	right: -3px;
	width: 14px;
	height: 14px;
	border: 2px solid #fff;
	border-radius: 50%;
	background: #34c973;
	animation: dot-pulse 1.6s ease-in-out infinite;
}

@keyframes dot-pulse {
	50% { transform: scale(1.3); }
}

@media (prefers-reduced-motion: reduce) {
	.dot { animation: none; }
}

.star span {
	color: #f2b21a;
	font-size: 18px;
}

.card {
	overflow-y: auto;
	overscroll-behavior: contain;
	position: absolute;
	left: 10px;
	z-index: 10;
	width: min(290px, calc(100% - 20px));
	padding: 12px 14px;
	border-radius: 16px;
	background: #fff7ea;
	color: #241d15;
	box-shadow: 0 6px 20px rgba(58, 38, 34, 0.25);
	font: 600 13px/1.35 system-ui, sans-serif;
}

.row {
	display: flex;
	gap: 2px;
	font-size: 24px;
	line-height: 1;
}

.s {
	color: #d9cdbb;
}

.s.on {
	color: #f2b21a;
}

.bar {
	height: 8px;
	margin: 8px 0 4px;
	border-radius: 4px;
	background: #eadcc6;
	overflow: hidden;
}

.bar i {
	display: block;
	height: 100%;
	background: #34c973;
	border-radius: 4px;
}

.link {
	background: none;
	border: 0;
	padding: 4px 0;
	color: #8a5a16;
	font-weight: 700;
	text-decoration: underline;
	cursor: pointer;
}

.hint {
	margin: 4px 0 8px;
	color: #5c4a38;
	font-weight: 500;
}

h3 {
	margin: 6px 0 4px;
	font: 800 10.5px/1.2 system-ui, sans-serif;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: #1f9a55;
}

ul {
	margin: 0 0 8px;
	padding: 0;
	list-style: none;
}

li {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 0 8px;
	padding: 5px 0;
	border-top: 1px solid #eadcc6;
}

.t {
	font-weight: 700;
}

.r {
	grid-column: 1;
	color: #c4521f;
	font-size: 12px;
}

.p {
	grid-row: 1;
	grid-column: 2;
	color: #5c4a38;
}

.claim {
	width: 100%;
	margin: 0 0 6px;
	padding: 8px 10px;
	border: 0;
	border-radius: 10px;
	background: #34c973;
	color: #fff;
	font: 800 13px system-ui, sans-serif;
	cursor: pointer;
}

.claim:disabled {
	background: #d9cdbb;
	color: #8a7660;
	cursor: default;
}

small {
	color: #8a7660;
	font-weight: 600;
}
</style>
