<script lang="ts">
type Option = { id: string; label: string }

let {
	options,
	selected,
	onselect,
	fullWidth = false,
}: {
	options: Option[]
	selected: string
	onselect: (id: string) => void
	fullWidth?: boolean
} = $props()
</script>

<div class="ui-segmented-tabs" class:full-width={fullWidth} role="tablist">
	{#each options as opt (opt.id)}
		<button
			type="button"
			role="tab"
			class="segment"
			class:active={opt.id === selected}
			aria-selected={opt.id === selected}
			onclick={() => onselect(opt.id)}
		>
			{opt.label}
		</button>
	{/each}
</div>

<style>
.ui-segmented-tabs {
	display: inline-flex;
	padding: var(--space-1);
	background: var(--color-surface-2);
	border-radius: var(--radius-full);
	gap: var(--space-1);
}

.segment {
	border: none;
	background: transparent;
	color: var(--color-text-muted);
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	font-family: var(--font-sans);
	padding: var(--space-2) var(--space-4);
	border-radius: var(--radius-full);
	cursor: pointer;
	transition: background 0.15s, color 0.15s;
}

.segment:hover:not(.active) {
	color: var(--color-text);
}

.segment.active {
	background: var(--color-accent);
	color: #fff;
}

.ui-segmented-tabs.full-width {
	display: flex;
	width: 100%;
}

.full-width .segment {
	flex: 1 1 0;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	text-align: center;
	padding-left: var(--space-2);
	padding-right: var(--space-2);
}
</style>
