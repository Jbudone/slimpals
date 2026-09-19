<script lang="ts">
type GymEvent = {
	type: string
	title: string
	description: string
	npcKey: string | null
	activeHours: [number, number]
	effects: { allNpcMoodBonus?: number; xpMultiplier?: number }
}

type Props = {
	gymName: string
	level: number
	xp: number
	xpToNextLevel: number
	pendingCount: number
	onClaim: () => void
	ceremonyActive?: boolean
	todayEvent?: GymEvent | null
}

let {
	gymName,
	level,
	xp,
	xpToNextLevel,
	pendingCount,
	onClaim,
	ceremonyActive = false,
	todayEvent = null,
}: Props = $props()

const EVENT_ICONS: Record<string, string> = {
	competition: "🏆",
	class: "🧘",
	delivery: "📦",
	special_guest: "⭐",
	maintenance: "🔧",
}

function isEventActive(event: GymEvent): boolean {
	const hour = new Date().getHours()
	return hour >= event.activeHours[0] && hour < event.activeHours[1]
}

const activeEvent = $derived(
	todayEvent && isEventActive(todayEvent) ? todayEvent : null,
)

const nextLevelXp = $derived(xp + xpToNextLevel)
const progressPercent = $derived(
	nextLevelXp > 0 ? Math.min(100, (xp / nextLevelXp) * 100) : 0,
)
</script>

<div class="gym-ui">
	{#if activeEvent}
		<div class="event-banner">
			<span class="event-icon">{EVENT_ICONS[activeEvent.type] ?? "🎉"}</span>
			<div class="event-info">
				<span class="event-title">{activeEvent.title}</span>
				<span class="event-desc">{activeEvent.description}</span>
			</div>
			{#if activeEvent.effects.xpMultiplier && activeEvent.effects.xpMultiplier > 1}
				<span class="event-bonus">{activeEvent.effects.xpMultiplier}x XP</span>
			{/if}
		</div>
	{/if}
	{#if ceremonyActive}
		<div class="ceremony-hint">
			<span class="hint-icon">🔨</span>
			<span>Click anywhere in the gym to help build!</span>
		</div>
	{:else}
		<div class="gym-header">
			<h2 class="gym-name">{gymName}</h2>
			<div class="level-badge">Lv. {level}</div>
		</div>

		<div class="xp-section">
			<div class="xp-label">
				<span>{xp} XP</span>
				<span class="xp-next">{xpToNextLevel} to next level</span>
			</div>
			<div class="xp-bar-track">
				<div class="xp-bar-fill" style="width: {progressPercent}%"></div>
			</div>
		</div>

		{#if pendingCount > 0}
			<button class="claim-btn" onclick={onClaim}>
				Claim Upgrade
				<span class="badge">{pendingCount}</span>
			</button>
		{/if}
	{/if}
</div>

<style>
.gym-ui {
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
	padding: var(--space-4) var(--space-5);
	background: var(--color-surface);
	border-bottom: 1px solid var(--color-border);
}

.gym-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.gym-name {
	font-family: var(--font-display);
	font-size: var(--font-size-xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
	margin: 0;
}

.level-badge {
	background: var(--color-accent);
	color: var(--color-on-accent, #fff);
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-bold);
	padding: var(--space-1) var(--space-3);
	border-radius: var(--radius-full);
}

.xp-section {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
}

.xp-label {
	display: flex;
	justify-content: space-between;
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.xp-next {
	opacity: 0.7;
}

.xp-bar-track {
	height: 8px;
	background: var(--color-surface-2);
	border-radius: var(--radius-full);
	overflow: hidden;
}

.xp-bar-fill {
	height: 100%;
	background: var(--color-accent);
	border-radius: var(--radius-full);
	transition: width 0.3s ease;
}

.claim-btn {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	background: var(--color-accent);
	color: var(--color-on-accent, #fff);
	border: none;
	border-radius: var(--radius-full);
	padding: var(--space-3) var(--space-4);
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	cursor: pointer;
	transition: opacity 0.15s;
}

.claim-btn:hover {
	opacity: 0.9;
}

.badge {
	background: rgba(0, 0, 0, 0.25);
	border-radius: var(--radius-full);
	font-size: 0.7rem;
	font-weight: var(--font-weight-bold);
	padding: 0.1rem 0.4rem;
	min-width: 1.2rem;
	text-align: center;
}

.event-banner {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface));
	border: 1px solid color-mix(in srgb, var(--color-accent) 40%, transparent);
	border-radius: var(--radius-sm);
	padding: var(--space-2) var(--space-3);
}

.event-icon {
	font-size: 1.25rem;
	flex-shrink: 0;
}

.event-info {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
}

.event-title {
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.event-desc {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.event-bonus {
	font-size: 0.7rem;
	font-weight: var(--font-weight-bold);
	color: var(--color-accent);
	background: color-mix(in srgb, var(--color-accent) 15%, transparent);
	padding: 0.15rem var(--space-2);
	border-radius: var(--radius-full);
	white-space: nowrap;
}

.ceremony-hint {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	color: var(--color-accent);
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	animation: pulse 1.5s ease-in-out infinite;
}

.hint-icon {
	font-size: 1.1rem;
}

@keyframes pulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.6; }
}
</style>
