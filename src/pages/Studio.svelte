<script lang="ts">
// The Studio (docs/studio): the owner's board of writing pieces, phone first.
// Ideas, Next, In progress, Paused, Done; a piece holds a premise, a script of
// "who | text" lines with saved versions, and the next Friday / Sunday slots.
import { onMount } from "svelte"
import {
	castOf,
	formatScript,
	isKind,
	KIND_LABEL,
	nextSlotDates,
	PIECE_KINDS,
	PIECE_STATUSES,
	type PieceKind,
	type PieceStatus,
	parseScript,
	type ScriptLine,
	STATUS_LABEL,
	STUDIO_SLOTS,
} from "../../shared/studio/pieces.js"
import { api } from "../lib/api.js"

type Row = {
	id: number
	title: string
	kind: PieceKind
	status: PieceStatus
	premise: string
	slot: string | null
	lineCount: number
	version: number
}
type Full = Row & { notes: string; lines: ScriptLine[] }
type Version = {
	version: number
	lines: ScriptLine[]
	note: string | null
	createdAt: string
}

let rows = $state<Row[]>([])
let tab = $state<PieceStatus>("in_progress")
let error = $state<string | null>(null)
let newTitle = $state("")
let newKind = $state<PieceKind>("bro-hype")

let open = $state<Full | null>(null)
let versions = $state<Version[]>([])
let script = $state("")
let saved = $state("")
let busy = $state(false)

const counts = $derived(
	Object.fromEntries(
		PIECE_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]),
	) as Record<PieceStatus, number>,
)
const shown = $derived(rows.filter((r) => r.status === tab))
const slots = $derived(
	STUDIO_SLOTS.map((s) => ({
		...s,
		dates: nextSlotDates(s.weekday, new Date(), 3),
	})),
)
const dirty = $derived(open !== null && script !== saved)
const cast = $derived(castOf(parseScript(script)))

async function load() {
	try {
		rows = (await api.get<{ pieces: Row[] }>("/admin/studio/pieces")).pieces
		error = null
	} catch (e) {
		error = (e as Error).message
	}
}
async function openPiece(id: number) {
	try {
		const d = await api.get<{ piece: Full; versions: Version[] }>(
			`/admin/studio/pieces/${id}`,
		)
		open = d.piece
		versions = d.versions
		script = saved = formatScript(d.piece.lines)
		error = null
	} catch (e) {
		error = (e as Error).message
	}
}
async function patch(body: Record<string, unknown>) {
	if (!open || busy) return
	busy = true
	try {
		await api.patch(`/admin/studio/pieces/${open.id}`, body)
		await openPiece(open.id)
		await load()
	} catch (e) {
		error = (e as Error).message
	} finally {
		busy = false
	}
}
async function addPiece() {
	const title = newTitle.trim()
	if (!title || busy) return
	busy = true
	try {
		await api.post("/admin/studio/pieces", { title, kind: newKind })
		newTitle = ""
		tab = "idea"
		await load()
	} catch (e) {
		error = (e as Error).message
	} finally {
		busy = false
	}
}
async function remove() {
	if (!open || !confirm(`Delete "${open.title}" and its versions?`)) return
	await api.del(`/admin/studio/pieces/${open.id}`)
	open = null
	await load()
}
function slotFor(date: string, kind: PieceKind) {
	return rows.find((r) => r.slot === date && r.kind === kind)
}
onMount(load)
</script>

