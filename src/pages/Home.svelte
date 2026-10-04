<script lang="ts">
// The Gym tab and home screen: the 3D gym full screen under the HUD, the
// coach with a line for the day, the Today drawer peeking above the tab bar
// and "Place it" for unlocked gear. Stays mounted while the player is on
// other tabs (hidden, so the renderer pauses) to make coming back instant.
import { onMount } from "svelte"
import {
	type ChallengeStanding,
	COACH_NAMES,
	type CoachSay,
	coachLineFor,
	isCoachVoice,
	seededRng,
} from "../../shared/gym3d/coachLines.js"
import type { GymLayoutDto } from "../../shared/types.js"
import NpcDialog from "../components/gym3d/NpcDialog.svelte"
import GoalsCard from "../components/home/GoalsCard.svelte"
import { coachSvg } from "../components/home/icons"
import StoryCard from "../components/home/StoryCard.svelte"
import TodayDrawer from "../components/home/TodayDrawer.svelte"
import { api } from "../lib/api.js"
import { challengeStanding } from "../lib/challengeCoach.js"
import { checkinState } from "../lib/checkin.svelte.js"
import { cosmetics, loadOwnedCosmetics } from "../lib/cosmetics.svelte.js"
import { gymGoals, rewardText, setGymGoals } from "../lib/goals.svelte.js"
import { loadStory, story } from "../lib/story.svelte.js"
import { loadToday, today, todayCounts } from "../lib/today.svelte.js"
import { userProfile } from "../lib/user.svelte.js"
import {
	claimAsk,
	loadWallet,
	patchWallet,
	wallet,
} from "../lib/wallet.svelte.js"

let { active = true }: { active?: boolean } = $props()

type Gym3DComponent = typeof import("../components/gym3d/Gym3D.svelte").default
let Gym3D = $state<Gym3DComponent | null>(null)
let failed = $state<string | null>(null)
let mountKey = $state(0)
let drawerOpen = $state(false)
let dialogNpcKey = $state<string | null>(null)
let dialogPortrait = $state<string | null>(null)
let claim3d = $state<{ key: string; n: number } | null>(null)
let claiming = $state(false)
let hudBottom = $state(72)
/** The coach, wearing the outfits the gym owns. */
const coach = $derived(
	coachSvg(
		cosmetics.keys,
		isCoachVoice(userProfile.data?.coachPersonality)
			? userProfile.data.coachPersonality
			: "friendly",
	),
)
let coachOpen = $state(true)
let coachTimer: ReturnType<typeof setTimeout> | null = null
let coachPick = $state(0)
/** A gym sheet (kitchen, job, piece...) or move mode is up: the drawer
 * steps aside so the sheet has the room. */
let sheetUp = $state(false)
/** Gym feedback ("Sweat spent...") the coach says for a moment. */
let tip = $state<{ text: string; kind: "info" | "error" } | null>(null)
let tipTimer: ReturnType<typeof setTimeout> | null = null
let sayH = $state(0)
/** Height of the coach avatar plus the goals star under it. */
const STAR_BAND = 116
/** The coach's corner under the HUD: gym cards (job timers, speech) are kept
 * below it so the coach's bubble never covers them. */
const coachBand = $derived(
	Math.max(
		(coachOpen || tip) && sayH ? Math.max(56, sayH + 10) : 56,
		// the goals star sits under the coach: cards stay below it too
		gymGoals.rating && !failed ? STAR_BAND : 0,
	),
)

function onTip(text: string, kind: "info" | "error") {
	tip = { text, kind }
	if (tipTimer) clearTimeout(tipTimer)
	tipTimer = setTimeout(() => {
		tip = null
	}, 4000)
}

const coachName = $derived(
	COACH_NAMES[userProfile.data?.coachPersonality ?? "friendly"] ?? "Coach Sam",
)

const pending = $derived(wallet.data?.pendingUpgrades ?? [])

