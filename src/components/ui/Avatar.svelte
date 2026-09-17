<script lang="ts">
import type { Snippet } from "svelte"

let {
	initials,
	size = 40,
	tone = "neutral",
	icon,
}: {
	initials?: string
	size?: number
	tone?: "neutral" | "accent"
	icon?: Snippet
} = $props()
</script>

<div
	class="ui-avatar"
	class:tone-accent={tone === "accent"}
	style="width:{size}px;height:{size}px;font-size:{size * 0.4}px"
>
	{#if icon}
		{@render icon()}
	{:else if initials}
		{initials.slice(0, 2).toUpperCase()}
	{/if}
</div>

<style>
.ui-avatar {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--radius-full);
	background: var(--color-surface-2);
	color: var(--color-text);
	font-weight: var(--font-weight-bold);
	flex-shrink: 0;
	line-height: 1;
}

.ui-avatar.tone-accent {
	background: color-mix(in srgb, var(--color-accent) 18%, transparent);
	color: var(--color-accent);
}
</style>
