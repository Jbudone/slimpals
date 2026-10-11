<script lang="ts">
// A one-time card listing what changed since the player was last here.
import { authState } from "../lib/auth.svelte.js"
import {
	checkWhatsNew,
	dismissWhatsNew,
	whatsNew,
} from "../lib/whatsNew.svelte.js"

let checkedFor = ""
// a short pause after sign-in, so it lands after the gym has loaded
$effect(() => {
	const id = authState.user?.id
	if (!id || id === checkedFor) return
	checkedFor = id
	const t = setTimeout(() => checkWhatsNew(id), 2500)
	return () => clearTimeout(t)
})

function close() {
	const id = authState.user?.id
	if (id) dismissWhatsNew(id)
}
</script>

{#if whatsNew.entries.length}
	<div class="wn-back" role="presentation" data-testid="whats-new">
		<div class="wn" role="dialog" aria-modal="true" aria-label="What's new">
			<h2>What's new</h2>
			<div class="wn-list">
				{#each whatsNew.entries as e (e.id)}
					<section>
						<h3>{e.title}<small>{e.date}</small></h3>
						<ul>
							{#each e.items as item (item)}<li>{item}</li>{/each}
						</ul>
					</section>
				{/each}
			</div>
			<button type="button" class="wn-ok" onclick={close} data-testid="whats-new-ok">Got it</button>
		</div>
	</div>
{/if}

<style>
.wn-back {
	position: fixed;
	inset: 0;
	z-index: 60;
	display: grid;
	place-items: center;
	padding: 18px;
	background: rgba(10, 12, 20, 0.55);
	-webkit-backdrop-filter: blur(3px);
	backdrop-filter: blur(3px);
}

.wn {
	width: min(420px, 100%);
	max-height: min(80vh, 620px);
	display: flex;
	flex-direction: column;
	padding: 18px 18px 16px;
	border-radius: 22px;
	background: #fdf8f0;
	color: #241d15;
	border: 3px solid var(--color-accent, #1f9a55);
	box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
	animation: wn-in 0.25s cubic-bezier(0.2, 1.3, 0.4, 1);
}

@keyframes wn-in {
	from {
		opacity: 0;
		transform: scale(0.9);
	}
}

h2 {
	margin: 0 0 8px;
	font: 800 22px/1.1 var(--font-display, Georgia, serif);
}

.wn-list {
	overflow-y: auto;
	flex: 1;
}

h3 {
	margin: 10px 0 4px;
	font: 800 15px/1.2 system-ui, sans-serif;
	display: flex;
	align-items: baseline;
	gap: 8px;
}

h3 small {
	font-weight: 600;
	font-size: 11px;
	color: #8d7c66;
}

ul {
	margin: 0;
	padding-left: 18px;
	font: 500 14px/1.4 system-ui, sans-serif;
}

li + li {
	margin-top: 4px;
}

.wn-ok {
	margin-top: 12px;
	min-height: 46px;
	border: none;
	border-radius: 14px;
	background: var(--color-accent, #1f9a55);
	color: #fff;
	font: 800 16px system-ui, sans-serif;
	cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
	.wn {
		animation: none;
	}
}
</style>
