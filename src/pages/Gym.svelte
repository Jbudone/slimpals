<script lang="ts">
import { onMount } from "svelte"
import GymUI from "../components/gym/GymUI.svelte"
import NpcDialog from "../components/gym/NpcDialog.svelte"
import PhaserGym from "../components/gym/PhaserGym.svelte"
import { api } from "../lib/api.js"

type UpgradeItem = {
	key: string
	name: string
	description: string | null
	category: string
	unlockedAt?: string
	placementData?: { x: number; y: number } | null
	requiredXp?: number
}

type GymResponse = {
	gym: { id: number; name: string; level: number; xp: number }
	upgrades: {
		unlocked: UpgradeItem[]
		pending: UpgradeItem[]
		locked: UpgradeItem[]
	}
	xpToNextLevel: number
}

let gymData = $state<GymResponse | null>(null)
let loading = $state(true)
let error = $state<string | null>(null)
let claiming = $state(false)
let dialogNpcKey = $state<string | null>(null)
let ceremonyUpgradeKey = $state<string | null>(null)
let ceremonyActive = $state(false)
let upgradeCompleteToast = $state(false)

async function loadGym() {
	try {
		gymData = await api.get<GymResponse>("/gym")
	} catch {
		error = "Failed to load gym"
	} finally {
		loading = false
	}
}

function claimNext() {
	if (
		!gymData ||
		gymData.upgrades.pending.length === 0 ||
		claiming ||
		ceremonyActive
	)
		return
	const nextKey = gymData.upgrades.pending[0].key
	dialogNpcKey = null
	ceremonyUpgradeKey = nextKey
	ceremonyActive = true
}

async function handleCeremonyComplete() {
	if (!gymData || !ceremonyUpgradeKey) return
	const key = ceremonyUpgradeKey
	claiming = true
	try {
		gymData = await api.post<GymResponse>("/gym/claim-upgrade", { key })
		upgradeCompleteToast = true
		setTimeout(() => {
			upgradeCompleteToast = false
		}, 3000)
	} catch {
		error = "Failed to claim upgrade"
	} finally {
		ceremonyUpgradeKey = null
		ceremonyActive = false
		claiming = false
	}
}

function handleNpcClick(npcKey: string) {
	dialogNpcKey = npcKey
}

function closeDialog() {
	dialogNpcKey = null
}

onMount(loadGym)
</script>

<div class="gym-page">
	{#if loading}
		<p class="muted center">Loading gym...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else if gymData}
		<GymUI
			gymName={gymData.gym.name}
			level={gymData.gym.level}
			xp={gymData.gym.xp}
			xpToNextLevel={gymData.xpToNextLevel}
			pendingCount={gymData.upgrades.pending.length}
			onClaim={claimNext}
			{ceremonyActive}
		/>
		<div class="canvas-area">
			<PhaserGym
				unlocked={gymData.upgrades.unlocked}
				locked={gymData.upgrades.locked}
				onNpcClick={handleNpcClick}
				{ceremonyUpgradeKey}
				onCeremonyComplete={handleCeremonyComplete}
			/>
			{#if dialogNpcKey}
				<NpcDialog npcKey={dialogNpcKey} onClose={closeDialog} />
			{/if}
			{#if upgradeCompleteToast}
				<div class="upgrade-toast">Upgrade Complete! 🎉</div>
			{/if}
		</div>
	{/if}
</div>

<style>
.gym-page {
	display: flex;
	flex-direction: column;
	height: calc(100vh - 52px);
}

.canvas-area {
	flex: 1;
	min-height: 0;
	position: relative;
}

.muted {
	color: var(--color-text-muted);
	font-size: 0.875rem;
}

.center {
	text-align: center;
	padding: 2rem;
}

.error {
	background: color-mix(in srgb, var(--color-danger) 15%, transparent);
	border: 1px solid var(--color-danger);
	color: var(--color-danger);
	border-radius: 0.375rem;
	padding: 0.625rem 0.875rem;
	font-size: 0.875rem;
	margin: 1rem;
}

.upgrade-toast {
	position: absolute;
	bottom: 1.5rem;
	left: 50%;
	transform: translateX(-50%);
	background: var(--color-accent);
	color: #fff;
	border-radius: 0.5rem;
	padding: 0.625rem 1.25rem;
	font-size: 0.9375rem;
	font-weight: 700;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	animation: slide-up 0.3s ease-out;
	pointer-events: none;
}

@keyframes slide-up {
	from { opacity: 0; transform: translateX(-50%) translateY(12px); }
	to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
