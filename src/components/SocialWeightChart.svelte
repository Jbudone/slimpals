<script lang="ts">
import * as d3 from "d3"

type Entry = { weightKg: number; recordedAt: string }

type UserSeries = {
	userId: string
	userName: string
	color: string
	entries: Entry[]
}

type GoalPoint = {
	weightKg: number
	goalDate: string
}

let {
	series,
	currentUserLatest,
	goal,
}: {
	series: UserSeries[]
	currentUserLatest: number | null
	goal: GoalPoint | null
} = $props()

const W = 640
const H = 320
const margin = { top: 20, right: 24, bottom: 40, left: 56 }
const iW = W - margin.left - margin.right
const iH = H - margin.top - margin.bottom

type Tooltip = {
	x: number
	items: {
		name: string
		color: string
		weightKg: number
		delta: number | null
	}[]
} | null

let tooltip = $state<Tooltip>(null)

type Derived = {
	userLines: {
		color: string
		userName: string
		path: string
		dots: { x: number; y: number; kg: number }[]
	}[]
	goalPath: string | null
	xScale: d3.ScaleTime<number, number>
	yScale: d3.ScaleLinear<number, number>
	xTicks: { x: number; label: string }[]
	yTicks: { y: number; label: string }[]
	allEntries: (Entry & { userName: string; color: string })[]
}

let derived = $derived.by<Derived | null>(() => {
	const allEntries = series.flatMap((u) =>
		u.entries.map((e) => ({ ...e, userName: u.userName, color: u.color })),
	)
	if (allEntries.length === 0) return null

	const dates = allEntries.map((e) => new Date(e.recordedAt))
	const weights = allEntries.map((e) => e.weightKg)

	// Extend date domain to include goal date if set
	let dateMin = d3.min(dates) as Date
	let dateMax = d3.max(dates) as Date
	if (goal) {
		const gd = new Date(goal.goalDate)
		if (gd > dateMax) dateMax = gd
	}

	// Extend weight domain to include goal weight if set
	let wMin = d3.min(weights) as number
	let wMax = d3.max(weights) as number
	if (goal) {
		wMin = Math.min(wMin, goal.weightKg)
		wMax = Math.max(wMax, goal.weightKg)
	}

	const xScale = d3.scaleTime().domain([dateMin, dateMax]).range([0, iW]).nice()

	const yScale = d3
		.scaleLinear()
		.domain([wMin - 1, wMax + 1])
		.range([iH, 0])
		.nice()

	const lineGen = d3
		.line<Entry>()
		.x((d) => xScale(new Date(d.recordedAt)))
		.y((d) => yScale(d.weightKg))
		.curve(d3.curveMonotoneX)

	const userLines = series
		.filter((u) => u.entries.length > 0)
		.map((u) => ({
			color: u.color,
			userName: u.userName,
			path:
				lineGen(
					[...u.entries].sort(
						(a, b) =>
							new Date(a.recordedAt).getTime() -
							new Date(b.recordedAt).getTime(),
					),
				) ?? "",
			dots: u.entries.map((e) => ({
				x: xScale(new Date(e.recordedAt)),
				y: yScale(e.weightKg),
				kg: e.weightKg,
			})),
		}))

	// Goal line: from latest personal weight to goal point
	let goalPath: string | null = null
	if (goal && currentUserLatest !== null) {
		const latestDate = d3.max(
			series.flatMap((u) => u.entries.map((e) => new Date(e.recordedAt))),
		) as Date
		const goalLineGen = d3
			.line<[Date, number]>()
			.x(([d]) => xScale(d))
			.y(([, w]) => yScale(w))
		goalPath =
			goalLineGen([
				[latestDate, currentUserLatest],
				[new Date(goal.goalDate), goal.weightKg],
			]) ?? null
	}

	return {
		userLines,
		goalPath,
		xScale,
		yScale,
		xTicks: xScale.ticks(5).map((t) => ({
			x: xScale(t),
			label: d3.timeFormat("%b %d")(t),
		})),
		yTicks: yScale.ticks(5).map((t) => ({
			y: yScale(t),
			label: `${t} kg`,
		})),
		allEntries,
	}
})

function onMouseMove(e: MouseEvent) {
	if (!derived) return
	const svg = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
	const mouseX = e.clientX - svg.left - (margin.left / svg.width) * svg.width
	const scaledX = (mouseX / svg.width) * W - margin.left
	if (scaledX < 0 || scaledX > iW) {
		tooltip = null
		return
	}

	const hoveredDate = derived.xScale.invert(scaledX)

	const items = series
		.filter((u) => u.entries.length > 0)
		.map((u) => {
			const sorted = [...u.entries].sort(
				(a, b) =>
					new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
			)
			// Find nearest entry at or before hovered date
			let nearest = sorted[0]
			for (const entry of sorted) {
				if (new Date(entry.recordedAt) <= hoveredDate) nearest = entry
			}
			const idx = sorted.indexOf(nearest)
			const prev = idx > 0 ? sorted[idx - 1] : null
			return {
				name: u.userName,
				color: u.color,
				weightKg: nearest.weightKg,
				delta: prev ? nearest.weightKg - prev.weightKg : null,
			}
		})

	tooltip = { x: derived.xScale(hoveredDate) + margin.left, items }
}

