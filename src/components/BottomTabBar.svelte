<script lang="ts">
import { ChartColumn, House, Trophy, Users } from "@lucide/svelte"
import { nav, page, type RoutePath } from "../router.svelte.js"

type Tab = {
	id: string
	label: string
	icon: typeof House
	targetPath: RoutePath
	matchPaths: RoutePath[]
}

const TABS: Tab[] = [
	{
		id: "today",
		label: "Today",
		icon: House,
		targetPath: "/",
		matchPaths: ["/"],
	},
	{
		id: "progress",
		label: "Progress",
		icon: ChartColumn,
		targetPath: "/weight",
		matchPaths: ["/weight", "/food"],
	},
	{
		id: "compete",
		label: "Compete",
		icon: Trophy,
		targetPath: "/tournaments",
		matchPaths: ["/tournaments", "/challenges", "/badges", "/gym"],
	},
	{
		id: "social",
		label: "Social",
		icon: Users,
		targetPath: "/social",
		matchPaths: ["/social"],
	},
]

let currentPath = $derived(nav.path)

function isActive(tab: Tab): boolean {
	return tab.matchPaths.includes(currentPath)
}
</script>

<nav class="bottom-tab-bar" aria-label="Primary">
	{#each TABS as tab (tab.id)}
		<button
			type="button"
			class="tab"
			class:active={isActive(tab)}
			aria-current={isActive(tab) ? "page" : undefined}
			onclick={() => page(tab.targetPath)}
		>
			<tab.icon size={22} strokeWidth={isActive(tab) ? 2.5 : 2} />
			<span class="tab-label">{tab.label}</span>
		</button>
	{/each}
</nav>

<style>
.bottom-tab-bar {
	position: sticky;
	bottom: 0;
	left: 0;
	right: 0;
	display: flex;
	background: var(--color-surface);
	border-top: 1px solid var(--color-border);
	padding: var(--space-2) 0 max(var(--space-2), env(safe-area-inset-bottom));
	z-index: 10;
}

.tab {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--space-1);
	background: none;
	border: none;
	color: var(--color-text-muted);
	font-family: var(--font-sans);
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-medium);
	cursor: pointer;
	padding: var(--space-1) 0;
}

.tab.active {
	color: var(--color-accent);
	font-weight: var(--font-weight-semibold);
}

.tab-label {
	line-height: 1;
}
</style>
