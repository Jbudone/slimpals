<script lang="ts">
import { onMount } from "svelte"
import Avatar from "../components/ui/Avatar.svelte"
import Card from "../components/ui/Card.svelte"
import Pill from "../components/ui/Pill.svelte"
import ProgressBar from "../components/ui/ProgressBar.svelte"
import { api } from "../lib/api.js"

type BadgeTier = "bronze" | "silver" | "gold" | "platinum"

type CatalogBadge = {
	id: number
	key: string
	name: string
	description: string | null
	tier: BadgeTier
}

type EarnedBadge = CatalogBadge & { earnedAt: string }

type ProgressEntry = {
	key: string
	name: string
	tier: BadgeTier
	current: number
	target: number
	unit: string
}

const TIER_EMOJI: Record<BadgeTier, string> = {
	bronze: "🥉",
	silver: "🥈",
	gold: "🥇",
	platinum: "💎",
}

const TIER_ORDER: BadgeTier[] = ["platinum", "gold", "silver", "bronze"]
const CLOSEST_COUNT = 3

let catalog = $state<CatalogBadge[]>([])
let earned = $state<EarnedBadge[]>([])
let progress = $state<ProgressEntry[]>([])
let loading = $state(true)
let error = $state<string | null>(null)

let tierBreakdown = $derived(
	TIER_ORDER.map((tier) => ({
		tier,
		earnedCount: earned.filter((b) => b.tier === tier).length,
		totalCount: catalog.filter((b) => b.tier === tier).length,
	})).filter((t) => t.totalCount > 0),
)

let closest = $derived(progress.slice(0, CLOSEST_COUNT))

function formatAmount(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

async function load() {
	try {
		;[catalog, earned, progress] = await Promise.all([
			api.get<CatalogBadge[]>("/badges"),
			api.get<EarnedBadge[]>("/badges/mine"),
			api.get<ProgressEntry[]>("/badges/progress"),
		])
	} catch {
		error = "Failed to load badges"
	} finally {
		loading = false
	}
}

onMount(load)
</script>

<div class="badges-tab">
	{#if loading}
		<p class="muted">Loading…</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else}
		<Card>
			<div class="earned-stat-row">
				<span class="earned-stat">{earned.length}</span>
				<span class="earned-stat-sub">of {catalog.length} earned</span>
			</div>
			<ProgressBar variant="linear" value={earned.length} max={Math.max(1, catalog.length)} />
			<p class="tier-breakdown">
				{#each tierBreakdown as t, i (t.tier)}
					{i > 0 ? " · " : ""}{t.earnedCount}/{t.totalCount} {t.tier}
				{/each}
			</p>
		</Card>

		{#if closest.length > 0}
			<h2 class="section-label">Closest to Unlocking</h2>
			{#each closest as p (p.key)}
				<Card padding="md">
					<div class="closest-row">
						<Avatar tone="accent" size={40}>
							{#snippet icon()}
								<span class="tier-icon">{TIER_EMOJI[p.tier]}</span>
							{/snippet}
						</Avatar>
						<div class="closest-copy">
							<span class="closest-title">{p.name}</span>
							<span class="closest-sub">{formatAmount(p.current)} of {p.target} {p.unit}</span>
							<ProgressBar variant="linear" value={p.current} max={p.target} />
						</div>
					</div>
				</Card>
			{/each}
		{/if}

		{#if earned.length > 0}
			<h2 class="section-label">Earned</h2>
			<div class="earned-grid">
				{#each earned as badge (badge.key)}
					<Pill tone="accent">{TIER_EMOJI[badge.tier]} {badge.name}</Pill>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
.badges-tab {
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

.earned-stat-row {
	display: flex;
	align-items: baseline;
	gap: var(--space-2);
	margin-bottom: var(--space-2);
}

.earned-stat {
	font-family: var(--font-display);
	font-size: var(--font-size-2xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.earned-stat-sub { font-size: var(--font-size-sm); color: var(--color-text-muted); }

.tier-breakdown {
	font-size: var(--font-size-sm);
	color: var(--color-text);
	font-weight: var(--font-weight-semibold);
	margin: var(--space-3) 0 0;
}

.section-label {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	margin: 0;
}

.closest-row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
}

.tier-icon { font-size: 1.125rem; line-height: 1; }

.closest-copy {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
	flex: 1;
	min-width: 0;
}

.closest-title {
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.closest-sub { font-size: var(--font-size-sm); color: var(--color-text-muted); }

.earned-grid {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
}
</style>
