<script lang="ts">
import { onMount } from "svelte"
import Avatar from "../components/ui/Avatar.svelte"
import Button from "../components/ui/Button.svelte"
import Card from "../components/ui/Card.svelte"
import Pill from "../components/ui/Pill.svelte"
import { api } from "../lib/api.js"
import { authState } from "../lib/auth.svelte.js"
import { computeInitials } from "../lib/initials.js"
import {
	TOURNAMENT_TYPE_LABELS as TYPE_LABELS,
	TOURNAMENT_TYPE_UNITS as TYPE_UNITS,
} from "../lib/tournamentLabels.js"

type Tournament = {
	id: number
	name: string
	creatorId: string
	startDate: string
	endDate: string
	type: string
	goalValue: number | null
	rewardDescription: string | null
	winnerId: string | null
	victoryMessage: string | null
	resolvedAt: string | null
	participantCount: number
}

type LeaderboardEntry = {
	userId: string
	userName: string
	score: number
}

type LeaderboardResponse = {
	tournament: {
		id: number
		name: string
		type: string
		startDate: string
		endDate: string
		winnerId: string | null
		victoryMessage: string | null
		resolvedAt: string | null
	}
	leaderboard: LeaderboardEntry[]
}

let tournaments = $state<Tournament[]>([])
let leaderboards = $state<Record<number, LeaderboardResponse>>({})
let loading = $state(true)
let error = $state<string | null>(null)
let showCreate = $state(false)
let creating = $state(false)
let joining = $state<number | null>(null)
let nudging = $state<number | null>(null)
let nudgedIds = $state<Set<number>>(new Set())

let formName = $state("")
let formType = $state("weight_loss")
let formStartDate = $state("")
let formEndDate = $state("")
let formReward = $state("")

let myId = $derived(authState.user?.id ?? null)

async function load() {
	try {
		tournaments = await api.get<Tournament[]>("/tournaments")
	} catch {
		error = "Failed to load tournaments"
		loading = false
		return
	}
	loading = false

	// Settle independently — one tournament's leaderboard failing to load
	// shouldn't blank out the others.
	await Promise.allSettled(
		tournaments.map(async (t) => {
			const res = await api.get<LeaderboardResponse>(
				`/tournaments/${t.id}/leaderboard`,
			)
			leaderboards = { ...leaderboards, [t.id]: res }
		}),
	)
}

async function createTournament() {
	if (!formName || !formStartDate || !formEndDate) return
	creating = true
	try {
		await api.post("/tournaments", {
			name: formName,
			startDate: formStartDate,
			endDate: formEndDate,
			type: formType,
			rewardDescription: formReward || undefined,
		})
		showCreate = false
		formName = ""
		formType = "weight_loss"
		formStartDate = ""
		formEndDate = ""
		formReward = ""
		await load()
	} catch {
		error = "Failed to create tournament"
	} finally {
		creating = false
	}
}

async function joinTournament(id: number) {
	joining = id
	try {
		await api.post(`/tournaments/${id}/join`)
		await load()
	} catch (e: unknown) {
		error = e instanceof Error ? e.message : "Failed to join"
	} finally {
		joining = null
	}
}

async function nudgeGroup(id: number) {
	nudging = id
	try {
		await api.post(`/tournaments/${id}/nudge`)
		nudgedIds = new Set(nudgedIds).add(id)
	} catch (e: unknown) {
		error = e instanceof Error ? e.message : "Failed to nudge the group"
	} finally {
		nudging = null
	}
}

function formatDate(d: string) {
	return new Date(d).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	})
}

function daysLeft(endDate: string): number {
	return Math.max(
		0,
		Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000),
	)
}

function tournamentStatus(t: Tournament): "upcoming" | "live" | "ended" {
	if (t.resolvedAt) return "ended"
	const now = Date.now()
	if (new Date(t.startDate).getTime() > now) return "upcoming"
	if (new Date(t.endDate).getTime() < now) return "ended"
	return "live"
}

onMount(load)
</script>

