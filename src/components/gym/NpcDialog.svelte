<script lang="ts">
import { api } from "../../lib/api.js"

type Props = {
	npcKey: string
	onClose: () => void
}

let { npcKey, onClose }: Props = $props()

type NpcDetail = {
	npc: { key: string; name: string; role: string; portraitUrl: string | null }
	relationship: {
		level: number
		stage: number
		stageLabel: string
		interactionCount: number
	}
	prompts: { index: number; promptText: string }[]
}

type InteractResult = {
	dialog: {
		promptText: string
		response: string
		portraitVariant: "happy" | "neutral" | "determined"
	}
	relationship: {
		level: number
		stage: number
		stageLabel: string
		gain: number
	}
	stageAdvanced: boolean
	newStage?: number
}

let detail = $state<NpcDetail | null>(null)
let loading = $state(true)
let interacting = $state(false)
let result = $state<InteractResult | null>(null)
let error = $state<string | null>(null)

async function load() {
	try {
		detail = await api.get<NpcDetail>(`/gym/npc/${npcKey}`)
	} catch {
		error = "Failed to load NPC"
	} finally {
		loading = false
	}
}

async function interact(promptIndex: number) {
	if (interacting) return
	interacting = true
	error = null
	try {
		result = await api.post<InteractResult>("/gym/npc/interact", {
			npcKey,
			promptIndex,
		})
		if (detail) {
			detail.relationship = result.relationship
		}
	} catch {
		error = "Failed to interact"
	} finally {
		interacting = false
	}
}

const STAGE_COLORS: Record<number, string> = {
	0: "#94a3b8",
	1: "#60a5fa",
	2: "#34d399",
	3: "#fbbf24",
}

function getPortraitUrl(
	baseUrl: string | null,
	variant?: "happy" | "neutral" | "determined",
): string | null {
	if (!baseUrl) return null
	if (!variant || variant === "neutral") return baseUrl
	return baseUrl.replace(".png", `_${variant}.png`)
}

let portraitSrc = $derived(
	getPortraitUrl(
		detail?.npc.portraitUrl ?? null,
		result?.dialog.portraitVariant,
	),
)
let portraitFailedSrc = $state<string | null>(null)

$effect(() => {
	npcKey
	loading = true
	result = null
	error = null
	load()
})
</script>

