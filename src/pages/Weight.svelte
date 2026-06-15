<script lang="ts">
import WeightChart from "../components/WeightChart.svelte"
import { api } from "../lib/api.js"

type WeightEntry = {
	id: number
	weightKg: number
	note: string | null
	recordedAt: string
	source: string
}

let entries = $state<WeightEntry[]>([])
let loading = $state(true)
let error = $state<string | null>(null)

// Form state
let weightInput = $state("")
let noteInput = $state("")
let dateInput = $state(todayIso())
let submitting = $state(false)
let formError = $state<string | null>(null)

function todayIso() {
	return new Date().toISOString().slice(0, 10)
}

async function loadEntries() {
	try {
		entries = await api.get<WeightEntry[]>("/weight")
	} catch {
		error = "Failed to load weight history"
	} finally {
		loading = false
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
		// Insert in sorted order by recordedAt
		entries = [...entries, entry].sort(
			(a, b) =>
				new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
		)
		weightInput = ""
		noteInput = ""
		dateInput = todayIso()
	} catch (err) {
		formError = err instanceof Error ? err.message : "Failed to save entry"
	} finally {
		submitting = false
	}
}

loadEntries()
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
		<h2>Your history</h2>

		{#if loading}
			<p class="muted">Loading…</p>
		{:else if error}
			<p class="form-error">{error}</p>
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

.log-form {
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
