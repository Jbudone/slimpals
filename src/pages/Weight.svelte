<script lang="ts">
import { onMount } from "svelte"
import SocialWeightChart from "../components/SocialWeightChart.svelte"
import Button from "../components/ui/Button.svelte"
import Card from "../components/ui/Card.svelte"
import WeightChart from "../components/WeightChart.svelte"
import { api } from "../lib/api.js"
import { showBadgeToast } from "../lib/toast.svelte.js"
import { userProfile } from "../lib/user.svelte.js"

type NewBadge = { key: string; name: string; tier: string; earnedAt: string }

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

// Entries ascending by date (API already returns this, sorted defensively).
let sortedAsc = $derived(
	[...entries].sort(
		(a, b) =>
			new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
	),
)

let latest = $derived(
	sortedAsc.length > 0 ? sortedAsc[sortedAsc.length - 1] : null,
)

// Latest weight for the current user (for goal line anchor)
let currentUserLatest = $derived(latest?.weightKg ?? null)

// Goal from user profile
let goal = $derived.by(() => {
	const p = userProfile.data
	if (!p?.goalWeightKg || !p?.goalDate) return null
	return { weightKg: p.goalWeightKg as number, goalDate: p.goalDate as string }
})

let remainingToGoal = $derived(
	goal && latest ? latest.weightKg - goal.weightKg : null,
)

// Change over the last ~7 days, vs. the closest entry at or before that.
let weekDelta = $derived.by(() => {
	if (!latest || sortedAsc.length < 2) return null
	const latestTime = new Date(latest.recordedAt).getTime()
	const weekAgo = latestTime - 7 * 86_400_000
	const candidates = sortedAsc.filter(
		(e) => new Date(e.recordedAt).getTime() <= weekAgo,
	)
	if (candidates.length === 0) return null
	const reference = candidates[candidates.length - 1]
	return latest.weightKg - reference.weightKg
})

// Entries newest-first, each annotated with its delta from the prior entry.
let entryRows = $derived(
	sortedAsc
		.map((entry, i) => ({
			entry,
			delta: i === 0 ? null : entry.weightKg - sortedAsc[i - 1].weightKg,
		}))
		.reverse(),
)

let daysSinceLatest = $derived(
	latest
		? Math.round(
				(Date.now() - new Date(latest.recordedAt).getTime()) / 86_400_000,
			)
		: null,
)

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
		const res = await api.post<WeightEntry & { newBadges?: NewBadge[] }>(
			"/weight",
			{
				weightKg: kg,
				note: noteInput.trim() || undefined,
				recordedAt: new Date(dateInput).toISOString(),
			},
		)
		const { newBadges, ...entry } = res
		if (newBadges?.length) {
			for (const b of newBadges) showBadgeToast(b)
		}
		entries = [...entries, entry]
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

