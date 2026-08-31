<script lang="ts">
import { onMount } from "svelte"
import { api } from "../lib/api.js"
import { showBadgeToast } from "../lib/toast.svelte.js"

type NewBadge = { key: string; name: string; tier: string; earnedAt: string }

const EMOJIS = ["❤️", "😂", "💪", "🔥", "😭"] as const
type Emoji = (typeof EMOJIS)[number]

type ReactionState = { count: number; userReacted: boolean }
type Reactions = Record<Emoji, ReactionState>

type PostType =
	| "food_photo"
	| "weight_update"
	| "milestone"
	| "ai_message"
	| "challenge_completion"

type FeedPost = {
	id: number
	userId: string
	userName: string
	type: PostType
	content: Record<string, unknown>
	createdAt: string
	reactions: Reactions
}

let posts = $state<FeedPost[]>([])
let loading = $state(true)
let error = $state<string | null>(null)
let reacting = $state<Set<number>>(new Set())

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
	<h1>Social Feed</h1>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else if posts.length === 0}
		<div class="empty">
			<p>No activity yet. Log your weight or a meal to get things started!</p>
		</div>
	{:else}
		<div class="feed">
			{#each posts as post (post.id)}
				<article class="post-card">
					<header class="post-header">
						<div class="avatar">{initials(post.userName)}</div>
						<div class="meta">
							<span class="user-name">{post.userName}</span>
							<span class="timestamp">{timeAgo(post.createdAt)}</span>
						</div>
						<span class="post-type-badge {post.type}">{post.type.replace("_", " ")}</span>
					</header>

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

					<footer class="reaction-bar">
						{#each EMOJIS as emoji}
							{@const state = post.reactions[emoji]}
							<button
								class="reaction-btn"
								class:active={state.userReacted}
								onclick={() => react(post.id, emoji)}
								disabled={reacting.has(post.id)}
								type="button"
								aria-label="{emoji} {state.count}"
							>
								<span class="emoji">{emoji}</span>
								{#if state.count > 0}
									<span class="count">{state.count}</span>
								{/if}
							</button>
						{/each}
					</footer>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
.social-page {
	max-width: 600px;
	margin: 0 auto;
	padding: 2rem 1.5rem;
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
}

h1 {
	font-size: 1.5rem;
	font-weight: 700;
	color: var(--color-text);
	margin: 0;
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

.empty {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 0.75rem;
	padding: 2rem;
	text-align: center;
	color: var(--color-text-muted);
	font-size: 0.875rem;
}

.feed {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

/* Post card */
.post-card {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 0.75rem;
	overflow: hidden;
}

.post-header {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.875rem 1rem 0.75rem;
}

.avatar {
	width: 2.25rem;
	height: 2.25rem;
	border-radius: 50%;
	background: var(--color-accent);
	color: #fff;
	font-size: 0.75rem;
	font-weight: 700;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

.meta {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
}

.user-name {
	font-size: 0.9375rem;
	font-weight: 600;
	color: var(--color-text);
}

.timestamp {
	font-size: 0.75rem;
	color: var(--color-text-muted);
}

.post-type-badge {
	font-size: 0.6875rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	padding: 0.2rem 0.5rem;
	border-radius: 99px;
	border: 1px solid var(--color-border);
	color: var(--color-text-muted);
	background: var(--color-surface-2);
}

/* Post content */
.post-content {
	padding: 0 1rem 0.875rem;
}

.content-line {
	font-size: 0.9375rem;
	color: var(--color-text);
	margin: 0;
}

.note {
	color: var(--color-text-muted);
}

.macros {
	color: var(--color-text-muted);
	font-size: 0.8125rem;
}

.milestone-text {
	color: var(--color-warning);
	font-weight: 600;
}

.ai-text {
	color: var(--color-text-muted);
	font-style: italic;
}

.food-thumb {
	width: 100%;
	max-height: 220px;
	object-fit: cover;
	border-radius: 0.5rem;
	margin-bottom: 0.625rem;
}

/* Reaction bar */
.reaction-bar {
	display: flex;
	gap: 0.375rem;
	padding: 0.625rem 1rem;
	border-top: 1px solid var(--color-border);
}

.reaction-btn {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.3rem 0.6rem;
	border-radius: 99px;
	border: 1px solid var(--color-border);
	background: var(--color-surface-2);
	cursor: pointer;
	transition: background 0.1s, border-color 0.1s;
	font-size: 0.875rem;
	line-height: 1;
}

.reaction-btn:hover:not(:disabled) {
	border-color: var(--color-accent);
	background: color-mix(in srgb, var(--color-accent) 10%, transparent);
}

.reaction-btn.active {
	border-color: var(--color-accent);
	background: color-mix(in srgb, var(--color-accent) 18%, transparent);
}

.reaction-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.emoji {
	font-size: 1rem;
	line-height: 1;
}

.count {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--color-text-muted);
}

.reaction-btn.active .count {
	color: var(--color-accent);
}
</style>
