<script lang="ts">
// The phone review queue (docs/content_pipeline.md, phase 2): one generated
// item at a time, three big buttons, optional tags. Admin only. A session is
// about ten minutes; what you decide trains the judge and takes bad lines out
// of play at once.
import { onMount } from "svelte"
import { REVIEW_TAGS } from "../../shared/content/quality.js"
import { api } from "../lib/api.js"
import { page } from "../router.svelte.js"

type Card = {
	id: number
	situation: string
	lines: string[]
	status: string
	model: string | null
	judgeScore: number | null
	judgeNote: string | null
}
type Stats = {
	total: number
	today: number
	byVerdict: Record<string, number>
	judgeAgreement: number | null
}

let cards = $state<Card[]>([])
let waiting = $state(0)
let stats = $state<Stats | null>(null)
let error = $state<string | null>(null)
let busy = $state(false)
let picked = $state<string[]>([])
let doneThisSession = $state(0)
const skipped: number[] = []
const startedAt = Date.now()
let now = $state(Date.now())

const card = $derived(cards[0] ?? null)
const minutes = $derived(Math.floor((now - startedAt) / 60000))

async function load() {
	try {
		const q = skipped.length ? `?skip=${skipped.join(",")}` : ""
		const d = await api.get<{ cards: Card[]; waiting: number; stats: Stats }>(
			`/admin/content/review/next${q}`,
		)
		cards = d.cards
		waiting = d.waiting
		stats = d.stats
		error = null
	} catch (e) {
		error =
			(e as { status?: number }).status === 403
				? "This page is for the admin account."
				: (e as Error).message
	}
}

async function decide(verdict: "good" | "meh" | "bad") {
	if (!card || busy) return
	busy = true
	try {
		await api.post("/admin/content/review", {
			itemId: card.id,
			verdict,
			tags: verdict === "good" ? [] : picked,
		})
		doneThisSession++
		picked = []
		cards = cards.slice(1)
		if (cards.length < 2) await load()
	} catch (e) {
		error = (e as Error).message
	} finally {
		busy = false
	}
}

function skip() {
	if (!card) return
	skipped.push(card.id)
	picked = []
	cards = cards.slice(1)
	if (cards.length < 2) void load()
}

function toggle(tag: string) {
	picked = picked.includes(tag)
		? picked.filter((t) => t !== tag)
		: [...picked, tag]
}

function key(e: KeyboardEvent) {
	if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return
	if (e.key === "g") void decide("good")
	else if (e.key === "m") void decide("meh")
	else if (e.key === "b") void decide("bad")
	else if (e.key === "s") skip()
}

onMount(() => {
	void load()
	const t = setInterval(() => (now = Date.now()), 30_000)
	return () => clearInterval(t)
})
</script>

<svelte:window onkeydown={key} />

<section class="review" data-testid="review-page">
	<header>
		<button type="button" class="back" onclick={() => page("/admin")}>‹ Admin</button>
		<p class="count" data-testid="review-count">
			{doneThisSession} done · {minutes} min{#if waiting} · {waiting} waiting{/if}
		</p>
	</header>

	{#if error}
		<p class="error">{error}</p>
	{:else if !stats}
		<p class="muted">Loading…</p>
	{:else if !card}
		<div class="empty" data-testid="review-empty">
			<h2>Nothing left to review</h2>
			<p class="muted">
				{stats.total} reviewed so far{#if stats.judgeAgreement !== null}; the judge agreed with you on {Math.round(stats.judgeAgreement * 100)}%{/if}.
				New items arrive with the nightly job.
			</p>
		</div>
	{:else}
		<div class="meta">
			<span class="chip">{card.situation.replace(/_/g, " ")}</span>
			{#if card.status === "rejected"}<span class="chip warn">judge rejected it</span>{/if}
			{#if card.judgeScore !== null}<span class="chip">judge {card.judgeScore}</span>{/if}
		</div>

		<div class="chat" data-testid="review-card" data-item={card.id}>
			{#each card.lines as line, i}
				<p class="bubble" class:right={i % 2 === 1}>{line}</p>
			{/each}
		</div>
		{#if card.judgeNote}<p class="note">Judge: {card.judgeNote}</p>{/if}

		<div class="tags" aria-label="Why (optional)">
			{#each REVIEW_TAGS as t}
				<button type="button" class="tag" class:on={picked.includes(t)} onclick={() => toggle(t)}>{t}</button>
			{/each}
		</div>

		<div class="verdicts">
			<button type="button" class="v bad" disabled={busy} onclick={() => decide("bad")} data-testid="review-bad">Bad</button>
			<button type="button" class="v meh" disabled={busy} onclick={() => decide("meh")} data-testid="review-meh">Meh</button>
			<button type="button" class="v good" disabled={busy} onclick={() => decide("good")} data-testid="review-good">Good</button>
		</div>
		<button type="button" class="skip" onclick={skip}>Skip</button>
		<p class="hint muted">Bad takes it out of play at once. Tags are optional and help tune the judge. Keys: b, m, g, s.</p>
	{/if}
</section>

<style>
.review {
	max-width: 520px;
	margin: 0 auto;
	padding: var(--space-4);
	padding-bottom: 96px; /* clear of the tab bar */
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
}
header {
	padding-right: 52px; /* the account button sits top right */
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.back,
.skip,
.tag {
	background: transparent;
	color: var(--color-text);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	min-height: 44px;
	padding: 0 var(--space-3);
	font: inherit;
	cursor: pointer;
}
.count,
.muted,
.note,
.hint {
	color: var(--color-text-muted);
	font-size: var(--font-size-sm);
	margin: 0;
}
.meta {
	display: flex;
	gap: var(--space-2);
	flex-wrap: wrap;
}
.chip {
	border: 1px solid var(--color-border);
	border-radius: 999px;
	padding: 2px 10px;
	font-size: var(--font-size-xs);
	text-transform: capitalize;
	color: var(--color-text-muted);
}
.chip.warn {
	border-color: var(--color-warning);
	color: var(--color-warning);
}
.chat {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
	padding: var(--space-4) 0;
}
.bubble {
	margin: 0;
	max-width: 85%;
	padding: var(--space-3) var(--space-4);
	border-radius: var(--radius-lg);
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	font-size: var(--font-size-base);
	line-height: 1.35;
	align-self: flex-start;
}
.bubble.right {
	align-self: flex-end;
}
.tags {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
}
.tag.on {
	background: var(--color-warning);
	color: var(--admin-on-warning);
	border-color: transparent;
}
.verdicts {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: var(--space-3);
}
.v {
	min-height: 72px;
	border-radius: var(--radius-lg);
	border: none;
	font: inherit;
	font-size: var(--font-size-lg, 1.15rem);
	font-weight: var(--font-weight-bold);
	color: #fff;
	cursor: pointer;
}
.v.good {
	background: #2f9e5b;
}
.v.meh {
	background: #c98a1a;
}
.v.bad {
	background: #c0453a;
}
.v:disabled {
	opacity: 0.5;
}
.empty {
	text-align: center;
	padding: var(--space-6) 0;
}
.error {
	color: var(--color-danger, #ef4444);
}
</style>
