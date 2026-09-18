<script lang="ts">
import * as d3 from "d3"
import type { ViewMode } from "../../shared/types.js"

type Entry = { weightKg: number; recordedAt: string }

let {
	entries,
	viewMode = "simple",
	heightCm = null,
	goal = null,
}: {
	entries: Entry[]
	viewMode?: ViewMode
	heightCm?: number | null
	goal?: { weightKg: number } | null
} = $props()

let svgEl = $state<SVGSVGElement | undefined>(undefined)

const W = 640
const H = 320
const margin = { top: 20, right: 24, bottom: 40, left: 48 }
const iW = W - margin.left - margin.right
const iH = H - margin.top - margin.bottom

const MILESTONES = [2, 5, 10, 15, 20, 25]

function computeMovingAverage(
	sorted: Entry[],
	window: number,
): { date: Date; kg: number }[] {
	const result: { date: Date; kg: number }[] = []
	for (let i = 0; i < sorted.length; i++) {
		const start = Math.max(0, i - window + 1)
		const slice = sorted.slice(start, i + 1)
		const avg = d3.mean(slice, (d) => d.weightKg) ?? sorted[i].weightKg
		result.push({ date: new Date(sorted[i].recordedAt), kg: avg })
	}
	return result
}

function computeRegression(sorted: Entry[]): {
	slope: number
	intercept: number
	points: { date: Date; kg: number }[]
	confidence: { date: Date; upper: number; lower: number }[]
} {
	const n = sorted.length
	const xs = sorted.map((e) => new Date(e.recordedAt).getTime())
	const ys = sorted.map((e) => e.weightKg)
	const xMean = d3.mean(xs) ?? 0
	const yMean = d3.mean(ys) ?? 0

	let ssXX = 0
	let ssXY = 0
	for (let i = 0; i < n; i++) {
		ssXX += (xs[i] - xMean) ** 2
		ssXY += (xs[i] - xMean) * (ys[i] - yMean)
	}

	const slope = ssXX === 0 ? 0 : ssXY / ssXX
	const intercept = yMean - slope * xMean

	const residuals = ys.map((y, i) => y - (slope * xs[i] + intercept))
	const se = Math.sqrt(d3.sum(residuals, (r) => r ** 2) / Math.max(1, n - 2))

	const z80 = 1.282

	const points = sorted.map((e) => {
		const t = new Date(e.recordedAt).getTime()
		return { date: new Date(e.recordedAt), kg: slope * t + intercept }
	})

	const confidence = sorted.map((e) => {
		const t = new Date(e.recordedAt).getTime()
		const predicted = slope * t + intercept
		const leverage = 1 / n + (t - xMean) ** 2 / ssXX
		const interval = z80 * se * Math.sqrt(1 + leverage)
		return {
			date: new Date(e.recordedAt),
			upper: predicted + interval,
			lower: predicted - interval,
		}
	})

	return { slope, intercept, points, confidence }
}

function computeBmi(weightKg: number, cm: number): number {
	const m = cm / 100
	return weightKg / (m * m)
}

function rateOfLossText(sorted: Entry[]): string | null {
	if (sorted.length < 2) return null
	const first = sorted[0]
	const last = sorted[sorted.length - 1]
	const daysElapsed =
		(new Date(last.recordedAt).getTime() -
			new Date(first.recordedAt).getTime()) /
		86_400_000
	if (daysElapsed < 1) return null
	const weeksElapsed = daysElapsed / 7
	const delta = last.weightKg - first.weightKg
	const perWeek = delta / weeksElapsed
	const sign = perWeek > 0 ? "+" : ""
	return `${sign}${perWeek.toFixed(1)} kg/week avg`
}

type Dot = { x: number; y: number; kg: number; date: string }
type Milestone = { x: number; y: number; label: string }
type Tick = { x?: number; y?: number; label: string }

