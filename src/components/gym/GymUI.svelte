<script lang="ts">
type Props = {
	gymName: string
	level: number
	xp: number
	xpToNextLevel: number
	pendingCount: number
	onClaim: () => void
}

let { gymName, level, xp, xpToNextLevel, pendingCount, onClaim }: Props =
	$props()

const nextLevelXp = $derived(xp + xpToNextLevel)
const progressPercent = $derived(
	nextLevelXp > 0 ? Math.min(100, (xp / nextLevelXp) * 100) : 0,
)
</script>

<div class="gym-ui">
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
			Claim Upgrade ({pendingCount})
		</button>
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
</style>
