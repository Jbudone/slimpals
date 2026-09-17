<script lang="ts">
import Avatar from "../components/ui/Avatar.svelte"
import Button from "../components/ui/Button.svelte"
import Card from "../components/ui/Card.svelte"
import Pill from "../components/ui/Pill.svelte"
import ProgressBar from "../components/ui/ProgressBar.svelte"
import SegmentedTabs from "../components/ui/SegmentedTabs.svelte"

let selectedTab = $state("weight")
const tabs = [
	{ id: "weight", label: "Weight" },
	{ id: "food", label: "Food" },
]
</script>

<div class="ui-kit">
	<h1>UI Kit (dev only)</h1>
	<p class="dev-note">
		Not linked from any nav — visual proof for components with no natural home
		in the gh-72 streak-card proof screen. See .agent/issues/gh-72.md.
	</p>

	<Card>
		<h2>Avatar</h2>
		<div class="row">
			<Avatar initials="AK" />
			<Avatar initials="JB" tone="accent" />
			<Avatar tone="accent" size={32}>
				{#snippet icon()}
					<span>🏆</span>
				{/snippet}
			</Avatar>
		</div>
	</Card>

	<Card>
		<h2>Pill</h2>
		<div class="row">
			<Pill>Default</Pill>
			<Pill tone="accent">Accent</Pill>
			<Pill active>Active</Pill>
		</div>
	</Card>

	<Card>
		<h2>SegmentedTabs</h2>
		<SegmentedTabs
			options={tabs}
			selected={selectedTab}
			onselect={(id) => (selectedTab = id)}
		/>
		<p>Selected: {selectedTab}</p>
	</Card>

	<Card>
		<h2>ProgressBar</h2>
		<div class="row">
			<ProgressBar variant="circular" value={12} max={30} size={80} />
			<div class="linear-wrap">
				<ProgressBar variant="linear" value={1230} max={1900} />
			</div>
		</div>
	</Card>

	<Card>
		<h2>Button</h2>
		<div class="row">
			<Button>Primary</Button>
			<Button variant="secondary">Secondary</Button>
		</div>
	</Card>
</div>

<style>
.ui-kit {
	max-width: 640px;
	margin: 0 auto;
	padding: var(--space-8) var(--space-6);
	display: flex;
	flex-direction: column;
	gap: var(--space-6);
}

h1 {
	font-family: var(--font-display);
	color: var(--color-text);
	margin: 0;
}

h2 {
	font-size: var(--font-size-base);
	color: var(--color-text);
	margin: 0;
}

.dev-note {
	color: var(--color-text-muted);
	font-size: var(--font-size-sm);
	margin: 0;
}

.row {
	display: flex;
	align-items: center;
	gap: var(--space-4);
}

.linear-wrap {
	flex: 1;
}
</style>
