<script lang="ts">
// The gym's star rating and the next few goals: a round star button under
// the coach (the account avatar owns the top-right corner) that opens a
// small card. The server computes both; finishing a
// goal pays Sweat or Greens once.
import { onMount } from "svelte"
import { api } from "../../lib/api.js"
import { cosmetics, wearOutfit } from "../../lib/cosmetics.svelte.js"
import { gymGoals, openGoals, rewardText } from "../../lib/goals.svelte.js"
import {
	claimRewardStep,
	loadRewardTrack,
	rewardTrack,
	stepText,
} from "../../lib/rewardTrack.svelte.js"
import { loadWallet } from "../../lib/wallet.svelte.js"

let { top = 64, onBought }: { top?: number; onBought?: () => void } = $props()

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
})

const outfits = $derived(cosmetics.owned.filter((c) => c.kind === "outfit"))
const burger = $derived(gymGoals.burger)
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
		aria-label="Gym rating {stars} of 5 stars. Goals"
		aria-expanded={open}
		onclick={() => (open = !open)}
		data-testid="gym-stars"
	>
		<span aria-hidden="true">★</span><b>{stars}</b>
	</button>
	{#if open}
		<div class="card" style="top:{top + 56}px" role="dialog" aria-label="Gym goals" data-testid="goals-card">
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
			{/if}
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

.star span {
	color: #f2b21a;
	font-size: 18px;
}

.card {
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
