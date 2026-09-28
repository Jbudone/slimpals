<script lang="ts">
// The Today drawer on the Home gym: peeks above the tab bar with "3 of 6
// done" and the next task; tap or drag the handle to open the full list.
import { checkinState } from "../../lib/checkin.svelte.js"
import { nextTask, today, todayCounts } from "../../lib/today.svelte.js"
import { GREENS_SVG, SWEAT_SVG } from "./icons"
import TodayList from "./TodayList.svelte"

let {
	open = $bindable(false),
	hidden = false,
}: { open?: boolean; hidden?: boolean } = $props()

const counts = $derived.by(() => {
	void checkinState.data
	void today.daily
	return todayCounts()
})
const next = $derived.by(() => {
	void checkinState.data
	void today.daily
	void today.weekly
	return nextTask()
})

let el: HTMLElement
let drag = $state<{ y0: number; dy: number; t0: number } | null>(null)

function down(e: PointerEvent) {
	drag = { y0: e.clientY, dy: 0, t0: performance.now() }
	;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}

function move(e: PointerEvent) {
	if (!drag) return
	drag = { ...drag, dy: e.clientY - drag.y0 }
}

function up() {
	const d = drag
	drag = null
	if (!d) return
	if (Math.abs(d.dy) < 8) {
		open = !open
		return
	}
	// a flick or a long enough drag decides
	const v = d.dy / Math.max(1, performance.now() - d.t0)
	if (open) open = !(d.dy > 60 || v > 0.5)
	else open = d.dy < -60 || v < -0.5
}

function keydown(e: KeyboardEvent) {
	if (e.key === "Enter" || e.key === " ") {
		e.preventDefault()
		open = !open
	}
}

// a sheet took over: drop any drag in flight so the drawer really tucks away
$effect(() => {
	if (hidden) drag = null
})

const offset = $derived.by(() => {
	if (!drag || hidden) return null
	const h = el?.offsetHeight ?? 500
	const peek = 78
	const base = open ? 0 : h - peek
	return Math.max(0, Math.min(h - peek, base + drag.dy))
})
</script>

<section
	class="drawer"
	class:open
	class:gone={hidden}
	class:dragging={drag != null}
	bind:this={el}
	style={offset != null ? `transform:translateY(${offset}px)` : ""}
	aria-label="Today"
	data-testid="today-drawer"
	data-open={open}
>
	<div
		class="dhead"
		role="button"
		tabindex="0"
		aria-expanded={open}
		aria-controls="dbody"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={() => (drag = null)}
		onkeydown={keydown}
		data-testid="drawer-head"
	>
		<div class="grab"></div>
		<div class="drow">
			<h2>Today</h2>
			<span class="dcount" data-testid="drawer-count"><b>{counts.done}</b> of {counts.all} done</span>
			<span class="segs" aria-hidden="true">
				{#each Array.from({ length: Math.min(counts.all, 10) }) as _, i (i)}
					<i class:on={i < counts.done}></i>
				{/each}
			</span>
		</div>
		<div class="dnext">
			{#if next?.kind === "checkin"}
				Next: <b>Daily check-in</b>
			{:else if next?.kind === "mission"}
				Next: <b>{next.mission.title}</b>
				{#if next.mission.sweat}<span class="cur">· {@html SWEAT_SVG}+{next.mission.sweat}</span>
				{:else if next.mission.greens}<span class="cur">· {@html GREENS_SVG}+{next.mission.greens}</span>{/if}
			{:else}
				<b>All done today. Your gym is buzzing.</b>
			{/if}
			<svg class="chev" viewBox="0 0 20 20" aria-hidden="true"
				><path d="M5 12.5 10 7.5l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg
			>
		</div>
	</div>
	<div class="dbody" id="dbody" inert={!open}>
		<TodayList />
	</div>
</section>

<style>
.drawer {
	/* the paper palette of the Layout Lab, whatever the app theme */
	--color-surface: #fff;
	--color-surface-2: #fdf8f0;
	--color-border: #eaddc4;
	--color-text: #241d15;
	--color-text-muted: #8d7c66;
	--color-accent: #1f9a55;
	position: fixed;
	left: 0;
	right: 0;
	bottom: var(--tab-h);
	z-index: 22;
	height: min(64%, calc(100% - var(--tab-h) - 90px));
	max-width: 560px;
	margin: 0 auto;
	transform: translateY(calc(100% - 78px));
	background: #fdf8f0;
	color: #241d15;
	border-radius: 24px 24px 0 0;
	box-shadow: 0 -6px 24px rgba(58, 38, 34, 0.22);
	display: flex;
	flex-direction: column;
	transition: transform 0.45s cubic-bezier(0.2, 1.25, 0.35, 1);
}

.drawer.open {
	transform: translateY(0);
}

.drawer.gone {
	transform: translateY(105%);
	pointer-events: none;
}

.drawer.dragging {
	transition: none;
}

.dhead {
	flex: none;
	padding: 8px 16px 10px;
	cursor: grab;
	touch-action: none;
	-webkit-user-select: none;
	user-select: none;
	outline-offset: -3px;
}

.grab {
	width: 40px;
	height: 5px;
	border-radius: 9px;
	background: #dccbb3;
	margin: 0 auto 8px;
}

.drow {
	display: flex;
	align-items: center;
	gap: 10px;
}

.drow h2 {
	margin: 0;
	font: 700 21px/1 var(--font-display, Georgia, serif);
}

.dcount {
	font: 700 13px/1 system-ui, sans-serif;
	color: #8d7c66;
	white-space: nowrap;
}

.dcount b {
	color: #1f9a55;
	font: 800 15px ui-rounded, system-ui, sans-serif;
}

.segs {
	display: flex;
	gap: 3px;
	margin-left: auto;
}

.segs i {
	width: 15px;
	height: 8px;
	border-radius: 4px;
	background: #eadfcd;
	transition: background 0.3s;
}

.segs i.on {
	background: #34c973;
}

.dnext {
	margin-top: 7px;
	display: flex;
	align-items: center;
	gap: 6px;
	font: 600 13px/1.2 system-ui, sans-serif;
	color: #8d7c66;
	white-space: nowrap;
	overflow: hidden;
}

.dnext b {
	color: #241d15;
	overflow: hidden;
	text-overflow: ellipsis;
}

.cur {
	display: inline-flex;
	align-items: center;
	gap: 2px;
}

.cur :global(svg) {
	width: 14px;
	height: 14px;
}

.chev {
	margin-left: auto;
	flex: none;
	width: 18px;
	height: 18px;
	transition: transform 0.3s;
}

.drawer.open .chev {
	transform: rotate(180deg);
}

.dbody {
	flex: 1;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding: 0 12px 24px;
	-webkit-overflow-scrolling: touch;
}
</style>
