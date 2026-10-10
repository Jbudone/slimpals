<script lang="ts">
// The daily check-in, daily missions and weekly missions (Layout Lab task
// list), shared by the Home drawer and the Today tab. With `editable`, the
// player adds, edits and archives missions (the old MissionsCard form).

import { onMount } from "svelte"
import { guessMissionKind } from "../../../shared/gym3d/economy.js"
import type {
	MissionCadence,
	MissionDifficulty,
} from "../../../shared/types.js"
import { checkinState } from "../../lib/checkin.svelte.js"
import {
	archiveMission,
	CHECKIN_XP,
	checkIn,
	loadToday,
	type Mission,
	type MissionInput,
	type MissionKind,
	SUGGESTED,
	saveMission,
	today,
	toggleMission,
} from "../../lib/today.svelte.js"
import ChallengeChecks from "./ChallengeChecks.svelte"
import { FLAME_SVG, GREENS_SVG, SWEAT_SVG, TICK_SVG } from "./icons"

let { editable = false }: { editable?: boolean } = $props()

const MILESTONES = [7, 30, 100]
const DIFF: Record<MissionDifficulty, string> = {
	easy: "Easy",
	medium: "Medium",
	hard: "Hard",
}

const streak = $derived(checkinState.data?.streakCount ?? 0)
const checked = $derived(checkinState.data?.checkedInToday ?? false)
const nextMilestone = $derived(MILESTONES.find((m) => m > streak) ?? null)
const daily = $derived(
	[...today.daily].sort(
		(a, b) => Number(a.completedThisPeriod) - Number(b.completedThisPeriod),
	),
)
const daysLeftInWeek = $derived.by(() => {
	// weeks start on Monday (server's currentPeriodStart)
	const d = new Date().getDay()
	return d === 0 ? 1 : 8 - d
})

let formOpen = $state(false)
let editingId = $state<number | null>(null)
let fTitle = $state("")
let fDesc = $state("")
let fCadence = $state<MissionCadence>("daily")
let fDiff = $state<MissionDifficulty>("easy")
let fKind = $state<MissionKind>("other")
let kindTouched = $state(false)
let saving = $state(false)
let formError = $state<string | null>(null)
let adding = $state<string | null>(null)

$effect(() => {
	// the kind follows the title until the player picks one
	if (!kindTouched && editingId == null) fKind = guessMissionKind(fTitle)
})

function openForm(m: Mission | null) {
	editingId = m?.id ?? null
	fTitle = m?.title ?? ""
	fDesc = m?.description ?? ""
	fCadence = m?.cadence ?? "daily"
	fDiff = m?.difficulty ?? "easy"
	fKind = m?.kind ?? "other"
	kindTouched = m != null
	formError = null
	formOpen = true
}

async function submit() {
	if (!fTitle.trim()) {
		formError = "Title is required"
		return
	}
	saving = true
	formError = null
	try {
		await saveMission(
			{
				title: fTitle.trim(),
				description: fDesc.trim() || undefined,
				cadence: fCadence,
				difficulty: fDiff,
				kind: fKind,
			},
			editingId,
		)
		formOpen = false
	} catch (e) {
		formError = e instanceof Error ? e.message : "Could not save"
	} finally {
		saving = false
	}
}

async function addSuggested(s: MissionInput) {
	adding = s.title
	try {
		await saveMission(s, null)
	} finally {
		adding = null
	}
}

const suggestions = $derived(
	SUGGESTED.filter(
		(s) =>
			![...today.daily, ...today.weekly].some(
				(m) => m.title.toLowerCase() === s.title.toLowerCase(),
			),
	),
)

onMount(() => {
	if (!today.loaded) void loadToday()
})
</script>