/** What the coach said lately (a plain list: it only feeds the next pick). */
const recentCoach: string[] = []
let challengeStand = $state<ChallengeStanding | null>(null)
/** Coins waiting in the gym, in steps of 50 so the bubble holds still as they grow. */
let coinsWaiting = $state(0)
const coachSay = $derived.by((): CoachSay => {
	void coachPick
	const c = (() => {
		void checkinState.data
		void today.daily
		return todayCounts()
	})()
	const voice = isCoachVoice(userProfile.data?.coachPersonality)
		? userProfile.data.coachPersonality
		: "friendly"
	return coachLineFor(
		voice,
		{
			left: c.all - c.done,
			total: c.all,
			loaded: today.loaded,
			pendingGear: pending[0]?.name,
			streak: checkinState.data?.streakCount,
			hour: new Date().getHours(),
			challenge: challengeStand ?? undefined,
			coinsWaiting,
		},
		recentCoach,
		seededRng(coachPick),
	)
})

function showCoach(ms = 7000) {
	coachOpen = true
	recentCoach.push(coachSay.id)
	if (recentCoach.length > 3) recentCoach.shift()
	coachPick++
	if (coachTimer) clearTimeout(coachTimer)
	coachTimer = setTimeout(() => {
		coachOpen = false
	}, ms)
}

function onLayout(l: GymLayoutDto) {
	patchWallet({ coins: l.coins, sweat: l.sweat, greens: l.greens })
	setGymGoals(l)
	// the coach cheers goals the gym just reached (the server paid them)
	const done = l.goalsPaid?.[0]
	if (done)
		onTip(
			`Goal done: ${done.title}! ${rewardText(done.reward)}${
				l.goalsPaid && l.goalsPaid.length > 1
					? ` (and ${l.goalsPaid.length - 1} more)`
					: ""
			}`,
			"info",
		)
}

function handleNpcClick(npcKey: string, portrait: string | null = null) {
	dialogNpcKey = npcKey
	dialogPortrait = portrait
}

function closeDialog() {
	dialogNpcKey = null
	dialogPortrait = null
}

/** Claims an unlocked upgrade; the gym plays the build in place. */
async function claimNow(key: string | null) {
	const k = key ?? pending[0]?.key
	if (!k || claiming || failed) return
	claiming = true
	drawerOpen = false
	dialogNpcKey = null
	try {
		await api.post("/gym/claim-upgrade", { key: k })
		claim3d = { key: k, n: (claim3d?.n ?? 0) + 1 }
	} catch {
		claiming = false
	}
}

function claimDone() {
	claiming = false
	void loadWallet()
}

let askSeen = claimAsk.n
$effect(() => {
	const n = claimAsk.n
	if (n === askSeen || !active) return
	askSeen = n
	const key = claimAsk.key
	claimAsk.key = null
	void claimNow(key)
})

function load() {
	import("../components/gym3d/Gym3D.svelte")
		.then((m) => {
			Gym3D = m.default
		})
		.catch(() => {
			failed = "load"
		})
}

function hasWebGL2(): boolean {
	try {
		const c = document.createElement("canvas")
		const gl = c.getContext("webgl2")
		// free the probe's context at once (the gym makes its own)
		gl?.getExtension("WEBGL_lose_context")?.loseContext()
		return !!gl
	} catch {
		return false
	}
}

/** The joined monthly challenge, so the coach can speak about it now and then. */
async function loadChallengeStanding() {
	try {
		const c = await api.get<
			(Parameters<typeof challengeStanding>[0] & { joined: boolean }) | null
		>("/challenges/current")
		challengeStand = c?.joined ? challengeStanding(c) : null
	} catch {
		// the coach just stays on the day's tasks
	}
}

// a level-up can open the next chapter
let storyLevel = -1
$effect(() => {
	const lv = wallet.data?.level ?? -1
	if (lv !== storyLevel) {
		storyLevel = lv
		void loadStory()
	}
})

