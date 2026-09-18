<script lang="ts">
import { Sparkles, Users } from "@lucide/svelte"
import { onMount } from "svelte"
import { api } from "../lib/api.js"
import { page } from "../router.svelte.js"
import Avatar from "./ui/Avatar.svelte"
import Button from "./ui/Button.svelte"
import Card from "./ui/Card.svelte"
import Pill from "./ui/Pill.svelte"

type GymEvent = {
	title: string
	description: string
} | null

type StreakBonus = {
	active: boolean
	multiplier: number
	currentStreak: number
}

let {
	todayEvent = null,
	streakBonus = null,
}: {
	todayEvent?: GymEvent
	streakBonus?: StreakBonus | null
} = $props()

type NpcInfo = { key: string; name: string }

type NpcSimState = {
	npcKey: string
	isPresent: boolean
	currentActivity:
		| "walking"
		| "using_equipment"
		| "idle"
		| "chatting"
		| "leaving"
	targetEquipmentKey: string | null
	chatEventWith: string | null
}

// Human labels for the equipment keys NPCs can actually be assigned to via
// targetEquipmentKey (cardio/weights/amenities only — decor/staff aren't
// "used" by NPCs the same way). See server/services/gym/simulation.ts's
// EQUIPMENT_BY_CATEGORY for the source list.
const EQUIPMENT_LABELS: Record<string, string> = {
	cardio_treadmill: "the treadmill",
	cardio_rowing: "the rowing machine",
	cardio_bikes: "the bikes",
	cardio_stairs: "the stair climber",
	cardio_cinema: "the cardio cinema",
	weights_dumbbells: "the dumbbells",
	weights_barbell: "the barbell",
	weights_cable: "the cable machine",
	weights_smith: "the smith machine",
	weights_olympic: "the olympic platform",
	amenity_water: "the water station",
	amenity_lockers: "the lockers",
	amenity_showers: "the showers",
	amenity_sauna: "the sauna",
	amenity_juice: "the juice bar",
}

let names = $state<Map<string, string>>(new Map())
let presentCount = $state(0)
let highlightLine = $state<string | null>(null)
let loaded = $state(false)

function displayName(npcKey: string): string {
	return names.get(npcKey) ?? npcKey
}

async function load() {
	try {
		const [npcs, sim] = await Promise.all([
			api.get<NpcInfo[]>("/gym/npcs"),
			api.get<{ npcs: NpcSimState[] }>("/gym/sim-state"),
		])
		names = new Map(npcs.map((n) => [n.key, n.name]))

		const present = sim.npcs.filter((n) => n.isPresent)
		presentCount = present.length

		const chatting = present.find(
			(n) => n.currentActivity === "chatting" && n.chatEventWith,
		)
		const usingEquipment = present.find(
			(n) => n.currentActivity === "using_equipment" && n.targetEquipmentKey,
		)

		if (chatting?.chatEventWith) {
			highlightLine = `${displayName(chatting.npcKey)} and ${displayName(chatting.chatEventWith)} are catching up`
		} else if (usingEquipment?.targetEquipmentKey) {
			const equipment =
				EQUIPMENT_LABELS[usingEquipment.targetEquipmentKey] ?? "the equipment"
			highlightLine = `${displayName(usingEquipment.npcKey)} is on ${equipment}`
		}
	} catch {
		// ignore — card stays hidden if the gym isn't unlocked yet
	} finally {
		loaded = true
	}
}

onMount(load)

let hasContent = $derived(
	presentCount > 0 || todayEvent !== null || (streakBonus?.active ?? false),
)
</script>

{#if loaded && hasContent}
	<Card>
		<div class="activity-header">
			<span class="activity-heading">Gym Activity</span>
			{#if streakBonus?.active}
				<Pill tone="accent">{streakBonus.multiplier}x XP</Pill>
			{/if}
		</div>

		{#if todayEvent}
			<div class="activity-row">
				<Avatar tone="accent">
					{#snippet icon()}
						<Sparkles size={18} />
					{/snippet}
				</Avatar>
				<div class="activity-copy">
					<span class="activity-title">{todayEvent.title}</span>
					<span class="activity-subtext">{todayEvent.description}</span>
				</div>
			</div>
		{/if}

		{#if presentCount > 0}
			<div class="activity-row">
				<Avatar tone="accent">
					{#snippet icon()}
						<Users size={18} />
					{/snippet}
				</Avatar>
				<div class="activity-copy">
					<span class="activity-title">
						{presentCount} {presentCount === 1 ? "person is" : "people are"} in the gym
						right now
					</span>
					{#if highlightLine}
						<span class="activity-subtext">{highlightLine}</span>
					{/if}
				</div>
			</div>
		{/if}

		<Button variant="secondary" onclick={() => page("/gym/canvas")}>Visit gym</Button>
	</Card>
{/if}

<style>
.activity-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.activity-heading {
	font-family: var(--font-display);
	font-size: var(--font-size-lg);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.activity-row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
}

.activity-copy {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
	flex: 1;
	min-width: 0;
}

.activity-title {
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	color: var(--color-text);
}

.activity-subtext {
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}
</style>
