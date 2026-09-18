<script lang="ts">
import { Dumbbell, Trophy } from "@lucide/svelte"
import { onMount } from "svelte"
import type { CoachPersonality } from "../../shared/types.js"
import GymActivityCard from "../components/GymActivityCard.svelte"
import Avatar from "../components/ui/Avatar.svelte"
import Button from "../components/ui/Button.svelte"
import Card from "../components/ui/Card.svelte"
import Pill from "../components/ui/Pill.svelte"
import ProgressBar from "../components/ui/ProgressBar.svelte"
import { api } from "../lib/api.js"
import { authState } from "../lib/auth.svelte.js"
import {
	checkinState,
	loadCheckinStatus,
	submitCheckin,
} from "../lib/checkin.svelte.js"
import { showBadgeToast } from "../lib/toast.svelte.js"
import { TOURNAMENT_TYPE_UNITS } from "../lib/tournamentLabels.js"
import { userProfile } from "../lib/user.svelte.js"
import { page } from "../router.svelte.js"

type GymDailySummary = {
	todayEvent: { title: string; description: string } | null
	streakBonus: { active: boolean; multiplier: number; currentStreak: number }
	pendingUpgrades: Array<{ key: string; name: string; category: string }>
}

type WeightEntry = { id: number; weightKg: number; recordedAt: string }

type WeightSummary = { latestKg: number; changeKg: number | null }

type FoodLog = {
	id: number
	aiAnalysis: { macros: { calories: number } } | null
	loggedAt: string
}

type TournamentListItem = {
	id: number
	name: string
	type: string
	endDate: string
	resolvedAt: string | null
}

type LeaderboardEntry = { userId: string; userName: string; score: number }

type LeaderboardResponse = {
	tournament: { id: number; name: string; type: string; endDate: string }
	leaderboard: LeaderboardEntry[]
}

type TournamentStanding = {
	name: string
	rank: number
	totalParticipants: number
	gapText: string | null
	daysLeft: number
}

type ChallengeCurrent = {
	title: string
	joined: boolean
	goalsCompleted: number
	totalGoals: number
} | null

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
let checkingIn = $state(false)
let checkinDone = $state(false)
let inspiration = $state<WeeklyInspiration>(null)
let gymSummary = $state<GymDailySummary | null>(null)
let weightSummary = $state<WeightSummary | null>(null)
let foodTodayCalories = $state<number | null>(null)
let tournamentStanding = $state<TournamentStanding | null>(null)
let challengeCurrent = $state<ChallengeCurrent>(null)

const MILESTONES = [7, 30, 100]

// The Today screen only needs a handful of active tournaments checked before
// giving up on finding one the user is actually in — this is a small
// dashboard widget, not a full tournament browser.
const MAX_TOURNAMENTS_TO_CHECK = 5

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

async function loadWeightSummary() {
	try {
		const entries = await api.get<WeightEntry[]>("/weight")
		if (entries.length === 0) return
		const latestKg = entries[entries.length - 1].weightKg
		const changeKg = entries.length > 1 ? latestKg - entries[0].weightKg : null
		weightSummary = { latestKg, changeKg }
	} catch {
		// ignore — tile stays hidden
	}
}

function isToday(iso: string): boolean {
	const d = new Date(iso)
	const now = new Date()
	return (
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate()
	)
}

async function loadFoodToday() {
	try {
		const logs = await api.get<FoodLog[]>("/food/logs")
		foodTodayCalories = logs
			.filter((l) => isToday(l.loggedAt))
			.reduce((sum, l) => sum + (l.aiAnalysis?.macros.calories ?? 0), 0)
	} catch {
		// ignore — tile stays hidden
	}
}

