<script lang="ts">
import { onMount } from "svelte"
import Button from "../components/ui/Button.svelte"
import Card from "../components/ui/Card.svelte"
import Pill from "../components/ui/Pill.svelte"
import SegmentedTabs from "../components/ui/SegmentedTabs.svelte"
import { api } from "../lib/api.js"

type ContextParamField =
	| {
			key: string
			label: string
			type: "select"
			options: { value: string; label: string }[]
	  }
	| { key: string; label: string; type: "text" }

type TypeMeta = {
	key: string
	label: string
	sampleKind: "text" | "image"
	subcategories: { key: string; label: string }[]
	contextParamFields: ContextParamField[]
	feedbackTags: string[]
}

type HistoryRow = {
	id: number
	tags: string[]
	note: string | null
	noteScope: "sample" | "global"
	changelog: string | null
	createdAt: string
	tuningDocBefore: string
	tuningDocAfter: string
}

let types = $state<TypeMeta[]>([])
let loading = $state(true)
let error = $state<string | null>(null)

let selectedType = $state<string | null>(null)
let selectedSubcategory = $state<string | null>(null)
let contextParams = $state<Record<string, string>>({})

let currentDoc = $state("")
let sample = $state<string | null>(null)
let selectedTags = $state<string[]>([])
let note = $state("")
let noteScope = $state<"sample" | "global">("sample")
let lastChangelog = $state<string | null>(null)
let history = $state<HistoryRow[]>([])

let generating = $state(false)
let submitting = $state(false)

let activeType = $derived.by(
	() => types.find((t) => t.key === selectedType) ?? null,
)

const NOTE_SCOPE_OPTIONS = [
	{ id: "sample", label: "Just this sample" },
	{ id: "global", label: "Global rule" },
]

function defaultContextParams(type: TypeMeta): Record<string, string> {
	const defaults: Record<string, string> = {}
	for (const field of type.contextParamFields) {
		if (field.type === "select" && field.options.length > 0) {
			defaults[field.key] = field.options[0].value
		} else {
			defaults[field.key] = ""
		}
	}
	return defaults
}

async function loadTypes() {
	loading = true
	try {
		types = await api.get<TypeMeta[]>("/admin/content-tuning/types")
		if (types.length > 0) {
			await selectType(types[0].key)
		}
	} catch {
		error = "Failed to load content types"
	} finally {
		loading = false
	}
}

async function selectType(typeKey: string) {
	const type = types.find((t) => t.key === typeKey)
	if (!type) return
	selectedType = typeKey
	contextParams = defaultContextParams(type)
	if (type.subcategories.length > 0) {
		await selectSubcategory(type.subcategories[0].key)
	}
}

async function selectSubcategory(subcategoryKey: string) {
	selectedSubcategory = subcategoryKey
	sample = null
	lastChangelog = null
	selectedTags = []
	note = ""
	await Promise.all([loadDoc(), loadHistory()])
}

async function loadDoc() {
	if (!selectedType || !selectedSubcategory) return
	try {
		const res = await api.get<{ doc: string }>(
			`/admin/content-tuning/${selectedType}/${selectedSubcategory}/tuning-doc`,
		)
		currentDoc = res.doc
	} catch {
		error = "Failed to load tuning doc"
	}
}

async function loadHistory() {
	if (!selectedType || !selectedSubcategory) return
	try {
		history = await api.get<HistoryRow[]>(
			`/admin/content-tuning/${selectedType}/${selectedSubcategory}/history`,
		)
	} catch {
		error = "Failed to load history"
	}
}

async function generate() {
	if (!selectedType || !selectedSubcategory || generating) return
	generating = true
	error = null
	try {
		const res = await api.post<{ sample: string }>(
			`/admin/content-tuning/${selectedType}/${selectedSubcategory}/generate`,
			{ contextParams },
		)
		if (!res.sample && activeType?.sampleKind === "image") {
			error = "Image generation failed — try again"
			sample = null
		} else {
			sample = res.sample
		}
		selectedTags = []
		note = ""
		lastChangelog = null
	} catch {
		error = "Failed to generate a sample"
	} finally {
		generating = false
	}
}