<div class="tournaments-tab">
	{#if error}
		<p class="error">{error}</p>
	{/if}

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if tournaments.length === 0}
		<Card padding="md">
			<p class="muted">No tournaments yet. Start one to get the group going!</p>
		</Card>
	{:else}
		{#each tournaments as t (t.id)}
			{@const status = tournamentStatus(t)}
			{@const board = leaderboards[t.id]}
			{@const joined = board?.leaderboard.some((e) => e.userId === myId) ?? false}
			<Card>
				<div class="card-top">
					<h3>{t.name}</h3>
					<Pill tone={status === "live" ? "accent" : "neutral"}>
						{status.charAt(0).toUpperCase() + status.slice(1)}
					</Pill>
				</div>
				<p class="meta">
					{TYPE_UNITS[t.type] ?? TYPE_LABELS[t.type] ?? t.type}
					· {t.participantCount} pal{t.participantCount === 1 ? "" : "s"}
					· {status === "ended" ? `ended ${formatDate(t.endDate)}` : `ends in ${daysLeft(t.endDate)} days`}
				</p>

				{#if board && board.leaderboard.length > 0}
					<div class="leaderboard-rows">
						{#each board.leaderboard as entry, i (entry.userId)}
							<div
								class="leaderboard-row"
								class:is-me={entry.userId === myId}
								class:winner={entry.userId === board.tournament.winnerId}
							>
								<span class="rank">
									{#if i === 0 && board.tournament.winnerId}🏆{:else}{i + 1}{/if}
								</span>
								<Avatar size={32} tone="accent" initials={computeInitials(entry.userName)} />
								<span class="name">{entry.userId === myId ? "You" : entry.userName}</span>
								<span class="score">
									{entry.score}{TYPE_UNITS[t.type]?.startsWith("%") ? "%" : ""}
								</span>
							</div>
						{/each}
					</div>
				{/if}

				{#if board?.tournament.victoryMessage}
					<div class="victory-banner">
						<p class="victory-msg">{board.tournament.victoryMessage}</p>
					</div>
				{/if}

				{#if joined}
					<Button
						variant="secondary"
						onclick={() => nudgeGroup(t.id)}
						disabled={nudging === t.id || nudgedIds.has(t.id)}
					>
						{nudgedIds.has(t.id) ? "Nudged!" : nudging === t.id ? "Nudging…" : "Nudge the group"}
					</Button>
				{:else if status !== "ended"}
					<Button onclick={() => joinTournament(t.id)} disabled={joining === t.id}>
						{joining === t.id ? "Joining…" : "Join"}
					</Button>
				{/if}
			</Card>
		{/each}
	{/if}

	{#if showCreate}
		<Card>
			<form class="create-form" onsubmit={(e) => { e.preventDefault(); createTournament() }}>
				<div class="form-row">
					<label>
						Name
						<input type="text" bind:value={formName} placeholder="Summer Shred" required />
					</label>
					<label>
						Type
						<select bind:value={formType}>
							<option value="weight_loss">Weight Loss</option>
							<option value="streak">Check-in Streak</option>
							<option value="food_challenge">Food Quality</option>
							<option value="step_count">Step Count</option>
						</select>
					</label>
				</div>
				<div class="form-row">
					<label>
						Start Date
						<input type="date" bind:value={formStartDate} required />
					</label>
					<label>
						End Date
						<input type="date" bind:value={formEndDate} required />
					</label>
				</div>
				<label>
					Reward (optional)
					<input type="text" bind:value={formReward} placeholder="Bragging rights!" />
				</label>
				<Button type="submit" disabled={creating}>
					{creating ? "Creating…" : "Create Tournament"}
				</Button>
			</form>
		</Card>
	{/if}

	<button class="start-btn" onclick={() => (showCreate = !showCreate)} type="button">
		{showCreate ? "Cancel" : "+ Start a new tournament"}
	</button>
</div>

<style>
.tournaments-tab {
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
}

.muted {
	color: var(--color-text-muted);
	font-size: var(--font-size-sm);
}

.error {
	background: color-mix(in srgb, var(--color-danger) 15%, transparent);
	border: 1px solid var(--color-danger);
	color: var(--color-danger);
	border-radius: var(--radius-sm);
	padding: 0.625rem 0.875rem;
	font-size: var(--font-size-sm);
	margin: 0;
}

.card-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-3);
}

h3 {
	font-family: var(--font-display);
	font-size: var(--font-size-lg);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
	margin: 0;
}

.meta {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
	margin: 0;
}

.leaderboard-rows {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
}

.leaderboard-row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	padding: var(--space-2) var(--space-3);
	border-radius: var(--radius-md);
	background: var(--color-surface-2);
}

.leaderboard-row.is-me {
	background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface-2));
	border: 1px solid var(--color-accent);
}

.leaderboard-row.winner {
	background: color-mix(in srgb, var(--color-warning) 15%, var(--color-surface-2));
	border: 1px solid var(--color-warning);
}

.rank {
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-muted);
	min-width: 1.25rem;
	text-align: center;
}

.name {
	flex: 1;
	min-width: 0;
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	color: var(--color-text);
}

.score {
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.victory-banner {
	background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	border: 1px solid var(--color-accent);
	border-radius: var(--radius-md);
	padding: var(--space-3) var(--space-4);
}

.victory-msg {
	font-size: var(--font-size-sm);
	color: var(--color-text);
	font-style: italic;
	margin: 0;
	line-height: 1.5;
}

.start-btn {
	background: transparent;
	border: 2px dashed var(--color-border);
	color: var(--color-text-muted);
	border-radius: var(--radius-full);
	padding: var(--space-3);
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	cursor: pointer;
}

.start-btn:hover {
	border-color: var(--color-accent);
	color: var(--color-accent);
}

.create-form {
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
}

.form-row {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: var(--space-3);
}

label {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	color: var(--color-text-muted);
}

input,
select {
	padding: 0.5rem 0.75rem;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	background: var(--color-surface-2);
	color: var(--color-text);
	font-size: var(--font-size-sm);
}
</style>
