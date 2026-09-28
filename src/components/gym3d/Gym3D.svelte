<script lang="ts">
import { onDestroy, onMount } from "svelte"
import {
	FLOOR_TINTS,
	finishCost,
	levelProgress,
	upgradeInfo,
	WALL_COLORS,
} from "../../../shared/gym3d/economy"
import { SHAPE_INFO } from "../../../shared/gym3d/lots"
import {
	type EquipmentRoomType,
	FLOOR_STYLES,
	PAINT,
	RT,
} from "../../../shared/gym3d/rooms"
import type { GymJobDto, GymLayoutDto } from "../../../shared/types"
import { api } from "../../lib/api"
import { page } from "../../router.svelte"
import { Gym3DApp, type JobAction, type Selection } from "./app"
import { fmtLeft, jobLeft } from "./world/build"
import { roomLabel } from "./world/world"

type Props = {
	/** Opens the NPC dialog for a named NPC (with the 3D look's picture). */
	onNpcClick?: (npcKey: string, portrait: string | null) => void
	/** The 3D gym could not start (no WebGL2, load or build failure). */
	onFallback?: (reason: string) => void
	/** An upgrade that was just claimed: its build ceremony plays in place.
	 * `n` changes for every claim. */
	claim?: { key: string; n: number } | null
	/** The claim ceremony is over (or could not run). */
	onClaimDone?: () => void
}

let { onNpcClick, onFallback, claim = null, onClaimDone }: Props = $props()

const TYPES: EquipmentRoomType[] = [
	"cardio",
	"weights",
	"boxing",
	"recovery",
	"juice",
	"pool",
]
const FLOOR_NAMES: Record<string, string> = {
	checker: "Checker",
	wood: "Wood",
	rubber: "Rubber",
	tile: "Tile",
	terrazzo: "Terrazzo",
	concrete: "Concrete",
}

let host: HTMLDivElement
let chipEl = $state<HTMLDivElement | null>(null)
let hudEl = $state<HTMLDivElement | null>(null)
let sheetH = $state(0)
/** Pixels of the gym hidden under the app's bottom tab bar (or below the
 * screen): sheets and banners sit above them. */
