<script lang="ts">
import { onMount } from "svelte"
import { api } from "../lib/api.js"

type CheckinStatus = {
	checkedInToday: boolean
	streakCount: number
}

let status = $state<CheckinStatus | null>(null)
let loading = $state(true)
let checkingIn = $state(false)
let checkinDone = $state(false)

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

async function handleCheckin() {
	checkingIn = true
	try {
		const res = await api.post<CheckinStatus & { streakCount: number }>(
			"/checkins",
			{},
		)
		status = { checkedInToday: true, streakCount: res.streakCount }
		checkinDone = true
	} finally {
		checkingIn = false
	}
}

function nextMilestone(streak: number): number | null {
	return MILESTONES.find((m) => m > streak) ?? null
}

onMount(loadStatus)
</script>

<div class="dashboard">
	<h1>Dashboard</h1>

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
</style>