<div class="studio" data-testid="studio">
	{#if open}
		<button type="button" class="back" onclick={() => { open = null }} data-testid="studio-back">← Board</button>
		<h1>{open.title}</h1>
		<div class="chips">
			{#each PIECE_STATUSES as s}
				<button type="button" class="chip" class:on={open.status === s} onclick={() => patch({ status: s })}>{STATUS_LABEL[s]}</button>
			{/each}
		</div>
		<label>Premise
			<textarea rows="2" value={open.premise} onchange={(e) => patch({ premise: e.currentTarget.value })} data-testid="studio-premise"></textarea>
		</label>
		<label>Script <span class="muted">one line each: who | what they say. A line with no bar is the narrator.</span>
			<textarea rows="14" bind:value={script} data-testid="studio-script"></textarea>
		</label>
		<p class="muted">{cast.length ? `Cast: ${cast.join(", ")}` : "No cast yet"} · version {open.version}</p>
		<div class="row">
			<button type="button" class="primary" disabled={!dirty || busy} onclick={() => patch({ script })} data-testid="studio-save">{dirty ? "Save version" : "Saved"}</button>
			<select value={open.slot ?? ""} onchange={(e) => patch({ slot: e.currentTarget.value || null })} aria-label="Slot">
				<option value="">No slot</option>
				{#each slots.filter((s) => s.kind === open?.kind) as s}
					{#each s.dates as d}<option value={d}>{s.label} {d}</option>{/each}
				{/each}
				{#if open.slot && !slots.some((s) => s.dates.includes(open?.slot ?? ""))}<option value={open.slot}>{open.slot}</option>{/if}
			</select>
		</div>
		<label>Notes
			<textarea rows="3" value={open.notes} onchange={(e) => patch({ notes: e.currentTarget.value })}></textarea>
		</label>
		{#if versions.length}
			<h2>Versions</h2>
			<ul class="versions">
				{#each versions as v}
					<li>
						<span>v{v.version} · {v.lines.length} lines{v.note ? ` · ${v.note}` : ""}</span>
						{#if v.version !== open.version}<button type="button" class="linklike" onclick={() => patch({ restore: v.version })}>Restore</button>{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<button type="button" class="danger" onclick={remove}>Delete piece</button>
	{:else}
		<h1>The Studio</h1>
		{#if error}<p class="err" role="alert">{error}</p>{/if}
		<form class="add" onsubmit={(e) => { e.preventDefault(); addPiece() }}>
			<input placeholder="A premise or a title…" bind:value={newTitle} maxlength="120" data-testid="studio-new" />
			<select bind:value={newKind} onchange={() => { if (!isKind(newKind)) newKind = "other" }}>
				{#each PIECE_KINDS as k}<option value={k}>{KIND_LABEL[k]}</option>{/each}
			</select>
			<button class="primary" disabled={!newTitle.trim() || busy}>Add</button>
		</form>
		<div class="chips" role="tablist">
			{#each PIECE_STATUSES as s}
				<button type="button" role="tab" aria-selected={tab === s} class="chip" class:on={tab === s} onclick={() => { tab = s }} data-testid={`studio-tab-${s}`}>{STATUS_LABEL[s]} {counts[s]}</button>
			{/each}
		</div>
		<ul class="cards">
			{#each shown as r (r.id)}
				<li><button type="button" class="card" onclick={() => openPiece(r.id)}>
					<strong>{r.title}</strong>
					<span class="muted">{KIND_LABEL[r.kind]} · {r.lineCount} lines{r.slot ? ` · ${r.slot}` : ""}</span>
					{#if r.premise}<span>{r.premise}</span>{/if}
				</button></li>
			{:else}
				<li class="muted">Nothing here yet.</li>
			{/each}
		</ul>
		<h2>Coming up</h2>
		{#each slots as s}
			<div class="slot">
				<strong>{s.label}</strong>
				{#each s.dates as d}
					{@const p = slotFor(d, s.kind)}
					<span class="muted">{d}: {p ? p.title : "empty"}</span>
				{/each}
			</div>
		{/each}
	{/if}
</div>

<style>
	.studio { max-width: 640px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
	h1 { font-size: 1.4rem; margin: 0; }
	h2 { font-size: 1rem; margin: 8px 0 0; }
	.muted { opacity: 0.7; font-size: 0.85rem; }
	.err { color: #e5484d; }
	.add, .row { display: flex; gap: 8px; }
	.add input { flex: 1; min-width: 0; }
	input, select, textarea { font: inherit; padding: 8px; border-radius: 8px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); background: transparent; color: inherit; width: 100%; box-sizing: border-box; }
	.add select, .row select { width: auto; }
	label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; }
	label .muted { font-weight: 400; }
	textarea { font-family: ui-monospace, monospace; font-size: 0.9rem; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.chip, .primary, .danger, .back { font: inherit; padding: 8px 12px; border-radius: 999px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); background: transparent; color: inherit; cursor: pointer; }
	.chip.on, .primary { background: var(--accent, #3b82f6); border-color: transparent; color: #fff; }
	.primary:disabled { opacity: 0.5; }
	.danger { color: #e5484d; align-self: flex-start; }
	.back { align-self: flex-start; }
	.cards, .versions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
	.card { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 2px; padding: 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); background: transparent; color: inherit; font: inherit; cursor: pointer; }
	.versions li { display: flex; justify-content: space-between; gap: 8px; }
	.linklike { background: none; border: 0; color: var(--accent, #3b82f6); cursor: pointer; font: inherit; }
	.slot { display: flex; flex-direction: column; gap: 2px; }
</style>
