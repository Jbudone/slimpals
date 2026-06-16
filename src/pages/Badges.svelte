<script lang="ts">
import { onMount } from "svelte"
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

const TIER_EMOJI: Record<BadgeTier, string> = {
	bronze: "🥉",
	silver: "🥈",
	gold: "🥇",
	platinum: "💎",
}

const TIER_ORDER: BadgeTier[] = ["platinum", "gold", "silver", "bronze"]

let catalog = $state<CatalogBadge[]>([])
let earned = $state<EarnedBadge[]>([])
let loading = $state(true)
let error = $state<string | null>(null)

const earnedKeys = $derived(new Set(earned.map((b) => b.key)))

const byTier = $derived(
	TIER_ORDER.map((tier) => ({
		tier,
		badges: catalog.filter((b) => b.tier === tier),
	})).filter((g) => g.badges.length > 0),
)

function earnedAt(key: string): string | null {
	const b = earned.find((e) => e.key === key)
	if (!b) return null
	return new Date(b.earnedAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
}

async function load() {
	try {
		;[catalog, earned] = await Promise.all([
			api.get<CatalogBadge[]>("/badges"),
			api.get<EarnedBadge[]>("/badges/mine"),
		])
	} catch {
		error = "Failed to load badges"
	} finally {
		loading = false
	}
}

onMount(load)
</script>

<div class="badges-page">
	<h1>Badge Collection</h1>
	<p class="subtitle">
		{#if !loading}
			{earned.length} / {catalog.length} earned
		{/if}
	</p>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else}
		{#each byTier as group (group.tier)}
			<section class="tier-section">
				<h2 class="tier-heading">
					{TIER_EMOJI[group.tier]}
					{group.tier.charAt(0).toUpperCase() + group.tier.slice(1)}
				</h2>
				<div class="badge-grid">
					{#each group.badges as badge (badge.key)}
						{@const isEarned = earnedKeys.has(badge.key)}
						{@const date = earnedAt(badge.key)}
						<div class="badge-card" class:earned={isEarned} class:locked={!isEarned}>
							<div class="badge-icon" class:tier-{badge.tier}={true}>
								{TIER_EMOJI[badge.tier]}
							</div>
							<div class="badge-body">
								<div class="badge-name">{badge.name}</div>
								{#if badge.description}
									<div class="badge-desc">{badge.description}</div>
								{/if}
								{#if isEarned && date}
									<div class="earned-date">Earned {date}</div>
								{/if}
							</div>
							{#if !isEarned}
								<div class="lock-icon">🔒</div>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>

<style>
.badges-page {
	max-width: 760px;
	margin: 0 auto;
	padding: 2rem 1.5rem;
	display: flex;
	flex-direction: column;
	gap: 2rem;
}

h1 {
	font-size: 1.5rem;
	font-weight: 700;
	color: var(--color-text);
	margin: 0;
}

.subtitle {
	font-size: 0.875rem;
	color: var(--color-text-muted);
	margin: -1.25rem 0 0;
}

.muted {
	color: var(--color-text-muted);
	font-size: 0.875rem;
}

.error {
	background: color-mix(in srgb, var(--color-danger) 15%, transparent);
	border: 1px solid var(--color-danger);
	color: var(--color-danger);
	border-radius: 0.375rem;
	padding: 0.625rem 0.875rem;
	font-size: 0.875rem;
	margin: 0;
}

.tier-section {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.tier-heading {
	font-size: 1rem;
	font-weight: 700;
	color: var(--color-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.06em;
	font-size: 0.8125rem;
	margin: 0;
}

.badge-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 0.75rem;
}

.badge-card {
	display: flex;
	align-items: flex-start;
	gap: 0.75rem;
	padding: 0.875rem 1rem;
	border-radius: 0.625rem;
	border: 1px solid var(--color-border);
	background: var(--color-surface);
	position: relative;
	transition: box-shadow 0.15s;
}

.badge-card.earned {
	border-color: var(--color-accent);
	background: color-mix(in srgb, var(--color-accent) 6%, var(--color-surface));
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

.badge-card.locked {
	opacity: 0.5;
}

.badge-icon {
	font-size: 1.75rem;
	line-height: 1;
	flex-shrink: 0;
}

.badge-body {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
}

.badge-name {
	font-size: 0.9375rem;
	font-weight: 600;
	color: var(--color-text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.badge-desc {
	font-size: 0.75rem;
	color: var(--color-text-muted);
	line-height: 1.4;
}

.earned-date {
	font-size: 0.6875rem;
	color: var(--color-accent);
	font-weight: 600;
	margin-top: 0.125rem;
}

.lock-icon {
	font-size: 0.875rem;
	flex-shrink: 0;
	opacity: 0.6;
}
</style>