function toggleTag(tag: string) {
	selectedTags = selectedTags.includes(tag)
		? selectedTags.filter((t) => t !== tag)
		: [...selectedTags, tag]
}

async function submitFeedback() {
	if (!selectedType || !selectedSubcategory || !sample || submitting) return
	submitting = true
	error = null
	try {
		const res = await api.post<{
			updatedDoc: string
			changelog: string
			newSample: string
		}>(
			`/admin/content-tuning/${selectedType}/${selectedSubcategory}/feedback`,
			{
				contextParams,
				sample,
				tags: selectedTags,
				note: note || null,
				noteScope,
			},
		)
		currentDoc = res.updatedDoc
		lastChangelog = res.changelog
		sample =
			!res.newSample && activeType?.sampleKind === "image"
				? null
				: res.newSample
		selectedTags = []
		note = ""
		await loadHistory()
	} catch {
		error = "Failed to submit feedback"
	} finally {
		submitting = false
	}
}

async function revert(feedbackId: number) {
	if (!selectedType || !selectedSubcategory) return
	try {
		await api.post(
			`/admin/content-tuning/${selectedType}/${selectedSubcategory}/revert/${feedbackId}`,
		)
		await loadDoc()
		await loadHistory()
	} catch {
		error = "Failed to revert"
	}
}

onMount(loadTypes)
</script>

