<script lang="ts">
import {
	ChevronLeft,
	ChevronRight,
	Dumbbell,
	Paintbrush,
	Users,
} from "@lucide/svelte"
import { onDestroy, onMount } from "svelte"
import {
	ECONOMY,
	FLOOR_TINTS,
	finishCost,
	KITCHEN_MENU,
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
	roomSpots,
} from "../../../shared/gym3d/rooms"
import type { GymJobDto, GymLayoutDto } from "../../../shared/types"
import { api } from "../../lib/api"
import { centerOf, flyChip } from "../../lib/fly"
import { COIN_SVG, chipHtml, GREENS_SVG, SWEAT_SVG } from "../home/icons"
import {
	bankAt,
	Gym3DApp,
	type JobAction,
	type RoomView,
	type Selection,
} from "./app"
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
	/** Screen space the app's HUD covers at the top. */
	insetTop?: number
	/** Screen space covered at the bottom (tab bar + Today drawer peek). */
	insetBottom?: number
	/** Every new layout (the HUD shows its balances). */
	onLayout?: (l: GymLayoutDto) => void
	/** A bottom sheet opened or closed (Home tucks the Today drawer away). */
	onSheet?: (open: boolean) => void
	/** Short feedback ("Sweat spent...") for the host to show (Home puts it
	 * in the coach's bubble); without it the gym shows its own tip. */
	onTip?: (text: string, kind: "info" | "error") => void
}

let {
	onNpcClick,
	onFallback,
	claim = null,
	onClaimDone,
	insetTop = 0,
	insetBottom = 0,
	onLayout,
	onSheet,
	onTip,
}: Props = $props()

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
let sheetH = $state(0)
/** Pixels of the gym hidden under the tab bar and the drawer's peek:
 * sheets and banners sit above them. */
const hidden = $derived(insetBottom)
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
let waiting = $state(0)
let welcome = $state<NonNullable<GymLayoutDto["welcomeBack"]> | null>(null)

const coins = $derived(layout?.coins ?? 0)
const sweat = $derived(layout?.sweat ?? 0)
const greens = $derived(layout?.greens ?? 0)

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
	if (s.kind === "kitchen") return "kitchen"
	if (s.kind === "lot") return lot ? "lot" : null
	if (s.kind === "job") return job ? "job" : null
	if (s.kind === "spot") return room ? "spot" : null
	if (s.kind === "piece") return piece?.roomType ? "piece" : null
	if (s.kind === "room") {
		if (!room || room.type === "lobby") return null
		if (room.building) return job ? "job" : null
		if (room.type === "empty") return "type"
		// the room menu first; paint and decor live under Customize
		if (s.view === "customize") return "paint"
		if (s.view === "gear") return "room-gear"
		if (s.view === "staff") return "room-staff"
		return "room"
	}
	return null
})

$effect(() => {
	// read chipEl first so the effect tracks it even before the app exists
	const el = chipEl
	app?.setChipElement(el)
})

$effect(() => {
	onSheet?.(!!sheet || !!moving)
})

$effect(() => {
	const bottom = (sheet ? sheetH : 0) + hidden
	const top = insetTop
	if (ready) app?.setInsets(top + 8, bottom)
})

function say(text: string, kind: "info" | "error" = "info") {
	if (onTip) {
		onTip(text, kind)
		return
	}
	tip = { text, kind }
	if (tipTimer) clearTimeout(tipTimer)
	tipTimer = setTimeout(() => {
		tip = null
	}, 3200)
}

