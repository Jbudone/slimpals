<script lang="ts">
import { onMount } from "svelte"
import { api } from "../lib/api.js"
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
let loading = $state(true)
let error = $state<string | null>(null)
let showCreate = $state(false)
let creating = $state(false)

let selectedTournament = $state<Tournament | null>(null)
let leaderboard = $state<LeaderboardResponse | null>(null)
let leaderboardLoading = $state(false)

let formName = $state("")
let formType = $state("weight_loss")
let formStartDate = $state("")
let formEndDate = $state("")
let formReward = $state("")

async function load() {
	try {
		tournaments = await api.get<Tournament[]>("/tournaments")
	} catch {
		error = "Failed to load tournaments"
	} finally {
		loading = false
	}
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
	try {
		await api.post(`/tournaments/${id}/join`)
		await load()
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "Failed to join"
		error = msg
	}
}

async function viewLeaderboard(tournament: Tournament) {
	selectedTournament = tournament
	leaderboardLoading = true
	try {
		leaderboard = await api.get<LeaderboardResponse>(
			`/tournaments/${tournament.id}/leaderboard`,
		)
	} catch {
		error = "Failed to load leaderboard"
	} finally {
		leaderboardLoading = false
	}
}

function closeLeaderboard() {
	selectedTournament = null
	leaderboard = null
}

function formatDate(d: string) {
	return new Date(d).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	})
}

function tournamentStatus(t: Tournament): "upcoming" | "active" | "ended" {
	const now = Date.now()
	if (new Date(t.startDate).getTime() > now) return "upcoming"
	if (new Date(t.endDate).getTime() < now) return "ended"
	return "active"
}

onMount(load)
</script>

