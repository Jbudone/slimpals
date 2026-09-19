<script lang="ts">
import { onMount } from "svelte"
import Avatar from "../components/ui/Avatar.svelte"
import Card from "../components/ui/Card.svelte"
import Pill from "../components/ui/Pill.svelte"
import { api } from "../lib/api.js"
import { showBadgeToast } from "../lib/toast.svelte.js"
import { page } from "../router.svelte.js"

type NewBadge = { key: string; name: string; tier: string; earnedAt: string }

const EMOJIS = ["❤️", "😂", "💪", "🔥", "😭"] as const
type Emoji = (typeof EMOJIS)[number]

// Real emoji reactions stay exactly as-is (PRD decision #4) — these are just
// short display labels for the new icon+label chip style. The mockup's
// "Nice/Ha/Beast" wording was shorthand for a 3-reaction example, not a
// scope change to fewer/renamed reaction types.
const EMOJI_LABELS: Record<Emoji, string> = {
	"❤️": "Love",
	"😂": "Haha",
	"💪": "Strong",
	"🔥": "Fire",
	"😭": "Cry",
}

type ReactionState = { count: number; userReacted: boolean }
type Reactions = Record<Emoji, ReactionState>

type PostType =
	| "food_photo"
	| "weight_update"
	| "milestone"
	| "ai_message"
	| "challenge_completion"

const TYPE_LABELS: Record<PostType, string> = {
	weight_update: "Weight update",
	food_photo: "Meal",
	milestone: "Badge earned",
	ai_message: "Coach",
	challenge_completion: "Challenge",
}

type FeedPost = {
	id: number
	userId: string
	userName: string
	type: PostType
	content: Record<string, unknown>
	createdAt: string
	reactions: Reactions
}

type EarnedBadge = {
	id: number
	userBadgeId: number
	key: string
	name: string
	tier: string
}

let posts = $state<FeedPost[]>([])
let loading = $state(true)
let error = $state<string | null>(null)
let reacting = $state<Set<number>>(new Set())

let showBragPicker = $state(false)
let earnedBadges = $state<EarnedBadge[]>([])
let bragging = $state<number | null>(null)

async function loadFeed() {
	try {
		posts = await api.get<FeedPost[]>("/social/feed")
	} catch {
		error = "Failed to load feed"
	} finally {
		loading = false
	}
}

async function react(postId: number, emoji: Emoji) {
	if (reacting.has(postId)) return
	reacting = new Set([...reacting, postId])

	// Optimistic update
	posts = posts.map((p) => {
		if (p.id !== postId) return p
		const prev = p.reactions[emoji]
		return {
			...p,
			reactions: {
				...p.reactions,
				[emoji]: {
					count: prev.userReacted ? prev.count - 1 : prev.count + 1,
					userReacted: !prev.userReacted,
				},
			},
		}
	})

	try {
		const res = await api.post<{ reactions: Reactions; newBadges: NewBadge[] }>(
			"/social/react",
			{ postId, emoji },
		)
		posts = posts.map((p) =>
			p.id === postId ? { ...p, reactions: res.reactions } : p,
		)
		if (res.newBadges?.length) {
			for (const b of res.newBadges) showBadgeToast(b)
		}
	} catch {
		// Revert optimistic update on failure
		await loadFeed()
	} finally {
		reacting = new Set([...reacting].filter((id) => id !== postId))
	}
}

async function openBragPicker() {
	showBragPicker = !showBragPicker
	if (showBragPicker && earnedBadges.length === 0) {
		try {
			earnedBadges = await api.get<EarnedBadge[]>("/badges/mine")
		} catch {
			// ignore — picker just stays empty
		}
	}
}

async function brag(badge: EarnedBadge) {
	if (bragging) return
	bragging = badge.userBadgeId
	try {
		await api.post("/social/share", {
			source_type: "badge",
			source_id: badge.userBadgeId,
		})
		showBragPicker = false
		await loadFeed()
	} finally {
		bragging = null
	}
}

function initials(name: string) {
	return name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2)
}

function timeAgo(iso: string) {
	const diff = Date.now() - new Date(iso).getTime()
	const mins = Math.floor(diff / 60_000)
	if (mins < 1) return "just now"
	if (mins < 60) return `${mins}m ago`
	const hrs = Math.floor(mins / 60)
	if (hrs < 24) return `${hrs}h ago`
	return `${Math.floor(hrs / 24)}d ago`
}

onMount(loadFeed)
</script>

