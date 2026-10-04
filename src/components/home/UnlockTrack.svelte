<script lang="ts">
// What the gym unlocks next, as a path: the next pieces of gear by XP, the
// first one with a bar for how close you are.
import { roomIcon } from "../../lib/roomIcons"
import type { UnlockStep } from "../../lib/unlocks"

let { steps, xp }: { steps: UnlockStep[]; xp: number } = $props()
</script>

<section class="unlocks" aria-label="Coming up in your gym" data-testid="unlock-track">
	<h3>Coming up</h3>
	{#if steps.length === 0}
		<p class="hint">Everything is unlocked. Build, upgrade and decorate.</p>
	{:else}
		<ol>
			{#each steps as s, i (s.key)}
				<li class:first={i === 0} data-testid="unlock-{s.key}">
					<span class="pic" aria-hidden="true">{roomIcon(s.roomType)}</span>
					<span class="body">
						<b>{s.name}</b>
						<small>{s.toGo.toLocaleString("en-US")} XP to go ({s.requiredXp.toLocaleString("en-US")} XP)</small>
						{#if i === 0}
							<span class="bar" aria-hidden="true"><i style="width:{(s.k * 100).toFixed(0)}%"></i></span>
						{/if}
					</span>
				</li>
			{/each}
		</ol>
		<p class="hint">You have {xp.toLocaleString("en-US")} XP. Tasks, check-ins and challenges all earn it.</p>
	{/if}
</section>

<style>
.unlocks {
	padding: 14px 16px;
	border-radius: 18px;
	background: #fff7ea;
	color: #241d15;
	box-shadow: 0 2px 0 rgba(58, 38, 34, 0.12);
}

h3 {
	margin: 0 0 8px;
	font: 800 12px/1.2 system-ui, sans-serif;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: #1f9a55;
}

ol {
	margin: 0;
	padding: 0;
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 0;
}

li {
	position: relative;
	display: flex;
	gap: 12px;
	padding: 8px 0 8px 0;
	font: 600 13px/1.3 system-ui, sans-serif;
}

/* the dotted path joining the steps */
li:not(:last-child)::before {
	content: "";
	position: absolute;
	left: 19px;
	top: 46px;
	bottom: -6px;
	border-left: 3px dotted #d9c9b0;
}

.pic {
	flex: none;
	display: grid;
	place-items: center;
	width: 40px;
	height: 40px;
	border-radius: 50%;
	background: #f0e4d0;
	font-size: 20px;
	filter: grayscale(0.7);
	opacity: 0.8;
}

.first .pic {
	background: #ffe9a8;
	filter: none;
	opacity: 1;
	box-shadow: 0 0 0 3px #f2b21a;
}

.body {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
	flex: 1;
}

small {
	color: #6b5a47;
	font-weight: 600;
}

.bar {
	display: block;
	height: 8px;
	margin-top: 4px;
	border-radius: 4px;
	background: #eadcc6;
	overflow: hidden;
}

.bar i {
	display: block;
	height: 100%;
	background: linear-gradient(90deg, #34c973, #f2c14a);
	border-radius: 4px;
}

.hint {
	margin: 8px 0 0;
	color: #6b5a47;
	font: 500 12px/1.4 system-ui, sans-serif;
}
</style>
