<script lang="ts">
import * as d3 from "d3"

type Entry = { weightKg: number; recordedAt: string }

let { entries }: { entries: Entry[] } = $props()

let svgEl = $state<SVGSVGElement | undefined>(undefined)

const W = 640
const H = 320
const margin = { top: 20, right: 24, bottom: 40, left: 48 }
const iW = W - margin.left - margin.right
const iH = H - margin.top - margin.bottom

// Milestone thresholds (kg lost from first entry)
const MILESTONES = [2, 5, 10, 15, 20, 25]

type Derived = {
	path: string
	dots: { x: number; y: number; kg: number; date: string }[]
	milestones: { x: number; y: number; label: string }[]
	xTicks: { x: number; label: string }[]
	yTicks: { y: number; label: string }[]
}

let derived = $derived.by<Derived | null>(() => {
	if (entries.length < 2) return null

	const sorted = [...entries].sort(
		(a, b) =>
			new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
	)

	const dates = sorted.map((e) => new Date(e.recordedAt))
	const weights = sorted.map((e) => e.weightKg)

	const xScale = d3
		.scaleTime()
		.domain([dates[0], dates[dates.length - 1]])
		.range([0, iW])
		.nice()

	const [wMin, wMax] = d3.extent(weights) as [number, number]
	const yScale = d3
		.scaleLinear()
		.domain([wMin - 1, wMax + 1])
		.range([iH, 0])
		.nice()

	const lineGen = d3
		.line<(typeof sorted)[0]>()
		.x((d) => xScale(new Date(d.recordedAt)))
		.y((d) => yScale(d.weightKg))
		.curve(d3.curveMonotoneX)

	const baseKg = weights[0]
	const milestones = MILESTONES.flatMap((delta) => {
		const target = baseKg - delta
		// Find the first entry that reached or passed this milestone
		const hit = sorted.find((e) => e.weightKg <= target)
		if (!hit) return []
		return [
			{
				x: xScale(new Date(hit.recordedAt)),
				y: yScale(hit.weightKg),
				label: `−${delta} kg`,
			},
		]
	})

	return {
		path: lineGen(sorted) ?? "",
		dots: sorted.map((e) => ({
			x: xScale(new Date(e.recordedAt)),
			y: yScale(e.weightKg),
			kg: e.weightKg,
			date: new Date(e.recordedAt).toLocaleDateString(),
		})),
		milestones,
		xTicks: xScale.ticks(5).map((t) => ({
			x: xScale(t),
			label: d3.timeFormat("%b %d")(t),
		})),
		yTicks: yScale.ticks(5).map((t) => ({
			y: yScale(t),
			label: `${t} kg`,
		})),
	}
})
</script>

{#if entries.length < 2}
	<div class="empty">
		{#if entries.length === 0}
			<p>No entries yet. Log your first weight above to get started.</p>
		{:else}
			<p>Log one more entry to see your chart.</p>
		{/if}
	</div>
{:else if derived}
	<svg
		bind:this={svgEl}
		viewBox="0 0 {W} {H}"
		class="chart"
		aria-label="Weight history chart"
	>
		<g transform="translate({margin.left},{margin.top})">
			<!-- Grid lines -->
			{#each derived.yTicks as tick}
				<line
					x1="0"
					x2={iW}
					y1={tick.y}
					y2={tick.y}
					stroke="var(--color-border)"
					stroke-width="1"
				/>
			{/each}

			<!-- X axis -->
			<g transform="translate(0,{iH})">
				<line x1="0" x2={iW} stroke="var(--color-border)" />
				{#each derived.xTicks as tick}
					<text
						x={tick.x}
						y="20"
						text-anchor="middle"
						fill="var(--color-text-muted)"
						font-size="11">{tick.label}</text
					>
				{/each}
			</g>

			<!-- Y axis -->
			<g>
				<line y1="0" y2={iH} stroke="var(--color-border)" />
				{#each derived.yTicks as tick}
					<text
						x="-8"
						y={tick.y}
						text-anchor="end"
						dominant-baseline="middle"
						fill="var(--color-text-muted)"
						font-size="11">{tick.label}</text
					>
				{/each}
			</g>

			<!-- Line -->
			<path
				d={derived.path}
				fill="none"
				stroke="var(--color-accent)"
				stroke-width="2.5"
				stroke-linecap="round"
			/>

			<!-- Milestone markers -->
			{#each derived.milestones as m}
				<g transform="translate({m.x},{m.y})">
					<circle r="6" fill="var(--color-success)" opacity="0.9" />
					<text
						x="10"
						y="-6"
						fill="var(--color-success)"
						font-size="11"
						font-weight="600">{m.label}</text
					>
				</g>
			{/each}

			<!-- Data points -->
			{#each derived.dots as dot}
				<g transform="translate({dot.x},{dot.y})">
					<title>{dot.kg} kg — {dot.date}</title>
					<circle
						r="4"
						fill="var(--color-accent)"
						stroke="var(--color-surface)"
						stroke-width="2"
					/>
				</g>
			{/each}
		</g>
	</svg>
{/if}

<style>
.chart {
	width: 100%;
	height: auto;
	display: block;
}

.empty {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 180px;
	background: var(--color-surface);
	border: 1px dashed var(--color-border);
	border-radius: 0.5rem;
}

.empty p {
	color: var(--color-text-muted);
	font-size: 0.9rem;
	margin: 0;
}
</style>