<div class="social-page">
	<h1>The pals</h1>

	<div class="composer-row">
		<button class="composer-btn" type="button" onclick={() => page("/weight")}>
			Weigh-in
		</button>
		<button class="composer-btn" type="button" onclick={() => page("/food")}>
			Meal photo
		</button>
		<button class="composer-btn" type="button" onclick={openBragPicker}>
			Brag
		</button>
	</div>

	{#if showBragPicker}
		<Card padding="md">
			{#if earnedBadges.length === 0}
				<p class="muted">No badges earned yet — go earn one to brag about!</p>
			{:else}
				<div class="brag-list">
					{#each earnedBadges as badge (badge.userBadgeId)}
						<button
							class="brag-item"
							type="button"
							disabled={bragging === badge.userBadgeId}
							onclick={() => brag(badge)}
						>
							<span>{badge.name}</span>
							<span class="brag-action">
								{bragging === badge.userBadgeId ? "Sharing…" : "Share"}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</Card>
	{/if}

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else if posts.length === 0}
		<Card padding="md">
			<p class="muted">No activity yet. Log your weight or a meal to get things started!</p>
		</Card>
	{:else}
		<div class="feed">
			{#each posts as post (post.id)}
				<Card padding="md">
					<div class="post-header">
						<Avatar tone="accent" initials={initials(post.userName)} />
						<div class="meta">
							<span class="user-name">{post.userName}</span>
							<span class="timestamp">{TYPE_LABELS[post.type]} · {timeAgo(post.createdAt)}</span>
						</div>
					</div>

					<div class="post-content">
						{#if post.type === "weight_update"}
							<p class="content-line">
								Logged <strong>{post.content.weightKg} kg</strong>
								{#if post.content.note}<span class="note"> — {post.content.note}</span>{/if}
							</p>
						{:else if post.type === "food_photo"}
							{#if post.content.photoUrl}
								<img
									src={String(post.content.photoUrl)}
									alt={String(post.content.foodName ?? "meal")}
									class="food-thumb"
								/>
							{/if}
							<p class="content-line">
								<strong>{post.content.foodName ?? "Meal"}</strong>
								{#if post.content.macros}
									<span class="macros">
										· {(post.content.macros as Record<string, number>).calories} kcal
									</span>
								{/if}
							</p>
						{:else if post.type === "milestone"}
							<p class="content-line milestone-text">
								{#if post.content.badgeName}
									🏆 Earned badge: <strong>{post.content.badgeName}</strong>
								{:else}
									🏆 {post.content.text}
								{/if}
							</p>
						{:else if post.type === "ai_message"}
							<p class="content-line ai-text">"{post.content.message}"</p>
						{:else if post.type === "challenge_completion"}
							<p class="content-line">
								✅ Completed challenge: <strong>{post.content.challengeName}</strong>
							</p>
						{/if}
					</div>

					<div class="reaction-bar">
						{#each EMOJIS as emoji}
							{@const state = post.reactions[emoji]}
							<button
								type="button"
								onclick={() => react(post.id, emoji)}
								disabled={reacting.has(post.id)}
								aria-label="{EMOJI_LABELS[emoji]} {state.count}"
							>
								<Pill active={state.userReacted}>
									{emoji} {EMOJI_LABELS[emoji]}
									{#if state.count > 0}
										{state.count}
									{/if}
								</Pill>
							</button>
						{/each}
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>

<style>
.social-page {
	max-width: 480px;
	margin: 0 auto;
	padding: var(--space-8) var(--space-6);
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
}

h1 {
	font-family: var(--font-display);
	font-size: var(--font-size-xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
	margin: 0;
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

.composer-row {
	display: flex;
	gap: var(--space-2);
}

.composer-btn {
	flex: 1;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-full);
	padding: var(--space-3) var(--space-2);
	color: var(--color-text);
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	cursor: pointer;
}

.composer-btn:hover {
	border-color: var(--color-accent);
	color: var(--color-accent);
}

.brag-list {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
}

.brag-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-3);
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	padding: var(--space-2) var(--space-3);
	color: var(--color-text);
	font-size: var(--font-size-sm);
	cursor: pointer;
}

.brag-item:hover:not(:disabled) {
	border-color: var(--color-accent);
}

.brag-item:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.brag-action {
	color: var(--color-accent);
	font-weight: var(--font-weight-semibold);
}

.feed {
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
}

.post-header {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	margin-bottom: var(--space-3);
}

.meta {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
	min-width: 0;
}

.user-name {
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.timestamp {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.post-content {
	margin-bottom: var(--space-3);
}

.content-line {
	font-size: var(--font-size-sm);
	color: var(--color-text);
	margin: 0;
}

.note {
	color: var(--color-text-muted);
}

.macros {
	color: var(--color-text-muted);
	font-size: var(--font-size-xs);
}

.milestone-text {
	color: var(--color-warning);
	font-weight: var(--font-weight-semibold);
}

.ai-text {
	color: var(--color-text-muted);
	font-style: italic;
}

.food-thumb {
	width: 100%;
	max-height: 220px;
	object-fit: cover;
	border-radius: var(--radius-sm);
	margin-bottom: var(--space-2);
}

.reaction-bar {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-2);
}

.reaction-bar button {
	background: none;
	border: none;
	padding: 0;
	cursor: pointer;
}

.reaction-bar button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
</style>
