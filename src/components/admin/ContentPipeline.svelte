<script lang="ts">
// Admin: the content pipeline's budget, spend and report (docs/content_pipeline.md).
// Phone first: one column, big targets. Everything here is admin only.
import { onMount } from "svelte"
import { api } from "../../lib/api.js"

type Bucket = { key: string; usd: number; calls: number }
type Step = { fromDay: number; usd: number }
type Overview = {
	budget: { startDate: string; steps: Step[]; reservePct: number }
	dayNumber: number
	capToday: number
	pipelineCapToday: number
	spentToday: number
	summary: {
		totalUsd: number
		calls: number
		failed: number
		byDay: Bucket[]
		byPurpose: Bucket[]
		byModel: Bucket[]
	}
	report: {
		enabled: boolean
		cadence: "daily" | "weekly"
		hourUtc: number
		recipients: string[]
		lastSentKey: string | null
	}
	keys: { gemini: boolean; openrouter: boolean; resend: boolean }
}

let data = $state<Overview | null>(null)
let error = $state<string | null>(null)
let note = $state<{ ok: boolean; text: string } | null>(null)
let busy = $state(false)

// editable copies
let steps = $state<Step[]>([])
let startDate = $state("")
let reservePct = $state(10)
let enabled = $state(true)
let cadence = $state<"daily" | "weekly">("daily")
let hourUtc = $state(14)
let recipients = $state("")
let orModel = $state("anthropic/claude-haiku-4.5")

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`

function adopt(o: Overview) {
	data = o
	steps = o.budget.steps.map((s) => ({ ...s }))
	startDate = o.budget.startDate
	reservePct = o.budget.reservePct
	enabled = o.report.enabled
	cadence = o.report.cadence
	hourUtc = o.report.hourUtc
	recipients = o.report.recipients.join(", ")
}

async function load() {
	try {
		adopt(await api.get<Overview>("/admin/content/overview"))
		error = null
	} catch (e) {
		error = (e as Error).message
	}
}

async function run(label: string, fn: () => Promise<unknown>) {
	busy = true
	note = null
	try {
		await fn()
		note = { ok: true, text: label }
		await load()
	} catch (e) {
		note = { ok: false, text: (e as Error).message }
	} finally {
		busy = false
	}
}

const saveBudget = () =>
	run("Budget saved", () =>
		api.put("/admin/content/budget", { startDate, steps, reservePct }),
	)

const saveReport = () =>
	run("Report settings saved", () =>
		api.put("/admin/content/report", {
			enabled,
			cadence,
			hourUtc,
			recipients: recipients
				.split(/[,\s]+/)
				.map((s) => s.trim())
				.filter(Boolean),
		}),
	)

const sendNow = () =>
	run("Report sent", async () => {
		const r = await api.post<{ sent: boolean; reason?: string }>(
			"/admin/content/report/send",
		)
		if (!r.sent) throw new Error(r.reason ?? "Not sent")
	})

const testCall = (provider: "gemini" | "openrouter", model: string) =>
	run(`${provider} ${model} answered`, async () => {
		await api.post("/admin/content/test-call", { provider, model })
	})

onMount(load)
</script>

<section class="card" data-testid="admin-content">
	<h2>Content pipeline</h2>
	{#if error}
		<p class="error-text">{error}</p>
	{:else if !data}
		<p class="muted">Loading…</p>
	{:else}
		<p class="muted">
			Day {data.dayNumber + 1} of the budget. Spend is counted per UTC day.
		</p>

		<div class="meter" role="img" aria-label="Spent today">
			<div
				class="fill"
				class:over={data.spentToday > data.pipelineCapToday}
				style="width:{Math.min(100, data.capToday ? (data.spentToday / data.capToday) * 100 : 100)}%"
			></div>
		</div>
		<p data-testid="content-today">
			<b>{usd(data.spentToday)}</b> of {usd(data.capToday)} today
			<span class="muted">({usd(data.pipelineCapToday)} for the pipeline, the rest held back)</span>
		</p>

		<p class="keys">
			<span class:on={data.keys.gemini}>Gemini {data.keys.gemini ? "set" : "missing"}</span>
			<span class:on={data.keys.openrouter}>OpenRouter {data.keys.openrouter ? "set" : "missing"}</span>
			<span class:on={data.keys.resend}>Email {data.keys.resend ? "set" : "missing"}</span>
		</p>
		<div class="row">
			<button type="button" disabled={busy || !data.keys.gemini} onclick={() => testCall("gemini", "gemini-2.5-flash")}>
				Test Gemini
			</button>
			<input type="text" bind:value={orModel} aria-label="OpenRouter model" />
			<button type="button" disabled={busy || !data.keys.openrouter} onclick={() => testCall("openrouter", orModel)}>
				Test OpenRouter
			</button>
		</div>

		<h3>Last days: {usd(data.summary.totalUsd)} over {data.summary.calls} calls{data.summary.failed ? `, ${data.summary.failed} failed` : ""}</h3>
		{#each [["By day", data.summary.byDay], ["By purpose", data.summary.byPurpose], ["By model", data.summary.byModel]] as [title, rows]}
			<details>
				<summary>{title}</summary>
				<table>
					<tbody>
						{#each rows as r}
							<tr><td>{r.key}</td><td class="num">{usd(r.usd)}</td><td class="num muted">{r.calls}</td></tr>
						{:else}
							<tr><td class="muted">Nothing yet</td></tr>
						{/each}
					</tbody>
				</table>
			</details>
		{/each}

		<h3>Daily budget</h3>
		<label>
			Counts from (UTC)
			<input type="date" bind:value={startDate} />
		</label>
		{#each steps as s, i}
			<div class="row">
				<label>
					From day
					<input type="number" min="0" step="1" bind:value={s.fromDay} />
				</label>
				<label>
					USD per day
					<input type="number" min="0" step="0.5" bind:value={s.usd} />
				</label>
				{#if steps.length > 1 && i > 0}
					<button type="button" onclick={() => (steps = steps.filter((_, j) => j !== i))}>Remove</button>
				{/if}
			</div>
		{/each}
		<div class="row">
			<button type="button" onclick={() => (steps = [...steps, { fromDay: (steps.at(-1)?.fromDay ?? 0) + 7, usd: 1 }])}>
				Add a step
			</button>
		</div>
		<label>
			Held back for your own requests (%)
			<input type="number" min="0" max="50" step="5" bind:value={reservePct} />
		</label>
		<button type="button" class="primary" disabled={busy} onclick={saveBudget}>Save budget</button>

		<h3>Report</h3>
		<label class="check"><input type="checkbox" bind:checked={enabled} /> Send the report</label>
		<div class="row">
			<label>
				How often
				<select bind:value={cadence}>
					<option value="daily">Every day</option>
					<option value="weekly">Mondays</option>
				</select>
			</label>
			<label>
				UTC hour
				<input type="number" min="0" max="23" step="1" bind:value={hourUtc} />
			</label>
		</div>
		<label>
			Send to (empty: the admin accounts' emails)
			<input type="text" bind:value={recipients} placeholder="you@example.com" />
		</label>
		<div class="row">
			<button type="button" class="primary" disabled={busy} onclick={saveReport}>Save report settings</button>
			<button type="button" disabled={busy || !data.keys.resend} onclick={sendNow}>Send it now</button>
		</div>
		{#if data.report.lastSentKey}<p class="muted">Last sent for {data.report.lastSentKey}</p>{/if}
	{/if}
	{#if note}
		<p class="status-msg" class:ok={note.ok} class:fail={!note.ok}>{note.text}</p>
	{/if}
</section>

<style>
.card {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-left: 3px solid var(--color-warning);
	border-radius: var(--radius-lg);
	box-shadow: var(--shadow-sm);
	padding: var(--space-5);
	margin-bottom: var(--space-5);
}
.card h2 {
	margin: 0 0 var(--space-4);
	font-family: var(--font-display);
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}
.muted {
	color: var(--color-text-muted);
	font-size: var(--font-size-sm);
}
.error-text {
	color: var(--color-danger, #ef4444);
}
.status-msg {
	margin: var(--space-3) 0 0;
	font-size: var(--font-size-sm);
}
.status-msg.ok {
	color: var(--color-success);
}
.status-msg.fail {
	color: var(--color-danger, #ef4444);
}
button {
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--color-text);
	padding: 0 var(--space-4);
	cursor: pointer;
}
button.primary {
	background: var(--color-warning);
	border-color: transparent;
	color: var(--admin-on-warning);
	font-weight: var(--font-weight-medium);
}
button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
input,
select {
	background: var(--color-surface-2);
	color: var(--color-text);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
}
summary {
	cursor: pointer;
	padding: var(--space-2) 0;
}
h3 {
	margin: var(--space-5) 0 var(--space-2);
	font-size: var(--font-size-sm);
}
.row {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
	align-items: end;
	margin: var(--space-2) 0;
}
label {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: var(--font-size-sm);
	margin: var(--space-2) 0;
}
label.check {
	flex-direction: row;
	align-items: center;
}
input,
select,
button {
	min-height: 44px;
	font: inherit;
}
input[type="text"],
input[type="number"],
input[type="date"],
select {
	padding: 0 var(--space-3);
	max-width: 100%;
}
.meter {
	height: 12px;
	border-radius: 6px;
	background: var(--color-border);
	overflow: hidden;
}
.fill {
	height: 100%;
	background: var(--color-success, #3a9d5d);
}
.fill.over {
	background: var(--color-warning, #d98a3a);
}
.keys span {
	display: inline-block;
	margin-right: var(--space-3);
	color: var(--color-text-muted, #888);
}
.keys span.on {
	color: var(--color-success, #3a9d5d);
}
table {
	width: 100%;
	border-collapse: collapse;
	font-size: var(--font-size-sm);
}
td {
	padding: 6px 4px;
	border-bottom: 1px solid var(--color-border);
}
.num {
	text-align: right;
	white-space: nowrap;
}
</style>