<div class="weight-tab">
	{#if loading}
		<p class="muted">Loading…</p>
	{:else if error}
		<p class="form-error">{error}</p>
	{:else}
		<Card>
			<div class="overview-header">
				<div>
					{#if latest}
						<span class="overview-value">{latest.weightKg} <span class="overview-unit">kg</span></span>
					{:else}
						<span class="overview-value overview-empty">No entries yet</span>
					{/if}
					{#if goal && remainingToGoal !== null}
						<p class="overview-sub">
							{#if remainingToGoal > 0}
								{remainingToGoal.toFixed(1)} kg to your {goal.weightKg} kg goal
							{:else}
								Goal reached — {Math.abs(remainingToGoal).toFixed(1)} kg past your {goal.weightKg} kg goal
							{/if}
						</p>
					{/if}
				</div>
				{#if weekDelta !== null}
					<div class="overview-delta-block">
						<span class="overview-delta" class:overview-delta-good={weekDelta < 0}>
							{weekDelta > 0 ? "+" : ""}{weekDelta.toFixed(1)} kg
						</span>
						<span class="overview-delta-label">this week</span>
					</div>
				{/if}
			</div>

			<div class="chart-toggle-row">
				<button class="toggle-btn" onclick={onToggle} type="button">
					{groupView ? "My Journey Only" : "Compare with Friends"}
				</button>
			</div>

			{#if groupView}
				{#if socialLoading}
					<p class="muted">Loading group data…</p>
				{:else}
					<SocialWeightChart series={socialSeries} {currentUserLatest} {goal} />
				{/if}
			{:else}
				<WeightChart
					{entries}
					viewMode={userProfile.data?.viewMode ?? "simple"}
					heightCm={userProfile.data?.heightCm ?? null}
					{goal}
				/>
			{/if}
		</Card>

		<Card>
			<h2 class="section-heading">Log today</h2>
			{#if formError}
				<p class="form-error">{formError}</p>
			{/if}
			<form onsubmit={handleSubmit} class="log-form">
				<div class="log-form-main">
					<input
						type="number"
						step="0.1"
						min="1"
						placeholder="e.g. 82.5"
						required
						bind:value={weightInput}
						aria-label="Weight (kg)"
					/>
					<Button type="submit" disabled={submitting}>
						{submitting ? "Saving…" : "Save"}
					</Button>
				</div>
				<div class="log-form-secondary">
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
				</div>
			</form>
			{#if latest}
				<p class="last-entry-note">
					Last entry {latest.weightKg} kg, {daysSinceLatest === 0 ? "today" : `${daysSinceLatest} day${daysSinceLatest === 1 ? "" : "s"} ago`}.
				</p>
			{/if}
		</Card>

		{#if entryRows.length > 0}
			<Card padding="md">
				{#each entryRows as { entry, delta }, i (entry.id)}
					<div class="entry-row" class:entry-row-first={i === 0}>
						<div class="entry-main">
							<span class="entry-weight">{entry.weightKg} kg</span>
							<span class="entry-note">{entry.note ?? (delta === null ? "Starting weight" : "—")}</span>
						</div>
						<div class="entry-meta">
							<span class="entry-date">
								{new Date(entry.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
							</span>
							<span class="entry-delta" class:entry-delta-good={delta !== null && delta < 0}>
								{delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
							</span>
						</div>
					</div>
				{/each}
			</Card>
		{/if}

		<Card>
			<h2 class="section-heading">Set a goal</h2>
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
				<Button type="submit" disabled={savingGoal || !goalWeightInput || !goalDateInput}>
					{#if goalSaved}
						Saved!
					{:else if savingGoal}
						Saving…
					{:else}
						Save goal
					{/if}
				</Button>
			</form>
		</Card>
	{/if}
</div>

<style>
.weight-tab {
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
}

.muted {
	color: var(--color-text-muted);
}

.overview-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-3);
}

.overview-value {
	font-family: var(--font-display);
	font-size: var(--font-size-2xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.overview-empty {
	font-size: var(--font-size-lg);
	color: var(--color-text-muted);
}

.overview-unit {
	font-family: var(--font-sans);
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-normal);
	color: var(--color-text-muted);
}

.overview-sub {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
	margin: var(--space-1) 0 0;
}

.overview-delta-block {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	flex-shrink: 0;
}

.overview-delta {
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.overview-delta-good {
	color: var(--color-success);
}

.overview-delta-label {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.chart-toggle-row {
	display: flex;
	justify-content: flex-end;
	margin: var(--space-3) 0 var(--space-2);
}

.toggle-btn {
	padding: 0.375rem 0.875rem;
	font-size: 0.8125rem;
	font-weight: 600;
	border: 1px solid var(--color-accent);
	color: var(--color-accent);
	background: transparent;
	border-radius: var(--radius-full);
	cursor: pointer;
	white-space: nowrap;
}

.toggle-btn:hover {
	background: color-mix(in srgb, var(--color-accent) 10%, transparent);
}

.section-heading {
	font-family: var(--font-display);
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
	margin: 0;
}

.section-desc {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
	margin: 0;
}

.log-form,
.goal-form {
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
}

.log-form-main {
	display: flex;
	gap: var(--space-3);
}

.log-form-main input {
	flex: 1;
	min-width: 0;
}

.log-form-secondary {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: var(--space-3);
}

.field {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
}

small {
	font-size: 0.75rem;
	opacity: 0.7;
}

input {
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	padding: 0.625rem 0.75rem;
	color: var(--color-text);
	font-size: 1rem;
}

input:focus {
	outline: 2px solid var(--color-accent);
	outline-offset: 1px;
	border-color: var(--color-accent);
}

.last-entry-note {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
	margin: 0;
}

.form-error {
	background: color-mix(in srgb, var(--color-danger) 15%, transparent);
	border: 1px solid var(--color-danger);
	color: var(--color-danger);
	border-radius: var(--radius-sm);
	padding: 0.625rem 0.875rem;
	font-size: 0.875rem;
	margin: 0;
}

.entry-row {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: var(--space-3);
	padding: var(--space-3) 0;
	border-top: 1px solid var(--color-border);
}

.entry-row-first {
	border-top: none;
	padding-top: 0;
}

.entry-main {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
}

.entry-weight {
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.entry-note {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.entry-meta {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: var(--space-1);
	flex-shrink: 0;
}

.entry-date {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.entry-delta {
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	color: var(--color-text);
}

.entry-delta-good {
	color: var(--color-success);
}
</style>