function setLayout(next: GymLayoutDto) {
	if (layout && next.coins !== layout.coins) bump++
	layout = next
	onLayout?.(next)
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

/** Opens a page of the room menu (none: back to the menu). */
function roomPage(view?: RoomView) {
	const r = room
	if (r)
		app?.select(
			view
				? { kind: "room", roomId: r.id, view }
				: { kind: "room", roomId: r.id },
		)
}

/** A piece from the room menu: its sheet, with the camera on it. */
function openPiece(p: GymLayoutDto["pieces"][number]) {
	app?.panTo(p.x, p.z)
	app?.select({ kind: "piece", id: p.id, name: p.name })
}

/** What the room menu shows: gear, free and locked spots, coin rate. */
const roomInfo = $derived.by(() => {
	const r = room
	const s = selection
	if (!r || !layout || s?.kind !== "room" || !(r.type in RT)) return null
	const here = layout.pieces.filter(
		(p) => p.roomId === r.id && p.status !== "stored",
	)
	const gear = here
		.filter((p) => p.kind === "equipment" && p.roomType)
		.sort((a, b) => (a.spotIndex ?? 0) - (b.spotIndex ?? 0))
	const decor = here.filter((p) => p.kind === "decor")
	const staffGear = gear.filter((p) => p.itemKey.startsWith("staff_"))
	const spots = roomSpots(r.type as EquipmentRoomType, r.cells)
	const taken = new Set(here.map((p) => p.spotIndex))
	const free = spots.filter((q) => !taken.has(q.index))
	const open = free.filter((q) => q.unlock <= r.level)
	const locked = free.filter((q) => q.unlock > r.level)
	const ids = new Set(here.map((p) => p.id))
	const rate = layout.income
		.filter(
			(i) => i.kind === "machine" && i.pieceId != null && ids.has(i.pieceId),
		)
		.reduce((a, i) => a + i.rate, 0)
	const nextUnlock = locked.length
		? Math.min(...locked.map((q) => q.unlock))
		: null
	return { gear, decor, staffGear, spots, open, locked, rate, nextUnlock }
})

/** Who works in the room now (the Staff page), read once a second. */
const roomStaff = $derived.by(() => {
	void clock
	const r = room
	return sheet === "room-staff" && r && app ? app.staffIn(r.id) : []
})

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

function noSweat(need: number) {
	say(
		`Not enough Sweat: you need ${need}. Tick a workout task in Today to earn some.`,
		"error",
	)
}

/** Spends Sweat on a job: one hour off, or finish it now. */
async function finishJob(jobId: number, cost: number) {
	if (cost > sweat) return noSweat(cost)
	app?.bounceJob(jobId)
	// allow a little drift; the server never charges more than this
	const next = await act(`jobs/${jobId}/finish`, { maxCost: cost })
	if (next) close()
}

async function sweatHour(jobId: number) {
	if (sweat < 1) return noSweat(1)
	app?.bounceJob(jobId)
	const next = await act(`jobs/${jobId}/sweat`)
	if (next) {
		const j = next.jobs.find((q) => q.id === jobId)
		say(
			j?.status === "active"
				? `Sweat spent: one hour off. ${fmtLeft(jobLeft(j, app?.now() ?? Date.now()))} left.`
				: "Sweat spent: done!",
		)
	}
}

function onJobAction(jobId: number, action: JobAction, cost: number) {
	if (action === "sweat") void sweatHour(jobId)
	else void finishJob(jobId, cost)
}

/** Coin bubbles tapped: the coins fly to the HUD. The bubbles are already
 * empty on screen; the server's answer is the truth. */
async function collect(keys: string[], from: HTMLElement | null) {
	const pt = from ? centerOf(from) : { x: innerWidth / 2, y: innerHeight / 2 }
	try {
		const next = await api.post<GymLayoutDto>("/gym/layout/income/collect", {
			keys,
		})
		if (destroyed || !app) return
		const got = next.collected ?? 0
		if (got > 0) {
			const n = Math.min(4, Math.max(1, Math.round(got / 25)))
			const each = Math.round(got / n)
			const fl: Promise<void>[] = []
			for (let i = 0; i < n; i++)
				fl.push(
					flyChip(
						"co",
						chipHtml("co", i === 0 ? got - each * (n - 1) : each),
						pt,
						i * 90,
					),
				)
			await Promise.all(fl)
		}
		if (destroyed || !app) return
		app.applyLayout(next)
		setLayout(next)
	} catch (e) {
		say(e instanceof Error ? e.message : "Could not collect", "error")
		try {
			if (app) setLayout(await app.reload())
		} catch {
			// keep what we have
		}
	}
}

function collectAll() {
	app?.collect()
	welcome = null
}

async function unlockItem(key: string) {
	const next = await act(`kitchen/menu/${key}`)
	if (next) {
		const m = KITCHEN_MENU.find((q) => q.key === key)
		say(`${m?.name ?? "New item"} is on the menu!`)
	}
}

async function rushHour() {
	if (greens < ECONOMY.income.kitchen.rush.greens) {
		say("You need a Green for rush hour. Tick a food task in Today.", "error")
		return
	}
	const next = await act("kitchen/rush")
	if (next)
		say(
			`Rush hour! Sales x${ECONOMY.income.kitchen.rush.mult} for ${ECONOMY.income.kitchen.rush.hours}h.`,
		)
}

function onTaskDone(e: Event) {
	const kind = (e as CustomEvent<{ kind?: string }>).detail?.kind ?? "other"
	app?.cheer(kind)
	// Sweat / Greens changed on the server: read the layout again once the
	// reward chips have landed in the HUD
	setTimeout(() => {
		if (destroyed || !app) return
		app
			.reload()
			.then((l) => setLayout(l))
			.catch(() => {})
	}, 1600)
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
		onCollect: (keys, from) => void collect(keys, from),
	})
		.then((a) => {
			if (destroyed) {
				a.dispose()
				return
			}
			app = a
			app.setChipElement(chipEl)
			setLayout(a.layout)
			welcome = a.layout.welcomeBack ?? null
			loading = false
			app.setInsets(insetTop + 8, hidden)
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
				coinsWaiting: () => a.coinsWaiting(),
				coinBubbles: () => a.coinBubbles(),
				collectAll: () => a.collect(),
				kitchen: () => a.kitchenScreen(),
				bubbles: () => a.shownBubbles(),
				say: (key, text) => a.sayTo(key, text),
				pick: (x, y) => a.pickAt(x, y),
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
		waiting = app?.coinsWaiting() ?? 0
	}, 1000)
	window.addEventListener("sp:task-done", onTaskDone)
})

