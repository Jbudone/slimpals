<script lang="ts">
import { onMount } from "svelte"
import type { CoachPersonality } from "../../shared/types.js"
import { api } from "../lib/api.js"
import { showBadgeToast } from "../lib/toast.svelte.js"

type NewBadge = { key: string; name: string; tier: string; earnedAt: string }

type CheckinStatus = {
	checkedInToday: boolean
	streakCount: number
}

type GymDailySummary = {
	todayEvent: { npcKey: string | null; activeHours: [number, number] } | null
	npcStatusUpdates: Array<{ npcKey: string; mood: number; moodVariant: string }>
	streakBonus: { active: boolean; multiplier: number; currentStreak: number }
	unclaimedXp: number
	pendingUpgrades: Array<{ key: string; name: string; category: string }>
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

let status = $state<CheckinStatus | null>(null)
let loading = $state(true)
let checkingIn = $state(false)
let checkinDone = $state(false)
let inspiration = $state<WeeklyInspiration>(null)
let gymSummary = $state<GymDailySummary | null>(null)

const MILESTONES = [7, 30, 100]

async function loadStatus() {
	try {
		status = await api.get<CheckinStatus>("/checkins/today")
	} catch {
		// ignore — widget stays hidden
	} finally {
		loading = false
	}
}

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

async function handleCheckin() {
	checkingIn = true
	try {
		const res = await api.post<
			CheckinStatus & { streakCount: number; newBadges?: NewBadge[] }
		>("/checkins", {})
		status = { checkedInToday: true, streakCount: res.streakCount }
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

onMount(() => {
	loadStatus()
	loadInspiration()
	loadGymSummary()
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

	{#if !loading && status}
		<section class="card streak-card">
			<div class="streak-header">
				<span class="streak-icon">🔥</span>
				<div>
					<div class="streak-count">{status.streakCount}</div>
					<div class="streak-label">day streak</div>
				</div>
				{#if MILESTONES.includes(status.streakCount)}
					<div class="milestone-badge">
						{status.streakCount}-day milestone!
					</div>
				{/if}
			</div>

			{#if !status.checkedInToday}
				<p class="prompt">You haven't checked in today yet.</p>
				<button
					class="checkin-btn"
					onclick={handleCheckin}
					disabled={checkingIn}
					type="button"
				>
					{checkingIn ? "Checking in…" : "Check in now"}
				</button>
			{:else}
				<p class="done-msg">
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
		</section>
	{/if}

	{#if gymSummary}
		<section class="card gym-card">
			<div class="gym-card-header">
				<span class="gym-icon">🏋️</span>
				<span class="gym-title">Today at Your Gym</span>
				{#if gymSummary.streakBonus.active}
					<span class="streak-multiplier">
						{gymSummary.streakBonus.multiplier}x XP &bull; {gymSummary.streakBonus.currentStreak}-day streak
					</span>
				{/if}
			</div>

			{#if gymSummary.todayEvent}
				<div class="gym-event">
					<span class="gym-event-label">Today's event</span>
					<span class="gym-event-hours">
						{gymSummary.todayEvent.activeHours[0]}:00–{gymSummary.todayEvent.activeHours[1]}:00
					</span>
				</div>
			{/if}

			{#if gymSummary.npcStatusUpdates.length > 0}
				<div class="npc-status-list">
					{#each gymSummary.npcStatusUpdates as npc (npc.npcKey)}
						<span class="npc-chip" class:energized={npc.moodVariant === 'energized'} class:tired={npc.moodVariant === 'tired'}>
							{npc.npcKey.replace(/^(trainer_|regular_|specialist_|receptionist_)/, '')}
							{#if npc.moodVariant === 'energized'}⚡{:else if npc.moodVariant === 'tired'}😴{/if}
						</span>
					{/each}
				</div>
			{/if}

			{#if gymSummary.pendingUpgrades.length > 0}
				<div class="pending-upgrades">
					<span class="pending-label">{gymSummary.pendingUpgrades.length} upgrade{gymSummary.pendingUpgrades.length === 1 ? '' : 's'} ready to claim</span>
				</div>
			{/if}

			<a href="/gym" class="gym-visit-btn">Visit gym</a>
		</section>
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

.streak-header {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.streak-icon {
	font-size: 2.5rem;
	line-height: 1;
}

.streak-count {
	font-size: 2.25rem;
	font-weight: 800;
	color: var(--color-accent);
	line-height: 1;
}

.streak-label {
	font-size: 0.8125rem;
	color: var(--color-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.milestone-badge {
	margin-left: auto;
	background: color-mix(in srgb, var(--color-warning) 20%, transparent);
	border: 1px solid var(--color-warning);
	color: var(--color-warning);
	font-size: 0.75rem;
	font-weight: 700;
	padding: 0.3rem 0.7rem;
	border-radius: 99px;
}

.prompt {
	font-size: 0.875rem;
	color: var(--color-text-muted);
	margin: 0;
}

.checkin-btn {
	background: var(--color-accent);
	color: #fff;
	border: none;
	border-radius: 0.375rem;
	padding: 0.625rem 1.25rem;
	font-size: 0.9375rem;
	font-weight: 600;
	cursor: pointer;
	align-self: flex-start;
}

.checkin-btn:hover:not(:disabled) {
	background: var(--color-accent-hover);
}

.checkin-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.done-msg {
	font-size: 0.875rem;
	color: var(--color-success);
	margin: 0;
}

.to-milestone {
	font-size: 0.8125rem;
	color: var(--color-text-muted);
	margin: 0;
}

/* Gym card */
.gym-card {
	border-color: var(--color-border);
}

.gym-card-header {
	display: flex;
	align-items: center;
	gap: 0.625rem;
}

.gym-icon {
	font-size: 1.375rem;
	line-height: 1;
}

.gym-title {
	font-size: 0.9375rem;
	font-weight: 700;
	color: var(--color-text);
}

.streak-multiplier {
	margin-left: auto;
	background: color-mix(in srgb, var(--color-accent) 15%, transparent);
	border: 1px solid var(--color-accent);
	color: var(--color-accent);
	font-size: 0.75rem;
	font-weight: 700;
	padding: 0.25rem 0.625rem;
	border-radius: 99px;
}

.gym-event {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-size: 0.8125rem;
}

.gym-event-label {
	color: var(--color-text-muted);
}

.gym-event-hours {
	font-weight: 600;
	color: var(--color-text);
}

.npc-status-list {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
}

.npc-chip {
	font-size: 0.75rem;
	padding: 0.2rem 0.5rem;
	border-radius: 99px;
	background: var(--color-bg);
	border: 1px solid var(--color-border);
	color: var(--color-text-muted);
	text-transform: capitalize;
}

.npc-chip.energized {
	border-color: var(--color-success);
	color: var(--color-success);
}

.npc-chip.tired {
	border-color: var(--color-text-muted);
	opacity: 0.7;
}

.pending-upgrades {
	font-size: 0.8125rem;
	color: var(--color-warning);
	font-weight: 600;
}

.pending-label {
	display: inline-block;
}

.gym-visit-btn {
	display: inline-block;
	background: var(--color-accent);
	color: #fff;
	text-decoration: none;
	border-radius: 0.375rem;
	padding: 0.5rem 1rem;
	font-size: 0.875rem;
	font-weight: 600;
	align-self: flex-start;
}

.gym-visit-btn:hover {
	background: var(--color-accent-hover);
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
