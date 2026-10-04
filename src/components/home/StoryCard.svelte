<script lang="ts">
// A short cutscene card for the waiting story chapter (#188): one line at a
// time, tap to go on, Skip to dismiss. Seeing it (or skipping) records it.
import { SPEAKERS } from "../../../shared/gym3d/story"
import { markStorySeen, story } from "../../lib/story.svelte.js"

const beat = $derived(story.data?.pending ?? null)
let at = $state(0)
let shownId = $state<string | null>(null)

$effect(() => {
	// a new chapter starts from its first line
	if (beat && beat.id !== shownId) {
		shownId = beat.id
		at = 0
	}
})

const line = $derived(beat ? (beat.lines[at] ?? null) : null)
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

{#if beat && line && who}
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
