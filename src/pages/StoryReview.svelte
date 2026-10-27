<script lang="ts">
// The story council's review page (docs/story_council.md): pick a campaign,
// start a stage, read what the council wrote, approve it or send it back with a
// note. Admin only. A stage only starts from the approved level above it.
import { onMount } from "svelte"
import { api } from "../lib/api.js"
import { page } from "../router.svelte.js"

type Draft = {
	id: number
	level: "arc" | "outline" | "scene"
	ref: string
	status: string
	body: Record<string, unknown>
	trace: Record<string, unknown>
	notes: string | null
	costMicros: number
}
type Arc = {
	title: string
	premise: string
	stakes: string
	threads: string[]
	chapters: {
		n: number
		level: number
		title: string
		logline: string
		turn: string
	}[]
}
type Outline = {
	title: string
	place: string
	object: string
	goal: string
	conflict: string
	turn: string
	emotion: string
	wants: { who: string; want: string }[]
	ending: string
}
type Scene = {
	title: string
	recap: string
	lines: { who: string; text: string }[]
}

let campaign = $state(13)
let drafts = $state<Draft[]>([])
let running = $state<string[]>([])
let error = $state<string | null>(null)
let busy = $state(false)
let notes = $state<Record<string, string>>({})
let timer: ReturnType<typeof setInterval> | null = null

const current = (level: string, ref: string, ...statuses: string[]) =>
	drafts.find(
		(d) => d.level === level && d.ref === ref && statuses.includes(d.status),
	) ?? null

const arcDraft = $derived(current("arc", String(campaign), "draft", "approved"))
const arcApproved = $derived(arcDraft?.status === "approved")
const arc = $derived(arcDraft ? (arcDraft.body as unknown as Arc) : null)
const chapterRef = (n: number) => `c${campaign}-${n}`
const outlineOf = (n: number) =>
	current("outline", chapterRef(n), "draft", "approved")
const sceneOf = (n: number) =>
	current("scene", chapterRef(n), "draft", "approved")
const isRunning = (key: string) => running.includes(`${campaign}:${key}`)

async function load() {
	try {
		const d = await api.get<{ drafts: Draft[]; running: string[] }>(
			`/admin/content/story/${campaign}`,
		)
		drafts = d.drafts
		running = d.running
		error = null
	} catch (e) {
		error =
			(e as { status?: number }).status === 403
				? "This page is for the admin account."
				: (e as Error).message
	}
}

async function start(
	stage: "arc" | "outlines" | "scene",
	chapter?: number,
	withNotes?: string,
) {
	busy = true
	try {
		await api.post(`/admin/content/story/${campaign}/${stage}`, {
			chapter,
			notes: withNotes || undefined,
		})
		await load()
	} catch (e) {
		error = (e as Error).message
	} finally {
		busy = false
	}
}

async function decide(d: Draft, verdict: "approve" | "reject") {
	busy = true
	try {
		const note = notes[`${d.level}:${d.ref}`]?.trim() ?? ""
		await api.post(`/admin/content/story/drafts/${d.id}/${verdict}`, {
			notes: note,
		})
		if (verdict === "reject") {
			// a rejection with a note runs the stage again with the note on top
			const stage = d.level === "outline" ? "outlines" : d.level
			const chapter =
				d.level === "scene" ? Number(d.ref.split("-")[1]) : undefined
			await start(stage as "arc" | "outlines" | "scene", chapter, note)
		} else await load()
	} catch (e) {
		error = (e as Error).message
	} finally {
		busy = false
	}
}

async function approveAllOutlines() {
	if (!arc) return
	busy = true
	try {
		for (const c of arc.chapters) {
			const o = outlineOf(c.n)
			if (o?.status === "draft")
				await api.post(`/admin/content/story/drafts/${o.id}/approve`)
		}
		await load()
	} catch (e) {
		error = (e as Error).message
	} finally {
		busy = false
	}
}

