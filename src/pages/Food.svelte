<script lang="ts">
import Button from "../components/ui/Button.svelte"
import Card from "../components/ui/Card.svelte"
import ProgressBar from "../components/ui/ProgressBar.svelte"
import { api } from "../lib/api.js"
import { userProfile } from "../lib/user.svelte.js"

type Macros = { calories: number; protein: number; carbs: number; fat: number }
type FoodAnalysis = {
	foodName: string
	macros: Macros
	coachMessage: string
	alternatives: string[]
	rating: number
}
type FoodLog = {
	id: number
	photoUrl: string
	aiAnalysis: FoodAnalysis | null
	mealType: string
	loggedAt: string
	isShared: boolean
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const

let logs = $state<FoodLog[]>([])
let logsLoading = $state(true)
let logsError = $state<string | null>(null)

let selectedFile = $state<File | null>(null)
let previewUrl = $state<string | null>(null)
let mealType = $state<string>("snack")
let analyzing = $state(false)
let analyzeError = $state<string | null>(null)
let lastResult = $state<FoodLog | null>(null)
let fileInputEl = $state<HTMLInputElement | null>(null)

function isToday(iso: string): boolean {
	const d = new Date(iso)
	const now = new Date()
	return (
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate()
	)
}

let todayLogs = $derived(logs.filter((l) => isToday(l.loggedAt)))

let todayTotals = $derived.by(() => {
	const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
	for (const l of todayLogs) {
		if (!l.aiAnalysis) continue
		totals.calories += l.aiAnalysis.macros.calories
		totals.protein += l.aiAnalysis.macros.protein
		totals.carbs += l.aiAnalysis.macros.carbs
		totals.fat += l.aiAnalysis.macros.fat
	}
	return totals
})

let calorieGoal = $derived(userProfile.data?.dailyCalorieGoal ?? null)
let remaining = $derived(
	calorieGoal !== null ? calorieGoal - todayTotals.calories : null,
)

function letterGrade(rating: number): string {
	if (rating >= 9) return "A+"
	if (rating >= 8) return "A"
	if (rating >= 7) return "B+"
	if (rating >= 6) return "B"
	if (rating >= 5) return "C+"
	if (rating >= 4) return "C"
	if (rating >= 3) return "D"
	return "F"
}

async function loadLogs() {
	try {
		logs = await api.get<FoodLog[]>("/food/logs")
	} catch {
		logsError = "Failed to load food history"
	} finally {
		logsLoading = false
	}
}

function onFileChange(e: Event) {
	const input = e.currentTarget as HTMLInputElement
	const file = input.files?.[0] ?? null
	selectedFile = file
	if (previewUrl) URL.revokeObjectURL(previewUrl)
	previewUrl = file ? URL.createObjectURL(file) : null
	analyzeError = null
	lastResult = null
}

function onDrop(e: DragEvent) {
	e.preventDefault()
	const file = e.dataTransfer?.files[0] ?? null
	if (file?.type.startsWith("image/")) {
		selectedFile = file
		if (previewUrl) URL.revokeObjectURL(previewUrl)
		previewUrl = URL.createObjectURL(file)
		analyzeError = null
		lastResult = null
	}
}

function openFilePicker() {
	fileInputEl?.click()
}

async function handleAnalyze() {
	if (!selectedFile) return
	analyzing = true
	analyzeError = null
	lastResult = null

	try {
		const form = new FormData()
		form.append("photo", selectedFile)
		form.append("mealType", mealType)

		const res = await fetch("/api/food/analyze", {
			method: "POST",
			body: form,
			credentials: "include",
		})

		if (!res.ok) {
			const err = await res.json().catch(() => ({}))
			throw new Error((err as { error?: string }).error ?? "Analysis failed")
		}

		const entry = (await res.json()) as FoodLog
		lastResult = entry
		logs = [entry, ...logs]
		selectedFile = null
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl)
			previewUrl = null
		}
	} catch (err) {
		analyzeError =
			err instanceof Error ? err.message : "Failed to analyse photo"
	} finally {
		analyzing = false
	}
}

function ratingColor(r: number) {
	if (r >= 8) return "var(--color-success)"
	if (r >= 5) return "var(--color-warning)"
	return "var(--color-danger)"
}

loadLogs()
</script>