onDestroy(() => {
	destroyed = true
	// a claim ceremony cut short still ends (the claim itself is saved)
	if (app?.claimActive) onClaimDone?.()
	app?.dispose()
	app = null
	if (tipTimer) clearTimeout(tipTimer)
	if (clockTimer) clearInterval(clockTimer)
	if (typeof window !== "undefined")
		window.removeEventListener("sp:task-done", onTaskDone)
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

const kitchenView = $derived.by(() => {
	const k = layout?.kitchen
	if (!k || !app) return null
	void clock
	const now = app.now()
	const rushEnd = k.rushEndsAt ? Date.parse(k.rushEndsAt) : 0
	const rush = rushEnd > now
	const src = layout?.income.find((q) => q.key === "kitchen")
	return {
		k,
		rush,
		rushLeft: rush ? rushEnd - now : 0,
		rate: rush ? k.rate * ECONOMY.income.kitchen.rush.mult : k.rate,
		bank: src
			? bankAt(src, Date.parse(layout?.serverNow ?? "") || now, now)
			: 0,
	}
})
</script>

<div class="g3d" bind:this={host} data-testid="gym3d">
	{#if loading}
		<p class="g3d-loading">Building your gym...</p>
	{/if}
	{#if layout && waiting > 0 && !sheet && !moving}
		<button
			type="button"
			class="g3d-collect"
			style="bottom:{hidden + 12}px"
			onclick={collectAll}
			data-testid="collect-all"
		>
			<span class="ic">{@html COIN_SVG}</span>Collect all <b>{waiting.toLocaleString("en-US")}</b>
		</button>
	{/if}
	{#if moving}
		<div class="g3d-banner" role="status" style="bottom:{hidden + 12}px">
			<span>Tap a glowing spot to move <b>{moving.name}</b>. A filled spot swaps.</span>
			<button type="button" class="g3d-btn" onclick={cancelMove}>Cancel</button>
		</div>
	{/if}
	{#if tip}
		<div
			class="g3d-tip"
			class:err={tip.kind === "error"}
			style="top:{insetTop + 8}px"
			role="status"
			data-testid="gym3d-tip"
		>
			{tip.text}
		</div>
	{/if}
	{#if selection?.kind === "person"}
		{@const info = selection.info}
		<!-- a stat card, not a speech bubble: labeled rows (never body weight) -->
		<div
			class="g3d-chip"
			bind:this={chipEl}
			role="group"
			aria-label="{selection.name}"
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
			{#if info.title || info.mood || info.doing || info.relation}
				<dl class="g3d-stats">
					{#if info.title}
						<div data-testid="gym3d-chip-title"><dt>Role</dt><dd>{info.title}</dd></div>
					{/if}
					{#if info.mood}
						<div data-testid="gym3d-chip-mood"><dt>Mood</dt><dd>{info.mood}</dd></div>
					{/if}
					{#if info.doing}
						<div data-testid="gym3d-chip-doing"><dt>Doing</dt><dd>{info.doing}</dd></div>
					{/if}
					{#if info.relation}
						<div data-testid="gym3d-chip-rel">
							<dt>Bond</dt>
							<dd>
								{info.relation}
								{#if info.bond != null}
									<span class="g3d-bond" aria-hidden="true"><i style="width:{info.bond}%"></i></span>
								{/if}
							</dd>
						</div>
					{/if}
				</dl>
			{/if}
		</div>
	{/if}

	{#if welcome && !loading}
		<div class="g3d-welcome" role="dialog" aria-label="Welcome back" data-testid="welcome-back">
			<h3>Welcome back!</h3>
			<p class="sub">While you were away ({welcome.hours}h), your gym kept busy:</p>
			<ul>
				{#if welcome.members}<li><b>{welcome.members}</b> members came in</li>{/if}
				{#if welcome.sales}<li><b>{welcome.sales}</b> juices sold at the Slim Kitchen</li>{/if}
				{#if welcome.builds}<li><b>{welcome.builds}</b> build{welcome.builds === 1 ? "" : "s"} finished</li>{/if}
			</ul>
			<div class="row">
				<button type="button" class="g3d-btn" onclick={() => (welcome = null)}>Later</button>
				<button type="button" class="g3d-btn primary" onclick={collectAll} data-testid="welcome-collect">
					Collect <span class="cur">{@html COIN_SVG}</span>{welcome.coins.toLocaleString("en-US")}
				</button>
			</div>
		</div>
	{/if}

	{#if sheet}
		<div
			class="g3d-sheet"
			style="bottom:{hidden}px;max-height:calc(72% - {hidden}px)"
			bind:clientHeight={sheetH}
			data-testid="gym3d-sheet"
			data-sheet={sheet}
			role="group"
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
				<p class="hint">Coins pile up by themselves: busy machines, the front desk and the Slim Kitchen fill coin bubbles. Tap them to collect.</p>

			{:else if sheet === "job" && jobView}
				{@const jv = jobView}
				<h3>{jv.j.kind === "plot" ? "Under construction" : "Being upgraded"}</h3>
				<p class="sub">{fmtLeft(jv.left)} left</p>
				<div class="row">
					<button
						type="button"
						class="g3d-btn"
						disabled={busy}
						onclick={() => sweatHour(jv.j.id)}
						data-testid="gym3d-sweat"
					>
						<span class="cur">{@html SWEAT_SVG}</span>1 · −1h
					</button>
					<button
						type="button"
						class="g3d-btn primary"
						disabled={busy}
						onclick={() => finishJob(jv.j.id, jv.cost)}
						data-testid="gym3d-finish"
					>
						Finish now <span class="cur">{@html SWEAT_SVG}</span>{jv.cost}
					</button>
				</div>
				<p class="hint">You have {sweat} Sweat. Every workout task you tick in Today earns more.</p>

			{:else if sheet === "kitchen" && kitchenView}
				{@const kv = kitchenView}
				<h3>Slim Kitchen</h3>
				<p class="sub">Your juice bar. Greens from food tasks grow the menu.</p>
				<div class="kstats">
					<div><small>Sales/h</small><b data-testid="kitchen-rate"><span class="cur">{@html COIN_SVG}</span>{kv.rate}</b></div>
					<div><small>Waiting</small><b>{kv.bank}/{kv.k.cap}</b></div>
					<div><small>Rush hour</small><b>{kv.rush ? fmtLeft(kv.rushLeft) : "Off"}</b></div>
				</div>
				<ul class="menu">
					{#each KITCHEN_MENU as m (m.key)}
						{@const on = kv.k.menu.includes(m.key)}
						<li class:on>
							<span><b>{m.name}</b><small>+{m.rate} coins/h</small></span>
							{#if on}
								<span class="onl">On the menu</span>
							{:else}
								<button
									type="button"
									class="g3d-btn primary"
									disabled={busy || greens < m.cost}
									onclick={() => unlockItem(m.key)}
									data-testid="kitchen-add-{m.key}"
								>
									Add <span class="cur">{@html GREENS_SVG}</span>{m.cost}
								</button>
							{/if}
						</li>
					{/each}
				</ul>
				<div class="row">
					<button
						type="button"
						class="g3d-btn"
						disabled={busy || kv.rush}
						onclick={rushHour}
						data-testid="kitchen-rush"
					>
						{#if kv.rush}Rush hour on{:else}Rush hour <span class="cur">{@html GREENS_SVG}</span>{ECONOMY.income.kitchen.rush.greens} · x{ECONOMY.income.kitchen.rush.mult} for {ECONOMY.income.kitchen.rush.hours}h{/if}
					</button>
					<button
						type="button"
						class="g3d-btn primary"
						disabled={kv.bank < 1}
						onclick={() => app?.collect(["kitchen"])}
						data-testid="kitchen-collect"
					>
						Collect <span class="cur">{@html COIN_SVG}</span>{kv.bank}
					</button>
				</div>
				<p class="hint">You have {greens} Greens. Tick a food task in Today to earn more.</p>

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

			{:else if sheet === "room" && room && roomInfo}
				{@const lp = levelProgress(room.level, room.points)}
				{@const ri = roomInfo}
				<h3>{roomLabel(room.type, room.shape)}</h3>
				<p class="sub">
					<span class="stars">{stars(room.level)}</span> Lv {room.level} · {room.points} points{#if lp.next != null}, {lp.next} for Lv {room.level + 1}{/if}
				</p>
				<div class="bar"><i style="width:{Math.round(lp.k * 100)}%"></i></div>
				<div class="kstats" data-testid="room-info">
					<div><small>Gear</small><b>{ri.gear.length}/{ri.spots.length}</b></div>
					<div><small>Coins/h</small><b><span class="cur">{@html COIN_SVG}</span>{ri.rate}</b></div>
					<div>
						<small>Bonus</small>
						<b class="sm">{ri.nextUnlock != null ? `Spot at Lv ${ri.nextUnlock}` : "All open"}</b>
					</div>
				</div>
				<ul class="rmenu" data-testid="room-menu">
					<li>
						<button type="button" class="rrow" onclick={() => roomPage("gear")} data-testid="room-gear">
							<span class="ric"><Dumbbell size={20} /></span>
							<span class="rtx"
								><b>Upgrade gear</b><small
									>{ri.gear.length} piece{ri.gear.length === 1 ? "" : "s"} · {ri.open.length} free spot{ri.open.length === 1 ? "" : "s"}</small
								></span
							>
							<ChevronRight size={18} />
						</button>
					</li>
					<li>
						<button type="button" class="rrow" onclick={() => roomPage("staff")} data-testid="room-staff">
							<span class="ric"><Users size={20} /></span>
							<span class="rtx"><b>Staff</b><small>Who works here today</small></span>
							<ChevronRight size={18} />
						</button>
					</li>
					<li>
						<button
							type="button"
							class="rrow"
							onclick={() => roomPage("customize")}
							data-testid="room-customize"
						>
							<span class="ric"><Paintbrush size={20} /></span>
							<span class="rtx"><b>Customize</b><small>Paint and decor</small></span>
							<ChevronRight size={18} />
						</button>
					</li>
				</ul>

			{:else if sheet === "room-gear" && room && roomInfo}
				{@const ri = roomInfo}
				<button type="button" class="g3d-back" onclick={() => roomPage()} data-testid="room-back"
					><ChevronLeft size={18} />{roomLabel(room.type, room.shape)}</button
				>
				<h3>Upgrade gear</h3>
				<p class="sub">Every piece scores its tier. Upgrade gear to level the room up and open bonus spots.</p>
				<ul class="gear" data-testid="room-gear-list">
					{#each ri.gear as p (p.id)}
						{@const u = upgradeInfo(p.itemKey, p.tier)}
						<li>
							<span><b>{p.name}</b> <span class="stars">{stars(p.tier)}</span></span>
							{#if p.status === "upgrading"}
								<button type="button" class="g3d-btn" onclick={() => openPiece(p)}>Upgrading</button>
							{:else if u}
								<button
									type="button"
									class="g3d-btn primary"
									onclick={() => openPiece(p)}
									data-testid="room-gear-piece"
								>
									Tier {u.toTier} <span class="g3d-coin"></span>{u.cost}
								</button>
							{:else}
								<span class="max">Top tier</span>
							{/if}
						</li>
					{/each}
					{#each ri.open as q (q.index)}
						<li>
							<span><b>Empty spot</b> <small>{q.size} × {q.size}</small></span>
							<button
								type="button"
								class="g3d-btn"
								onclick={() =>
									app?.select({
										kind: "spot",
										roomId: room.id,
										spot: q.index,
										size: q.size,
										unlock: q.unlock,
										open: true,
									})}>Fill</button
							>
						</li>
					{/each}
					{#each ri.locked as q (q.index)}
						<li class="locked">
							<span><b>Bonus spot</b> <small>{q.size} × {q.size}</small></span>
							<small>Opens at Lv {q.unlock}</small>
						</li>
					{/each}
				</ul>

			{:else if sheet === "room-staff" && room && roomInfo}
				{@const ri = roomInfo}
				<button type="button" class="g3d-back" onclick={() => roomPage()} data-testid="room-back"
					><ChevronLeft size={18} />{roomLabel(room.type, room.shape)}</button
				>
				<h3>Staff</h3>
				<ul class="gear" data-testid="room-staff-list">
					{#each roomStaff as w (w.key)}
						<li>
							<span><b>{w.name}</b> <small>{w.title}</small></span>
							<button type="button" class="g3d-btn" onclick={() => app?.selectPerson(w.key)}>Say hi</button>
						</li>
					{/each}
					{#each ri.staffGear as p (p.id)}
						<li>
							<span><b>{p.name}</b> <span class="stars">{stars(p.tier)}</span></span>
							<button type="button" class="g3d-btn" onclick={() => openPiece(p)}>Open</button>
						</li>
					{/each}
					<li class="locked">
						<span><b>Hire staff</b></span>
						<small>Coming soon</small>
					</li>
				</ul>
				{#if !roomStaff.length && !ri.staffGear.length}
					<p class="hint">Nobody works here right now. Trainers and instructors drop by for classes.</p>
				{/if}

			{:else if sheet === "paint" && room}
				<button type="button" class="g3d-back" onclick={() => roomPage()} data-testid="room-back"
					><ChevronLeft size={18} />{roomLabel(room.type, room.shape)}</button
				>
				<h3>Customize</h3>
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

				<p class="lbl">Decor</p>
				{#if roomInfo?.decor.length}
					<ul class="gear">
						{#each roomInfo.decor as p (p.id)}
							<li><span><b>{p.name}</b></span></li>
						{/each}
					</ul>
				{:else}
					<p class="hint" data-testid="room-decor-none">Decor you unlock with gym XP goes up in the lobby for now. Room decor is coming.</p>
				{/if}

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
							class="g3d-btn"
							disabled={busy}
							onclick={() => sweatHour(jv.j.id)}
							data-testid="gym3d-sweat"
						>
							<span class="cur">{@html SWEAT_SVG}</span>1 · −1h
						</button>
						<button
							type="button"
							class="g3d-btn primary"
							disabled={busy}
							onclick={() => finishJob(jv.j.id, jv.cost)}
							data-testid="gym3d-finish"
						>
							Finish now <span class="cur">{@html SWEAT_SVG}</span>{jv.cost}
						</button>
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
	overflow: hidden;
	/* clip: a focused label must not scroll the gym sideways */
	overflow: clip;
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

.g3d .cur {
	display: inline-flex;
	vertical-align: -0.2em;
	margin: 0 2px;
}

.g3d .cur :global(svg) {
	width: 1.1em;
	height: 1.1em;
}

.g3d-collect {
	position: absolute;
	left: 12px;
	z-index: 6;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 7px 14px 7px 8px;
	border: 2px solid var(--ink);
	border-radius: 999px;
	background: #fff7ea;
	box-shadow: 0 3px 0 var(--ink);
	color: var(--ink);
	font: 800 14px system-ui, sans-serif;
	cursor: pointer;
	animation: g3d-in 0.25s ease-out;
}

.g3d-collect .ic :global(svg) {
	display: block;
	width: 22px;
	height: 22px;
}

.g3d-collect b {
	font-variant-numeric: tabular-nums;
}

.g3d-welcome {
	position: absolute;
	left: 50%;
	top: 46%;
	transform: translate(-50%, -50%);
	z-index: 8;
	width: min(330px, calc(100% - 32px));
	box-sizing: border-box;
	padding: 18px 18px 16px;
	border: 2px solid var(--ink);
	border-radius: 20px;
	background: #fff7ea;
	box-shadow: 0 5px 0 var(--ink);
	animation: g3d-in 0.3s ease-out;
}

.g3d-welcome h3 {
	margin: 0 0 4px;
	font-size: 22px;
}

.g3d-welcome ul {
	margin: 10px 0 14px;
	padding-left: 18px;
	font-weight: 600;
	font-size: 14px;
	line-height: 1.6;
}

.kstats {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 6px;
	margin: 8px 0;
}

.kstats div {
	padding: 7px 8px;
	border-radius: 12px;
	background: #fdf1e0;
	text-align: center;
}

.kstats small {
	display: block;
	font-size: 11px;
	font-weight: 700;
	opacity: 0.7;
}

.kstats b {
	font-size: 16px;
}

.menu {
	list-style: none;
	margin: 0 0 10px;
	padding: 0;
	display: grid;
	gap: 6px;
}

.menu li {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 6px 6px 6px 10px;
	border-radius: 12px;
	border: 1.5px dashed #d9c3a6;
}

.menu li.on {
	border-style: solid;
	border-color: #7ac943;
	background: #f1fbe9;
}

.menu li > span:first-child {
	display: flex;
	flex-direction: column;
}

.menu small {
	font-size: 12px;
	opacity: 0.75;
}

.menu .onl {
	font-size: 12px;
	font-weight: 800;
	color: #3f7c44;
	padding-right: 6px;
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
	left: 70px;
	max-width: calc(100% - 140px);
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
	gap: 5px;
	width: max-content;
	min-width: 178px;
	max-width: min(260px, calc(100vw - 32px));
	padding: 7px 8px 8px 11px;
	border: 2px solid var(--ink);
	border-radius: 10px;
	background: #fff;
	box-shadow: 0 3px 0 var(--ink);
	font-weight: 800;
	font-size: 13px;
	will-change: transform;
	box-sizing: border-box;
	animation: g3d-card-in 0.16s ease-out;
}

/* a card, not a bubble: a coloured header strip, and a small pointer
   down to the person (hidden when the card cannot sit right over them) */
.g3d-chip::after {
	content: "";
	position: absolute;
	left: calc(var(--tx, 50%) - 6px);
	bottom: -7px;
	width: 10px;
	height: 10px;
	background: #fff;
	border-right: 2px solid var(--ink);
	border-bottom: 2px solid var(--ink);
	transform: rotate(45deg);
}

.g3d-chip:global(.pin)::after {
	display: none;
}

.g3d-chip::before {
	content: "";
	position: absolute;
	left: -2px;
	right: -2px;
	top: -2px;
	height: 5px;
	border-radius: 10px 10px 0 0;
	background: #3aa89a;
	border: 2px solid var(--ink);
	border-bottom: 0;
}

@keyframes g3d-card-in {
	from {
		opacity: 0;
	}
}

.g3d-chip-head {
	display: flex;
	align-items: center;
	gap: 8px;
	padding-top: 2px;
}

.g3d-chip-name {
	padding-right: 2px;
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 14px;
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

.g3d-stats {
	display: grid;
	grid-template-columns: auto 1fr;
	column-gap: 9px;
	row-gap: 3px;
	margin: 0;
	padding-top: 5px;
	border-top: 1.5px dashed #d9cbbd;
}

.g3d-stats > div {
	display: contents;
}

.g3d-stats dt {
	font-size: 10px;
	font-weight: 800;
	color: #8a7a70;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	line-height: 17px;
}

.g3d-stats dd {
	margin: 0;
	min-width: 0;
	font-size: 12px;
	font-weight: 700;
	color: #23262e;
	line-height: 17px;
	overflow-wrap: anywhere;
}

[data-testid="gym3d-chip-rel"] dd {
	color: #c8323a;
}

.g3d-bond {
	display: block;
	height: 5px;
	margin: 1px 0 2px;
	border-radius: 3px;
	background: #f6dcdc;
	overflow: hidden;
}

.g3d-bond i {
	display: block;
	height: 100%;
	background: #e0525a;
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

.gear small {
	font-size: 11px;
	opacity: 0.7;
}

.kstats b.sm {
	font-size: 13px;
}

/* the room action menu: one row per page */
.rmenu {
	list-style: none;
	margin: 6px 0 0;
	padding: 0;
	display: grid;
	gap: 6px;
}

.rrow {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	min-height: 52px;
	padding: 6px 10px;
	border: 2px solid var(--ink);
	border-radius: 12px;
	background: #fff;
	box-shadow: 0 3px 0 var(--ink);
	color: var(--ink);
	font: inherit;
	text-align: left;
	cursor: pointer;
}

.rrow:active {
	transform: translateY(2px);
	box-shadow: 0 1px 0 var(--ink);
}

.ric {
	display: grid;
	place-items: center;
	flex: none;
	width: 34px;
	height: 34px;
	border-radius: 10px;
	background: #fdf1e0;
	color: #e8743b;
}

.rtx {
	display: flex;
	flex-direction: column;
	flex: 1;
	min-width: 0;
}

.rtx b {
	font-size: 14px;
	font-weight: 800;
}

.rtx small {
	font-size: 12px;
	opacity: 0.7;
}

.g3d-back {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	min-height: 32px;
	margin: -4px 0 2px -6px;
	padding: 0 6px;
	border: none;
	background: none;
	color: #e8743b;
	font: inherit;
	font-size: 13px;
	font-weight: 800;
	cursor: pointer;
}

/* a quick squash on a tapped DOM label (room badge, coin bubble) */
.g3d :global(.g3d-tapped) {
	animation: g3d-tapped 0.32s ease-out;
}

@keyframes g3d-tapped {
	0% {
		scale: 1;
	}
	30% {
		scale: 1.12 0.86;
	}
	60% {
		scale: 0.95 1.06;
	}
	100% {
		scale: 1;
	}
}

@media (prefers-reduced-motion: reduce) {
	.g3d :global(.g3d-tapped) {
		animation: none;
	}
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
	/* --tx: the tail follows its anchor (world/labels.ts) */
	left: var(--tx, 50%);
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
	background: #e3f1ff;
}

.g3d :global(.g3d-bb button) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 3px;
}

.g3d :global(.g3d-bb svg) {
	width: 15px;
	height: 15px;
	flex: none;
}

/* coin bubbles (idle income): a tappable coin + count over the source */
.g3d :global(.g3d-cb) {
	display: flex;
	align-items: center;
	gap: 3px;
	min-width: 44px;
	min-height: 34px;
	padding: 3px 9px 3px 4px;
	border: 2px solid var(--ink);
	border-radius: 999px;
	background: #fff7ea;
	box-shadow: 0 2px 0 var(--ink);
	color: var(--ink);
	font: 800 13px system-ui, sans-serif;
	font-variant-numeric: tabular-nums;
	cursor: pointer;
	/* over speech bubbles: coins are what the player taps */
	z-index: 4;
}

/* the coin bobs inside a still bubble (the layout keeps the box put) */
.g3d :global(.g3d-cb svg) {
	width: 22px;
	height: 22px;
	flex: none;
	animation: g3d-float 2.4s ease-in-out infinite;
}

.g3d :global(.g3d-cb.full) {
	background: #ffe07a;
}

.g3d :global(.g3d-cb-kitchen) {
	background: #eaf8dd;
}

@keyframes g3d-float {
	50% {
		translate: 0 -3px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.g3d :global(.g3d-cb svg) {
		animation: none;
	}
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
	/* a short tap pops it; a drag pans (app.ts) */
	pointer-events: auto;
	cursor: pointer;
	contain: layout;
}

.g3d :global(.g3d-say::after) {
	content: "";
	position: absolute;
	left: calc(var(--tx, 50%) - 5px);
	bottom: -7px;
	width: 8px;
	height: 8px;
	background: #fffdf7;
	border-right: 2px solid var(--ink);
	border-bottom: 2px solid var(--ink);
	transform: rotate(45deg);
}

.g3d :global(.g3d-say.pin::after) {
	display: none;
}

/* ambient (the crowd): a thought, not a line said to the player */
.g3d :global(.g3d-say.amb) {
	border-style: dashed;
	border-radius: 16px;
	background: #f4f1ff;
	color: #4a4560;
	font-style: italic;
	font-weight: 500;
	box-shadow: none;
}

.g3d :global(.g3d-say.amb::after) {
	left: calc(var(--tx, 50%) - 4px);
	bottom: -9px;
	width: 7px;
	height: 7px;
	border: 2px solid var(--ink);
	border-radius: 50%;
	background: #f4f1ff;
	transform: none;
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

/* banners wrap rather than run off a phone screen (the bubble layout
 * keeps them inside it) */
.g3d :global(.g3d-evt),
.g3d :global(.g3d-class) {
	white-space: normal;
	max-width: min(260px, calc(100vw - 32px));
	text-align: center;
	line-height: 1.25;
	border-radius: 14px;
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
