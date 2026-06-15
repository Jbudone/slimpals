<script lang="ts">
import type { Theme } from "../../shared/types.js"
import { updateTheme, userProfile } from "../lib/user.svelte.js"

const themes: { id: Theme; label: string; accent: string }[] = [
	{ id: "midnight", label: "Midnight", accent: "#7c3aed" },
	{ id: "forest", label: "Forest", accent: "#22c55e" },
	{ id: "sunset", label: "Sunset", accent: "#f97316" },
	{ id: "ocean", label: "Ocean", accent: "#0ea5e9" },
	{ id: "light", label: "Light", accent: "#6d28d9" },
	{ id: "neon", label: "Neon", accent: "#00ff88" },
]

let current = $derived(userProfile.data?.theme ?? "midnight")
let saving = $state(false)

async function select(theme: Theme) {
	if (theme === current || saving) return
	saving = true
	await updateTheme(theme)
	saving = false
}
</script>

<div class="switcher">
	{#each themes as t (t.id)}
		<button
			class="swatch"
			class:active={current === t.id}
			aria-pressed={current === t.id}
			aria-label={t.label}
			disabled={saving}
			onclick={() => select(t.id)}
		>
			<span class="dot" style="background:{t.accent}"></span>
			<span class="label">{t.label}</span>
			{#if current === t.id}
				<span class="check" aria-hidden="true">✓</span>
			{/if}
		</button>
	{/each}
</div>

<style>
.switcher {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	gap: 0.75rem;
}

.swatch {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.625rem 0.875rem;
	background: var(--color-surface);
	border: 2px solid var(--color-border);
	border-radius: 0.5rem;
	color: var(--color-text);
	cursor: pointer;
	font-size: 0.875rem;
	transition: border-color 0.15s, background 0.15s;
	position: relative;
}

.swatch:hover:not(:disabled) {
	border-color: var(--color-accent);
	background: var(--color-surface-2);
}

.swatch.active {
	border-color: var(--color-accent);
}

.swatch:disabled {
	opacity: 0.6;
	cursor: wait;
}

.dot {
	width: 1rem;
	height: 1rem;
	border-radius: 50%;
	flex-shrink: 0;
}

.label {
	flex: 1;
	text-align: left;
}

.check {
	color: var(--color-accent);
	font-size: 0.75rem;
}
</style>
