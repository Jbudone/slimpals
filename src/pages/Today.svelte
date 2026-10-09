<script lang="ts">
// The Today tab: the day's tasks (check-in, daily and weekly missions, with
// add / edit / archive), today's challenge goals and tournaments, the
// coach's weekly note, the streak and the gym's day. Weight and food tiles live on
// Progress.
import { Dumbbell } from "@lucide/svelte"
import { onMount } from "svelte"
import type { CoachPersonality } from "../../shared/types.js"
import CompeteCard from "../components/CompeteCard.svelte"
import GymActivityCard from "../components/GymActivityCard.svelte"
import TodayList from "../components/home/TodayList.svelte"
import UnlockRail from "../components/home/UnlockRail.svelte"
import Avatar from "../components/ui/Avatar.svelte"
import Button from "../components/ui/Button.svelte"
import Card from "../components/ui/Card.svelte"
import Pill from "../components/ui/Pill.svelte"
import ProgressBar from "../components/ui/ProgressBar.svelte"
import { api } from "../lib/api.js"
import { checkinState, loadCheckinStatus } from "../lib/checkin.svelte.js"
import { gymGoals } from "../lib/goals.svelte.js"
import { loadRewardTrack, rewardTrack } from "../lib/rewardTrack.svelte.js"
import { loadToday } from "../lib/today.svelte.js"
import { claimAsk, wallet } from "../lib/wallet.svelte.js"
import { page } from "../router.svelte.js"

type GymDailySummary = {
	todayEvent: { title: string; description: string } | null
	streakBonus: { active: boolean; multiplier: number; currentStreak: number }
	pendingUpgrades: Array<{ key: string; name: string; category: string }>
	level: number
	xp: number
	xpToNextLevel: number
	xpIntoLevel: number
	xpForLevel: number
}

type WeeklyInspiration = {
	id: number
	message: string
	weekStart: string
	generatedAt: string
	coachPersonality: CoachPersonality
} | null

const COACH_NAMES: Record<CoachPersonality, string> = {
	friendly: "Coach Sam",
	drill_sergeant: "Sarge",
	roaster: "The Roaster",
	anime_sensei: "Sensei",
	bro: "Bro",
}

let loading = $state(true)
let inspiration = $state<WeeklyInspiration>(null)
let gymSummary = $state<GymDailySummary | null>(null)

const MILESTONES = [7, 30, 100]

async function loadInspiration() {
	try {
		inspiration = await api.get<WeeklyInspiration>("/inspiration/weekly")
	} catch {
		// ignore — card stays hidden
	}
}

async function loadGymSummary() {
	try {
		gymSummary = await api.get<GymDailySummary>("/gym/daily-summary")
	} catch {
		// ignore — gym card stays hidden if not unlocked
	}
}

/** Home plays the claim build for the next unlocked upgrade. */
function placeUpgrade() {
	claimAsk.n++
	page("/")
}

function nextMilestone(streak: number): number | null {
	return MILESTONES.find((m) => m > streak) ?? null
}

function ringMax(streak: number): number {
	return nextMilestone(streak) ?? Math.max(streak, 1)
}

onMount(() => {
	loadCheckinStatus().finally(() => {
		loading = false
	})
	loadInspiration()
	loadGymSummary()
	void loadToday()
	void loadRewardTrack()
})
</script>

