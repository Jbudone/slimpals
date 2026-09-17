<script lang="ts">
import type { Snippet } from "svelte"

let {
	padding = "lg",
	children,
	...rest
}: {
	padding?: "md" | "lg"
	children: Snippet
	[key: string]: unknown
} = $props()
</script>

<div class="ui-card" class:padding-md={padding === "md"} {...rest}>
	{@render children()}
</div>

<style>
.ui-card {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-lg);
	box-shadow: var(--shadow-sm);
	padding: var(--space-6);
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
}

.ui-card.padding-md {
	padding: var(--space-4);
}
</style>
