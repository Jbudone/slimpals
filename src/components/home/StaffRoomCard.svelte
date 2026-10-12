<script lang="ts">
// The staff room (#293): once the gym has enough coaches, an overheard scene
// twice a week. A short intro, then a big portrait and one line at a time, tap
// to go on, "Not now" to dismiss. Seeing it (or skipping) records it.
import { SPEAKERS } from "../../../shared/gym3d/story"
import {
	endReplay,
	markEpisodeSeen,
	staffRoom,
} from "../../lib/staffRoom.svelte.js"

const rerun = $derived(!!staffRoom.replay)
const ep = $derived(staffRoom.replay ?? staffRoom.data?.pending ?? null)
/** -1 is the intro, then the lines. */
let at = $state(-1)
let shownId = $state<string | null>(null)

$effect(() => {
	// a new episode starts from its intro
	if (ep && ep.id !== shownId) {
		shownId = ep.id
		at = -1
	}
})

const intro = $derived(!!ep && at < 0)
const line = $derived(ep && at >= 0 ? (ep.lines[at] ?? null) : null)
const who = $derived(line ? SPEAKERS[line.who] : null)
const last = $derived(!!ep && at >= ep.lines.length - 1)

/** A rerun records nothing: it just ends. */
function finish() {
	if (!ep) return
	if (rerun) endReplay()
	else void markEpisodeSeen(ep.id)
}

function next() {
	if (!ep) return
	if (last) finish()
	else at += 1
}

function skip() {
	finish()
}
</script>

{#if ep && intro}
	<div class="backdrop" role="presentation" data-testid="room-card">
		<div class="card title" role="dialog" aria-label="Staff room: {ep.arcTitle}">
			<p class="kicker">{rerun ? "Rerun" : "The staff room"} · Episode {ep.n} of {ep.of}</p>
			<h2 data-testid="room-title">{ep.arcTitle}</h2>
			<p class="sub">{rerun ? "Back in the staff room, from the diary." : "You hear voices behind the staff room door."} <b>{ep.title}.</b></p>
			<div class="foot">
				<button type="button" class="skip" onclick={skip} data-testid="room-skip">{rerun ? "Close" : "Not now"}</button>
				<button type="button" class="go" onclick={next} data-testid="room-begin">{rerun ? "Play" : "Peek in"}</button>
			</div>
		</div>
	</div>
{:else if ep && line && who}
	<div class="backdrop" role="presentation" data-testid="room-card">
		<div class="card" role="dialog" aria-label="Staff room: {ep.title}">
			<p class="kicker">{ep.arcTitle} · {ep.title}</p>
			{#key at}
				<button type="button" class="scene" onclick={next} data-testid="room-line">
					{#if who.name}
						<span class="portrait" style="--c:{who.color}" aria-hidden="true">{who.name[0]}</span>
						<span class="plate" style="background:{who.color}">{who.name}</span>
					{/if}
					<span class="said" class:narrator={!who.name}>{line.text}</span>
				</button>
			{/key}
			<div class="foot">
				<button type="button" class="skip" onclick={skip} data-testid="room-skip">Not now</button>
				<span class="dots" aria-hidden="true">
					{#each ep.lines as _, i}<i class:on={i <= at}></i>{/each}
				</span>
				<button type="button" class="go" onclick={next} data-testid="room-next">
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
	z-index: 29;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	padding: 0 12px 96px;
	background: rgba(20, 14, 10, 0.5);
}

.card {
	width: min(420px, 100%);
	padding: 14px 16px 12px;
	border-radius: 20px;
	background: #fff7ea;
	color: #3a2a1c;
	box-shadow: 0 10px 28px rgba(30, 20, 10, 0.35);
}

.kicker {
	margin: 0 0 8px;
	font: 700 11px/1 system-ui, sans-serif;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: #7a4fb0;
}

.title h2 {
	margin: 0 0 8px;
	font: 800 22px/1.2 var(--font-display, system-ui, sans-serif);
}

.sub {
	margin: 0 0 6px;
	font: 500 14px/1.4 system-ui, sans-serif;
}

.scene {
	position: relative;
	display: block;
	width: 100%;
	min-height: 160px;
	padding: 0;
	border: 0;
	background: none;
	color: inherit;
	text-align: left;
	font: 500 16px/1.4 system-ui, sans-serif;
	cursor: pointer;
	animation: pop 0.18s ease-out;
}

.portrait {
	display: grid;
	place-items: center;
	width: 84px;
	height: 84px;
	margin: 6px 0 0 4px;
	border-radius: 50%;
	background: var(--c);
	border: 4px solid #fff7ea;
	box-shadow: 0 4px 12px rgba(30, 20, 10, 0.3);
	color: #fff;
	font: 800 38px system-ui, sans-serif;
}

.plate {
	position: absolute;
	top: 36px;
	left: 100px;
	padding: 3px 12px;
	border-radius: 999px;
	color: #fff;
	font: 800 13px system-ui, sans-serif;
}

.said {
	display: block;
	margin-top: 10px;
}

.narrator {
	padding-top: 18px;
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
	background: #7a4fb0;
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
	background: #b48ad6;
}

@keyframes pop {
	from {
		opacity: 0;
		transform: translateY(5px);
	}
}

@media (prefers-reduced-motion: reduce) {
	.scene {
		animation: none;
	}
}
</style>
