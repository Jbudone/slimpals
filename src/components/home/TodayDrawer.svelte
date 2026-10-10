<script lang="ts">
// The Today drawer on the Home gym: peeks above the tab bar with "3 of 6
// done" and the next task; tap or drag the handle to open the full list.
import { checkinState } from "../../lib/checkin.svelte.js"
import { type DrawerTab, drawerUi } from "../../lib/drawer.svelte.js"
import { rewardTrack } from "../../lib/rewardTrack.svelte.js"
import { nextTask, today, todayCounts } from "../../lib/today.svelte.js"
import CompeteCard from "../CompeteCard.svelte"
import DrawerCoach from "./DrawerCoach.svelte"
import DrawerRewards from "./DrawerRewards.svelte"
import { GREENS_SVG, SWEAT_SVG } from "./icons"
import TodayList from "./TodayList.svelte"

let {
	open = $bindable(false),
	hidden = false,
}: { open?: boolean; hidden?: boolean } = $props()

const SEGS: { id: DrawerTab; label: string }[] = [
	{ id: "tasks", label: "Tasks" },
	{ id: "rewards", label: "Rewards" },
	{ id: "coach", label: "Coach" },
]
const stepReady = $derived(!!rewardTrack.data?.canClaim)

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
	<div class="segbar" role="tablist" aria-label="Drawer sections" inert={!open}>
		{#each SEGS as sg (sg.id)}
			<button
				type="button"
				role="tab"
				aria-selected={drawerUi.tab === sg.id}
				class:on={drawerUi.tab === sg.id}
				onclick={() => (drawerUi.tab = sg.id)}
				data-testid="drawer-tab-{sg.id}"
			>
				{sg.label}{#if sg.id === "rewards" && stepReady}<i class="dot" data-testid="drawer-rewards-dot"></i>{/if}
			</button>
		{/each}
	</div>
	<div class="dbody" id="dbody" inert={!open}>
		{#if drawerUi.tab === "tasks"}
			<TodayList editable />
			<CompeteCard />
		{:else if drawerUi.tab === "rewards"}
			<DrawerRewards />
		{:else}
			<DrawerCoach />
		{/if}
	</div>
</section>

<style>
.drawer {
	/* the paper palette of the Layout Lab; an event look re-skins it through
	   the --dr-* variables (styles/app.css) */
	--dr-bg: #fdf8f0;
	--dr-surface: #fff;
	--dr-border: #eaddc4;
	--dr-text: #241d15;
	--dr-muted: #8d7c66;
	--dr-accent: #1f9a55;
	--dr-fill: #34c973;
	--dr-grab: #dccbb3;
	--dr-seg: #eadfcd;
	--color-surface: var(--dr-surface);
	--color-surface-2: var(--dr-bg);
	--color-border: var(--dr-border);
	--color-text: var(--dr-text);
	--color-text-muted: var(--dr-muted);
	--color-accent: var(--dr-accent);
	position: fixed;
	left: 0;
	right: 0;
	bottom: var(--tab-h);
	z-index: 22;
	height: min(64%, calc(100% - var(--tab-h) - 90px));
	max-width: 560px;
	margin: 0 auto;
	transform: translateY(calc(100% - 78px));
	background: var(--dr-bg);
	color: var(--dr-text);
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
	background: var(--dr-grab);
	margin: 0 auto 8px;
}

.drow {
	display: flex;
	align-items: center;
	gap: 10px;
}

.drow h2 {
	margin: 0;
	font: 700 21px/1 var(--dr-font, var(--font-display, Georgia, serif));
}

.dcount {
	font: 700 13px/1 system-ui, sans-serif;
	color: var(--dr-muted);
	white-space: nowrap;
}

.dcount b {
	color: var(--dr-accent);
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
	background: var(--dr-seg);
	transition: background 0.3s;
}

.segs i.on {
	background: var(--dr-fill);
}

.dnext {
	margin-top: 7px;
	display: flex;
	align-items: center;
	gap: 6px;
	font: 600 13px/1.2 system-ui, sans-serif;
	color: var(--dr-muted);
	white-space: nowrap;
	overflow: hidden;
}

.dnext b {
	color: var(--dr-text);
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

.segbar {
	flex: none;
	display: flex;
	gap: 6px;
	padding: 0 12px 8px;
}

.segbar button {
	flex: 1;
	min-height: 36px;
	border: 2px solid var(--dr-border);
	border-radius: 12px;
	background: var(--dr-surface);
	color: var(--dr-muted);
	font: 800 13px ui-rounded, system-ui, sans-serif;
	cursor: pointer;
}

.segbar button.on {
	background: #241d15;
	border-color: var(--dr-text);
	color: #fff;
}

.dot {
	display: inline-block;
	width: 8px;
	height: 8px;
	margin-left: 5px;
	border-radius: 50%;
	background: var(--dr-fill);
	vertical-align: middle;
}

.dbody {
	flex: 1;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding: 0 12px 24px;
	-webkit-overflow-scrolling: touch;
}
</style>