<div class="food-tab">
	<Card>
		<div class="summary-row">
			{#if calorieGoal !== null}
				<ProgressBar
					variant="circular"
					value={todayTotals.calories}
					max={calorieGoal}
					size={92}
					thickness={8}
				>
					{#snippet children()}
						<div class="ring-content">
							<span class="ring-value">{Math.abs(remaining ?? 0)}</span>
							<span class="ring-label">{(remaining ?? 0) < 0 ? "OVER" : "LEFT"}</span>
						</div>
					{/snippet}
				</ProgressBar>
			{/if}

			<div class="summary-copy">
				<span class="summary-title">
					{todayLogs.length} meal{todayLogs.length === 1 ? "" : "s"} logged today
				</span>
				{#if calorieGoal === null}
					<span class="summary-macros">{todayTotals.calories} kcal today</span>
				{/if}
				<span class="summary-macros">
					Protein {todayTotals.protein} g · Carbs {todayTotals.carbs} g · Fat {todayTotals.fat} g
				</span>
				<Button onclick={openFilePicker}>📷 Snap a meal</Button>
			</div>
		</div>
	</Card>

	<Card>
		<h2 class="section-heading">Analyze a meal</h2>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="drop-zone"
			class:has-preview={!!previewUrl}
			ondragover={(e) => e.preventDefault()}
			ondrop={onDrop}
		>
			{#if previewUrl}
				<img src={previewUrl} alt="Meal preview" class="preview-img" />
			{:else}
				<div class="drop-hint">
					<span class="drop-icon">📷</span>
					<p>Drag a photo here or click to pick one</p>
				</div>
			{/if}
			<input
				bind:this={fileInputEl}
				type="file"
				accept="image/*"
				class="file-input"
				onchange={onFileChange}
			/>
		</div>

		<div class="controls">
			<div class="meal-type-row">
				{#each MEAL_TYPES as type}
					<button
						class="meal-btn"
						class:active={mealType === type}
						onclick={() => (mealType = type)}
						type="button"
					>
						{type}
					</button>
				{/each}
			</div>

			<Button onclick={handleAnalyze} disabled={!selectedFile || analyzing}>
				{analyzing ? "Analysing…" : "Analyse meal"}
			</Button>
		</div>

		{#if analyzeError}
			<p class="error">{analyzeError}</p>
		{/if}

		{#if analyzing}
			<div class="result-loading">
				<div class="spinner"></div>
				<p>Asking your AI coach…</p>
			</div>
		{:else if lastResult?.aiAnalysis}
			{@const a = lastResult.aiAnalysis}
			<div class="result-card">
				<div class="result-header">
					<h3>{a.foodName}</h3>
					<span class="rating-circle" style="background:{ratingColor(a.rating)}">
						{letterGrade(a.rating)}
					</span>
				</div>

				<div class="macros">
					<div class="macro"><span>{a.macros.calories}</span>kcal</div>
					<div class="macro"><span>{a.macros.protein}g</span>protein</div>
					<div class="macro"><span>{a.macros.carbs}g</span>carbs</div>
					<div class="macro"><span>{a.macros.fat}g</span>fat</div>
				</div>

				<p class="coach-msg">"{a.coachMessage}"</p>

				{#if a.alternatives.length > 0}
					<div class="alternatives">
						<p class="alts-label">Healthier swaps:</p>
						<ul>
							{#each a.alternatives as alt}
								<li>{alt}</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	</Card>

	{#if logsLoading}
		<p class="muted">Loading…</p>
	{:else if logsError}
		<p class="error">{logsError}</p>
	{:else if logs.length === 0}
		<Card padding="md">
			<p class="muted">No meals logged yet. Snap a photo above to get started.</p>
		</Card>
	{:else}
		{#each logs as log (log.id)}
			<Card padding="md">
				<div class="meal-row">
					<img
						src={log.photoUrl}
						alt={log.aiAnalysis?.foodName ?? "meal"}
						class="meal-thumb"
					/>
					<div class="meal-copy">
						<span class="meal-type-label">{log.mealType}</span>
						<span class="meal-name">{log.aiAnalysis?.foodName ?? "Unknown meal"}</span>
						{#if log.aiAnalysis}
							<span class="meal-macros">
								{log.aiAnalysis.macros.calories} kcal · {log.aiAnalysis.macros.protein} g protein
							</span>
						{/if}
					</div>
					{#if log.aiAnalysis}
						<span
							class="rating-circle"
							style="background:{ratingColor(log.aiAnalysis.rating)}"
						>
							{letterGrade(log.aiAnalysis.rating)}
						</span>
					{/if}
				</div>
			</Card>
		{/each}
	{/if}
</div>

<style>
.food-tab {
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
}

.muted {
	color: var(--color-text-muted);
	font-size: var(--font-size-sm);
}

/* Summary card */
.summary-row {
	display: flex;
	align-items: center;
	gap: var(--space-5);
}

.ring-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	line-height: 1;
}

.ring-value {
	font-family: var(--font-display);
	font-size: var(--font-size-xl);
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

.summary-copy {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
	flex: 1;
	min-width: 0;
	align-items: flex-start;
}

.summary-title {
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.summary-macros {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
}

.section-heading {
	font-family: var(--font-display);
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
	margin: 0;
}

/* Drop zone */
.drop-zone {
	position: relative;
	border: 2px dashed var(--color-border);
	border-radius: var(--radius-sm);
	min-height: 160px;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	overflow: hidden;
	transition: border-color 0.15s;
	margin-top: var(--space-3);
}

.drop-zone:hover {
	border-color: var(--color-accent);
}

.file-input {
	position: absolute;
	inset: 0;
	opacity: 0;
	cursor: pointer;
}

.drop-hint {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--space-2);
	pointer-events: none;
}

.drop-icon {
	font-size: 2.5rem;
}

.drop-hint p {
	color: var(--color-text-muted);
	font-size: var(--font-size-sm);
	margin: 0;
}

.preview-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	max-height: 280px;
	border-radius: var(--radius-sm);
}

/* Controls */
.controls {
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
	margin-top: var(--space-3);
}

.meal-type-row {
	display: flex;
	gap: var(--space-2);
	flex-wrap: wrap;
}

.meal-btn {
	padding: 0.375rem 0.875rem;
	border-radius: var(--radius-full);
	border: 1px solid var(--color-border);
	background: var(--color-surface-2);
	color: var(--color-text-muted);
	font-size: 0.8125rem;
	cursor: pointer;
	text-transform: capitalize;
}

.meal-btn.active {
	background: var(--color-accent);
	border-color: var(--color-accent);
	color: #fff;
}

/* Loading */
.result-loading {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	color: var(--color-text-muted);
	font-size: var(--font-size-sm);
	margin-top: var(--space-3);
}

.spinner {
	width: 20px;
	height: 20px;
	border: 2px solid var(--color-border);
	border-top-color: var(--color-accent);
	border-radius: 50%;
	animation: spin 0.7s linear infinite;
}

@keyframes spin {
	to { transform: rotate(360deg); }
}

/* Result card */
.result-card {
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	padding: var(--space-4);
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
	margin-top: var(--space-3);
}

.result-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.result-header h3 {
	font-size: var(--font-size-lg);
	font-weight: var(--font-weight-semibold);
	color: var(--color-text);
	margin: 0;
}

.rating-circle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2rem;
	height: 2rem;
	border-radius: var(--radius-full);
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-bold);
	color: #fff;
	flex-shrink: 0;
}

.macros {
	display: flex;
	gap: var(--space-4);
}

.macro {
	display: flex;
	flex-direction: column;
	align-items: center;
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.macro span {
	font-size: var(--font-size-lg);
	font-weight: var(--font-weight-semibold);
	color: var(--color-text);
}

.coach-msg {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
	font-style: italic;
	margin: 0;
}

.alternatives {
	font-size: 0.8125rem;
}

.alts-label {
	color: var(--color-text-muted);
	margin: 0 0 var(--space-1);
}

.alternatives ul {
	margin: 0;
	padding-left: 1.25rem;
	color: var(--color-text);
}

/* Meal history rows */
.meal-row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
}

.meal-thumb {
	width: 48px;
	height: 48px;
	object-fit: cover;
	border-radius: var(--radius-sm);
	flex-shrink: 0;
}

.meal-copy {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	flex: 1;
	min-width: 0;
}

.meal-type-label {
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-semibold);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--color-text-muted);
}

.meal-name {
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.meal-macros {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
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
</style>