{#snippet tags(m: Mission)}
	{#if m.kind === "exercise"}
		<span class="tag ex">{@html SWEAT_SVG} Exercise</span>
	{:else if m.kind === "diet"}
		<span class="tag diet">{@html GREENS_SVG} Diet</span>
	{/if}
	<span class="tag {m.difficulty}">{DIFF[m.difficulty]}</span>
{/snippet}

{#snippet chips(m: Mission, weekly: boolean)}
	<span class="rw">
		<span class="chip xp" data-r="xp">{weekly ? "Bonus " : ""}+{m.xp} XP</span>
		{#if m.sweat}<span class="chip sw" data-r="sw">{@html SWEAT_SVG}+{m.sweat}</span>{/if}
		{#if m.greens}<span class="chip gr" data-r="gr">{@html GREENS_SVG}+{m.greens}</span>{/if}
	</span>
{/snippet}

{#snippet row(m: Mission, weekly: boolean)}
	<li class="task" class:done={m.completedThisPeriod} data-task={m.id} data-testid="task-{m.id}">
		<button
			type="button"
			class="tick"
			disabled={today.busy != null}
			aria-pressed={m.completedThisPeriod}
			aria-label={m.completedThisPeriod ? `Mark ${m.title} not done` : `Mark ${m.title} done`}
			onclick={(e) => toggleMission(m, e.currentTarget)}
		>{@html TICK_SVG}</button>
		<span class="ttx">
			<span class="ttl">{m.title}</span>
			<span class="tmeta">
				{@render tags(m)}
				{#if m.description}<span class="desc">{m.description}</span>{/if}
			</span>
			{#if editable}
				<span class="edit">
					<button type="button" class="link" onclick={() => openForm(m)}>Edit</button>
					<button type="button" class="link" onclick={() => archiveMission(m.id)}>Archive</button>
				</span>
			{/if}
		</span>
		{@render chips(m, weekly)}
	</li>
{/snippet}

<div class="tl">
	<div class="checkin" class:done={checked} data-task="checkin" data-testid="checkin-card">
		<div class="flame">{@html FLAME_SVG}<b>{streak}</b></div>
		<div class="ctx">
			<b>{checked ? "You're on a roll" : "Keep the fire going"}</b>
			<small>
				{checked ? "See you tomorrow." : "Before midnight, or the streak resets."}
				{#if nextMilestone}{nextMilestone - streak} day{nextMilestone - streak === 1 ? "" : "s"} to {nextMilestone}.{/if}
			</small>
		</div>
		{#if checked}
			<span class="okmark">{@html TICK_SVG}</span>
		{:else}
			<button
				type="button"
				class="primary"
				data-testid="checkin-btn"
				disabled={today.busy != null}
				onclick={(e) => checkIn(e.currentTarget)}
			>
				Check in<br /><small data-r="xp">+{CHECKIN_XP} XP</small>
			</button>
		{/if}
	</div>

	<div class="tsec"><h3>Daily missions</h3><small>reset at midnight</small></div>
	{#if today.error}
		<p class="err">{today.error}</p>
	{:else if !today.loaded}
		<p class="muted">Loading…</p>
	{:else if daily.length}
		<ul class="tlist">
			{#each daily as m (m.id)}{@render row(m, false)}{/each}
		</ul>
	{:else}
		<p class="muted">No daily missions yet. Add one below: every tick builds your gym.</p>
	{/if}

	<ChallengeChecks />

	{#if today.weekly.length}
		<div class="tsec">
			<h3>This week</h3>
			<small>{daysLeftInWeek} day{daysLeftInWeek === 1 ? "" : "s"} left</small>
		</div>
		<ul class="tlist">
			{#each today.weekly as m (m.id)}{@render row(m, true)}{/each}
		</ul>
	{/if}

	{#if today.loaded && suggestions.length && today.daily.length + today.weekly.length < 5}
		<div class="tsec"><h3>Quick add</h3><small>one tap</small></div>
		<div class="sugg">
			{#each suggestions as s (s.title)}
				<button
					type="button"
					class="sg {s.kind}"
					disabled={adding != null}
					onclick={() => addSuggested(s)}
				>+ {s.title}{s.cadence === "weekly" ? " (weekly)" : ""}</button>
			{/each}
		</div>
	{/if}

	{#if editable}
		{#if formOpen}
			<div class="form" data-testid="mission-form">
				<label for="m-title">Title</label>
				<input id="m-title" type="text" maxlength="255" placeholder="e.g. 10-minute walk" bind:value={fTitle} />
				<label for="m-desc">Description (optional)</label>
				<input id="m-desc" type="text" placeholder="Any extra detail" bind:value={fDesc} />
				<div class="frow">
					<div>
						<label for="m-cad">Cadence</label>
						<select id="m-cad" bind:value={fCadence}>
							<option value="daily">Daily</option>
							<option value="weekly">Weekly</option>
						</select>
					</div>
					<div>
						<label for="m-diff">Difficulty</label>
						<select id="m-diff" bind:value={fDiff}>
							<option value="easy">Easy</option>
							<option value="medium">Medium</option>
							<option value="hard">Hard</option>
						</select>
					</div>
				</div>
				<span class="lbl" id="m-kind">Kind</span>
				<div class="kinds" role="radiogroup" aria-labelledby="m-kind">
					{#each [["exercise", "Exercise · Sweat"], ["diet", "Diet · Greens"], ["other", "Other · XP only"]] as [k, label] (k)}
						<button
							type="button"
							role="radio"
							aria-checked={fKind === k}
							class="kind {k}"
							class:on={fKind === k}
							onclick={() => {
								fKind = k as MissionKind
								kindTouched = true
							}}>{label}</button
						>
					{/each}
				</div>
				{#if formError}<p class="err">{formError}</p>{/if}
				<div class="facts">
					<button type="button" class="primary" disabled={saving} onclick={submit}>
						{saving ? "Saving…" : editingId != null ? "Save changes" : "Add mission"}
					</button>
					<button type="button" onclick={() => (formOpen = false)}>Cancel</button>
				</div>
			</div>
		{:else}
			<button type="button" class="add" onclick={() => openForm(null)}>+ Add mission</button>
		{/if}
	{/if}

	<p class="hint">
		Exercise earns <b class="sw-t">Sweat</b> (speeds up gym builds). Diet earns
		<b class="gr-t">Greens</b> (runs the Slim Kitchen). Everything earns XP.
	</p>
</div>

<style>
.tl {
	--tl-card: var(--color-surface);
	--tl-line: var(--color-border);
	--tl-text: var(--color-text);
	--tl-muted: var(--color-text-muted);
	--tl-done: color-mix(in srgb, var(--dr-fill, #34c973) 10%, var(--color-surface));
	color: var(--tl-text);
}

button {
	font: 700 14px/1.1 system-ui, sans-serif;
	border: 0;
	background: var(--tl-card);
	color: var(--tl-text);
	border-radius: 14px;
	padding: 10px 14px;
	cursor: pointer;
	box-shadow: inset 0 0 0 1.5px var(--tl-line);
	-webkit-tap-highlight-color: transparent;
}

button:active {
	transform: translateY(1px) scale(0.98);
}

button.primary {
	background: var(--dr-fill, #34c973);
	color: #fff;
	box-shadow: 0 3px 0 var(--dr-accent, #1f9a55);
}

button:disabled {
	opacity: 0.55;
	cursor: default;
}

.checkin {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px;
	border-radius: 18px;
	background: linear-gradient(135deg, var(--dr-hero-a, #17331f), var(--dr-hero-b, #1e3f27));
	color: #f2f7f0;
	box-shadow: 0 4px 0 #0f2016;
}

.checkin.done {
	background: linear-gradient(135deg, var(--dr-hero2-a, #1e5a37), var(--dr-hero2-b, #23703f));
}

.flame {
	position: relative;
	width: 52px;
	height: 52px;
	flex: none;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.08);
	display: grid;
	place-items: center;
}

.flame :global(svg) {
	width: 30px;
	height: 30px;
}

.flame b {
	position: absolute;
	right: -4px;
	bottom: -4px;
	min-width: 24px;
	height: 22px;
	border-radius: 11px;
	background: #ff8a3d;
	color: #fff;
	font: 800 13px/22px ui-rounded, system-ui, sans-serif;
	text-align: center;
	padding: 0 5px;
	box-shadow: 0 0 0 2.5px #17331f;
}

.ctx {
	flex: 1;
	min-width: 0;
}

.ctx b {
	display: block;
	font: 700 16px/1.15 var(--font-display, Georgia, serif);
}

.ctx small {
	display: block;
	margin-top: 3px;
	font: 600 12px/1.3 system-ui, sans-serif;
	color: #8fae95;
}

.checkin button {
	flex: none;
	padding: 11px 14px;
	line-height: 1.2;
}

.checkin button small {
	font-weight: 700;
	opacity: 0.85;
}

.okmark {
	width: 34px;
	height: 34px;
	border-radius: 50%;
	background: var(--dr-fill, #34c973);
	display: grid;
	place-items: center;
	flex: none;
}

.okmark :global(svg) {
	width: 22px;
	height: 22px;
}

.tsec {
	margin: 16px 4px 8px;
	display: flex;
	align-items: baseline;
	gap: 8px;
}

.tsec h3 {
	margin: 0;
	font: 700 16px/1 var(--font-display, Georgia, serif);
}

.tsec small,
.muted {
	font: 600 12px system-ui, sans-serif;
	color: var(--tl-muted);
}

.muted {
	margin: 4px 4px 0;
	font-size: 13px;
	line-height: 1.4;
}

.tlist {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.task {
	display: flex;
	align-items: center;
	gap: 11px;
	min-height: 62px;
	padding: 9px 10px 9px 9px;
	border-radius: 16px;
	background: var(--tl-card);
	box-shadow:
		0 2px 0 rgba(58, 38, 34, 0.08),
		inset 0 0 0 1.5px var(--tl-line);
	transition: background 0.3s;
}

.task.done {
	background: var(--tl-done);
}

.tick {
	width: 40px;
	height: 40px;
	flex: none;
	border-radius: 50%;
	padding: 0;
	background: var(--tl-card);
	box-shadow: inset 0 0 0 2.5px #d9c8ae;
	display: grid;
	place-items: center;
}

.tick :global(svg) {
	width: 22px;
	height: 22px;
}

.tick :global(svg path) {
	stroke-dasharray: 24;
	stroke-dashoffset: 24;
	transition: stroke-dashoffset 0.35s 0.08s ease-out;
}

.task.done .tick {
	background: var(--dr-fill, #34c973);
	box-shadow: 0 2px 0 var(--dr-accent, #1f9a55);
	animation: tickpop 0.5s cubic-bezier(0.2, 1.8, 0.4, 1);
}

.task.done .tick :global(svg path) {
	stroke-dashoffset: 0;
}

@keyframes tickpop {
	40% {
		transform: scale(1.25);
	}
}

.ttx {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.ttl {
	font: 700 15px/1.2 system-ui, sans-serif;
}

.task.done .ttl {
	color: #5f8a6b;
	text-decoration: line-through;
	text-decoration-thickness: 2px;
	text-decoration-color: rgba(52, 201, 115, 0.6);
}

.tmeta {
	display: flex;
	align-items: center;
	gap: 5px;
	flex-wrap: wrap;
	font: 600 11.5px/1.2 system-ui, sans-serif;
	color: var(--tl-muted);
}

.desc {
	flex-basis: 100%;
}

.tag {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 3px 6px;
	border-radius: 6px;
	font: 800 10px/1 system-ui, sans-serif;
	letter-spacing: 0.03em;
	text-transform: uppercase;
}

.tag :global(svg) {
	width: 11px;
	height: 11px;
}

.tag.ex {
	background: #e3f0fc;
	color: #1f6fb8;
}

.tag.diet {
	background: #e7f5dd;
	color: #3f8a25;
}

.tag.easy {
	background: #eef5ef;
	color: #4d7a5a;
}

.tag.medium {
	background: #fbf1d8;
	color: #8a6410;
}

.tag.hard {
	background: #fbe2dc;
	color: #a8392c;
}

.rw {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 4px;
	flex: none;
}

.task.done .rw {
	opacity: 0.35;
}

.chip {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 4px 7px 4px 5px;
	border-radius: 999px;
	font: 800 12.5px/1 ui-rounded, system-ui, sans-serif;
	white-space: nowrap;
}

.chip :global(svg) {
	width: 15px;
	height: 15px;
}

.chip.xp {
	background: #e6f8ed;
	color: #1b7a44;
}

.chip.sw {
	background: #e3f0fc;
	color: #1f6fb8;
}

.chip.gr {
	background: #e7f5dd;
	color: #3f8a25;
}

.edit {
	display: flex;
	gap: 12px;
}

.link {
	background: none;
	box-shadow: none;
	padding: 2px 0;
	color: var(--color-accent);
	font-size: 12.5px;
}

.sugg {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.sg {
	padding: 8px 11px;
	font-size: 13px;
	border-radius: 999px;
}

.sg.exercise {
	box-shadow: inset 0 0 0 1.5px #9ed0ff;
}

.sg.diet {
	box-shadow: inset 0 0 0 1.5px #b7e39f;
}

.add {
	margin-top: 12px;
	width: 100%;
}

.form {
	margin-top: 12px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 12px;
	border-radius: 16px;
	background: var(--tl-card);
	box-shadow: inset 0 0 0 1.5px var(--tl-line);
}

.form label,
.lbl {
	font: 700 12px system-ui, sans-serif;
	color: var(--tl-muted);
}

.form input,
.form select {
	width: 100%;
	box-sizing: border-box;
	background: var(--color-surface-2);
	border: 1px solid var(--tl-line);
	border-radius: 10px;
	padding: 9px 10px;
	color: var(--tl-text);
	font: 500 15px system-ui, sans-serif;
}

.frow {
	display: flex;
	gap: 8px;
}

.frow > div {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.kinds {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
}

.kind {
	padding: 8px 10px;
	font-size: 12.5px;
	border-radius: 10px;
}

.kind.on.exercise {
	background: #3d9df0;
	color: #fff;
	box-shadow: none;
}

.kind.on.diet {
	background: #62b83f;
	color: #fff;
	box-shadow: none;
}

.kind.on.other {
	background: #8d7c66;
	color: #fff;
	box-shadow: none;
}

.facts {
	display: flex;
	gap: 8px;
	margin-top: 6px;
}

.err {
	color: #dc2626;
	font-size: 13px;
	margin: 4px;
}

.hint {
	margin: 16px 6px 4px;
	font: 600 12.5px/1.45 system-ui, sans-serif;
	color: var(--tl-muted);
}

.sw-t {
	color: #3d9df0;
}

.gr-t {
	color: #62b83f;
}
</style>
