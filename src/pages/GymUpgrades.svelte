<script lang="ts">
import { Dumbbell } from "@lucide/svelte"
import { onMount } from "svelte"
import Avatar from "../components/ui/Avatar.svelte"
import Button from "../components/ui/Button.svelte"
import Card from "../components/ui/Card.svelte"
import Pill from "../components/ui/Pill.svelte"
import ProgressBar from "../components/ui/ProgressBar.svelte"
import { api } from "../lib/api.js"
import { page } from "../router.svelte.js"

type UpgradeItem = {
	key: string
	name: string
	description: string | null
	category: string
	sortOrder: number
	requiredXp?: number
	unlockedAt?: string
}

type GymResponse = {
	gym: { id: number; name: string; level: number; xp: number }
	upgrades: {
		unlocked: UpgradeItem[]
		pending: UpgradeItem[]
		locked: UpgradeItem[]
	}
	xpToNextLevel: number
}

let gymData = $state<GymResponse | null>(null)
let loading = $state(true)
let error = $state<string | null>(null)
let claiming = $state<string | null>(null)

// Mirrors the pure computeLevel(xp) formula in
// server/services/gym/index.ts (level = floor(sqrt(xp / 50))) — safe to
// duplicate since it's simple display math, not business/award logic.
function computeLevel(xp: number): number {
	return Math.floor(Math.sqrt(xp / 50))
}

function levelFloorXp(level: number): number {
	return level * level * 50
}

let levelProgress = $derived.by(() => {
	if (!gymData) return { current: 0, span: 1 }
	const level = gymData.gym.level
	const floor = levelFloorXp(level)
	const ceil = levelFloorXp(level + 1)
	return { current: gymData.gym.xp - floor, span: Math.max(1, ceil - floor) }
})

// The cheapest still-locked item is "the next thing you'll reach" —
// real data, not a fabricated tie to the exact next level.
let nextUnlock = $derived.by(() => {
	if (!gymData || gymData.upgrades.locked.length === 0) return null
	return [...gymData.upgrades.locked].sort(
		(a, b) => (a.requiredXp ?? 0) - (b.requiredXp ?? 0),
	)[0]
})

type Row = UpgradeItem & { state: "unlocked" | "pending" | "locked" }

let rows = $derived.by<Row[]>(() => {
	if (!gymData) return []
	const { unlocked, pending, locked } = gymData.upgrades
	return [
		...unlocked.map((u) => ({ ...u, state: "unlocked" as const })),
		...pending.map((u) => ({ ...u, state: "pending" as const })),
		...locked.map((u) => ({ ...u, state: "locked" as const })),
	].sort((a, b) => a.sortOrder - b.sortOrder)
})

async function loadGym() {
	try {
		gymData = await api.get<GymResponse>("/gym")
	} catch {
		error = "Failed to load gym"
	} finally {
		loading = false
	}
}

async function claim(key: string) {
	if (claiming) return
	claiming = key
	try {
		gymData = await api.post<GymResponse>("/gym/claim-upgrade", { key })
	} catch {
		error = "Failed to claim upgrade"
	} finally {
		claiming = null
	}
}

onMount(loadGym)
</script>

<div class="gym-upgrades-tab">
	{#if loading}
		<p class="muted">Loading…</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else if gymData}
		<Card>
			<div class="summary-row">
				<Avatar tone="accent" size={40}>
					{#snippet icon()}
						<Dumbbell size={20} />
					{/snippet}
				</Avatar>
				<div class="summary-copy">
					<span class="summary-title">Your gym · level {gymData.gym.level}</span>
					<span class="summary-sub">{gymData.gym.xp} XP total</span>
				</div>
			</div>

			<ProgressBar variant="linear" value={levelProgress.current} max={levelProgress.span} />

			<p class="next-level-note">
				{gymData.xpToNextLevel} XP to level {gymData.gym.level + 1}
				{#if nextUnlock}
					— unlocks {nextUnlock.name}
				{/if}
			</p>
		</Card>

		<Card padding="md">
			<div class="visit-row">
				<div class="visit-copy">
					<span class="visit-title">Visit your gym</span>
					<span class="visit-sub">See your gym come to life — NPCs, equipment, and more</span>
				</div>
				<Button onclick={() => page("/gym/canvas")}>Visit</Button>
			</div>
		</Card>

		{#each rows as row (row.key)}
			<Card padding="md">
				<div class="upgrade-row">
					<div class="upgrade-copy">
						<span class="upgrade-name">{row.name}</span>
						{#if row.state === "locked"}
							<span class="upgrade-sub">Needs level {computeLevel(row.requiredXp ?? 0)}</span>
						{:else if row.description}
							<span class="upgrade-sub">
								{row.description}
								{#if row.state === "pending"}
									· {row.requiredXp} XP
								{/if}
							</span>
						{/if}
					</div>

					{#if row.state === "unlocked"}
						<Pill>Claimed</Pill>
					{:else if row.state === "pending"}
						<Button onclick={() => claim(row.key)} disabled={claiming === row.key}>
							{claiming === row.key ? "Claiming…" : "Claim"}
						</Button>
					{:else}
						<Pill>Locked</Pill>
					{/if}
				</div>
			</Card>
		{/each}
	{/if}
</div>

<style>
.gym-upgrades-tab {
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
}

.muted { color: var(--color-text-muted); font-size: var(--font-size-sm); }

.error {
	background: color-mix(in srgb, var(--color-danger) 15%, transparent);
	border: 1px solid var(--color-danger);
	color: var(--color-danger);
	border-radius: var(--radius-sm);
	padding: 0.625rem 0.875rem;
	font-size: var(--font-size-sm);
	margin: 0;
}

.summary-row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	margin-bottom: var(--space-3);
}

.summary-copy {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
}

.summary-title {
	font-family: var(--font-display);
	font-size: var(--font-size-lg);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.summary-sub { font-size: var(--font-size-sm); color: var(--color-text-muted); }

.next-level-note {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
	margin: var(--space-3) 0 0;
}

.visit-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-3);
}

.visit-copy {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
	min-width: 0;
}

.visit-title {
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.visit-sub {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
}

.upgrade-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-3);
}

.upgrade-copy {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
	min-width: 0;
}

.upgrade-name {
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.upgrade-sub { font-size: var(--font-size-sm); color: var(--color-text-muted); }
</style>
