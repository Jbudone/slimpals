<script lang="ts">
/** The challenge's themed banner: a pixel-art strip that moves a little
 * (#124). Pure CSS; `progress` (0-1) shifts the sunrise theme from dawn to dusk. */
let {
	theme,
	title,
	progress = 0,
}: { theme: string | null; title: string; progress?: number } = $props()

const kind = $derived(
	theme === "arcade" || theme === "sunrise" || theme === "greens"
		? theme
		: "plain",
)
const sky = $derived(Math.max(0, Math.min(1, progress)))
</script>

<div
	class="banner {kind}"
	data-testid="challenge-banner"
	data-theme={kind}
	style:--sky={sky}
	role="img"
	aria-label="{title} banner"
>
	<div class="layer a"></div>
	<div class="layer b"></div>
	<span class="label">{title}</span>
</div>

<style>
.banner {
	position: relative;
	overflow: hidden;
	height: 64px;
	border-radius: 10px;
	image-rendering: pixelated;
}
.layer { position: absolute; inset: 0; }
.label {
	position: absolute;
	left: 12px;
	bottom: 8px;
	font-weight: 800;
	font-size: 0.95rem;
	letter-spacing: 0.04em;
	color: #fff;
	text-shadow: 0 2px 0 rgba(0, 0, 0, 0.45);
}

/* arcade: a purple strip, a scrolling row of pixel stars and a blinking coin slot */
.arcade { background: linear-gradient(#2a1650, #4a2f7a); }
.arcade .a {
	background-image: radial-gradient(#ffe45a 1.5px, transparent 2px);
	background-size: 22px 22px;
	opacity: 0.8;
	animation: scroll 6s linear infinite;
}
.arcade .b {
	left: auto;
	right: 14px;
	top: 14px;
	bottom: auto;
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: #ffd23a;
	box-shadow: 0 0 0 3px #b8860b;
	animation: blink 1.2s steps(2) infinite;
}

/* sunrise: the sky runs dawn to dusk as the challenge fills */
.sunrise {
	background: linear-gradient(
		hsl(calc(20 + var(--sky) * 250) 70% 60%),
		hsl(calc(45 - var(--sky) * 20) 90% calc(75 - var(--sky) * 35%))
	);
}
.sunrise .b {
	left: auto;
	top: auto;
	right: calc(10% + var(--sky) * 60%);
	bottom: calc(-10px + var(--sky) * 8px);
	width: 34px;
	height: 34px;
	border-radius: 50%;
	background: #fff3b0;
	box-shadow: 0 0 18px #ffd35a;
	animation: bob 4s ease-in-out infinite;
}

/* greens: leaves drifting up over a green wash */
.greens { background: linear-gradient(#1f6b3a, #3f9a44); }
.greens .a {
	background-image: radial-gradient(ellipse 5px 3px at 50% 50%, #9be07a 90%, transparent);
	background-size: 30px 26px;
	opacity: 0.7;
	animation: rise 5s linear infinite;
}

.plain { background: linear-gradient(135deg, #34c973, #2a8f8f); }
.plain .a {
	background: linear-gradient(100deg, transparent 40%, rgba(255, 255, 255, 0.25) 50%, transparent 60%);
	background-size: 200% 100%;
	animation: shimmer 4s ease-in-out infinite;
}

@keyframes scroll { to { background-position: 44px 0; } }
@keyframes blink { 50% { opacity: 0.35; } }
@keyframes bob { 50% { transform: translateY(-4px); } }
@keyframes rise { to { background-position: 0 -26px; } }
@keyframes shimmer { from { background-position: 150% 0; } to { background-position: -50% 0; } }

@media (prefers-reduced-motion: reduce) {
	.layer { animation: none !important; }
}
</style>