function onMouseLeave() {
	tooltip = null
}
</script>

{#if !derived || series.every((u) => u.entries.length === 0)}
	<div class="empty">
		<p>No weight data to compare yet. Log entries to see the group chart.</p>
	</div>
{:else}
	<!-- Legend -->
	<div class="legend">
		{#each series.filter((u) => u.entries.length > 0) as u}
			<span class="legend-item">
				<span class="legend-dot" style="background:{u.color}"></span>
				{u.userName}
			</span>
		{/each}
		{#if derived?.goalPath}
			<span class="legend-item">
				<span class="legend-dot goal-dot"></span>
				Your goal
			</span>
		{/if}
	</div>

	<div class="chart-wrap">
		<svg
			viewBox="0 0 {W} {H}"
			class="chart"
			aria-label="Group weight comparison chart"
			onmousemove={onMouseMove}
			onmouseleave={onMouseLeave}
			role="img"
		>
			<g transform="translate({margin.left},{margin.top})">
				<!-- Grid lines -->
				{#each derived?.yTicks ?? [] as tick}
					<line x1="0" x2={iW} y1={tick.y} y2={tick.y} stroke="var(--color-border)" stroke-width="1" />
				{/each}

				<!-- X axis -->
				<g transform="translate(0,{iH})">
					<line x1="0" x2={iW} stroke="var(--color-border)" />
					{#each derived?.xTicks ?? [] as tick}
						<text x={tick.x} y="20" text-anchor="middle" fill="var(--color-text-muted)" font-size="11">{tick.label}</text>
					{/each}
				</g>

				<!-- Y axis -->
				<g>
					<line y1="0" y2={iH} stroke="var(--color-border)" />
					{#each derived?.yTicks ?? [] as tick}
						<text x="-8" y={tick.y} text-anchor="end" dominant-baseline="middle" fill="var(--color-text-muted)" font-size="11">{tick.label}</text>
					{/each}
				</g>

				<!-- User lines -->
				{#each derived?.userLines ?? [] as line}
					<path d={line.path} fill="none" stroke={line.color} stroke-width="2.5" stroke-linecap="round" />
					{#each line.dots as dot}
						<circle cx={dot.x} cy={dot.y} r="4" fill={line.color} stroke="var(--color-surface)" stroke-width="2" />
					{/each}
				{/each}

				<!-- Goal line (dashed) -->
				{#if derived?.goalPath}
					<path
						d={derived.goalPath}
						fill="none"
						stroke="var(--color-text-muted)"
						stroke-width="1.5"
						stroke-dasharray="6 4"
						opacity="0.7"
					/>
				{/if}

				<!-- Crosshair -->
				{#if tooltip}
					<line
						x1={tooltip.x - margin.left}
						x2={tooltip.x - margin.left}
						y1="0"
						y2={iH}
						stroke="var(--color-text-muted)"
						stroke-width="1"
						stroke-dasharray="4 2"
						opacity="0.6"
					/>
				{/if}
			</g>
		</svg>

		<!-- Tooltip -->
		{#if tooltip}
			<div
				class="tooltip"
				style="left:{Math.min(tooltip.x + 12, W - 140)}px"
			>
				{#each tooltip.items as item}
					<div class="tooltip-row">
						<span class="tooltip-dot" style="background:{item.color}"></span>
						<span class="tooltip-name">{item.name}</span>
						<span class="tooltip-weight">{item.weightKg} kg</span>
						{#if item.delta !== null}
							<span class="tooltip-delta" class:pos={item.delta > 0} class:neg={item.delta < 0}>
								{item.delta > 0 ? "+" : ""}{item.delta.toFixed(1)}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
.chart-wrap {
	position: relative;
}

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

/* Legend */
.legend {
	display: flex;
	flex-wrap: wrap;
	gap: 0.75rem;
	margin-bottom: 0.75rem;
}

.legend-item {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.8125rem;
	color: var(--color-text-muted);
}

.legend-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	flex-shrink: 0;
}

.goal-dot {
	background: var(--color-text-muted);
	border: 2px dashed var(--color-text-muted);
	border-radius: 0;
	width: 16px;
	height: 2px;
}

/* Tooltip */
.tooltip {
	position: absolute;
	top: 16px;
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	border-radius: 0.5rem;
	padding: 0.5rem 0.75rem;
	pointer-events: none;
	min-width: 130px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.tooltip-row {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.8125rem;
	padding: 0.15rem 0;
}

.tooltip-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	flex-shrink: 0;
}

.tooltip-name {
	flex: 1;
	color: var(--color-text);
	font-weight: 500;
}

.tooltip-weight {
	color: var(--color-text);
	font-variant-numeric: tabular-nums;
}

.tooltip-delta {
	font-size: 0.75rem;
	font-variant-numeric: tabular-nums;
	color: var(--color-text-muted);
}

.tooltip-delta.neg {
	color: var(--color-success, #22c55e);
}

.tooltip-delta.pos {
	color: var(--color-danger, #ef4444);
}
</style>
