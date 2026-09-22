<script lang="ts">
import { onMount } from "svelte"
import type { MissionCadence, MissionDifficulty } from "../../shared/types.js"
import { api } from "../lib/api.js"
import Button from "./ui/Button.svelte"
import Card from "./ui/Card.svelte"
import Pill from "./ui/Pill.svelte"

type Mission = {
	id: number
	title: string
	description: string | null
	cadence: MissionCadence
	difficulty: MissionDifficulty
	createdAt: string
}

type MissionsResponse = { daily: Mission[]; weekly: Mission[] }

const DIFFICULTY_LABEL: Record<MissionDifficulty, string> = {
	easy: "Easy",
	medium: "Medium",
	hard: "Hard",
}

let loading = $state(true)
let loadError = $state<string | null>(null)
let daily = $state<Mission[]>([])
let weekly = $state<Mission[]>([])

let formOpen = $state(false)
let editingId = $state<number | null>(null)
let formTitle = $state("")
let formDescription = $state("")
let formCadence = $state<MissionCadence>("daily")
let formDifficulty = $state<MissionDifficulty>("easy")
let saving = $state(false)
let formError = $state<string | null>(null)

async function loadMissions() {
	loading = true
	loadError = null
	try {
		const res = await api.get<MissionsResponse>("/missions")
		daily = res.daily
		weekly = res.weekly
	} catch (e) {
		loadError = e instanceof Error ? e.message : "Failed to load missions"
	} finally {
		loading = false
	}
}

function resetForm() {
	formOpen = false
	editingId = null
	formTitle = ""
	formDescription = ""
	formCadence = "daily"
	formDifficulty = "easy"
	formError = null
}

function openCreateForm() {
	resetForm()
	formOpen = true
}

function openEditForm(mission: Mission) {
	editingId = mission.id
	formTitle = mission.title
	formDescription = mission.description ?? ""
	formCadence = mission.cadence
	formDifficulty = mission.difficulty
	formError = null
	formOpen = true
}

async function submitForm() {
	if (formTitle.trim().length === 0) {
		formError = "Title is required"
		return
	}
	saving = true
	formError = null
	try {
		const payload = {
			title: formTitle.trim(),
			description: formDescription.trim() || undefined,
			cadence: formCadence,
			difficulty: formDifficulty,
		}
		if (editingId !== null) {
			await api.patch(`/missions/${editingId}`, payload)
		} else {
			await api.post("/missions", payload)
		}
		resetForm()
		await loadMissions()
	} catch (e) {
		formError = e instanceof Error ? e.message : "Failed to save mission"
	} finally {
		saving = false
	}
}

async function archiveMission(id: number) {
	try {
		await api.post(`/missions/${id}/archive`)
		await loadMissions()
	} catch {
		// swallow — the list simply won't update, user can retry
	}
}

onMount(loadMissions)
</script>

