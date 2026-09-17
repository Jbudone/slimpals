<script lang="ts">
import { checkinState } from "../lib/checkin.svelte.js"
import AvatarMenu from "./AvatarMenu.svelte"
import Pill from "./ui/Pill.svelte"
</script>

<header class="app-header">
	<span class="brand">SlimPals</span>
	<div class="header-right">
		{#if checkinState.data}
			<Pill tone="accent">
				🔥 {checkinState.data.streakCount}
			</Pill>
		{/if}
		<AvatarMenu />
	</div>
</header>

<style>
.app-header {
	position: sticky;
	top: 0;
	z-index: 10;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: var(--space-4) var(--space-6);
	background: var(--color-surface);
	border-bottom: 1px solid var(--color-border);
}

.brand {
	font-family: var(--font-display);
	font-size: var(--font-size-lg);
	font-weight: var(--font-weight-bold);
	color: var(--color-accent);
}

.header-right {
	display: flex;
	align-items: center;
	gap: var(--space-3);
}
</style>
