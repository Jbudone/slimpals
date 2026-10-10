<script lang="ts">
// The backdrop of the app's event look (see lib/eventTheme.ts): a slow
// animated scene behind the cards (a synthwave grid and stars for the
// arcade, snow, fog and a moon, drifting petals...) with now and then a tiny
// something drifting across. Purely decoration: it takes no taps, stays
// still with reduced motion. On the gym (`over`) it floats over the 3D scene,
// under the HUD and the bubbles: a dusk or cold tint, weather and the tiny
// events drifting past the windows.

import { nextDelay, THEME_EVENTS } from "../lib/eventTheme.js"
import { activeEventTheme, eventLook } from "../lib/eventTheme.svelte.js"

let { show = true, over = false }: { show?: boolean; over?: boolean } = $props()

const look = $derived(activeEventTheme())
const theme = $derived(show ? look : null)
let host = $state<HTMLElement | null>(null)

const reduce =
	typeof window !== "undefined" &&
	!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

// the accent (and the arcade, Halloween and winter palettes) follow the look
// everywhere, the gym's HUD and tab bar included
$effect(() => {
	if (over) return
	document.documentElement.dataset.event = look ?? ""
	return () => {
		document.documentElement.dataset.event = ""
	}
})

// tiny events: one timer per kind, the first one soon, then every so often
$effect(() => {
	const th = theme
	const el = host
	if (!th || !el || reduce) return
	const timers: ReturnType<typeof setTimeout>[] = []
	for (const def of THEME_EVENTS[th]) {
		const spawn = () => {
			const s = document.createElement("span")
			s.className = `ev ${def.cls}`
			if (def.svg) s.innerHTML = def.svg
			else s.textContent = def.glyph ?? ""
			s.style.setProperty("--y", `${8 + Math.random() * 65}%`)
			s.style.setProperty("--x", `${5 + Math.random() * 88}%`)
			s.addEventListener("animationend", (e) => {
				if (e.target === s) s.remove()
			})
			el.appendChild(s)
			timers.push(setTimeout(spawn, nextDelay(def.every, Math.random) * 1000))
		}
		timers.push(setTimeout(spawn, (3 + Math.random() * 7) * 1000))
	}
	return () => {
		for (const t of timers) clearTimeout(t)
		el.replaceChildren()
	}
})
</script>