<Card>
	<div class="missions-header">
		<h2>Missions</h2>
		<Button variant="secondary" onclick={openCreateForm}>+ Add mission</Button>
	</div>

	{#if loading}
		<p class="muted">Loading missions…</p>
	{:else if loadError}
		<p class="error-text">{loadError}</p>
	{:else}
		{#if daily.length === 0 && weekly.length === 0 && !formOpen}
			<p class="empty-state">
				No missions yet. Add a daily or weekly task to start earning XP for
				the habits you care about.
			</p>
		{/if}

		{#if daily.length > 0}
			<div class="mission-group">
				<h3>Daily</h3>
				<ul class="mission-list">
					{#each daily as mission (mission.id)}
						<li class="mission-item">
							<div class="mission-item-body">
								<span class="mission-title">{mission.title}</span>
								{#if mission.description}
									<span class="mission-description">{mission.description}</span>
								{/if}
							</div>
							<Pill>{DIFFICULTY_LABEL[mission.difficulty]}</Pill>
							<div class="mission-actions">
								<button
									type="button"
									class="link-button"
									onclick={() => openEditForm(mission)}
								>Edit</button>
								<button
									type="button"
									class="link-button"
									onclick={() => archiveMission(mission.id)}
								>Archive</button>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if weekly.length > 0}
			<div class="mission-group">
				<h3>Weekly</h3>
				<ul class="mission-list">
					{#each weekly as mission (mission.id)}
						<li class="mission-item">
							<div class="mission-item-body">
								<span class="mission-title">{mission.title}</span>
								{#if mission.description}
									<span class="mission-description">{mission.description}</span>
								{/if}
							</div>
							<Pill>{DIFFICULTY_LABEL[mission.difficulty]}</Pill>
							<div class="mission-actions">
								<button
									type="button"
									class="link-button"
									onclick={() => openEditForm(mission)}
								>Edit</button>
								<button
									type="button"
									class="link-button"
									onclick={() => archiveMission(mission.id)}
								>Archive</button>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if formOpen}
			<div class="mission-form">
				<label class="form-label" for="mission-title">Title</label>
				<input
					id="mission-title"
					type="text"
					placeholder="e.g. Read for 20 minutes"
					maxlength="255"
					bind:value={formTitle}
					class="mission-input"
				/>

				<label class="form-label" for="mission-description">Description (optional)</label>
				<textarea
					id="mission-description"
					placeholder="Any extra detail"
					bind:value={formDescription}
					class="mission-input mission-textarea"
				></textarea>

				<div class="form-row">
					<div class="form-field">
						<label class="form-label" for="mission-cadence">Cadence</label>
						<select id="mission-cadence" bind:value={formCadence} class="mission-input">
							<option value="daily">Daily</option>
							<option value="weekly">Weekly</option>
						</select>
					</div>
					<div class="form-field">
						<label class="form-label" for="mission-difficulty">Difficulty</label>
						<select id="mission-difficulty" bind:value={formDifficulty} class="mission-input">
							<option value="easy">Easy</option>
							<option value="medium">Medium</option>
							<option value="hard">Hard</option>
						</select>
					</div>
				</div>

				{#if formError}
					<p class="error-text">{formError}</p>
				{/if}

				<div class="form-actions">
					<Button onclick={submitForm} disabled={saving}>
						{saving ? "Saving…" : editingId !== null ? "Save changes" : "Add mission"}
					</Button>
					<Button variant="secondary" onclick={resetForm}>Cancel</Button>
				</div>
			</div>
		{/if}
	{/if}
</Card>

<style>
.missions-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-3);
}

.missions-header h2 {
	margin: 0;
	font-family: var(--font-display);
	font-size: var(--font-size-lg);
	color: var(--color-text);
}

.muted {
	color: var(--color-text-muted);
	font-size: var(--font-size-sm);
}

.error-text {
	background: color-mix(in srgb, var(--color-danger) 15%, transparent);
	border: 1px solid var(--color-danger);
	color: var(--color-danger);
	border-radius: var(--radius-sm);
	padding: 0.625rem 0.875rem;
	font-size: var(--font-size-sm);
	margin: 0;
}

.empty-state {
	color: var(--color-text-muted);
	font-size: var(--font-size-sm);
	margin: 0;
}

.mission-group {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
}

.mission-group h3 {
	margin: 0;
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	color: var(--color-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.03em;
}

.mission-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
}

.mission-item {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	padding: 0.625rem 0.75rem;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	background: var(--color-surface-2);
}

.mission-item-body {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.mission-title {
	font-weight: var(--font-weight-semibold);
	color: var(--color-text);
}

.mission-description {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.mission-actions {
	display: flex;
	gap: var(--space-2);
}

.link-button {
	background: none;
	border: none;
	color: var(--color-accent);
	font-size: var(--font-size-sm);
	cursor: pointer;
	padding: 0;
}

.mission-form {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
	padding-top: var(--space-2);
	border-top: 1px solid var(--color-border);
}

.form-label {
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	color: var(--color-text-muted);
}

.mission-input {
	width: 100%;
	box-sizing: border-box;
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	padding: 0.5rem 0.75rem;
	color: var(--color-text);
	font-size: var(--font-size-sm);
	font-family: inherit;
}

.mission-textarea {
	resize: vertical;
	min-height: 3rem;
}

.form-row {
	display: flex;
	gap: var(--space-3);
}

.form-field {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.form-actions {
	display: flex;
	gap: var(--space-2);
}
</style>
