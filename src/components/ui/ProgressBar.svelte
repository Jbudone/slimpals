<script lang="ts">
import type { Snippet } from "svelte"

let {
	variant = "linear",
	value,
	max = 100,
	size = 140,
	thickness = 10,
	children,
}: {
	variant?: "linear" | "circular"
	value: number
	max?: number
	size?: number
	thickness?: number
	children?: Snippet
} = $props()

let ratio = $derived(max > 0 ? Math.min(1, Math.max(0, value / max)) : 0)

let radius = $derived((size - thickness) / 2)
let circumference = $derived(2 * Math.PI * radius)
let dashOffset = $derived(circumference * (1 - ratio))
</script>

{#if variant === "circular"}
	<div
		class="ui-progress-circular"
		style="width:{size}px;height:{size}px"
		role="progressbar"
		aria-valuenow={value}
		aria-valuemin={0}
		aria-valuemax={max}
	>
		<svg width={size} height={size} viewBox="0 0 {size} {size}">
			<circle
				class="track"
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke-width={thickness}
				fill="none"
			/>
			<circle
				class="fill"
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke-width={thickness}
				fill="none"
				stroke-dasharray={circumference}
				stroke-dashoffset={dashOffset}
				transform="rotate(-90 {size / 2} {size / 2})"
			/>
		</svg>
		{#if children}
			<div class="center-content">
				{@render children()}
			</div>
		{/if}
	</div>
{:else}
	<div
		class="ui-progress-linear"
		role="progressbar"
		aria-valuenow={value}
		aria-valuemin={0}
		aria-valuemax={max}
	>
		<div class="fill" style="width:{ratio * 100}%"></div>
	</div>
{/if}

<style>
.ui-progress-linear {
	width: 100%;
	height: 0.5rem;
	background: var(--color-surface-2);
	border-radius: var(--radius-full);
	overflow: hidden;
}

.ui-progress-linear .fill {
	height: 100%;
	background: var(--color-accent);
	border-radius: var(--radius-full);
	transition: width 0.2s;
}

.ui-progress-circular {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.ui-progress-circular .track {
	stroke: var(--color-surface-2);
}

.ui-progress-circular .fill {
	stroke: var(--color-accent);
	stroke-linecap: round;
	transition: stroke-dashoffset 0.3s;
}

.center-content {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}
</style>