{#if theme}
	<div
		class="theme-layer {theme}"
		class:over
		data-over={over}
		style:--sky={eventLook.progress}
		aria-hidden="true"
		data-testid="theme-layer"
		data-event={theme}
	>
		<div class="back"></div>
		<div class="mid"></div>
		<div class="front"></div>
		<div class="events" bind:this={host}></div>
	</div>
{/if}

<style>
.theme-layer {
	position: fixed;
	inset: 0;
	z-index: 0;
	overflow: hidden;
	pointer-events: none;
	contain: strict;
}

/* on the gym: inside its stacking context, above the canvas, under the bubbles */
.theme-layer.over {
	position: absolute;
	z-index: 1;
}

.over .back {
	opacity: 0.8;
}

/* the arcade grid and scanlines belong to the pages, not the gym floor */
.over.arcade .mid,
.over.arcade .front {
	display: none;
}

/* Halloween dusk: the gym sits in a purple evening, lit orange from the door */
.over.halloween .front {
	background:
		radial-gradient(ellipse at 50% 55%, transparent 35%, rgba(46, 12, 70, 0.5) 100%),
		linear-gradient(rgba(70, 20, 90, 0.22), rgba(255, 120, 20, 0.1));
	animation: dusk 7s ease-in-out infinite alternate;
}

@keyframes dusk {
	from {
		opacity: 0.85;
	}
	to {
		opacity: 1;
	}
}

/* winter: a cold blue cast */
.over.winter .front {
	background: linear-gradient(rgba(120, 180, 255, 0.2), rgba(200, 230, 255, 0.08));
}

/* harvest: golden hour */
.over.harvest .front {
	background: linear-gradient(rgba(255, 170, 60, 0.16), rgba(255, 120, 30, 0.1));
}

.over.summer .front {
	background: linear-gradient(rgba(255, 230, 140, 0.14), transparent 60%);
}

.over.spring .front {
	background: linear-gradient(rgba(255, 190, 215, 0.12), rgba(190, 240, 170, 0.08));
}

.back,
.mid,
.front,
.events {
	position: absolute;
	inset: 0;
}

/* ── arcade: stars, a neon horizon grid, scanlines ── */
.arcade .back {
	background:
		radial-gradient(#ffffff 1px, transparent 1.5px) 0 0 / 46px 46px,
		radial-gradient(#8fe9ff 1px, transparent 1.5px) 23px 23px / 70px 70px;
	opacity: 0.35;
	animation: drift-y 90s linear infinite;
}

.arcade .mid {
	top: auto;
	height: 38%;
	left: -60%;
	right: -60%;
	background-image:
		linear-gradient(rgba(255, 79, 216, 0.5) 1px, transparent 1px),
		linear-gradient(90deg, rgba(0, 240, 255, 0.35) 1px, transparent 1px);
	background-size: 48px 48px;
	transform: perspective(260px) rotateX(64deg);
	transform-origin: 50% 100%;
	-webkit-mask-image: linear-gradient(transparent, #000 70%);
	mask-image: linear-gradient(transparent, #000 70%);
	animation: grid-run 2.4s linear infinite;
}

.arcade .front {
	background: repeating-linear-gradient(
		0deg,
		rgba(0, 0, 0, 0.16) 0 2px,
		transparent 2px 4px
	);
}

@keyframes drift-y {
	to {
		background-position: 0 460px, 23px 700px;
	}
}

@keyframes grid-run {
	to {
		background-position: 0 48px, 0 0;
	}
}

/* ── Halloween: a moon glow and slow fog ── */
.halloween .back {
	background: radial-gradient(
		circle at 82% 8%,
		rgba(255, 179, 71, 0.28),
		rgba(255, 179, 71, 0.05) 30%,
		transparent 55%
	);
}

.halloween .mid {
	top: auto;
	height: 40%;
	background: linear-gradient(transparent, rgba(150, 100, 190, 0.18));
	animation: fog 18s ease-in-out infinite alternate;
}

@keyframes fog {
	from {
		transform: translateX(-3%);
		opacity: 0.6;
	}
	to {
		transform: translateX(3%);
		opacity: 1;
	}
}

/* ── harvest: a warm glow from below ── */
.harvest .back {
	background: radial-gradient(
		ellipse at 50% 110%,
		rgba(217, 138, 43, 0.3),
		transparent 60%
	);
}

/* ── winter: two layers of falling snow ── */
.winter .back {
	background:
		radial-gradient(#ffffff 1.4px, transparent 2px) 0 0 / 60px 60px,
		radial-gradient(#dff3ff 1px, transparent 1.6px) 30px 30px / 90px 90px;
	opacity: 0.4;
	animation: snow 40s linear infinite;
}

.winter .mid {
	background: linear-gradient(rgba(111, 195, 255, 0.12), transparent 40%);
}

@keyframes snow {
	to {
		background-position: 20px 600px, 50px 900px;
	}
}

/* ── spring: pastel blooms ── */
.spring .back {
	background:
		radial-gradient(circle at 12% 18%, rgba(255, 143, 177, 0.2), transparent 32%),
		radial-gradient(circle at 88% 70%, rgba(180, 230, 150, 0.16), transparent 36%);
}

/* ── summer: a sun in the corner, rays turning slowly ── */
.summer .back {
	background: radial-gradient(
		circle at 10% 6%,
		rgba(255, 197, 51, 0.38),
		rgba(255, 197, 51, 0.08) 26%,
		transparent 46%
	);
}

.summer .mid {
	background: conic-gradient(
		from 0deg at 10% 6%,
		rgba(255, 220, 120, 0.1) 0 8deg,
		transparent 8deg 30deg
	);
	animation: rays 120s linear infinite;
	transform-origin: 10% 6%;
}

@keyframes rays {
	to {
		transform: rotate(360deg);
	}
}

/* ── new year: gold sparkle drifting up over a deep navy glow ── */
.newyear .back {
	background:
		radial-gradient(circle at 50% 0%, rgba(255, 210, 58, 0.2), transparent 45%),
		radial-gradient(#ffd23a 1.2px, transparent 1.8px) 0 0 / 70px 70px,
		radial-gradient(#fff 1px, transparent 1.6px) 35px 35px / 110px 110px;
	opacity: 0.4;
	animation: sparkle-up 60s linear infinite;
}

@keyframes sparkle-up {
	to {
		background-position: 0 0, 20px -420px, 60px -660px;
	}
}

/* ── Valentine's: soft rose glows ── */
.valentine .back {
	background:
		radial-gradient(circle at 15% 12%, rgba(255, 92, 138, 0.26), transparent 34%),
		radial-gradient(circle at 85% 78%, rgba(255, 179, 201, 0.18), transparent 38%);
}

/* ── clover: green light and a faint shamrock pattern ── */
.clover .back {
	background:
		radial-gradient(circle at 10% 88%, rgba(62, 196, 109, 0.24), transparent 38%),
		radial-gradient(circle at 90% 10%, rgba(255, 210, 58, 0.12), transparent 34%);
}

/* ── sunrise: a sky strip that runs dawn to dusk with the challenge ── */
.sunrise .back {
	height: 38%;
	bottom: auto;
	background: linear-gradient(
		hsl(calc(20 + var(--sky) * 250) 70% 55% / 0.35),
		transparent
	);
}

/* ── greens: soft green light ── */
.greens .back {
	background:
		radial-gradient(circle at 8% 90%, rgba(91, 209, 106, 0.22), transparent 38%),
		radial-gradient(circle at 92% 12%, rgba(160, 230, 120, 0.14), transparent 34%);
}

/* ── the tiny events ── */
.events :global(.ev) {
	position: absolute;
	font-size: 26px;
	line-height: 1;
	opacity: 0.85;
	will-change: translate, transform;
}

.events :global(.ev svg) {
	width: 34px;
	height: auto;
	color: #9af0b9;
}

.events :global(.ev.cross) {
	left: -12%;
	top: var(--y);
	animation:
		ev-cross 16s linear forwards,
		ev-bob 1.3s ease-in-out infinite alternate;
}

.events :global(.ev.cross.slow) {
	animation-duration: 44s, 4s;
	opacity: 0.55;
	font-size: 40px;
}

.events :global(.ev.rise) {
	left: var(--x);
	bottom: -40px;
	animation: ev-rise 9s ease-out forwards;
}

.events :global(.ev.fall) {
	left: var(--x);
	top: -40px;
	animation:
		ev-fall 15s linear forwards,
		ev-bob 2.2s ease-in-out infinite alternate;
}

.events :global(.ev.drop) {
	left: var(--x);
	top: -6px;
	animation: ev-drop 12s ease-in-out forwards;
}

.events :global(.ev.drop::before) {
	content: "";
	position: absolute;
	left: 50%;
	bottom: 100%;
	width: 1px;
	height: 60vh;
	background: rgba(255, 255, 255, 0.45);
}

.events :global(.ev.streak) {
	left: var(--x);
	top: calc(var(--y) / 3);
	animation: ev-streak 1.6s ease-in forwards;
}

@keyframes ev-cross {
	to {
		translate: 135vw 0;
	}
}

@keyframes ev-bob {
	to {
		transform: translateY(-8px) rotate(4deg);
	}
}

@keyframes ev-rise {
	0% {
		translate: 0 0;
		opacity: 0;
	}
	15% {
		opacity: 0.9;
	}
	100% {
		translate: 0 -55vh;
		opacity: 0;
	}
}

@keyframes ev-fall {
	to {
		translate: 40px 112vh;
	}
}

@keyframes ev-drop {
	0% {
		translate: 0 -2vh;
	}
	30%,
	65% {
		translate: 0 26vh;
	}
	100% {
		translate: 0 -2vh;
	}
}

@keyframes ev-streak {
	0% {
		translate: 0 0;
		opacity: 0;
	}
	20% {
		opacity: 1;
	}
	100% {
		translate: 150px 90px;
		opacity: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.theme-layer :global(*) {
		animation: none !important;
	}
}
</style>