<div class="content-tuning">
	<div class="ct-banner">
		<div class="ct-banner-text">
			<p class="ct-banner-sub">⚠ Admin / dev surface</p>
			<h1>Content Tuning</h1>
		</div>
		<span class="dev-tag">DEV ONLY</span>
	</div>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if error}
		<p class="error-text">{error}</p>
	{/if}

	{#if !loading && types.length > 0}
		<div class="ct-layout">
			<div class="ct-sidebar">
				<Card padding="md">
					<h2 class="section-title">Content type</h2>
					<div class="chip-list">
						{#each types as type (type.key)}
							<button
								class="chip"
								class:active={type.key === selectedType}
								onclick={() => selectType(type.key)}
							>
								{type.label}
							</button>
						{/each}
					</div>

					{#if activeType}
						<h2 class="section-title">Subcategory</h2>
						<div class="chip-list">
							{#each activeType.subcategories as sub (sub.key)}
								<button
									class="chip"
									class:active={sub.key === selectedSubcategory}
									onclick={() => selectSubcategory(sub.key)}
								>
									{sub.label}
								</button>
							{/each}
						</div>

						{#each activeType.contextParamFields as field (field.key)}
							<label class="field-label">
								{field.label}
								{#if field.type === "select"}
									<select class="ct-input" bind:value={contextParams[field.key]}>
										{#each field.options as opt (opt.value)}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</select>
								{:else}
									<input class="ct-input" bind:value={contextParams[field.key]} />
								{/if}
							</label>
						{/each}

						<Button onclick={generate} disabled={generating}>
							{generating ? "Generating…" : "Generate"}
						</Button>
					{/if}
				</Card>
			</div>

			<div class="ct-main">
				<Card>
					<h2 class="section-title">Sample</h2>
					{#if sample && activeType?.sampleKind === "image"}
						<img class="sample-image" src={sample} alt="Generated preview" />
					{:else if sample}
						<p class="sample-text">{sample}</p>
					{:else}
						<p class="muted">Hit Generate to produce a sample.</p>
					{/if}
				</Card>

				{#if sample && activeType}
					<Card>
						<h2 class="section-title">Feedback</h2>
						<div class="chip-list">
							{#each activeType.feedbackTags as tag (tag)}
								<button
									class="chip"
									class:active={selectedTags.includes(tag)}
									onclick={() => toggleTag(tag)}
								>
									{tag}
								</button>
							{/each}
						</div>
						<textarea
							class="ct-input"
							rows="3"
							placeholder="Anything else to explain your feedback…"
							bind:value={note}
						></textarea>
						<SegmentedTabs
							options={NOTE_SCOPE_OPTIONS}
							selected={noteScope}
							onselect={(id) => (noteScope = id as "sample" | "global")}
						/>
						<Button onclick={submitFeedback} disabled={submitting}>
							{submitting ? "Submitting…" : "Submit Feedback"}
						</Button>
						{#if lastChangelog}
							<p class="changelog-text">{lastChangelog}</p>
						{/if}
					</Card>
				{/if}

				<Card padding="md">
					<h2 class="section-title">Current tuning doc</h2>
					<pre class="doc-preview">{currentDoc}</pre>
				</Card>
			</div>

			<div class="ct-history">
				<Card padding="md">
					<h2 class="section-title">History</h2>
					{#if history.length === 0}
						<p class="muted">No feedback submitted yet.</p>
					{:else}
						{#each history as row (row.id)}
							<div class="history-row">
								<div class="history-meta">
									<Pill tone={row.noteScope === "global" ? "accent" : "neutral"}>
										{row.noteScope}
									</Pill>
									<span class="history-date">
										{new Date(row.createdAt).toLocaleString()}
									</span>
								</div>
								{#if row.changelog}
									<p class="history-changelog">{row.changelog}</p>
								{/if}
								<button class="btn-link" onclick={() => revert(row.id)}>
									Revert to before this
								</button>
							</div>
						{/each}
					{/if}
				</Card>
			</div>
		</div>
	{/if}
</div>

<style>
.content-tuning {
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
}

.muted { color: var(--color-text-muted); font-size: var(--font-size-sm); }

.error-text {
	background: color-mix(in srgb, var(--color-danger) 15%, transparent);
	border: 1px solid var(--color-danger);
	color: var(--color-danger);
	border-radius: var(--radius-sm);
	padding: 0.625rem 0.875rem;
	font-size: var(--font-size-sm);
	margin: 0;
}

.ct-banner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-3);
}

.ct-banner-sub {
	margin: 0;
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-semibold);
	color: var(--color-danger);
}

.ct-banner-text h1 {
	margin: 0;
	font-family: var(--font-display);
}

.dev-tag {
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-full);
	padding: var(--space-1) var(--space-3);
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-muted);
}

.ct-layout {
	display: grid;
	grid-template-columns: 260px 1fr 280px;
	gap: var(--space-4);
	align-items: start;
}

@media (max-width: 900px) {
	.ct-layout {
		grid-template-columns: 1fr;
	}
}

.ct-sidebar, .ct-main, .ct-history {
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
}

.section-title {
	margin: 0;
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.chip-list {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
}

.chip {
	border: 1px solid var(--color-border);
	background: var(--color-surface-2);
	color: var(--color-text-muted);
	border-radius: var(--radius-full);
	padding: var(--space-1) var(--space-3);
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-semibold);
	cursor: pointer;
}

.chip.active {
	background: var(--color-accent);
	border-color: var(--color-accent);
	color: var(--color-on-accent, #fff);
}

.field-label {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
}

.ct-input {
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	padding: var(--space-2) var(--space-3);
	font-size: var(--font-size-sm);
	color: var(--color-text);
	font-family: var(--font-sans);
	resize: vertical;
}

.sample-text {
	white-space: pre-wrap;
	font-size: var(--font-size-base);
	color: var(--color-text);
	margin: 0;
}

.sample-image {
	width: 128px;
	height: 128px;
	image-rendering: pixelated;
	border-radius: var(--radius-sm);
	border: 1px solid var(--color-border);
	background: var(--color-surface-2);
}

.changelog-text {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
	font-style: italic;
	margin: 0;
}

.doc-preview {
	white-space: pre-wrap;
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
	max-height: 260px;
	overflow-y: auto;
	margin: 0;
}

.history-row {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
	padding: var(--space-2) 0;
	border-bottom: 1px solid var(--color-border);
}

.history-row:last-child { border-bottom: none; }

.history-meta {
	display: flex;
	align-items: center;
	gap: var(--space-2);
}

.history-date {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.history-changelog {
	font-size: var(--font-size-sm);
	color: var(--color-text);
	margin: 0;
}

.btn-link {
	align-self: flex-start;
	background: none;
	border: none;
	color: var(--color-accent);
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-semibold);
	cursor: pointer;
	padding: 0;
}
</style>
