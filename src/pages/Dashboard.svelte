<script lang="ts">
import { onMount } from "svelte"
import type { CoachPersonality } from "../../shared/types.js"
import Button from "../components/ui/Button.svelte"
import Card from "../components/ui/Card.svelte"
import Pill from "../components/ui/Pill.svelte"
import ProgressBar from "../components/ui/ProgressBar.svelte"
import { api } from "../lib/api.js"
import {
	checkinState,
	loadCheckinStatus,
	submitCheckin,
} from "../lib/checkin.svelte.js"
import { showBadgeToast } from "../lib/toast.svelte.js"

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

let loading = $state(true)
let checkingIn = $state(false)
let checkinDone = $state(false)
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

onMount(() => {
	loadCheckinStatus().finally(() => {
		loading = false
	})
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