<div class="dashboard">
	<h1>Today</h1>

	<CompeteCard />

	{#if rewardTrack.data}
		{@const t = rewardTrack.data}
		<button
			type="button"
			class="rewards-row"
			onclick={() => page("/rewards")}
			data-testid="today-rewards"
		>
			<span class="gift" aria-hidden="true">🎁</span>
			<span class="rw-copy">
				<b>{t.theme} track · {t.claimed}/{t.steps.length}</b>
				<small>{t.canClaim ? "Today's step is ready" : "See what is coming up"}</small>
			</span>
			<span class="rw-go" aria-hidden="true">›</span>
		</button>
	{/if}

	{#if gymGoals.locked.length}
		<section class="upnext" data-testid="today-upnext" aria-label="Up next in your gym">
			<h3>Up next in your gym</h3>
			<UnlockRail gear={gymGoals.locked} xp={wallet.data?.xp ?? 0} compact />
		</section>
	{/if}

	<div class="tasks"><TodayList editable /></div>

	{#if inspiration}
		<section class="card inspiration-card">
			<div class="inspiration-header">
				<span class="inspiration-icon">💬</span>
				<span class="inspiration-coach">{COACH_NAMES[inspiration.coachPersonality]}</span>
			</div>
			<p class="inspiration-message">{inspiration.message}</p>
		</section>
	{/if}

	{#if !loading && checkinState.data}
		{@const status = checkinState.data}
		<Card>
			<div class="streak-body">
				<ProgressBar
					variant="circular"
					value={status.streakCount}
					max={ringMax(status.streakCount)}
					size={92}
					thickness={8}
				>
					{#snippet children()}
						<div class="ring-content">
							<span class="ring-count">{status.streakCount}</span>
							<span class="ring-label">days</span>
						</div>
					{/snippet}
				</ProgressBar>

				<div class="streak-copy">
					<div class="streak-heading-row">
						<h2 class="streak-heading">
							{status.checkedInToday ? "You're on a roll" : "Keep the fire going"}
						</h2>
						{#if MILESTONES.includes(status.streakCount)}
							<Pill tone="accent">{status.streakCount}-day milestone!</Pill>
						{/if}
					</div>

					<p class="streak-subtext">
						{status.checkedInToday
							? "You've checked in today."
							: "Check in above before midnight or the streak resets."}
					</p>

					{#if status.streakCount > 0}
						{@const next = nextMilestone(status.streakCount)}
						{#if next}
							<p class="to-milestone">
								{next - status.streakCount} day{next - status.streakCount === 1 ? "" : "s"} to {next}-day milestone
							</p>
						{/if}
					{/if}
				</div>
			</div>
		</Card>
	{/if}

	{#if (gymSummary?.pendingUpgrades.length ?? 0) > 0}
		<Card>
			<h2 class="running-heading">Ready for you</h2>

			{#if gymSummary && gymSummary.pendingUpgrades.length > 0}
				<div class="running-row">
					<Avatar tone="accent">
						{#snippet icon()}
							<Dumbbell size={18} />
						{/snippet}
					</Avatar>
					<div class="running-copy">
						<span class="running-title running-title-accent">
							{gymSummary.pendingUpgrades.length} gym upgrade{gymSummary.pendingUpgrades.length === 1 ? "" : "s"} ready
						</span>
						<span class="running-subtext">Place it in your gym</span>
					</div>
					<Button variant="secondary" onclick={placeUpgrade}>Place</Button>
				</div>
			{/if}
		</Card>
	{/if}

	{#if gymSummary}
		<GymActivityCard
			todayEvent={gymSummary.todayEvent}
			streakBonus={gymSummary.streakBonus}
		/>
	{/if}
</div>

<style>
.rewards-row {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	width: 100%;
	padding: 0.75rem 1rem;
	border: 2px solid rgba(242, 193, 74, 0.45);
	border-radius: var(--radius-lg, 16px);
	background: linear-gradient(180deg, #1f3f2a, #17301f);
	color: var(--color-text);
	font: inherit;
	text-align: left;
	cursor: pointer;
}

.rewards-row .gift {
	font-size: 1.6rem;
}

.rw-copy {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
}

.rw-copy small {
	color: var(--color-text-muted);
}

.rw-go {
	font-size: 1.5rem;
	color: #f2c14a;
}

.dashboard {
	max-width: 480px;
	margin: 0 auto;
	padding: 1.5rem 1rem 2rem;
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
}

h1 {
	font-size: 1.5rem;
	font-weight: 700;
	color: var(--color-text);
	margin: 0;
}

.card {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 0.75rem;
	padding: 1.5rem;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.streak-body {
	display: flex;
	align-items: center;
	gap: var(--space-6);
}

.ring-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	line-height: 1;
}

.ring-count {
	font-family: var(--font-display);
	font-size: var(--font-size-2xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.ring-label {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	margin-top: var(--space-1);
}

.streak-copy {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
	flex: 1;
	min-width: 0;
}

.streak-heading-row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	flex-wrap: wrap;
}

.streak-heading {
	font-family: var(--font-display);
	font-size: var(--font-size-xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
	margin: 0;
}

.streak-subtext {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
	margin: 0;
}

.to-milestone {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
	margin: 0;
}

/* In the running */
.running-heading {
	font-family: var(--font-display);
	font-size: var(--font-size-lg);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
	margin: 0;
}

.running-row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
}

.running-copy {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
	flex: 1;
	min-width: 0;
}

.running-title {
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	color: var(--color-text);
}

.running-title-accent {
	color: var(--color-accent);
}

.running-subtext {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

/* Inspiration card */
.inspiration-card {
	border-color: var(--color-accent);
	background: color-mix(in srgb, var(--color-accent) 6%, var(--color-surface));
}

.inspiration-header {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.inspiration-icon {
	font-size: 1.25rem;
	line-height: 1;
}

.inspiration-coach {
	font-size: 0.8125rem;
	font-weight: 700;
	color: var(--color-accent);
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.inspiration-message {
	font-size: 0.9375rem;
	color: var(--color-text);
	line-height: 1.5;
	margin: 0;
	font-style: italic;
}
.upnext {
	margin: 0.75rem 0;
	padding: 12px;
	border-radius: 16px;
	background: #fff7ea;
	color: #241d15;
}

.upnext h3 {
	margin: 0 0 8px;
	font: 800 12px/1.2 system-ui, sans-serif;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: #1f9a55;
}
</style>