<div class="dialog-overlay" role="dialog" aria-modal="true">
	<div class="dialog-panel">
		{#if loading}
			<p class="muted">Loading...</p>
		{:else if error && !detail}
			<p class="error-msg">{error}</p>
			<button class="close-btn" onclick={onClose}>Close</button>
		{:else if detail}
			<div class="npc-header">
				{#if portraitSrc && portraitFailedSrc !== portraitSrc}
					<img
						class="portrait"
						src={portraitSrc}
						alt={detail.npc.name}
						onerror={() => {
							portraitFailedSrc = portraitSrc
						}}
					/>
				{:else}
					<div class="portrait-placeholder">{detail.npc.name[0]}</div>
				{/if}
				<div class="npc-info">
					<h3 class="npc-name">{detail.npc.name}</h3>
					<span class="npc-role">{detail.npc.role}</span>
					<span
						class="stage-badge"
						style="color: {STAGE_COLORS[detail.relationship.stage] ?? '#94a3b8'}"
					>
						{detail.relationship.stageLabel}
					</span>
					<div class="rel-bar-track">
						<div
							class="rel-bar-fill"
							style="width: {detail.relationship.level}%"
						></div>
					</div>
				</div>
			</div>

			{#if result}
				<div class="response-area">
					{#if result.stageAdvanced}
						<div class="stage-advance">
							{detail.npc.name} considers you a {result.relationship.stageLabel} now!
						</div>
					{/if}
					<p class="prompt-echo">You: "{result.dialog.promptText}"</p>
					<p class="npc-response">{detail.npc.name}: "{result.dialog.response}"</p>
					<span class="rel-gain">+{result.relationship.gain} relationship</span>
				</div>
				<button class="close-btn" onclick={onClose}>Close</button>
			{:else}
				<div class="prompts">
					{#each detail.prompts as prompt (prompt.index)}
						<button
							class="prompt-btn"
							disabled={interacting}
							onclick={() => interact(prompt.index)}
						>
							{prompt.promptText}
						</button>
					{/each}
				</div>
				<button class="close-btn secondary" onclick={onClose}>Leave</button>
			{/if}

			{#if error}
				<p class="error-msg small">{error}</p>
			{/if}
		{/if}
	</div>
</div>

<style>
.dialog-overlay {
	position: absolute;
	inset: 0;
	background: rgba(0, 0, 0, 0.6);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 100;
}

.dialog-panel {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 0.75rem;
	padding: 1.25rem;
	max-width: 400px;
	width: 90%;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.npc-header {
	display: flex;
	gap: 0.75rem;
	align-items: flex-start;
}

.portrait {
	width: 64px;
	height: 64px;
	border-radius: 0.5rem;
	object-fit: cover;
	border: 2px solid var(--color-border);
}

.portrait-placeholder {
	width: 64px;
	height: 64px;
	border-radius: 0.5rem;
	background: var(--color-accent);
	color: #fff;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.5rem;
	font-weight: 700;
}

.npc-info {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
}

.npc-name {
	margin: 0;
	font-size: 1.1rem;
	font-weight: 700;
	color: var(--color-text);
}

.npc-role {
	font-size: 0.75rem;
	color: var(--color-text-muted);
	text-transform: capitalize;
}

.stage-badge {
	font-size: 0.7rem;
	font-weight: 600;
}

.rel-bar-track {
	height: 4px;
	background: var(--color-border);
	border-radius: 2px;
	margin-top: 0.25rem;
}

.rel-bar-fill {
	height: 100%;
	background: var(--color-accent);
	border-radius: 2px;
	transition: width 0.3s;
}

.prompts {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.prompt-btn {
	background: var(--color-surface-2, var(--color-border));
	border: 1px solid var(--color-border);
	border-radius: 0.375rem;
	padding: 0.5rem 0.75rem;
	color: var(--color-text);
	font-size: 0.8125rem;
	text-align: left;
	cursor: pointer;
	transition: background 0.15s;
}

.prompt-btn:hover:not(:disabled) {
	background: color-mix(in srgb, var(--color-accent) 15%, var(--color-surface));
	border-color: var(--color-accent);
}

.prompt-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.response-area {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.prompt-echo {
	font-size: 0.8125rem;
	color: var(--color-text-muted);
	font-style: italic;
	margin: 0;
}

.npc-response {
	font-size: 0.875rem;
	color: var(--color-text);
	margin: 0;
	line-height: 1.5;
}

.rel-gain {
	font-size: 0.7rem;
	color: var(--color-accent);
	font-weight: 600;
}

.stage-advance {
	background: color-mix(in srgb, var(--color-accent) 15%, var(--color-surface));
	border: 1px solid var(--color-accent);
	border-radius: 0.375rem;
	padding: 0.5rem 0.75rem;
	font-size: 0.8125rem;
	color: var(--color-accent);
	font-weight: 600;
	text-align: center;
}

.close-btn {
	background: var(--color-accent);
	color: #fff;
	border: none;
	border-radius: 0.375rem;
	padding: 0.5rem 1rem;
	font-size: 0.8125rem;
	font-weight: 600;
	cursor: pointer;
}

.close-btn.secondary {
	background: transparent;
	border: 1px solid var(--color-border);
	color: var(--color-text-muted);
}

.muted {
	color: var(--color-text-muted);
	font-size: 0.875rem;
	margin: 0;
}

.error-msg {
	color: var(--color-danger);
	font-size: 0.875rem;
	margin: 0;
}

.error-msg.small {
	font-size: 0.75rem;
}
</style>
