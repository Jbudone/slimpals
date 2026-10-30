<script lang="ts">
import { onMount } from "svelte"
import type { InboxTask } from "../../../shared/admin/inbox.js"
import { api } from "../../lib/api.js"
import { page } from "../../router.svelte.js"

let tasks = $state<InboxTask[]>([])
let loading = $state(true)
let error = $state<string | null>(null)
let done = $state<Record<string, boolean>>({})
let notes = $state<Record<string, string>>({})
let copied = $state(false)

const KEY = "sp:admin-inbox:v1"

function load() {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}")
		done = raw.done ?? {}
		notes = raw.notes ?? {}
	} catch {
		// private window: the inbox still works, it just forgets
	}
}
function save() {
	try {
		localStorage.setItem(KEY, JSON.stringify({ done, notes }))
	} catch {
		// ignore
	}
}

onMount(async () => {
	load()
	try {
		tasks = (await api.get<{ tasks: InboxTask[] }>("/admin/inbox")).tasks
	} catch (e) {
		error = e instanceof Error ? e.message : "Could not load"
	} finally {
		loading = false
	}
})

const open = $derived(tasks.filter((t) => !(t.kind === "check" && done[t.id])))
const finished = $derived(tasks.filter((t) => t.kind === "check" && done[t.id]))
const minutes = $derived(open.reduce((n, t) => n + t.minutes, 0))
const noted = $derived(tasks.filter((t) => (notes[t.id] ?? "").trim()))

function toggle(id: string) {
	done = { ...done, [id]: !done[id] }
	save()
}
function setNote(id: string, v: string) {
	notes = { ...notes, [id]: v }
	save()
}
async function copyNotes() {
	const text = noted
		.map((t) => `## ${t.title}\n${(notes[t.id] ?? "").trim()}`)
		.join("\n\n")
	try {
		await navigator.clipboard.writeText(text)
		copied = true
		setTimeout(() => (copied = false), 2500)
	} catch {
		window.prompt("Copy this and paste it to Claude:", text)
	}
}
</script>

<div class="inbox" data-testid="admin-inbox">
	{#if loading}
		<p class="muted">Loading…</p>
	{:else if error}
		<p class="error-text">{error}</p>
	{:else}
		<p class="lead" data-testid="inbox-summary">
			{#if open.length === 0}
				Nothing is waiting on you. 🎉
			{:else}
				{open.length} {open.length === 1 ? "thing" : "things"} for you · about {minutes} min
			{/if}
		</p>

		{#each open as t (t.id)}
			<article class="task" class:waiting={t.kind === "waiting"} data-testid={`inbox-${t.id}`}>
				<header>
					<h3>{t.title}</h3>
					{#if t.count}<span class="badge" data-testid={`inbox-count-${t.id}`}>{t.count}</span>{/if}
					<span class="mins">~{t.minutes} min</span>
				</header>
				<ol>
					{#each t.steps as s}<li>{s}</li>{/each}
				</ol>
				<p class="tell"><strong>Tell me:</strong> {t.tell}</p>
				<button type="button" class="go" onclick={() => page(t.href)} data-testid={`inbox-go-${t.id}`}>{t.cta} →</button>
				{#if t.kind === "check"}
					<label class="note">
						<span>Your note for Claude</span>
						<textarea
							rows="2"
							placeholder="Type what you saw here (kept on this device)"
							value={notes[t.id] ?? ""}
							oninput={(e) => setNote(t.id, e.currentTarget.value)}
						></textarea>
					</label>
					<button type="button" class="done" onclick={() => toggle(t.id)} data-testid={`inbox-done-${t.id}`}>Mark done</button>
				{/if}
			</article>
		{/each}

		{#if noted.length}
			<div class="copy">
				<button type="button" class="go" onclick={copyNotes} data-testid="inbox-copy">
					{copied ? "Copied. Paste it in the chat." : `Copy my ${noted.length} ${noted.length === 1 ? "note" : "notes"} for Claude`}
				</button>
				<p class="muted">Feedback reaches me when you paste it into our chat.</p>
			</div>
		{/if}

		{#if finished.length}
			<details>
				<summary>Done ({finished.length})</summary>
				{#each finished as t (t.id)}
					<p class="muted">✓ {t.title} <button type="button" class="linklike" onclick={() => toggle(t.id)}>Undo</button></p>
				{/each}
			</details>
		{/if}
	{/if}
</div>

<style>
	.inbox { display: grid; gap: 0.9rem; }
	.lead { font-size: 1.1rem; font-weight: 600; margin: 0; }
	.task { border: 1px solid var(--border, #ccc); border-radius: 12px; padding: 0.9rem; display: grid; gap: 0.6rem; background: var(--card, transparent); }
	.task.waiting { border-color: var(--accent, #3a7); border-width: 2px; }
	header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	h3 { margin: 0; font-size: 1.05rem; flex: 1; }
	.badge { background: var(--accent, #3a7); color: #fff; border-radius: 999px; padding: 0.1rem 0.6rem; font-weight: 700; }
	.mins { opacity: 0.7; font-size: 0.85rem; }
	ol { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.25rem; }
	.tell { margin: 0; font-size: 0.92rem; }
	.go { min-height: 44px; padding: 0.6rem 1rem; border-radius: 10px; border: none; background: var(--accent, #3a7); color: #fff; font-weight: 700; font-size: 1rem; cursor: pointer; }
	.done { min-height: 40px; border-radius: 10px; border: 1px solid var(--border, #ccc); background: transparent; color: inherit; cursor: pointer; }
	.note { display: grid; gap: 0.25rem; font-size: 0.85rem; }
	.note textarea { width: 100%; font: inherit; padding: 0.5rem; border-radius: 8px; border: 1px solid var(--border, #ccc); background: transparent; color: inherit; }
	.copy { display: grid; gap: 0.3rem; }
	.linklike { background: none; border: none; text-decoration: underline; color: inherit; cursor: pointer; }
</style>