type Derived = {
	path: string
	dots: Dot[]
	milestones: Milestone[]
	xTicks: (Tick & { x: number })[]
	yTicks: (Tick & { y: number })[]
	xScale: d3.ScaleTime<number, number>
	yScale: d3.ScaleLinear<number, number>
	maPath: string | null
	regPath: string | null
	ciArea: string | null
	bmiLines: { y18: number; y25: number; y30: number; visible: boolean } | null
	rateLoss: string | null
	goalY: number | null
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
	const domainMin = goal ? Math.min(wMin, goal.weightKg) : wMin
	const domainMax = goal ? Math.max(wMax, goal.weightKg) : wMax
	const yScale = d3
		.scaleLinear()
		.domain([domainMin - 1, domainMax + 1])
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

	let maPath: string | null = null
	let regPath: string | null = null
	let ciArea: string | null = null
	let bmiLines: Derived["bmiLines"] = null
	let rateLoss: string | null = null

	if (viewMode === "technical") {
		const ma = computeMovingAverage(sorted, 7)
		const maLineGen = d3
			.line<(typeof ma)[0]>()
			.x((d) => xScale(d.date))
			.y((d) => yScale(d.kg))
			.curve(d3.curveMonotoneX)
		maPath = maLineGen(ma) ?? null

		const reg = computeRegression(sorted)
		const regLineGen = d3
			.line<(typeof reg.points)[0]>()
			.x((d) => xScale(d.date))
			.y((d) => yScale(d.kg))
		regPath = regLineGen(reg.points) ?? null

		const areaGen = d3
			.area<(typeof reg.confidence)[0]>()
			.x((d) => xScale(d.date))
			.y0((d) => yScale(d.lower))
			.y1((d) => yScale(d.upper))
		ciArea = areaGen(reg.confidence) ?? null

		if (heightCm && heightCm > 0) {
			const bmi18w = 18.5 * (heightCm / 100) ** 2
			const bmi25w = 25 * (heightCm / 100) ** 2
			const bmi30w = 30 * (heightCm / 100) ** 2
			const domain = yScale.domain()
			const visible = bmi18w < domain[1] + 5 && bmi30w > domain[0] - 5
			bmiLines = {
				y18: yScale(bmi18w),
				y25: yScale(bmi25w),
				y30: yScale(bmi30w),
				visible,
			}
		}

		rateLoss = rateOfLossText(sorted)
	}

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
		xScale,
		yScale,
		maPath,
		regPath,
		ciArea,
		bmiLines,
		rateLoss,
		goalY: goal ? yScale(goal.weightKg) : null,
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

			<!-- Goal line -->
			{#if derived.goalY !== null}
				<line
					x1="0" x2={iW}
					y1={derived.goalY} y2={derived.goalY}
					stroke="var(--color-warning)"
					stroke-width="1.5"
					stroke-dasharray="5 4"
				/>
			{/if}

			<!-- BMI bands (technical mode) -->
			{#if viewMode === "technical" && derived.bmiLines?.visible}
				<rect
					x="0"
					y={Math.min(derived.bmiLines.y25, derived.bmiLines.y18)}
					width={iW}
					height={Math.abs(derived.bmiLines.y18 - derived.bmiLines.y25)}
					fill="var(--color-success, #22c55e)"
					opacity="0.08"
				/>
				<line
					x1="0" x2={iW}
					y1={derived.bmiLines.y25} y2={derived.bmiLines.y25}
					stroke="var(--color-warning, #f59e0b)"
					stroke-width="1"
					stroke-dasharray="4 3"
				/>
				<text
					x={iW - 4} y={derived.bmiLines.y25 - 4}
					text-anchor="end"
					fill="var(--color-warning, #f59e0b)"
					font-size="9"
					opacity="0.8"
				>BMI 25</text>
				<line
					x1="0" x2={iW}
					y1={derived.bmiLines.y30} y2={derived.bmiLines.y30}
					stroke="var(--color-danger, #ef4444)"
					stroke-width="1"
					stroke-dasharray="4 3"
				/>
				<text
					x={iW - 4} y={derived.bmiLines.y30 - 4}
					text-anchor="end"
					fill="var(--color-danger, #ef4444)"
					font-size="9"
					opacity="0.8"
				>BMI 30</text>
			{/if}

			<!-- Confidence interval (technical mode) -->
			{#if viewMode === "technical" && derived.ciArea}
				<path
					d={derived.ciArea}
					fill="var(--color-accent)"
					opacity="0.1"
				/>
			{/if}

			<!-- Regression line (technical mode) -->
			{#if viewMode === "technical" && derived.regPath}
				<path
					d={derived.regPath}
					fill="none"
					stroke="var(--color-accent)"
					stroke-width="1.5"
					stroke-dasharray="6 4"
					opacity="0.6"
				/>
			{/if}

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

			<!-- Main trend line -->
			<path
				d={derived.path}
				fill="none"
				stroke="var(--color-accent)"
				stroke-width="2.5"
				stroke-linecap="round"
			/>

			<!-- Moving average (technical mode) -->
			{#if viewMode === "technical" && derived.maPath}
				<path
					d={derived.maPath}
					fill="none"
					stroke="var(--color-success, #22c55e)"
					stroke-width="2"
					stroke-linecap="round"
					opacity="0.8"
				/>
			{/if}

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

			<!-- Rate of loss annotation (technical mode) -->
			{#if viewMode === "technical" && derived.rateLoss}
				<text
					x={iW}
					y="12"
					text-anchor="end"
					fill="var(--color-text-muted)"
					font-size="11"
					font-weight="600"
				>{derived.rateLoss}</text>
			{/if}
		</g>
	</svg>

	<!-- Technical mode legend -->
	{#if viewMode === "technical"}
		<div class="legend">
			<span class="legend-item"><span class="swatch accent"></span> Trend</span>
			<span class="legend-item"><span class="swatch success"></span> 7-day avg</span>
			<span class="legend-item"><span class="swatch accent-dash"></span> Regression</span>
			{#if derived.bmiLines?.visible}
				<span class="legend-item"><span class="swatch bmi"></span> BMI zones</span>
			{/if}
		</div>
	{/if}
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

.legend {
	display: flex;
	gap: 1rem;
	flex-wrap: wrap;
	padding: 0.5rem 0 0;
	font-size: 0.75rem;
	color: var(--color-text-muted);
}

.legend-item {
	display: flex;
	align-items: center;
	gap: 0.35rem;
}

.swatch {
	display: inline-block;
	width: 14px;
	height: 3px;
	border-radius: 2px;
}

.swatch.accent {
	background: var(--color-accent);
}

.swatch.success {
	background: var(--color-success, #22c55e);
}

.swatch.accent-dash {
	background: var(--color-accent);
	opacity: 0.6;
	border-top: 1px dashed var(--color-accent);
	height: 0;
}

.swatch.bmi {
	background: var(--color-success, #22c55e);
	opacity: 0.3;
	height: 8px;
}
</style>
