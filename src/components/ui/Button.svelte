<script lang="ts">
import type { Snippet } from "svelte"

let {
	variant = "primary",
	type = "button",
	disabled = false,
	onclick,
	children,
	...rest
}: {
	variant?: "primary" | "secondary"
	type?: "button" | "submit"
	disabled?: boolean
	onclick?: (e: MouseEvent) => void
	children: Snippet
	[key: string]: unknown
} = $props()
</script>

<button
	class="ui-button"
	class:secondary={variant === "secondary"}
	{type}
	{disabled}
	{onclick}
	{...rest}
>
	{@render children()}
</button>

<style>
.ui-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: var(--space-2);
	border: none;
	border-radius: var(--radius-full);
	padding: var(--space-3) var(--space-6);
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	font-family: var(--font-sans);
	cursor: pointer;
	background: var(--color-accent);
	color: var(--color-on-accent, #fff);
	transition: background 0.15s;
}

.ui-button:hover:not(:disabled) {
	background: var(--color-accent-hover);
}

.ui-button:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.ui-button.secondary {
	background: var(--color-surface-2);
	color: var(--color-text);
	border: 1px solid var(--color-border);
}

.ui-button.secondary:hover:not(:disabled) {
	background: var(--color-border);
}
</style>