let hidden = $state(0)
let app: Gym3DApp | null = null
let destroyed = false
let loading = $state(true)
let selection = $state<Selection | null>(null)
let layout = $state<GymLayoutDto | null>(null)
let busy = $state(false)
let tip = $state<{ text: string; kind: "info" | "error" } | null>(null)
let tipTimer: ReturnType<typeof setTimeout> | null = null
let moving = $state<{ id: number; name: string } | null>(null)
let pickType = $state<EquipmentRoomType | null>(null)
let bump = $state(0)
let clock = $state(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null

const coins = $derived(layout?.coins ?? 0)

const room = $derived.by(() => {
	const s = selection
	if (!layout || !s) return null
	const id =
		s.kind === "room" || s.kind === "spot"
			? s.roomId
			: s.kind === "piece"
				? (layout.pieces.find((p) => p.id === s.id)?.roomId ?? null)
				: s.kind === "job"
					? (layout.jobs.find((j) => j.id === s.jobId)?.roomId ?? null)
					: null
	return id == null ? null : (layout.rooms.find((r) => r.id === id) ?? null)
})
const piece = $derived.by(() => {
	const s = selection
	return s?.kind === "piece" && layout
		? (layout.pieces.find((p) => p.id === s.id) ?? null)
		: null
})
const lot = $derived.by(() => {
	const s = selection
	return s?.kind === "lot" && layout
		? (layout.lots.find((l) => l.id === s.lotId) ?? null)
		: null
})
const job = $derived.by((): GymJobDto | null => {
	const s = selection
	if (!layout || !s) return null
	if (s.kind === "job")
		return (
			layout.jobs.find((j) => j.id === s.jobId && j.status === "active") ?? null
		)
	if (s.kind === "piece")
		return (
			layout.jobs.find((j) => j.pieceId === s.id && j.status === "active") ??
			null
		)
	if (s.kind === "room")
		return (
			layout.jobs.find(
				(j) =>
					j.kind === "plot" && j.roomId === s.roomId && j.status === "active",
			) ?? null
		)
	return null
})

/** Which bottom sheet is open. */
const sheet = $derived.by(() => {
	const s = selection
	if (!s || moving) return null
	if (s.kind === "lot") return lot ? "lot" : null
	if (s.kind === "job") return job ? "job" : null
	if (s.kind === "spot") return room ? "spot" : null
	if (s.kind === "piece") return piece?.roomType ? "piece" : null
	if (s.kind === "room") {
		if (!room || room.type === "lobby") return null
		if (room.building) return job ? "job" : null
		if (room.type === "empty") return "type"
		return s.paint ? "paint" : "room"
	}
	return null
})

$effect(() => {
	// read chipEl first so the effect tracks it even before the app exists
	const el = chipEl
	app?.setChipElement(el)
})

$effect(() => {
	const top = hudEl?.offsetHeight ?? 0
	const bottom = (sheet ? sheetH : 0) + hidden
	app?.setInsets(top + 8, bottom)
})

function measureHidden() {
	if (!host) return
	const r = host.getBoundingClientRect()
	const nav = document.querySelector(".bottom-tab-bar")
	const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight
	const vis = Math.min(window.innerHeight, navTop)
	hidden = Math.max(0, Math.min(r.height * 0.6, Math.round(r.bottom - vis)))
}

function say(text: string, kind: "info" | "error" = "info") {
	tip = { text, kind }
	if (tipTimer) clearTimeout(tipTimer)
	tipTimer = setTimeout(() => {
		tip = null
	}, 3200)
}

function setLayout(next: GymLayoutDto) {
	if (layout && next.coins !== layout.coins) bump++
	layout = next
}

/** Posts a build action; the server answers with the whole new layout. */
async function act(path: string, body?: unknown): Promise<GymLayoutDto | null> {
	if (!app || busy) return null
	busy = true
	try {
		const next = await api.post<GymLayoutDto>(`/gym/layout/${path}`, body ?? {})
		if (destroyed || !app) return null
		app.applyLayout(next)
		setLayout(next)
		return next
	} catch (e) {
		say(e instanceof Error ? e.message : "Something went wrong", "error")
		// the gym may be out of date (another device): read it again
		try {
			if (app) setLayout(await app.reload())
		} catch {
			// keep what we have
		}
		return null
	} finally {
		busy = false
	}
}

function close() {
	app?.select(null)
}

async function buyLot() {
	const l = lot
	if (!l) return
	const before = new Set(layout?.jobs.map((j) => j.id))
	const next = await act(`lots/${encodeURIComponent(l.id)}/buy`)
	if (!next) return
	const j = next.jobs.find((q) => !before.has(q.id))
	const r = next.rooms.find((q) => q.id === j?.roomId)
	if (r) {
		const xs = r.cells.map((c) => c.px * 9 + 4.5)
		const zs = r.cells.map((c) => c.pz * 6 + 3)
		app?.panTo(
			xs.reduce((a, b) => a + b, 0) / xs.length,
			zs.reduce((a, b) => a + b, 0) / zs.length,
		)
	}
	close()
	say(`Construction started: about ${l.hours}h`)
}

async function finishJob(jobId: number, cost: number) {
	if (cost > coins) {
		say(`Not enough coins: you need ${cost}`, "error")
		return
	}
	app?.bounceJob(jobId)
	// allow a few seconds of drift; the server never charges more than this
	const next = await act(`jobs/${jobId}/finish`, { maxCost: cost + 2 })
	if (next) close()
}

function logWorkout() {
	page("/")
}

function onJobAction(jobId: number, action: JobAction, cost: number) {
	if (action === "workout") logWorkout()
	else void finishJob(jobId, cost)
}

async function chooseType() {
	const r = room
	const t = pickType
	if (!r || !t) return
	const next = await act(`rooms/${r.id}/type`, { type: t })
	if (!next) return
	pickType = null
	app?.sparkleRoom(r.id, PAINT[t].wall)
	app?.select({ kind: "room", roomId: r.id })
	say(`${roomLabel(t, r.shape)} is open! Tap a glowing spot to add gear.`)
}

async function paint(p: {
	wall?: string
	floorStyle?: string
	floorColor?: string
}) {
	const r = room
	if (!r) return
	const next = await act(`rooms/${r.id}/paint`, p)
	if (next) app?.sparkleRoom(r.id, p.wall ?? p.floorColor ?? "#ffffff")
}

async function placeStored(pieceId: number) {
	const s = selection
	if (s?.kind !== "spot") return
	const next = await act(`pieces/${pieceId}/move`, {
		roomId: s.roomId,
		spotIndex: s.spot,
	})
	if (next) close()
}

function startMove() {
	const p = piece
	if (!p || !app) return
	const n = app.beginMove(p.id)
	if (!n) {
		say("No other spot fits it right now. Level the room up to open more.")
		return
	}
	moving = { id: p.id, name: p.name }
}

function cancelMove() {
	app?.endMove()
	moving = null
}

async function onMoveTarget(
	pieceId: number,
	roomId: number,
	spotIndex: number,
) {
	moving = null
	const next = await act(`pieces/${pieceId}/move`, { roomId, spotIndex })
	if (next) {
		const p = next.pieces.find((q) => q.id === pieceId)
		if (p) {
			app?.select({ kind: "piece", id: p.id, name: p.name })
			app?.panTo(p.x, p.z)
		}
	}
}

async function rotate() {
	if (piece) await act(`pieces/${piece.id}/rotate`)
}

async function store() {
	const p = piece
	if (!p) return
	const next = await act(`pieces/${p.id}/store`)
	if (next) {
		close()
		say(`${p.name} is in storage. Tap an empty spot to place it again.`)
	}
}

async function upgrade() {
	const p = piece
	if (!p) return
	const u = upgradeInfo(p.itemKey, p.tier)
	if (!u) return
	if (u.cost > coins) {
		say(`Not enough coins: you need ${u.cost}`, "error")
		return
	}
	const next = await act(`pieces/${p.id}/upgrade`)
	if (next) say(`Upgrading to tier ${u.toTier}: ${u.hours}h`)
}

function stars(n: number): string {
	return "★".repeat(Math.max(0, Math.min(5, n)))
}

const spotInfo = $derived.by(() => {
	const s = selection
	if (s?.kind !== "spot" || !layout || !room) return null
	const stored = layout.pieces.filter(
		(p) =>
			p.status === "stored" && p.roomType === room.type && p.size === s.size,
	)
	const locked = layout.lockedGear.filter(
		(g) => g.roomType === room.type && g.size === s.size,
	)
	return { s, stored, locked }
})

onMount(() => {
	Gym3DApp.create(host, {
		onSelect: (s) => {
			selection = s
			pickType = null
		},
		onMoveTarget: (id, roomId, spot) => void onMoveTarget(id, roomId, spot),
		onMoveEnd: () => {
			moving = null
		},
		onJobAction,
		onJobDone: (j, title) => {
			if (j.kind === "plot" && j.roomId != null) {
				say(`${title} Choose what it becomes.`)
				const id = j.roomId
				// let the confetti fall before the sheet covers it
				setTimeout(() => {
					if (!destroyed && !selection)
						app?.select({ kind: "room", roomId: id })
				}, 1400)
			} else say(title)
		},
		onJobDue: () => {
			if (!app) return
			app
				.reload()
				.then((l) => setLayout(l))
				.catch(() => {})
		},
		onHint: (t) => say(t),
	})
		.then((a) => {
			if (destroyed) {
				a.dispose()
				return
			}
			app = a
			app.setChipElement(chipEl)
			layout = a.layout
			loading = false
			app.setInsets((hudEl?.offsetHeight ?? 0) + 8, 0)
			window.gym3d = {
				ready: true,
				stats: () => a.stats(),
				tap: (x, y) => a.tapAt(x, y),
				screenOf: (key) => a.screenOf(key),
				people: () => a.personKeys(),
				layout: () => a.layout,
				screenAt: (x, y, z) => a.screenAt(x, y, z),
				moveTargets: () => a.moveTargets(),
				panTo: (x, z) => a.panTo(x, z),
				lineup: (on) => a.lineup(on),
				info: (key) => {
					const p = a.personKeys().includes(key)
					return p ? a.infoByKey(key) : null
				},
				claiming: () => a.claimActive,
				portrait: (k) => a.portraitOf(k),
			}
			ready = true
		})
		.catch((e: unknown) => {
			if (destroyed) return
			loading = false
			onFallback?.(e instanceof Error ? e.message : String(e))
		})
	clockTimer = setInterval(() => {
		clock = Date.now()
	}, 1000)
	measureHidden()
	window.addEventListener("scroll", measureHidden, { passive: true })
	window.addEventListener("resize", measureHidden)
})

onDestroy(() => {
	destroyed = true
	// a claim ceremony cut short still ends (the claim itself is saved)
	if (app?.claimActive) onClaimDone?.()
	app?.dispose()
	app = null
	if (tipTimer) clearTimeout(tipTimer)
	if (clockTimer) clearInterval(clockTimer)
	if (typeof window !== "undefined") {
		window.removeEventListener("scroll", measureHidden)
		window.removeEventListener("resize", measureHidden)
	}
	if (typeof window !== "undefined") window.gym3d = undefined
})

function talk() {
	if (selection?.kind === "person" && selection.npcKey)
		onNpcClick?.(selection.npcKey, app?.portraitOf(selection.npcKey) ?? null)
}

let claimSeen = 0
let ready = $state(false)
$effect(() => {
	const c = claim
	if (!ready || !c || c.n === claimSeen) return
	claimSeen = c.n
	const a = app
	if (!a) {
		onClaimDone?.()
		return
	}
	a.claimCeremony(c.key, () => {
		if (!destroyed) {
			layout = a.layout
			onClaimDone?.()
		}
	}).catch(() => onClaimDone?.())
})

const jobView = $derived.by(() => {
	const j = job
	if (!j || !app) return null
	void clock
	const left = jobLeft(j, app.now())
	return { j, left, cost: finishCost(left) }
})
</script>

<div class="g3d" bind:this={host} data-testid="gym3d">
	{#if loading}
		<p class="g3d-loading">Building your gym...</p>
	{/if}
	{#if layout}
		<div class="g3d-hud" bind:this={hudEl}>
			{#key bump}
				<div class="g3d-coins" class:bump={bump > 0} data-testid="gym3d-coins" aria-label="{coins} coins">
					<span class="g3d-coin" aria-hidden="true"></span>{coins.toLocaleString("en-US")}
				</div>
			{/key}
		</div>
	{/if}
	{#if moving}
		<div class="g3d-banner" role="status" style="bottom:{hidden + 12}px">
			<span>Tap a glowing spot to move <b>{moving.name}</b>. A filled spot swaps.</span>
			<button type="button" class="g3d-btn" onclick={cancelMove}>Cancel</button>
		</div>
	{/if}
	{#if tip}
		<div class="g3d-tip" class:err={tip.kind === "error"} role="status" data-testid="gym3d-tip">
			{tip.text}
		</div>
	{/if}
	{#if selection?.kind === "person"}
		{@const info = selection.info}
		<div
			class="g3d-chip"
			class:rich={!!(info.mood || info.doing || info.relation)}
			bind:this={chipEl}
			role="status"
			data-testid="gym3d-chip"
		>
			<div class="g3d-chip-head">
				<span class="g3d-chip-name">{selection.name}</span>
				{#if info.hero}<span class="g3d-chip-hero">★ Visiting</span>{/if}
				{#if selection.npcKey}
					<button type="button" class="g3d-talk" onclick={talk} data-testid="gym3d-talk"
						>Talk</button
					>
				{/if}
			</div>
			{#if info.title}<div class="g3d-chip-title">{info.title}</div>{/if}
			{#if info.mood || info.doing}
				<div class="g3d-chip-row" data-testid="gym3d-chip-doing">
					{#if info.mood}<span class="g3d-chip-mood">{info.mood}</span>{/if}
					{#if info.doing}<span>{info.doing}</span>{/if}
				</div>
			{/if}
			{#if info.relation}
				<div class="g3d-chip-row rel" data-testid="gym3d-chip-rel">♥ {info.relation}</div>
			{/if}
		</div>
	{/if}

	{#if sheet}
		<div
			class="g3d-sheet"
			style="bottom:{hidden}px;max-height:calc(72% - {hidden}px)"
			bind:clientHeight={sheetH}
			data-testid="gym3d-sheet"
			data-sheet={sheet}
			role="dialog"
			aria-label="Gym builder"
		>
			<button type="button" class="g3d-x" onclick={close} aria-label="Close">×</button>

			{#if sheet === "lot" && lot}
				{@const info = SHAPE_INFO[lot.shape as keyof typeof SHAPE_INFO]}
				<h3>{info?.name ?? "Plot"} for sale</h3>
				<p class="sub">{info?.sub} · builds in about {lot.hours}h</p>
				<div class="row">
					<span class="price"><span class="g3d-coin"></span>{lot.price.toLocaleString("en-US")}</span>
					<button
						type="button"
						class="g3d-btn primary"
						disabled={busy || coins < lot.price}
						onclick={buyLot}
						data-testid="gym3d-buy"
					>
						{coins < lot.price ? `Need ${lot.price - coins} more` : "Buy and build"}
					</button>
				</div>
				<p class="hint">Coins come with gym XP: check in, log meals and finish missions.</p>

			{:else if sheet === "job" && jobView}
				{@const jv = jobView}
				<h3>{jv.j.kind === "plot" ? "Under construction" : "Being upgraded"}</h3>
				<p class="sub">{fmtLeft(jv.left)} left</p>
				<div class="row">
					<button
						type="button"
						class="g3d-btn primary"
						disabled={busy}
						onclick={() => finishJob(jv.j.id, jv.cost)}
						data-testid="gym3d-finish"
					>
						Finish now <span class="g3d-coin"></span>{jv.cost}
					</button>
					<button type="button" class="g3d-btn" onclick={logWorkout}>Log a workout: −1h</button>
				</div>

			{:else if sheet === "type" && room}
				<h3>What should this room be?</h3>
				<p class="sub">You choose once. Pick a card, then open the room.</p>
				<div class="types" role="radiogroup" aria-label="Room type">
					{#each TYPES as t (t)}
						<button
							type="button"
							class="type"
							class:on={pickType === t}
							role="radio"
							aria-checked={pickType === t}
							style="--wall:{PAINT[t].wall};--floor:{PAINT[t].floorColor}"
							onclick={() => (pickType = t)}
							data-testid="gym3d-type-{t}"
						>
							<span class="sw" aria-hidden="true"></span>
							<b>{roomLabel(t, room.shape)}</b>
							<small>{RT[t].desc}</small>
						</button>
					{/each}
				</div>
				<button
					type="button"
					class="g3d-btn primary wide"
					disabled={!pickType || busy}
					onclick={chooseType}
					data-testid="gym3d-type-ok"
				>
					{pickType ? `Open the ${roomLabel(pickType, room.shape)}` : "Choose a type"}
				</button>

			{:else if sheet === "room" && room}
				{@const lp = levelProgress(room.level, room.points)}
				<h3>{roomLabel(room.type, room.shape)}</h3>
				<p class="sub">
					<span class="stars">{stars(room.level)}</span> Lv {room.level} · {room.points} points{#if lp.next != null}, {lp.next} for Lv {room.level + 1}{/if}
				</p>
				<div class="bar"><i style="width:{Math.round(lp.k * 100)}%"></i></div>
				<p class="hint">Every piece scores its tier. Upgrade gear to level the room up and open bonus spots.</p>
				<button
					type="button"
					class="g3d-btn wide"
					onclick={() => app?.select({ kind: "room", roomId: room.id, paint: true })}
					data-testid="gym3d-paint">Paint this room</button
				>

			{:else if sheet === "paint" && room}
				<h3>Paint: {roomLabel(room.type, room.shape)}</h3>
				<p class="lbl">Walls</p>
				<div class="sws">
					{#each WALL_COLORS as c (c)}
						<button
							type="button"
							class="sw2"
							class:on={room.paint.wall === c}
							style="background:{c}"
							aria-label="Wall colour {c}"
							disabled={busy}
							onclick={() => paint({ wall: c })}
						></button>
					{/each}
				</div>
				<p class="lbl">Floor</p>
				<div class="chips">
					{#each FLOOR_STYLES as f (f)}
						<button
							type="button"
							class="g3d-chipbtn"
							class:on={room.paint.floorStyle === f}
							disabled={busy}
							onclick={() => paint({ floorStyle: f })}>{FLOOR_NAMES[f]}</button
						>
					{/each}
				</div>
				<div class="sws">
					{#each FLOOR_TINTS as c (c)}
						<button
							type="button"
							class="sw2"
							class:on={room.paint.floorColor === c}
							style="background:{c}"
							aria-label="Floor colour {c}"
							disabled={busy}
							onclick={() => paint({ floorColor: c })}
						></button>
					{/each}
				</div>

			{:else if sheet === "spot" && spotInfo && room}
				{@const si = spotInfo}
				<h3>{si.s.open ? "Empty spot" : `Opens at room Lv ${si.s.unlock}`}</h3>
				<p class="sub">
					{roomLabel(room.type, room.shape)} · {si.s.size} × {si.s.size}
				</p>
				{#if !si.s.open}
					<p class="hint">Upgrade the gear in this room to reach Lv {si.s.unlock}.</p>
				{:else if si.stored.length || si.locked.length}
					<ul class="gear">
						{#each si.stored as p (p.id)}
							<li>
								<span><b>{p.name}</b> <span class="stars">{stars(p.tier)}</span></span>
								<button
									type="button"
									class="g3d-btn primary"
									disabled={busy}
									onclick={() => placeStored(p.id)}
									data-testid="gym3d-place">Place</button
								>
							</li>
						{/each}
						{#each si.locked as g (g.key)}
							<li class="locked">
								<span><b>{g.name}</b></span>
								<small>Unlocks at {g.requiredXp} XP</small>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="hint">Nothing in storage fits here. New gear comes from gym XP unlocks.</p>
				{/if}

			{:else if sheet === "piece" && piece}
				{@const u = upgradeInfo(piece.itemKey, piece.tier)}
				<h3>{piece.name}</h3>
				<p class="sub">
					<span class="stars">{stars(piece.tier)}</span> Tier {piece.tier}{room ? ` · ${roomLabel(room.type, room.shape)}` : ""}
				</p>
				{#if piece.status === "upgrading" && jobView}
					{@const jv = jobView}
					<p class="hint">Being upgraded to tier {jv.j.targetTier}: {fmtLeft(jv.left)} left.</p>
					<div class="row">
						<button
							type="button"
							class="g3d-btn primary"
							disabled={busy}
							onclick={() => finishJob(jv.j.id, jv.cost)}
							data-testid="gym3d-finish"
						>
							Finish now <span class="g3d-coin"></span>{jv.cost}
						</button>
						<button type="button" class="g3d-btn" onclick={logWorkout}>Log a workout: −1h</button>
					</div>
				{:else}
					<div class="acts">
						{#if u}
							<button
								type="button"
								class="g3d-btn primary"
								disabled={busy || coins < u.cost}
								onclick={upgrade}
								data-testid="gym3d-upgrade"
							>
								Tier {u.toTier} <span class="g3d-coin"></span>{u.cost} · {u.hours}h
							</button>
						{:else}
							<span class="max">Top tier</span>
						{/if}
						<button type="button" class="g3d-btn" disabled={busy} onclick={startMove} data-testid="gym3d-move">Move</button>
						<button type="button" class="g3d-btn" disabled={busy} onclick={rotate}>Rotate</button>
						<button type="button" class="g3d-btn" disabled={busy} onclick={store}>Store</button>
					</div>
					<p class="hint">Tip: drag a selected piece onto a glowing spot.</p>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
.g3d {
	position: relative;
	width: 100%;
	height: 100%;
	/* in flow like the 2D gym (which is min 400px); fill a phone screen
	   below the gym header when there is room */
	min-height: max(400px, calc(100dvh - 250px));
	overflow: hidden;
	background: #f2c9b4;
	-webkit-user-select: none;
	user-select: none;
	-webkit-tap-highlight-color: transparent;
	touch-action: none;
	--ink: #3a2622;
	color: var(--ink);
}

.g3d-loading {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	margin: 0;
	color: var(--ink);
	font-weight: 700;
	font-size: 0.9rem;
}

.g3d-hud {
	position: absolute;
	top: 8px;
	right: 8px;
	z-index: 5;
	pointer-events: none;
}

.g3d-coins {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 5px 12px 5px 7px;
	border: 2px solid var(--ink);
	border-radius: 999px;
	background: #fff7ea;
	box-shadow: 0 3px 0 var(--ink);
	font-weight: 900;
	font-size: 15px;
	font-variant-numeric: tabular-nums;
}

.g3d-coins.bump {
	animation: g3d-bump 0.45s ease-out;
}

@keyframes g3d-bump {
	30% {
		transform: scale(1.18);
	}
}

.g3d :global(.g3d-coin) {
	display: inline-block;
	width: 1em;
	height: 1em;
	border-radius: 50%;
	background: radial-gradient(circle at 35% 35%, #ffe38a, #f2c14a 55%, #c9902a);
	box-shadow: inset 0 0 0 2px #b27a1c;
	vertical-align: -0.15em;
	margin-right: 3px;
}

.g3d-banner,
.g3d-tip {
	position: absolute;
	z-index: 6;
	width: max-content;
	border: 2px solid var(--ink);
	border-radius: 14px;
	background: #fff;
	box-shadow: 0 3px 0 var(--ink);
	font-weight: 700;
	font-size: 13px;
	line-height: 1.3;
}

.g3d-banner {
	left: 50%;
	transform: translateX(-50%);
	max-width: calc(100% - 24px);
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 6px 6px 12px;
}

.g3d-tip {
	top: 8px;
	left: 8px;
	max-width: calc(100% - 150px);
	padding: 7px 11px;
	pointer-events: none;
	background: #fff7ea;
	animation: g3d-in 0.2s ease-out;
}

.g3d-tip.err {
	background: #ffe3dc;
	border-color: #b3372c;
	color: #7a1f17;
}

@keyframes g3d-in {
	from {
		opacity: 0;
		transform: translateY(-6px);
	}
}

.g3d-chip {
	position: absolute;
	left: 0;
	top: 0;
	z-index: 4;
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 5px 6px 5px 12px;
	border: 2px solid var(--ink);
	border-radius: 999px;
	background: #fff;
	box-shadow: 0 3px 0 var(--ink);
	font-weight: 800;
	font-size: 13px;
	white-space: nowrap;
	margin-bottom: 8px;
	will-change: transform;
	max-width: min(270px, calc(100vw - 32px));
	box-sizing: border-box;
}

.g3d-chip.rich {
	border-radius: 14px;
	padding: 6px 8px 7px 12px;
}

.g3d-chip-head {
	display: flex;
	align-items: center;
	gap: 8px;
}

.g3d-chip-name {
	padding-right: 2px;
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
}

.g3d-chip-head > :not(.g3d-chip-name) {
	flex: none;
}

.g3d-chip-hero {
	background: #f2c14a;
	border: 1.5px solid var(--ink);
	border-radius: 999px;
	padding: 0 6px;
	font-size: 10px;
}

.g3d-chip-title {
	font-size: 11px;
	font-weight: 700;
	color: #3aa89a;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	margin-top: -2px;
}

.g3d-chip-row {
	display: flex;
	gap: 6px;
	font-size: 12px;
	font-weight: 600;
	color: #3b3f4a;
	white-space: normal;
	line-height: 1.25;
}

.g3d-chip-mood {
	font-weight: 800;
	white-space: nowrap;
}

.g3d-chip-row.rel {
	color: #c8323a;
}

.g3d-talk {
	border: 2px solid var(--ink);
	border-radius: 999px;
	background: #e8743b;
	color: #fff;
	font-weight: 800;
	font-size: 12px;
	padding: 3px 10px;
	cursor: pointer;
	min-height: 28px;
}

.g3d button:focus-visible {
	outline: 3px solid #3aa89a;
	outline-offset: 2px;
}

/* bottom sheet */
.g3d-sheet {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 7;
	max-height: 62%;
	overflow-y: auto;
	padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
	border-top: 2px solid var(--ink);
	border-radius: 18px 18px 0 0;
	background: #fff7ea;
	box-shadow: 0 -4px 0 rgba(58, 38, 34, 0.18);
	animation: g3d-up 0.22s ease-out;
	touch-action: pan-y;
}

@keyframes g3d-up {
	from {
		transform: translateY(40px);
		opacity: 0;
	}
}

.g3d-sheet h3 {
	margin: 0 44px 2px 0;
	font-size: 17px;
	font-weight: 900;
}

.g3d-sheet .sub {
	margin: 0 0 10px;
	font-size: 13px;
	font-weight: 600;
	opacity: 0.8;
}

.g3d-sheet .hint {
	margin: 8px 0 0;
	font-size: 12px;
	opacity: 0.75;
}

.g3d-sheet .lbl {
	margin: 8px 0 6px;
	font-size: 12px;
	font-weight: 800;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	opacity: 0.7;
}

.g3d-x {
	position: absolute;
	top: 6px;
	right: 6px;
	width: 44px;
	height: 44px;
	border: none;
	background: none;
	font-size: 26px;
	line-height: 1;
	color: var(--ink);
	cursor: pointer;
}

.g3d-btn {
	min-height: 44px;
	padding: 0 14px;
	border: 2px solid var(--ink);
	border-radius: 12px;
	background: #fff;
	box-shadow: 0 3px 0 var(--ink);
	color: var(--ink);
	font-weight: 800;
	font-size: 14px;
	cursor: pointer;
	white-space: nowrap;
}

.g3d-btn.primary {
	background: #e8743b;
	color: #fff;
}

.g3d-btn.wide {
	width: 100%;
	margin-top: 10px;
}

.g3d-btn:active:not(:disabled) {
	transform: translateY(2px);
	box-shadow: 0 1px 0 var(--ink);
}

.g3d-btn:disabled {
	opacity: 0.5;
	cursor: default;
}

.row,
.acts {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.row .price {
	font-size: 20px;
	font-weight: 900;
	margin-right: auto;
}

.max {
	font-weight: 800;
	font-size: 13px;
	padding: 0 6px;
}

.stars {
	color: #e0a526;
	letter-spacing: 1px;
}

.bar {
	height: 8px;
	border: 2px solid var(--ink);
	border-radius: 99px;
	background: #fff;
	overflow: hidden;
}

.bar i {
	display: block;
	height: 100%;
	background: #3aa89a;
}

.types {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 8px;
}

.type {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 2px;
	min-height: 44px;
	padding: 6px;
	border: 2px solid var(--ink);
	border-radius: 12px;
	background: #fff;
	color: var(--ink);
	text-align: left;
	cursor: pointer;
}

.type.on {
	background: #dff5f1;
	box-shadow: 0 0 0 3px #3aa89a;
}

.type .sw {
	width: 100%;
	height: 26px;
	border-radius: 7px;
	background: linear-gradient(var(--wall) 55%, var(--floor) 55%);
	border: 1px solid rgba(58, 38, 34, 0.3);
}

.type b {
	font-size: 13px;
}

.type small {
	font-size: 10.5px;
	line-height: 1.2;
	opacity: 0.7;
}

.sws,
.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.sw2 {
	width: 44px;
	height: 44px;
	border: 2px solid var(--ink);
	border-radius: 50%;
	cursor: pointer;
}

.sw2.on {
	box-shadow: 0 0 0 3px #fff7ea, 0 0 0 5px #3aa89a;
}

.g3d-chipbtn {
	min-height: 44px;
	padding: 0 12px;
	border: 2px solid var(--ink);
	border-radius: 999px;
	background: #fff;
	color: var(--ink);
	font-weight: 700;
	cursor: pointer;
}

.g3d-chipbtn.on {
	background: #3aa89a;
	color: #fff;
}

.gear {
	list-style: none;
	margin: 0;
	padding: 0;
}

.gear li {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-height: 48px;
	border-bottom: 1px dashed rgba(58, 38, 34, 0.25);
}

.gear li.locked {
	opacity: 0.55;
}

/* labels drawn by the app (room badges, timer bubbles) */
.g3d :global(.g3d-badge) {
	background: var(--ink);
	color: #fff7ef;
	border: none;
	border-radius: 999px;
	padding: 3px 9px 4px;
	font: inherit;
	font-size: 11px;
	line-height: 1.2;
	opacity: 0.92;
	box-shadow: 0 3px 0 rgba(58, 38, 34, 0.35);
	margin-bottom: 4px;
	cursor: pointer;
	transition: opacity 0.2s;
}

.g3d :global(.g3d-badge.dim) {
	opacity: 0.25;
}

.g3d :global(.g3d-badge-new) {
	background: #3aa89a;
}

.g3d :global(.g3d-badge-l1) {
	display: flex;
	gap: 6px;
	align-items: center;
	white-space: nowrap;
}

.g3d :global(.g3d-stars) {
	color: #f2c14a;
}

.g3d :global(.g3d-pbar) {
	display: block;
	height: 4px;
	margin-top: 3px;
	border-radius: 9px;
	background: rgba(255, 255, 255, 0.25);
	overflow: hidden;
}

.g3d :global(.g3d-pbar i) {
	display: block;
	height: 100%;
	background: #f2c14a;
}

.g3d :global(.g3d-bub) {
	display: flex;
	flex-direction: column;
	gap: 2px;
	width: 188px;
	padding: 7px 9px 8px;
	border: 2px solid var(--ink);
	border-radius: 14px;
	background: #fff;
	box-shadow: 0 3px 0 var(--ink);
	font-size: 12px;
	margin-bottom: 10px;
	z-index: 3;
}

.g3d :global(.g3d-bub::after) {
	content: "";
	position: absolute;
	left: 50%;
	bottom: -8px;
	width: 12px;
	height: 12px;
	background: #fff;
	border-right: 2px solid var(--ink);
	border-bottom: 2px solid var(--ink);
	transform: translateX(-50%) rotate(45deg);
}

.g3d :global(.g3d-bub.pin::after) {
	display: none;
}

.g3d :global(.g3d-bub .g3d-pbar) {
	background: #f1e4d6;
	height: 6px;
}

.g3d :global(.g3d-bub .g3d-pbar i) {
	background: #3aa89a;
}

.g3d :global(.g3d-left) {
	font-weight: 700;
	opacity: 0.75;
}

.g3d :global(.g3d-bb) {
	display: flex;
	gap: 5px;
	margin-top: 3px;
}

.g3d :global(.g3d-bb button) {
	flex: 1 1 auto;
	min-height: 44px;
	padding: 0 6px;
	border: 2px solid var(--ink);
	border-radius: 10px;
	background: #fff;
	color: var(--ink);
	font: inherit;
	font-weight: 800;
	font-size: 11.5px;
	cursor: pointer;
	white-space: nowrap;
}

.g3d :global(.g3d-bb .g3d-fin) {
	background: #e8743b;
	color: #fff;
}

.g3d :global(.g3d-bb .g3d-wk) {
	background: #dff5f1;
}

/* speech bubbles (world/life.ts): pooled, moved by transform only */
.g3d :global(.g3d-say) {
	z-index: 3;
	max-width: 190px;
	padding: 5px 9px 6px;
	border: 2px solid var(--ink);
	border-radius: 12px;
	background: #fffdf7;
	box-shadow: 0 2px 0 var(--ink);
	font-size: 12px;
	font-weight: 600;
	line-height: 1.25;
	color: #23262e;
	pointer-events: none;
	contain: layout paint;
}

.g3d :global(.g3d-say::after) {
	content: "";
	position: absolute;
	left: calc(50% - 5px);
	bottom: -7px;
	width: 8px;
	height: 8px;
	background: #fffdf7;
	border-right: 2px solid var(--ink);
	border-bottom: 2px solid var(--ink);
	transform: rotate(45deg);
}

.g3d :global(.g3d-say b) {
	display: block;
	font-size: 10px;
	font-weight: 800;
	color: #e8743b;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

/* today's event, classes and visiting heroes (world/happenings.ts) */
.g3d :global(.g3d-evt),
.g3d :global(.g3d-class),
.g3d :global(.g3d-hero) {
	z-index: 2;
	white-space: nowrap;
	border: 2px solid var(--ink);
	border-radius: 999px;
	font-weight: 800;
	font-size: 12px;
	padding: 3px 10px;
	box-shadow: 0 2px 0 var(--ink);
	pointer-events: none;
	transform-origin: 50% 100%;
}

.g3d :global(.g3d-evt) {
	background: #f2c14a;
	color: #23262e;
}

.g3d :global(.g3d-class) {
	background: #9b6bc4;
	color: #fff;
}

.g3d :global(.g3d-name) {
	z-index: 2;
	white-space: nowrap;
	background: #fff;
	border: 2px solid var(--ink);
	border-radius: 8px;
	padding: 1px 6px;
	font-size: 11px;
	font-weight: 800;
	pointer-events: none;
}

.g3d :global(.g3d-hero) {
	background: #23262e;
	color: #ffd75e;
	font-size: 10px;
	padding: 1px 7px;
}
</style>
