<script lang="ts">
type Props = {
	gymName: string
	level: number
	xp: number
	xpToNextLevel: number
	pendingCount: number
	onClaim: () => void
	ceremonyActive?: boolean
}

let {
	gymName,
	level,
	xp,
	xpToNextLevel,
	pendingCount,
	onClaim,
	ceremonyActive = false,
}: Props = $props()

const nextLevelXp = $derived(xp + xpToNextLevel)
const progressPercent = $derived(
	nextLevelXp > 0 ? Math.min(100, (xp / nextLevelXp) * 100) : 0,
)
</script>

<div class="gym-ui">
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
	gap: 0.75rem;
	padding: 1rem 1.25rem;
	background: var(--color-surface);
	border-bottom: 1px solid var(--color-border);
}

.gym-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.gym-name {
	font-size: 1.25rem;
	font-weight: 700;
	color: var(--color-text);
	margin: 0;
}

.level-badge {
	background: var(--color-accent);
	color: #fff;
	font-size: 0.75rem;
	font-weight: 700;
	padding: 0.25rem 0.625rem;
	border-radius: 999px;
}

.xp-section {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
}

.xp-label {
	display: flex;
	justify-content: space-between;
	font-size: 0.75rem;
	color: var(--color-text-muted);
}

.xp-next {
	opacity: 0.7;
}

.xp-bar-track {
	height: 8px;
	background: var(--color-surface-2, var(--color-border));
	border-radius: 4px;
	overflow: hidden;
}

.xp-bar-fill {
	height: 100%;
	background: var(--color-accent);
	border-radius: 4px;
	transition: width 0.3s ease;
}

.claim-btn {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	background: var(--color-accent);
	color: #fff;
	border: none;
	border-radius: 0.375rem;
	padding: 0.5rem 1rem;
	font-size: 0.875rem;
	font-weight: 600;
	cursor: pointer;
	transition: opacity 0.15s;
}

.claim-btn:hover {
	opacity: 0.9;
}

.badge {
	background: rgba(0, 0, 0, 0.25);
	border-radius: 999px;
	font-size: 0.7rem;
	font-weight: 700;
	padding: 0.1rem 0.4rem;
	min-width: 1.2rem;
	text-align: center;
}

.ceremony-hint {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	color: var(--color-accent);
	font-size: 0.875rem;
	font-weight: 600;
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