async function loadTournamentStanding() {
	try {
		const tournaments = await api.get<TournamentListItem[]>("/tournaments")
		const active = tournaments
			.filter((t) => t.resolvedAt === null)
			.sort(
				(a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime(),
			)
			.slice(0, MAX_TOURNAMENTS_TO_CHECK)

		const myId = authState.user?.id
		if (!myId) return

		for (const t of active) {
			const res = await api.get<LeaderboardResponse>(
				`/tournaments/${t.id}/leaderboard`,
			)
			const rank = res.leaderboard.findIndex((e) => e.userId === myId)
			if (rank === -1) continue

			const unit = TOURNAMENT_TYPE_UNITS[t.type] ?? ""
			const gapText =
				rank === 0
					? null
					: `${formatScore(res.leaderboard[rank - 1].score - res.leaderboard[rank].score)} ${unit} behind ${res.leaderboard[rank - 1].userName}`
			const daysLeft = Math.max(
				0,
				Math.ceil((new Date(t.endDate).getTime() - Date.now()) / 86_400_000),
			)

			tournamentStanding = {
				name: t.name,
				rank: rank + 1,
				totalParticipants: res.leaderboard.length,
				gapText,
				daysLeft,
			}
			return
		}
	} catch {
		// ignore — row stays hidden
	}
}

async function loadChallengeCurrent() {
	try {
		challengeCurrent = await api.get<ChallengeCurrent>("/challenges/current")
	} catch {
		// ignore — row stays hidden
	}
}

async function handleCheckin() {
	checkingIn = true
	try {
		const res = await submitCheckin()
		checkinDone = true
		if (res.newBadges?.length) {
			for (const b of res.newBadges) showBadgeToast(b)
		}
	} finally {
		checkingIn = false
	}
}

function nextMilestone(streak: number): number | null {
	return MILESTONES.find((m) => m > streak) ?? null
}

function ringMax(streak: number): number {
	return nextMilestone(streak) ?? Math.max(streak, 1)
}

function formatScore(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

onMount(() => {
	loadCheckinStatus().finally(() => {
		loading = false
	})
	loadInspiration()
	loadGymSummary()
	loadWeightSummary()
	loadFoodToday()
	loadTournamentStanding()
	loadChallengeCurrent()
})
</script>

<div class="dashboard">
	<h1>Dashboard</h1>

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

					{#if !status.checkedInToday}
						<p class="streak-subtext">
							Check in before midnight or the streak resets.
						</p>
						<Button onclick={handleCheckin} disabled={checkingIn}>
							{checkingIn ? "Checking in…" : "Check in now"}
						</Button>
					{:else}
						<p class="streak-subtext">
							{checkinDone ? "Checked in! Keep it up." : "You've checked in today."}
						</p>
					{/if}

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

	{#if weightSummary || foodTodayCalories !== null}
		<div class="tile-row">
			{#if weightSummary}
				<Card padding="md">
					<span class="tile-label">Weight</span>
					<span class="tile-value">{weightSummary.latestKg} <span class="tile-unit">kg</span></span>
					{#if weightSummary.changeKg !== null}
						<span class="tile-sub" class:tile-sub-good={weightSummary.changeKg < 0}>
							{weightSummary.changeKg > 0 ? "+" : ""}{weightSummary.changeKg.toFixed(1)} kg total
						</span>
					{/if}
				</Card>
			{/if}
			{#if foodTodayCalories !== null}
				<Card padding="md">
					<span class="tile-label">Eaten Today</span>
					<span class="tile-value">
						{foodTodayCalories}
						{#if userProfile.data?.dailyCalorieGoal}
							<span class="tile-unit">/ {userProfile.data.dailyCalorieGoal}</span>
						{/if}
					</span>
					{#if userProfile.data?.dailyCalorieGoal}
						<ProgressBar
							variant="linear"
							value={foodTodayCalories}
							max={userProfile.data.dailyCalorieGoal}
						/>
					{/if}
				</Card>
			{/if}
		</div>

		<div class="tile-actions">
			<Button variant="secondary" onclick={() => page("/weight")}>Log weight</Button>
			<Button variant="secondary" onclick={() => page("/food")}>Snap a meal</Button>
		</div>
	{/if}

	{#if tournamentStanding || (challengeCurrent?.joined ?? false) || (gymSummary?.pendingUpgrades.length ?? 0) > 0}
		<Card>
			<h2 class="running-heading">In the running</h2>

			{#if tournamentStanding}
				<div class="running-row">
					<Avatar tone="accent" initials={String(tournamentStanding.rank)} />
					<div class="running-copy">
						<span class="running-title">
							{tournamentStanding.name} · {tournamentStanding.rank === 1 ? "1st" : `${tournamentStanding.rank}${tournamentStanding.rank === 2 ? "nd" : tournamentStanding.rank === 3 ? "rd" : "th"}`} of {tournamentStanding.totalParticipants}
						</span>
						<span class="running-subtext">
							{tournamentStanding.gapText ?? "In the lead"} · {tournamentStanding.daysLeft} day{tournamentStanding.daysLeft === 1 ? "" : "s"} left
						</span>
					</div>
				</div>
			{/if}

			{#if challengeCurrent?.joined}
				<div class="running-row">
					<Avatar tone="accent">
						{#snippet icon()}
							<Trophy size={18} />
						{/snippet}
					</Avatar>
					<div class="running-copy">
						<span class="running-title">
							{challengeCurrent.title} · {challengeCurrent.goalsCompleted}/{challengeCurrent.totalGoals}
						</span>
						<ProgressBar
							variant="linear"
							value={challengeCurrent.goalsCompleted}
							max={challengeCurrent.totalGoals}
						/>
					</div>
				</div>
			{/if}

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
						<span class="running-subtext">Spend your streak points</span>
					</div>
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
.dashboard {
	max-width: 480px;
	margin: 0 auto;
	padding: 2rem 1.5rem;
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

/* Weight / Eaten Today tiles */
.tile-row {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: var(--space-4);
}

.tile-label {
	display: block;
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	margin-bottom: var(--space-2);
}

.tile-value {
	display: block;
	font-family: var(--font-display);
	font-size: var(--font-size-xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.tile-unit {
	font-family: var(--font-sans);
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-normal);
	color: var(--color-text-muted);
}

.tile-sub {
	display: block;
	margin-top: var(--space-2);
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.tile-sub-good {
	color: var(--color-success);
}

.tile-actions {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: var(--space-3);
}

.tile-actions :global(.ui-button) {
	width: 100%;
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
</style>
