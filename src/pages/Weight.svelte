<script lang="ts">
import { onMount } from "svelte"
import SocialWeightChart from "../components/SocialWeightChart.svelte"
import WeightChart from "../components/WeightChart.svelte"
import { api } from "../lib/api.js"
import { userProfile } from "../lib/user.svelte.js"

type WeightEntry = {
	id: number
	weightKg: number
	note: string | null
	recordedAt: string
	source: string
}

type UserSeries = {
	userId: string
	userName: string
	color: string
	entries: WeightEntry[]
}

let entries = $state<WeightEntry[]>([])
let socialSeries = $state<UserSeries[]>([])
let loading = $state(true)
let socialLoading = $state(false)
let error = $state<string | null>(null)

// View toggle
let groupView = $state(false)

// Form state
let weightInput = $state("")
let noteInput = $state("")
let dateInput = $state(todayIso())
let submitting = $state(false)
let formError = $state<string | null>(null)

// Goal form state
let goalWeightInput = $state("")
let goalDateInput = $state("")
let savingGoal = $state(false)
let goalSaved = $state(false)

function todayIso() {
	return new Date().toISOString().slice(0, 10)
}

// Latest weight for the current user (for goal line anchor)
let currentUserLatest = $derived(
	entries.length > 0 ? entries[entries.length - 1].weightKg : null,
)

// Goal from user profile
let goal = $derived.by(() => {
	const p = userProfile.data
	if (!p?.goalWeightKg || !p?.goalDate) return null
	return { weightKg: p.goalWeightKg as number, goalDate: p.goalDate as string }
})

async function loadEntries() {
	try {
		entries = await api.get<WeightEntry[]>("/weight")
	} catch {
		error = "Failed to load weight history"
	} finally {
		loading = false
	}
}

async function loadSocial() {
	if (socialSeries.length > 0) return
	socialLoading = true
	try {
		socialSeries = await api.get<UserSeries[]>("/weight/social")
	} finally {
		socialLoading = false
	}
}

async function handleSubmit(e: SubmitEvent) {
	e.preventDefault()
	formError = null
	const kg = Number.parseFloat(weightInput)
	if (Number.isNaN(kg) || kg <= 0) {
		formError = "Enter a positive weight in kg"
		return
	}
	submitting = true
	try {
		const entry = await api.post<WeightEntry>("/weight", {
			weightKg: kg,
			note: noteInput.trim() || undefined,
			recordedAt: new Date(dateInput).toISOString(),
		})
		entries = [...entries, entry].sort(
			(a, b) =>
				new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
		)
		weightInput = ""
		noteInput = ""
		dateInput = todayIso()
		// Invalidate cached social data so it reloads fresh
		socialSeries = []
	} catch (err) {
		formError = err instanceof Error ? err.message : "Failed to save entry"
	} finally {
		submitting = false
	}
}

async function handleGoalSave(e: SubmitEvent) {
	e.preventDefault()
	const kg = Number.parseFloat(goalWeightInput)
	if (Number.isNaN(kg) || kg <= 0 || !goalDateInput) return
	savingGoal = true
	try {
		const updated = await api.patch<typeof userProfile.data>("/users/me", {
			goalWeightKg: kg,
			goalDate: goalDateInput,
		})
		userProfile.data = updated
		goalSaved = true
		setTimeout(() => {
			goalSaved = false
		}, 2000)
	} finally {
		savingGoal = false
	}
}

async function onToggle() {
	groupView = !groupView
	if (groupView) await loadSocial()
}

onMount(async () => {
	await loadEntries()
	// Pre-populate goal form from profile
	if (userProfile.data?.goalWeightKg) {
		goalWeightInput = String(userProfile.data.goalWeightKg)
	}
	if (userProfile.data?.goalDate) {
		goalDateInput = new Date(userProfile.data.goalDate)
			.toISOString()
			.slice(0, 10)
	}
})
</script>

