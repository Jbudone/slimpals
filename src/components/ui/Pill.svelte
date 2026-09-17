<script lang="ts">
import type { Snippet } from "svelte"

let {
	active = false,
	tone = "neutral",
	children,
	...rest
}: {
	active?: boolean
	tone?: "neutral" | "accent"
	children: Snippet
	[key: string]: unknown
} = $props()
</script>

<span class="ui-pill" class:active class:tone-accent={tone === "accent"} {...rest}>
	{@render children()}
</span>

<style>
.ui-pill {
	display: inline-flex;
	align-items: center;
	gap: var(--space-1);
	border-radius: var(--radius-full);
	padding: var(--space-1) var(--space-3);
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-semibold);
	background: var(--color-surface-2);
	color: var(--color-text-muted);
	border: 1px solid var(--color-border);
	white-space: nowrap;
}

.ui-pill.tone-accent {
	background: color-mix(in srgb, var(--color-accent) 15%, transparent);
	border-color: var(--color-accent);
	color: var(--color-accent);
}

.ui-pill.active {
	background: var(--color-accent);
	border-color: var(--color-accent);
	color: #fff;
}
</style>