onMount(() => {
	void loadOwnedCosmetics()
	void loadChallengeStanding()
	if (!hasWebGL2()) failed = "webgl"
	else load()
	void loadToday()
	const hud = document.querySelector("[data-testid=hud]")
	if (hud) hudBottom = Math.round(hud.getBoundingClientRect().bottom) + 4
	showCoach(8000)
	if (import.meta.env.DEV)
		window.spRemountGym = () => {
			mountKey++
		}
	return () => {
		if (coachTimer) clearTimeout(coachTimer)
		if (tipTimer) clearTimeout(tipTimer)
		if (import.meta.env.DEV) window.spRemountGym = undefined
	}
})
</script>

<div class="home" class:off={!active} data-testid="home">
	{#if failed}
		<div class="fallback" data-testid="gym-fallback">
			<div class="card">
				<div class="coach-big">{@html coach}</div>
				<h2>Your gym needs a newer browser</h2>
				<p>
					{failed === "webgl"
						? "The 3D gym uses WebGL 2, which this browser or device does not have (or has turned off)."
						: "The gym could not load just now."}
					Your tasks, rewards and progress all still count: open Today to keep going.
				</p>
				{#if failed !== "webgl"}
					<button type="button" class="btn" onclick={() => {
						failed = null
						mountKey++
						load()
					}}>Try again</button>
				{/if}
			</div>
		</div>
	{:else if Gym3D}
		{#key mountKey}
			<Gym3D
				onNpcClick={handleNpcClick}
				onFallback={(r) => (failed = r.includes("WebGL") ? "webgl" : "load")}
				claim={claim3d}
				onClaimDone={claimDone}
				insetTop={hudBottom + coachBand}
				insetBottom={sheetUp ? 0 : 78}
				{onLayout}
				{onTip}
				onWaiting={(n) => (coinsWaiting = Math.floor(n / 50) * 50)}
				onSheet={(o) => {
					sheetUp = o
					if (o) drawerOpen = false
				}}
			/>
		{/key}
	{:else}
		<p class="loading">Opening your gym...</p>
	{/if}

	<button
		type="button"
		class="coach"
		style="top:{hudBottom + 4}px"
		onclick={() => (coachOpen ? (coachOpen = false) : showCoach())}
		aria-label="{coachName}"
		data-testid="coach"
	>
		{@html coach}
	</button>
	{#if !failed}
		<GoalsCard top={hudBottom + 62} onBought={() => mountKey++} />
	{/if}
	{#if active && !failed && !claiming && !sheetUp && story.data?.pending}
		<StoryCard />
	{/if}
	{#if tip}
		<div
			class="say"
			class:err={tip.kind === "error"}
			style="top:{hudBottom + 6}px"
			bind:clientHeight={sayH}
			role="status"
			data-testid="gym3d-tip"
		>
			<small>{coachName.toUpperCase()}</small>
			{tip.text}
		</div>
	{:else if coachOpen}
		<div
			class="say"
			style="top:{hudBottom + 6}px"
			bind:clientHeight={sayH}
			role="status"
			data-testid="coach-say"
		>
			<small>{coachName.toUpperCase()}</small>
			<b>{coachSay.lead}</b> {coachSay.rest}
		</div>
	{/if}

	{#if claiming}
		<div class="helpbuild" style="top:{hudBottom + 64}px" role="status">Tap the gym to help build!</div>
	{/if}

	{#if pending.length && !claiming && !failed && !sheetUp}
		<button type="button" class="place" onclick={() => claimNow(null)} data-testid="place-gear">
			<span class="dot">{pending.length}</span>Place new gear
		</button>
	{/if}

	{#if active}
		<TodayDrawer bind:open={drawerOpen} hidden={sheetUp} />
	{/if}

	{#if dialogNpcKey}
		<NpcDialog npcKey={dialogNpcKey} onClose={closeDialog} portrait={dialogPortrait} />
	{/if}
</div>

<style>
.home {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: var(--tab-h);
	z-index: 1;
	background: #f2c9b4;
	overflow: hidden;
}

.home.off {
	display: none;
}

.loading {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	margin: 0;
	color: #3a2622;
	font-weight: 700;
}

.coach {
	position: absolute;
	left: 10px;
	z-index: 9;
	width: 50px;
	height: 50px;
	padding: 0;
	border: 3px solid #34c973;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 3px 10px rgba(30, 20, 10, 0.25);
	cursor: pointer;
}

.coach :global(svg) {
	display: block;
	width: 100%;
	height: 100%;
	border-radius: 50%;
}

.say {
	position: absolute;
	left: 70px;
	right: 60px;
	max-width: 300px;
	z-index: 9;
	padding: 8px 12px 9px;
	border-radius: 16px 16px 16px 4px;
	background: #fff;
	color: #241d15;
	box-shadow: 0 4px 14px rgba(30, 20, 10, 0.2);
	font: 600 13.5px/1.35 system-ui, sans-serif;
	animation: say-in 0.3s cubic-bezier(0.2, 1.4, 0.4, 1);
	pointer-events: none;
}

.say small {
	display: block;
	color: #1f9a55;
	font: 800 10.5px/1.2 system-ui, sans-serif;
	letter-spacing: 0.12em;
	margin-bottom: 2px;
}

.say.err {
	background: #ffe3dc;
	color: #7a1f17;
}

.say b {
	color: #c4521f;
}

@keyframes say-in {
	from {
		opacity: 0;
		transform: translateX(-8px) scale(0.95);
	}
}

.helpbuild {
	position: absolute;
	left: 50%;
	transform: translateX(-50%);
	z-index: 9;
	padding: 8px 14px;
	border-radius: 999px;
	background: #fff7ea;
	color: #3a2622;
	font: 800 14px system-ui, sans-serif;
	box-shadow: 0 3px 0 #3a2622;
	border: 2px solid #3a2622;
	white-space: nowrap;
	pointer-events: none;
}

.place {
	position: absolute;
	right: 12px;
	bottom: 92px;
	z-index: 7;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 16px 10px 10px;
	border: 0;
	border-radius: 999px;
	background: #e8743b;
	color: #fff;
	font: 800 15px system-ui, sans-serif;
	box-shadow: 0 4px 0 #b4521f;
	cursor: pointer;
}

/* a soft halo pulses around it (the button itself stays put) */
.place::after {
	content: "";
	position: absolute;
	inset: -4px;
	border-radius: inherit;
	border: 3px solid #e8743b;
	opacity: 0;
	animation: halo 2s ease-out infinite;
	pointer-events: none;
}

.place .dot {
	display: grid;
	place-items: center;
	min-width: 24px;
	height: 24px;
	border-radius: 12px;
	background: #fff;
	color: #c4521f;
	font-size: 13px;
}

@keyframes pulse {
	50% {
		transform: scale(1.05);
	}
}

@media (prefers-reduced-motion: reduce) {
	.helpbuild {
	position: absolute;
	left: 50%;
	transform: translateX(-50%);
	z-index: 9;
	padding: 8px 14px;
	border-radius: 999px;
	background: #fff7ea;
	color: #3a2622;
	font: 800 14px system-ui, sans-serif;
	box-shadow: 0 3px 0 #3a2622;
	border: 2px solid #3a2622;
	white-space: nowrap;
	pointer-events: none;
}

.place {
		animation: none;
	}
}

.fallback {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	padding: 90px 16px 100px;
	background: linear-gradient(180deg, #f6dccb, #f2c9b4);
}

.card {
	max-width: 340px;
	padding: 22px 20px;
	border-radius: 22px;
	background: #fff7ea;
	color: #241d15;
	text-align: center;
	box-shadow: 0 6px 20px rgba(58, 38, 34, 0.18);
}

.coach-big {
	width: 72px;
	height: 72px;
	margin: 0 auto 8px;
}

.coach-big :global(svg) {
	width: 100%;
	height: 100%;
}

.card h2 {
	margin: 0 0 8px;
	font: 700 20px/1.2 var(--font-display, Georgia, serif);
}

.card p {
	margin: 0 0 12px;
	font: 500 14px/1.45 system-ui, sans-serif;
	color: #5c4a38;
}

.btn {
	border: 0;
	border-radius: 14px;
	padding: 10px 18px;
	background: #34c973;
	color: #fff;
	font: 800 15px system-ui, sans-serif;
	cursor: pointer;
}
</style>