<div class="weight-page">
	<h1>Weight Tracker</h1>

	<!-- Log entry form -->
	<section class="card log-section">
		<h2>Log a weight</h2>

		{#if formError}
			<p class="form-error">{formError}</p>
		{/if}

		<form onsubmit={handleSubmit} class="log-form">
			<label class="field">
				<span>Weight (kg)</span>
				<input
					type="number"
					step="0.1"
					min="1"
					placeholder="e.g. 82.5"
					required
					bind:value={weightInput}
				/>
			</label>

			<label class="field">
				<span>Date</span>
				<input type="date" required bind:value={dateInput} />
			</label>

			<label class="field">
				<span>Note <small>(optional)</small></span>
				<input
					type="text"
					placeholder="Morning, after workout…"
					bind:value={noteInput}
				/>
			</label>

			<button type="submit" disabled={submitting}>
				{submitting ? "Saving…" : "Log weight"}
			</button>
		</form>
	</section>

	<!-- Chart / history -->
	<section class="card chart-section">
		<div class="chart-header">
			<h2>{groupView ? "Compare with friends" : "Your history"}</h2>
			<button class="toggle-btn" onclick={onToggle} type="button">
				{groupView ? "My Journey Only" : "Compare with Friends"}
			</button>
		</div>

		{#if loading}
			<p class="muted">Loading…</p>
		{:else if error}
			<p class="form-error">{error}</p>
		{:else if groupView}
			{#if socialLoading}
				<p class="muted">Loading group data…</p>
			{:else}
				<SocialWeightChart
					series={socialSeries}
					{currentUserLatest}
					{goal}
				/>
			{/if}
		{:else}
			<WeightChart {entries} />

			{#if entries.length > 0}
				<table class="history-table">
					<thead>
						<tr>
							<th>Date</th>
							<th>Weight</th>
							<th>Note</th>
						</tr>
					</thead>
					<tbody>
						{#each [...entries].reverse() as entry (entry.id)}
							<tr>
								<td>{new Date(entry.recordedAt).toLocaleDateString()}</td>
								<td>{entry.weightKg} kg</td>
								<td class="muted">{entry.note ?? "—"}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		{/if}
	</section>

	<!-- Goal setting -->
	<section class="card goal-section">
		<h2>Set a goal</h2>
		<p class="section-desc">Define a target weight and date. A dashed goal line will appear on your chart.</p>

		<form onsubmit={handleGoalSave} class="goal-form">
			<label class="field">
				<span>Target weight (kg)</span>
				<input
					type="number"
					step="0.1"
					min="1"
					placeholder="e.g. 75"
					bind:value={goalWeightInput}
				/>
			</label>

			<label class="field">
				<span>Target date</span>
				<input type="date" bind:value={goalDateInput} />
			</label>

			<button type="submit" disabled={savingGoal || !goalWeightInput || !goalDateInput}>
				{#if goalSaved}
					Saved!
				{:else if savingGoal}
					Saving…
				{:else}
					Save goal
				{/if}
			</button>
		</form>
	</section>
</div>

<style>
.weight-page {
	max-width: 760px;
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
}

h2 {
	font-size: 1rem;
	font-weight: 600;
	color: var(--color-text);
	margin: 0 0 1rem;
}

.chart-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 1rem;
}

.chart-header h2 {
	margin: 0;
}

.toggle-btn {
	padding: 0.375rem 0.875rem;
	font-size: 0.8125rem;
	font-weight: 600;
	border: 1px solid var(--color-accent);
	color: var(--color-accent);
	background: transparent;
	border-radius: 99px;
	cursor: pointer;
	white-space: nowrap;
}

.toggle-btn:hover {
	background: color-mix(in srgb, var(--color-accent) 10%, transparent);
}

.section-desc {
	font-size: 0.875rem;
	color: var(--color-text-muted);
	margin: -0.5rem 0 1rem;
}

.log-form,
.goal-form {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1rem;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
	font-size: 0.875rem;
	color: var(--color-text-muted);
}

.field:last-of-type {
	grid-column: 1 / -1;
}

small {
	font-size: 0.75rem;
	opacity: 0.7;
}

input {
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	border-radius: 0.375rem;
	padding: 0.625rem 0.75rem;
	color: var(--color-text);
	font-size: 1rem;
}

input:focus {
	outline: 2px solid var(--color-accent);
	outline-offset: 1px;
	border-color: var(--color-accent);
}

button[type="submit"] {
	grid-column: 1 / -1;
	background: var(--color-accent);
	color: #fff;
	border: none;
	border-radius: 0.375rem;
	padding: 0.75rem;
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
}

button[type="submit"]:hover:not(:disabled) {
	background: var(--color-accent-hover);
}

button[type="submit"]:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.form-error {
	background: color-mix(in srgb, var(--color-danger) 15%, transparent);
	border: 1px solid var(--color-danger);
	color: var(--color-danger);
	border-radius: 0.375rem;
	padding: 0.625rem 0.875rem;
	font-size: 0.875rem;
	margin: 0 0 1rem;
}

.history-table {
	width: 100%;
	border-collapse: collapse;
	margin-top: 1.25rem;
	font-size: 0.875rem;
}

.history-table th {
	text-align: left;
	color: var(--color-text-muted);
	font-weight: 500;
	padding: 0.375rem 0.5rem;
	border-bottom: 1px solid var(--color-border);
}

.history-table td {
	padding: 0.5rem 0.5rem;
	color: var(--color-text);
	border-bottom: 1px solid var(--color-surface-2);
}

.muted {
	color: var(--color-text-muted);
}
</style>
