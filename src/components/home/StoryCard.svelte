<script lang="ts">
// A short cutscene card for the waiting story chapter (#188): a title card
// first (act, chapter n of N, what happened before), then one line at a time,
// tap to go on, Skip to dismiss. Seeing it (or skipping) records it.
import { SPEAKERS } from "../../../shared/gym3d/story"
import { markStorySeen, story } from "../../lib/story.svelte.js"

const beat = $derived(story.data?.pending ?? null)
/** -1 is the title card, then the lines. */
let at = $state(-1)
let shownId = $state<string | null>(null)

$effect(() => {
	// a new chapter starts from its first line
	if (beat && beat.id !== shownId) {
		shownId = beat.id
		at = -1
	}
})

const intro = $derived(!!beat && at < 0)
const chapter = $derived(story.data?.chapter ?? null)
const previously = $derived(story.data?.previously ?? null)
const after = $derived(story.data?.after ?? null)
const line = $derived(beat && at >= 0 ? (beat.lines[at] ?? null) : null)
const who = $derived(line ? SPEAKERS[line.who] : null)
const last = $derived(!!beat && at >= beat.lines.length - 1)

function next() {
	if (!beat) return
	if (last) void markStorySeen(beat.id)
	else at += 1
}

function skip() {
	if (beat) void markStorySeen(beat.id)
}
</script>

{#if beat && intro}
	<div class="backdrop" role="presentation" data-testid="story-card">
		<div class="card title" role="dialog" aria-label="Chapter: {beat.title}">
			<p class="kicker">
				Act {beat.act}{#if chapter} · Chapter {chapter.n} of {chapter.of}{/if}
			</p>
			<h2 data-testid="story-title">{beat.title}</h2>
			{#if previously}
				<p class="prev" data-testid="story-previously"><b>Previously</b> {previously}</p>
			{/if}
			{#if after != null}
				<p class="after">The next chapter opens at level {after}.</p>
			{/if}
			<div class="foot">
				<button type="button" class="skip" onclick={skip} data-testid="story-skip">Skip</button>
				<button type="button" class="go" onclick={next} data-testid="story-begin">Begin</button>
			</div>
		</div>
	</div>
{:else if beat && line && who}
	<div class="backdrop" role="presentation" data-testid="story-card">
		<div class="card" role="dialog" aria-label="Story: {beat.title}">
			<p class="kicker">Act {beat.act} · {beat.title}</p>
			<button type="button" class="line" onclick={next} data-testid="story-line">
				{#if who.name}
					<span class="face" style="background:{who.color}" aria-hidden="true">{who.name[0]}</span>
					<span class="said">
						<b>{who.name}</b>
						<span>{line.text}</span>
					</span>
				{:else}
					<span class="said narrator"><span>{line.text}</span></span>
				{/if}
			</button>
			{#if last && beat.reward}
				<p class="reward" data-testid="story-reward">+{beat.reward.coins.toLocaleString("en-US")} coins</p>
			{/if}
			<div class="foot">
				<button type="button" class="skip" onclick={skip} data-testid="story-skip">Skip</button>
				<span class="dots" aria-hidden="true">
					{#each beat.lines as _, i}<i class:on={i <= at}></i>{/each}
				</span>
				<button type="button" class="go" onclick={next} data-testid="story-next">
					{last ? "Done" : "Next"}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
.backdrop {
	position: absolute;
	inset: 0;
	z-index: 30;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	padding: 0 12px 96px;
	background: rgba(20, 14, 10, 0.45);
}

.card {
	width: min(420px, 100%);
	padding: 14px 16px;
	border-radius: 18px;
	background: #fff7ea;
	color: #3a2a1c;
	box-shadow: 0 10px 28px rgba(30, 20, 10, 0.35);
}

.kicker {
	margin: 0 0 8px;
	font: 700 11px/1 system-ui, sans-serif;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: #c4521f;
}

.title h2 {
	margin: 0 0 8px;
	font: 800 22px/1.2 var(--font-display, system-ui, sans-serif);
}

.prev,
.after {
	margin: 0 0 6px;
	font: 500 14px/1.4 system-ui, sans-serif;
}

.prev b {
	color: #c4521f;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	font-size: 11px;
	margin-right: 4px;
}

.after {
	color: #8a7a68;
	font-size: 12px;
}

.line {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	width: 100%;
	min-height: 64px;
	padding: 0;
	border: 0;
	background: none;
	color: inherit;
	text-align: left;
	font: 500 15px/1.35 system-ui, sans-serif;
	cursor: pointer;
}

.face {
	flex: none;
	display: grid;
	place-items: center;
	width: 40px;
	height: 40px;
	border-radius: 50%;
	color: #fff;
	font: 800 18px system-ui, sans-serif;
}

.said {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.narrator {
	font-style: italic;
	opacity: 0.85;
}

.reward {
	margin: 6px 0 0;
	font: 800 14px system-ui, sans-serif;
	color: #b8862a;
}

.foot {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: 10px;
}

.skip,
.go {
	padding: 6px 12px;
	border: 0;
	border-radius: 999px;
	font: 700 13px system-ui, sans-serif;
	cursor: pointer;
}

.skip {
	background: none;
	color: #8a7a68;
}

.go {
	background: #34c973;
	color: #fff;
}

.dots {
	display: flex;
	gap: 5px;
}

.dots i {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: #e5d6c0;
}

.dots i.on {
	background: #f2b21a;
}
</style>
