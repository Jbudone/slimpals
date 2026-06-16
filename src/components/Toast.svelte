<script lang="ts">
import { toasts } from "../lib/toast.svelte.js"
</script>

{#if toasts.length > 0}
	<div class="toast-stack" aria-live="polite">
		{#each toasts as toast (toast.id)}
			<div class="toast toast-{toast.type}">
				{#if toast.type === "badge"}
					<span class="toast-icon">🏅</span>
				{/if}
				<div class="toast-body">
					<div class="toast-message">{toast.message}</div>
					{#if toast.detail}
						<div class="toast-detail">{toast.detail}</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
.toast-stack {
	position: fixed;
	bottom: 1.5rem;
	right: 1.5rem;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	z-index: 1000;
	pointer-events: none;
}

.toast {
	display: flex;
	align-items: center;
	gap: 0.625rem;
	padding: 0.75rem 1rem;
	border-radius: 0.5rem;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
	min-width: 220px;
	max-width: 320px;
	animation: slide-in 0.2s ease;
}

.toast-badge {
	border-color: var(--color-accent);
	background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface));
}

.toast-icon {
	font-size: 1.25rem;
	flex-shrink: 0;
}

.toast-body {
	flex: 1;
	min-width: 0;
}

.toast-message {
	font-size: 0.875rem;
	font-weight: 600;
	color: var(--color-text);
}

.toast-detail {
	font-size: 0.75rem;
	color: var(--color-text-muted);
	text-transform: capitalize;
	margin-top: 0.125rem;
}

@keyframes slide-in {
	from {
		transform: translateX(100%);
		opacity: 0;
	}
	to {
		transform: translateX(0);
		opacity: 1;
	}
}
</style>
