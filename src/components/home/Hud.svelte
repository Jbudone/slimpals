<script lang="ts">
// The top bar on every tab (Layout Lab HUD): level ring + XP bar, coins,
// Sweat, Greens and the streak. Tapping a pill explains where it comes from.
import { checkinState } from "../../lib/checkin.svelte.js"
import { wallet } from "../../lib/wallet.svelte.js"
import { page } from "../../router.svelte.js"
import { COIN_SVG, FLAME_SVG, GREENS_SVG, SWEAT_SVG } from "./icons"

const RING = 116.2

const w = $derived(wallet.data)
const k = $derived(
	w ? Math.min(1, Math.max(0, w.xpIntoLevel / Math.max(1, w.xpForLevel))) : 0,
)
const streak = $derived(checkinState.data?.streakCount ?? 0)

let tip = $state<string | null>(null)
let tipTimer: ReturnType<typeof setTimeout> | null = null

const TIPS = {
	coins:
		"Coins come from the gym itself: busy machines, the front desk and the Slim Kitchen. Tap the bubbles to collect. They buy plots, gear and upgrades.",
	sweat:
		"Sweat comes from exercise tasks only. Spend it on a build: 1 Sweat takes an hour off.",
	greens:
		"Greens come from diet tasks: meals, water, weigh-ins. They run the Slim Kitchen.",
	streak: "Your check-in streak. Check in every day to keep it going.",
} as const

function explain(key: keyof typeof TIPS) {
	tip = TIPS[key]
	if (tipTimer) clearTimeout(tipTimer)
	tipTimer = setTimeout(() => {
		tip = null
	}, 4500)
}

function fmt(n: number): string {
	return n.toLocaleString("en-US")
}
</script>

<header class="hud" data-testid="hud">
	<button
		type="button"
		class="lvl"
		aria-label="Level {w?.level ?? 0}, {w?.xpIntoLevel ?? 0} of {w?.xpForLevel ?? 0} XP. Gym levels"
		onclick={() => page("/upgrades")}
	>
		<span class="lvring" data-hud="xp">
			<svg viewBox="0 0 42 42" aria-hidden="true"
				><circle class="tr" cx="21" cy="21" r="18.5" /><circle
					class="fg"
					cx="21"
					cy="21"
					r="18.5"
					stroke-dasharray={RING}
					stroke-dashoffset={(RING * (1 - k)).toFixed(1)}
				/></svg
			>
			<b data-testid="hud-level">{w?.level ?? "–"}</b>
			<small>LV</small>
		</span>
		<span class="xpcol">
			<span class="xptxt"><b>{fmt(w?.xpIntoLevel ?? 0)}</b>/{fmt(w?.xpForLevel ?? 0)} XP</span>
			<span class="xpbar"><i style="width:{(k * 100).toFixed(1)}%"></i></span>
		</span>
	</button>
	<button type="button" class="pill" data-hud="coins" aria-label="{w?.coins ?? 0} coins" onclick={() => explain("coins")}>
		{@html COIN_SVG}<span data-testid="hud-coins">{fmt(w?.coins ?? 0)}</span>
	</button>
	<button type="button" class="pill" data-hud="sweat" aria-label="{w?.sweat ?? 0} Sweat" onclick={() => explain("sweat")}>
		{@html SWEAT_SVG}<span data-testid="hud-sweat">{w?.sweat ?? 0}</span>
	</button>
	<button type="button" class="pill" data-hud="greens" aria-label="{w?.greens ?? 0} Greens" onclick={() => explain("greens")}>
		{@html GREENS_SVG}<span data-testid="hud-greens">{w?.greens ?? 0}</span>
	</button>
	<button type="button" class="pill" data-hud="streak" aria-label="{streak} day streak" onclick={() => explain("streak")}>
		{@html FLAME_SVG}<span>{streak}</span>
	</button>