<div class="tournaments-page">
	<div class="page-header">
		<h1>Tournaments</h1>
		<button class="btn-primary" onclick={() => (showCreate = !showCreate)}>
			{showCreate ? "Cancel" : "+ New Tournament"}
		</button>
	</div>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	{#if showCreate}
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
			<button class="btn-primary" type="submit" disabled={creating}>
				{creating ? "Creating…" : "Create Tournament"}
			</button>
		</form>
	{/if}

	{#if selectedTournament && leaderboard}
		<div class="leaderboard-modal">
			<div class="leaderboard-content">
				<div class="leaderboard-header">
					<h2>{leaderboard.tournament.name}</h2>
					<button class="btn-close" onclick={closeLeaderboard}>×</button>
				</div>
				<p class="tournament-meta">
					{TYPE_LABELS[leaderboard.tournament.type] ?? leaderboard.tournament.type}
					· {formatDate(leaderboard.tournament.startDate)} – {formatDate(leaderboard.tournament.endDate)}
				</p>

				{#if leaderboard.tournament.victoryMessage}
					<div class="victory-banner">
						<p class="victory-msg">{leaderboard.tournament.victoryMessage}</p>
					</div>
				{/if}

				{#if leaderboardLoading}
					<p class="muted">Loading…</p>
				{:else if leaderboard.leaderboard.length === 0}
					<p class="muted">No participants yet</p>
				{:else}
					<ol class="leaderboard-list">
						{#each leaderboard.leaderboard as entry, i (entry.userId)}
							<li class="leaderboard-row" class:winner={entry.userId === leaderboard?.tournament.winnerId}>
								<span class="rank">
									{#if i === 0 && leaderboard?.tournament.winnerId}🏆{:else}{i + 1}{/if}
								</span>
								<span class="name">{entry.userName}</span>
								<span class="score">
									{entry.score} {TYPE_UNITS[leaderboard?.tournament.type ?? ""] ?? ""}
								</span>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		</div>
	{/if}

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if tournaments.length === 0}
		<p class="muted">No tournaments yet. Create one to get started!</p>
	{:else}
		<div class="tournament-list">
			{#each tournaments as t (t.id)}
				{@const status = tournamentStatus(t)}
				<div class="tournament-card">
					<div class="card-top">
						<span class="type-tag">{TYPE_LABELS[t.type] ?? t.type}</span>
						<span class="status-tag {status}">{status}</span>
					</div>
					<h3>{t.name}</h3>
					<p class="meta">
						{formatDate(t.startDate)} – {formatDate(t.endDate)}
						· {t.participantCount} participant{t.participantCount !== 1 ? "s" : ""}
					</p>
					{#if t.rewardDescription}
						<p class="reward">Reward: {t.rewardDescription}</p>
					{/if}
					<div class="card-actions">
						<button class="btn-secondary" onclick={() => viewLeaderboard(t)}>
							Leaderboard
						</button>
						{#if status !== "ended" && !t.resolvedAt}
							<button class="btn-primary btn-sm" onclick={() => joinTournament(t.id)}>
								Join
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
.tournaments-page {
	max-width: 760px;
	margin: 0 auto;
	padding: 2rem 1.5rem;
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
}

.page-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

h1 {
	font-size: 1.5rem;
	font-weight: 700;
	color: var(--color-text);
	margin: 0;
}

.muted {
	color: var(--color-text-muted);
	font-size: 0.875rem;
}

.error {
	background: color-mix(in srgb, var(--color-danger) 15%, transparent);
	border: 1px solid var(--color-danger);
	color: var(--color-danger);
	border-radius: 0.375rem;
	padding: 0.625rem 0.875rem;
	font-size: 0.875rem;
	margin: 0;
}

.create-form {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 0.625rem;
	padding: 1.25rem;
}

.form-row {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.75rem;
}

label {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	font-size: 0.8125rem;
	font-weight: 600;
	color: var(--color-text-muted);
}

input, select {
	padding: 0.5rem 0.75rem;
	border: 1px solid var(--color-border);
	border-radius: 0.375rem;
	background: var(--color-bg);
	color: var(--color-text);
	font-size: 0.875rem;
}

.btn-primary {
	background: var(--color-accent);
	color: #fff;
	border: none;
	border-radius: 0.375rem;
	padding: 0.5rem 1rem;
	font-size: 0.875rem;
	font-weight: 600;
	cursor: pointer;
}

.btn-primary:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.btn-secondary {
	background: var(--color-surface);
	color: var(--color-text);
	border: 1px solid var(--color-border);
	border-radius: 0.375rem;
	padding: 0.5rem 1rem;
	font-size: 0.875rem;
	cursor: pointer;
}

.btn-sm {
	padding: 0.375rem 0.75rem;
	font-size: 0.8125rem;
}

.btn-close {
	background: none;
	border: none;
	color: var(--color-text-muted);
	font-size: 1.5rem;
	cursor: pointer;
	line-height: 1;
}

.tournament-list {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.tournament-card {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 0.625rem;
	padding: 1rem 1.25rem;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.card-top {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.type-tag {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--color-accent);
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.status-tag {
	font-size: 0.6875rem;
	font-weight: 700;
	text-transform: uppercase;
	padding: 0.125rem 0.5rem;
	border-radius: 1rem;
}

.status-tag.active {
	background: color-mix(in srgb, #10b981 20%, transparent);
	color: #10b981;
}

.status-tag.upcoming {
	background: color-mix(in srgb, #6366f1 20%, transparent);
	color: #6366f1;
}

.status-tag.ended {
	background: color-mix(in srgb, var(--color-text-muted) 20%, transparent);
	color: var(--color-text-muted);
}

h3 {
	font-size: 1.125rem;
	font-weight: 600;
	color: var(--color-text);
	margin: 0;
}

.meta {
	font-size: 0.8125rem;
	color: var(--color-text-muted);
	margin: 0;
}

.reward {
	font-size: 0.8125rem;
	color: var(--color-accent);
	margin: 0;
}

.card-actions {
	display: flex;
	gap: 0.5rem;
	margin-top: 0.25rem;
}

.leaderboard-modal {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.6);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
}

.leaderboard-content {
	background: var(--color-bg);
	border: 1px solid var(--color-border);
	border-radius: 0.75rem;
	padding: 1.5rem;
	max-width: 520px;
	width: 90%;
	max-height: 80vh;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.leaderboard-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.leaderboard-header h2 {
	font-size: 1.25rem;
	font-weight: 700;
	color: var(--color-text);
	margin: 0;
}

.tournament-meta {
	font-size: 0.8125rem;
	color: var(--color-text-muted);
	margin: 0;
}

.victory-banner {
	background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	border: 1px solid var(--color-accent);
	border-radius: 0.5rem;
	padding: 0.75rem 1rem;
}

.victory-msg {
	font-size: 0.875rem;
	color: var(--color-text);
	margin: 0;
	line-height: 1.5;
}

.leaderboard-list {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
}

.leaderboard-row {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.5rem 0.75rem;
	border-radius: 0.375rem;
	background: var(--color-surface);
}

.leaderboard-row.winner {
	background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface));
	border: 1px solid var(--color-accent);
}

.rank {
	font-size: 1rem;
	font-weight: 700;
	color: var(--color-text-muted);
	min-width: 2rem;
	text-align: center;
}

.name {
	flex: 1;
	font-size: 0.9375rem;
	font-weight: 600;
	color: var(--color-text);
}

.score {
	font-size: 0.875rem;
	color: var(--color-text-muted);
	font-weight: 600;
}
</style>
