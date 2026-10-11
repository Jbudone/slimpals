<script lang="ts">
// A one-time card listing what changed since the player was last here.
import { authState } from "../lib/auth.svelte.js"
import {
	checkWhatsNew,
	dismissWhatsNew,
	whatsNew,
} from "../lib/whatsNew.svelte.js"

/** Entries shown open; older ones collapse to a title you can tap. */
const OPEN_COUNT = 3

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
			{#if whatsNew.entries.length > OPEN_COUNT}
				<p class="wn-sub">
					{whatsNew.history ? "Everything added so far" : "Here is what has been added since you were last here"}:
					{whatsNew.entries.length} updates. Tap an older one to read it.
				</p>
			{/if}
			<div class="wn-list">
				{#each whatsNew.entries as e, i (e.id)}
					{#if i < OPEN_COUNT}
						<section>
							<h3>{e.title}<small>{e.date}</small></h3>
							<ul>
								{#each e.items as item (item)}<li>{item}</li>{/each}
							</ul>
						</section>
					{:else}
						<details class="wn-old" data-testid="whats-new-old">
							<summary>{e.title}<small>{e.date}</small></summary>
							<ul>
								{#each e.items as item (item)}<li>{item}</li>{/each}
							</ul>
						</details>
					{/if}
				{/each}
			</div>
			<button type="button" class="wn-ok" onclick={close} data-testid="whats-new-ok">Got it</button>
		</div>
	</div>
{/if}

<style>
.wn-sub {
	margin: 0 0 8px;
	font-size: 0.8rem;
	color: #6b5d4f;
}

.wn-old {
	margin: 0 0 6px;
	padding: 7px 10px;
	border-radius: 10px;
	background: rgba(36, 29, 21, 0.06);
}

.wn-old summary {
	cursor: pointer;
	font-weight: 700;
	font-size: 0.88rem;
	display: flex;
	justify-content: space-between;
	gap: 8px;
}

.wn-old summary small {
	font-weight: 500;
	color: #8a7a68;
}

.wn-old ul {
	margin: 6px 0 0;
	padding-left: 18px;
	font-size: 0.85rem;
}

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