</header>
{#if tip}
	<div class="hud-tip" role="status">{tip}</div>
{/if}

<style>
.hud {
	position: fixed;
	left: 6px;
	right: 6px;
	top: calc(env(safe-area-inset-top, 0px) + 8px);
	z-index: 30;
	height: 54px;
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 0 6px;
	border-radius: 20px;
	background: linear-gradient(180deg, rgba(30, 63, 39, 0.96), rgba(23, 51, 31, 0.96));
	color: #f2f7f0;
	box-shadow:
		0 6px 18px rgba(15, 32, 22, 0.28),
		inset 0 1px 0 rgba(255, 255, 255, 0.06);
	max-width: 520px;
	margin: 0 auto;
}

button {
	border: 0;
	font: inherit;
	color: inherit;
	cursor: pointer;
	-webkit-tap-highlight-color: transparent;
}

.lvl {
	display: flex;
	align-items: center;
	gap: 7px;
	flex: 1;
	min-width: 0;
	background: none;
	padding: 0;
	border-radius: 12px;
}

.lvring {
	position: relative;
	width: 42px;
	height: 42px;
	flex: none;
}

.lvring svg {
	position: absolute;
	inset: 0;
	transform: rotate(-90deg);
}

.lvring circle {
	fill: none;
	stroke-width: 4.5;
}

.lvring .tr {
	stroke: rgba(255, 255, 255, 0.12);
}

.lvring .fg {
	stroke: #34c973;
	stroke-linecap: round;
	transition: stroke-dashoffset 0.6s cubic-bezier(0.3, 1.3, 0.5, 1);
}

.lvring b {
	position: absolute;
	inset: 5px;
	border-radius: 50%;
	background: #0f2016;
	display: grid;
	place-items: center;
	font: 800 17px/1 ui-rounded, system-ui, sans-serif;
}

.lvring small {
	position: absolute;
	left: 50%;
	bottom: -5px;
	transform: translateX(-50%);
	font: 800 8.5px/1 system-ui, sans-serif;
	letter-spacing: 0.06em;
	background: #34c973;
	color: #063218;
	padding: 2px 4px;
	border-radius: 5px;
}

.xpcol {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
	text-align: left;
}

.xptxt {
	font: 700 10px/1 system-ui, sans-serif;
	color: #8fae95;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.xptxt b {
	color: #f2f7f0;
}

.xpbar {
	height: 7px;
	border-radius: 9px;
	background: rgba(255, 255, 255, 0.12);
	overflow: hidden;
}

.xpbar i {
	display: block;
	height: 100%;
	border-radius: 9px;
	background: linear-gradient(90deg, #34c973, #9af0b9);
	transition: width 0.6s cubic-bezier(0.3, 1.3, 0.5, 1);
}

.pill {
	display: flex;
	align-items: center;
	gap: 3px;
	height: 32px;
	padding: 0 8px 0 5px;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.08);
	font: 800 15px/1 ui-rounded, system-ui, sans-serif;
	white-space: nowrap;
	flex: none;
	font-variant-numeric: tabular-nums;
}

.pill:active {
	transform: scale(0.95);
}

.pill :global(svg) {
	width: 20px;
	height: 20px;
	flex: none;
}

.hud-tip {
	position: fixed;
	top: calc(env(safe-area-inset-top, 0px) + 68px);
	left: 12px;
	right: 12px;
	max-width: 420px;
	margin: 0 auto;
	z-index: 31;
	background: #fff;
	color: #241d15;
	border-radius: 14px;
	padding: 9px 12px;
	font: 600 13px/1.4 system-ui, sans-serif;
	box-shadow: 0 6px 18px rgba(15, 32, 22, 0.28);
	animation: tip-in 0.25s cubic-bezier(0.2, 1.4, 0.4, 1);
}

@keyframes tip-in {
	from {
		opacity: 0;
		transform: translateY(-6px);
	}
}

@media (max-width: 360px) {
	.pill {
		font-size: 13px;
		padding: 0 6px 0 4px;
	}
	.pill :global(svg) {
		width: 17px;
		height: 17px;
	}
}
</style>
