<script lang="ts">
import { api } from "../lib/api.js"

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

<div class="food-page">
	<h1>Food Log</h1>

	<!-- Upload + analyze -->
	<section class="card">
		<h2>Analyze a meal</h2>

		<!-- Drop zone -->
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
				type="file"
				accept="image/*"
				class="file-input"
				onchange={onFileChange}
			/>
		</div>

		<!-- Meal type + submit -->
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

			<button
				class="analyze-btn"
				onclick={handleAnalyze}
				disabled={!selectedFile || analyzing}
				type="button"
			>
				{analyzing ? "Analysing…" : "Analyse meal"}
			</button>
		</div>

		{#if analyzeError}
			<p class="error">{analyzeError}</p>
		{/if}

		<!-- Analysis result -->
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
					<span
						class="rating-badge"
						style="background:{ratingColor(a.rating)}"
					>{a.rating}/10</span>
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
	</section>

	<!-- History -->
	<section class="card">
		<h2>Your food history</h2>

		{#if logsLoading}
			<p class="muted">Loading…</p>
		{:else if logsError}
			<p class="error">{logsError}</p>
		{:else if logs.length === 0}
			<p class="muted">No meals logged yet. Upload a photo above to get started.</p>
		{:else}
			<div class="log-list">
				{#each logs as log (log.id)}
					<div class="log-item">
						<img
							src={log.photoUrl}
							alt={log.aiAnalysis?.foodName ?? "meal"}
							class="log-thumb"
						/>
						<div class="log-info">
							<div class="log-title">
								{log.aiAnalysis?.foodName ?? "Unknown meal"}
								<span class="log-meal-type">{log.mealType}</span>
							</div>
							{#if log.aiAnalysis}
								<div class="log-macros">
									{log.aiAnalysis.macros.calories} kcal ·
									{log.aiAnalysis.macros.protein}g protein
								</div>
							{/if}
							<div class="log-date">
								{new Date(log.loggedAt).toLocaleString()}
							</div>
						</div>
						{#if log.aiAnalysis}
							<span
								class="log-rating"
								style="color:{ratingColor(log.aiAnalysis.rating)}"
							>{log.aiAnalysis.rating}/10</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
.food-page {
	max-width: 680px;
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

h2 {
	font-size: 1rem;
	font-weight: 600;
	color: var(--color-text);
	margin: 0;
}

/* Drop zone */
.drop-zone {
	position: relative;
	border: 2px dashed var(--color-border);
	border-radius: 0.5rem;
	min-height: 180px;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	overflow: hidden;
	transition: border-color 0.15s;
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
	gap: 0.5rem;
	pointer-events: none;
}

.drop-icon {
	font-size: 2.5rem;
}

.drop-hint p {
	color: var(--color-text-muted);
	font-size: 0.875rem;
	margin: 0;
}

.preview-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	max-height: 280px;
	border-radius: 0.375rem;
}

/* Controls */
.controls {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.meal-type-row {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
}

.meal-btn {
	padding: 0.375rem 0.875rem;
	border-radius: 99px;
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

.analyze-btn {
	background: var(--color-accent);
	color: #fff;
	border: none;
	border-radius: 0.375rem;
	padding: 0.75rem;
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
}

.analyze-btn:hover:not(:disabled) {
	background: var(--color-accent-hover);
}

.analyze-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

/* Loading */
.result-loading {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	color: var(--color-text-muted);
	font-size: 0.875rem;
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
	border-radius: 0.5rem;
	padding: 1rem;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.result-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.result-header h3 {
	font-size: 1.125rem;
	font-weight: 600;
	color: var(--color-text);
	margin: 0;
}

.rating-badge {
	font-size: 0.75rem;
	font-weight: 700;
	color: #fff;
	padding: 0.25rem 0.5rem;
	border-radius: 99px;
}

.macros {
	display: flex;
	gap: 1rem;
}

.macro {
	display: flex;
	flex-direction: column;
	align-items: center;
	font-size: 0.75rem;
	color: var(--color-text-muted);
}

.macro span {
	font-size: 1.125rem;
	font-weight: 600;
	color: var(--color-text);
}

.coach-msg {
	font-size: 0.875rem;
	color: var(--color-text-muted);
	font-style: italic;
	margin: 0;
}

.alternatives {
	font-size: 0.8125rem;
}

.alts-label {
	color: var(--color-text-muted);
	margin: 0 0 0.25rem;
}

.alternatives ul {
	margin: 0;
	padding-left: 1.25rem;
	color: var(--color-text);
}

/* History */
.log-list {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.log-item {
	display: flex;
	align-items: center;
	gap: 0.875rem;
	padding: 0.625rem;
	background: var(--color-surface-2);
	border-radius: 0.5rem;
}

.log-thumb {
	width: 56px;
	height: 56px;
	object-fit: cover;
	border-radius: 0.375rem;
	flex-shrink: 0;
}

.log-info {
	flex: 1;
	min-width: 0;
}

.log-title {
	font-size: 0.9375rem;
	font-weight: 600;
	color: var(--color-text);
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.log-meal-type {
	font-size: 0.7rem;
	font-weight: 400;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--color-text-muted);
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	padding: 0.1rem 0.4rem;
	border-radius: 99px;
}

.log-macros {
	font-size: 0.8125rem;
	color: var(--color-text-muted);
}

.log-date {
	font-size: 0.75rem;
	color: var(--color-text-muted);
	margin-top: 0.125rem;
}

.log-rating {
	font-size: 0.8125rem;
	font-weight: 700;
	flex-shrink: 0;
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
</style>