const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(3)}`

onMount(() => {
	void load()
	timer = setInterval(() => {
		if (running.length) void load()
	}, 6000)
	return () => {
		if (timer) clearInterval(timer)
	}
})
</script>

<section class="sr" data-testid="story-review">
	<header>
		<button type="button" class="back" onclick={() => page("/admin")}>‹ Admin</button>
		<label>
			Campaign
			<input type="number" min="1" max="99" bind:value={campaign} onchange={load} data-testid="sr-campaign" />
		</label>
	</header>
	<p class="muted">
		The council writes the arc, then the outlines, then each scene. You approve each level before the next is written. Only approved scenes play, and only for a campaign with no authored story (13 and up).
	</p>
	{#if error}<p class="error">{error}</p>{/if}

	<h2>1. Arc</h2>
	{#if isRunning("arc")}<p class="muted">The council is writing the arc… (this takes a minute or two)</p>{/if}
	{#if arc && arcDraft}
		<article class="card" data-testid="sr-arc">
			<span class="chip">{arcDraft.status}</span>
			<h3>{arc.title}</h3>
			<p>{arc.premise}</p>
			<p><b>Stakes.</b> {arc.stakes}</p>
			<p class="muted">Threads: {arc.threads.join(" · ")}</p>
			<ol>
				{#each arc.chapters as c}
					<li><b>{c.title}</b> (level {c.level}): {c.logline} <i>Turn: {c.turn}</i></li>
				{/each}
			</ol>
			<p class="muted">Reader's fix: {arcDraft.trace.readerFix ?? ""} · cost {usd(arcDraft.costMicros)}</p>
			{#if arcDraft.status === "draft"}
				<textarea rows="2" placeholder="What to change (optional)" bind:value={notes[`arc:${arcDraft.ref}`]}></textarea>
				<div class="row">
					<button type="button" class="ok" disabled={busy} onclick={() => decide(arcDraft, "approve")} data-testid="sr-arc-approve">Approve</button>
					<button type="button" disabled={busy} onclick={() => decide(arcDraft, "reject")}>Send back</button>
				</div>
			{/if}
		</article>
	{/if}
	{#if !arcApproved}
		<button type="button" disabled={busy || isRunning("arc")} onclick={() => start("arc")} data-testid="sr-start-arc">
			{arc ? "Write a different arc" : "Write the arc"}
		</button>
	{/if}

	{#if arcApproved && arc}
		<h2>2. Outlines</h2>
		{#if isRunning("outlines")}<p class="muted">Writing outlines…</p>{/if}
		<div class="row">
			<button type="button" disabled={busy || isRunning("outlines")} onclick={() => start("outlines")} data-testid="sr-start-outlines">
				{outlineOf(1) ? "Write the outlines again" : "Write the outlines"}
			</button>
			<button type="button" class="ok" disabled={busy} onclick={approveAllOutlines}>Approve all drafts</button>
		</div>
		{#each arc.chapters as c}
			{@const o = outlineOf(c.n)}
			{#if o}
				{@const ob = o.body as unknown as Outline}
				<article class="card">
					<span class="chip">{o.status}</span>
					<h3>{c.n}. {ob.title}</h3>
					<p class="muted">{ob.place} · {ob.object}</p>
					<p><b>Goal.</b> {ob.goal} <b>Conflict.</b> {ob.conflict} <b>Turn.</b> {ob.turn}</p>
					<p><b>Feeling.</b> {ob.emotion} <b>Ending.</b> {ob.ending}</p>
					<ul>{#each ob.wants as w}<li>{w.who}: {w.want}</li>{/each}</ul>
					{#if o.status === "draft"}
						<textarea rows="2" placeholder="What to change (optional)" bind:value={notes[`outline:${o.ref}`]}></textarea>
						<div class="row">
							<button type="button" class="ok" disabled={busy} onclick={() => decide(o, "approve")}>Approve</button>
							<button type="button" disabled={busy} onclick={() => decide(o, "reject")}>Send back</button>
						</div>
					{/if}
				</article>
			{/if}
		{/each}

		<h2>3. Scenes</h2>
		{#each arc.chapters as c}
			{@const o = outlineOf(c.n)}
			{@const s = sceneOf(c.n)}
			{#if o?.status === "approved"}
				<article class="card">
					<h3>{c.n}. {c.title}</h3>
					{#if isRunning(chapterRef(c.n))}<p class="muted">Writing…</p>{/if}
					{#if s}
						{@const sb = s.body as unknown as Scene}
						<span class="chip">{s.status}</span>
						<h4>{sb.title}</h4>
						{#each sb.lines as l}
							<p class="line"><b>{l.who}</b> {l.text}</p>
						{/each}
						<p class="muted">Critic {s.trace.criticScore ?? "–"}/5: {s.trace.criticFix ?? ""}</p>
						{#if s.status === "draft"}
							<textarea rows="2" placeholder="What to change (optional)" bind:value={notes[`scene:${s.ref}`]}></textarea>
							<div class="row">
								<button type="button" class="ok" disabled={busy} onclick={() => decide(s, "approve")}>Approve</button>
								<button type="button" disabled={busy} onclick={() => decide(s, "reject")}>Send back</button>
							</div>
						{/if}
					{:else}
						<button type="button" disabled={busy || isRunning(chapterRef(c.n))} onclick={() => start("scene", c.n)}>Write this scene</button>
					{/if}
				</article>
			{/if}
		{/each}
	{/if}
</section>

<style>
.sr {
	max-width: 640px;
	margin: 0 auto;
	padding: var(--space-4);
	padding-bottom: 96px;
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
}
header {
	padding-right: 52px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: var(--space-3);
}
input[type="number"] {
	width: 5rem;
	min-height: 44px;
	padding: 0 var(--space-3);
	font: inherit;
}
textarea {
	width: 100%;
	font: inherit;
	padding: var(--space-2) var(--space-3);
}
button {
	min-height: 44px;
	padding: 0 var(--space-4);
	border-radius: var(--radius-sm);
	border: 1px solid var(--color-border);
	background: transparent;
	color: var(--color-text);
	font: inherit;
	cursor: pointer;
}
button.ok {
	background: #2f9e5b;
	border-color: transparent;
	color: #fff;
}
button:disabled {
	opacity: 0.5;
}
.back {
	border: none;
}
.row {
	display: flex;
	gap: var(--space-2);
	flex-wrap: wrap;
}
.card {
	border: 1px solid var(--color-border);
	border-radius: var(--radius-lg);
	background: var(--color-surface-2);
	padding: var(--space-3) var(--space-4);
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
}
.card h3,
.card h4,
.card p {
	margin: 0;
}
.chip {
	align-self: flex-start;
	border: 1px solid var(--color-border);
	border-radius: 999px;
	padding: 2px 10px;
	font-size: var(--font-size-xs);
	text-transform: capitalize;
	color: var(--color-text-muted);
}
.line b {
	color: var(--color-text-muted);
	text-transform: capitalize;
	margin-right: 6px;
}
.muted {
	color: var(--color-text-muted);
	font-size: var(--font-size-sm);
	margin: 0;
}
.error {
	color: var(--color-danger, #ef4444);
}
h2 {
	margin: var(--space-3) 0 0;
}
</style>
