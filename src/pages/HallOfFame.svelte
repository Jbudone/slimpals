<script lang="ts">
// The Hall of fame: every finished campaign, oldest first, with where it was
// played and what the gym amounted to (server: services/gym/campaign.ts).
import { onMount } from "svelte"
import { locationFor } from "../../shared/gym3d/locations"
import Card from "../components/ui/Card.svelte"
import { campaign, loadCampaign } from "../lib/campaign.svelte"
import { page } from "../router.svelte.js"

onMount(() => void loadCampaign())

const fmtDate = (iso: string) =>
	new Date(iso).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
</script>

<div class="hall-page" data-testid="hall-page">
	<button type="button" class="back" onclick={() => page("/")}>← Back to the gym</button>
	<h1>Hall of fame</h1>
	{#if !campaign.data}
		<p class="hint">Loading…</p>
	{:else if campaign.data.hall.length === 0}
		<Card>
			<p class="hint">
				No finished campaigns yet. Finish the story and begin the next campaign, and your
				first gym is kept here.
			</p>
		</Card>
	{:else}
		<ul class="entries" data-testid="hall-entries">
			{#each campaign.data.hall as h (h.campaign)}
				<li>
					<Card>
						<h2>Campaign {h.campaign}: {h.name}</h2>
						<p class="place">{locationFor(h.campaign).name} · finished {fmtDate(h.archivedAt)}</p>
						{#if h.summary}
							<dl>
								<div><dt>Level</dt><dd>{h.summary.level}</dd></div>
								<div><dt>Days</dt><dd>{h.summary.days}</dd></div>
								<div><dt>Rooms</dt><dd>{h.summary.plots}</dd></div>
								<div><dt>Gear</dt><dd>{h.summary.pieces}</dd></div>
								<div><dt>XP</dt><dd>{h.summary.xp.toLocaleString("en-US")}</dd></div>
							</dl>
						{/if}
					</Card>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
.hall-page {
	max-width: 480px;
	margin: 0 auto;
	padding: var(--space-6) var(--space-4) var(--space-8);
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
}
.back {
	align-self: flex-start;
	background: none;
	border: 0;
	padding: 0;
	color: var(--accent, inherit);
	cursor: pointer;
}
.entries {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
}
h1, h2, p {
	margin: 0;
}
h2 {
	font-size: 1.05rem;
}
.place, .hint {
	opacity: 0.7;
	font-size: 0.9rem;
}
dl {
	display: grid;
	grid-template-columns: repeat(5, 1fr);
	gap: var(--space-2);
	margin: var(--space-3) 0 0;
}
dt {
	font-size: 0.75rem;
	opacity: 0.7;
}
dd {
	margin: 0;
	font-weight: 600;
}
</style>
