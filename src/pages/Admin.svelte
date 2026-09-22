<script lang="ts">
import { onMount } from "svelte"
import { api } from "../lib/api.js"
import { fetchSession } from "../lib/auth.svelte.js"
import { fetchUserProfile } from "../lib/user.svelte.js"
import { page } from "../router.svelte.js"

type AdminUser = {
	id: string
	name: string
	email: string
	isAdmin: boolean
	createdAt: string
}

type Badge = {
	id: number
	key: string
	name: string
	tier: string
}

type ChallengeGoal = {
	id: string
	title: string
	description: string
	target: number
	unit: string
}

type UserChallengeState = {
	challenge: {
		id: number
		title: string
		description: string | null
		theme: string | null
		month: number
		year: number
		goals: ChallengeGoal[]
	} | null
	joined: boolean
	completedTasks: Record<string, number> | null
	completedAt: string | null
	goalsCompleted: number
	totalGoals: number
}

type SprintTask = {
	id: string
	title: string
	description: string
}

type UserSprintState = {
	sprint: {
		id: number
		title: string
		weekStart: string
		tasks: SprintTask[]
	} | null
	completedTasks: string[] | null
	completedAt: string | null
	progress: number
}

type AdminTournamentSummary = {
	id: number
	name: string
	type: string
	startDate: string
	endDate: string
	winnerId: string | null
	resolvedAt: string | null
	participantCount: number
}

type AdminTournamentDetail = {
	tournament: AdminTournamentSummary & {
		goalValue: number | null
		rewardDescription: string | null
		victoryMessage: string | null
	}
	participants: {
		userId: string
		userName: string
		joinedAt: string
		completed: boolean
		score: number
	}[]
}

type AdminWeightEntry = {
	id: number
	weightKg: number
	note: string | null
	recordedAt: string
	source: string
}

type AdminFoodEntry = {
	id: number
	photoUrl: string
	aiAnalysis: Record<string, unknown> | null
	mealType: string
	loggedAt: string
	isShared: boolean
}

type AdminGymNpc = {
	key: string
	name: string
	role: string
	unlocked: boolean
	relationshipLevel: number
	relationshipStage: number
	stageLabel: string
	interactionCount: number
	gymDaysActive: number
	mood: number | null
	goalSequence: unknown[] | null
}

type AdminDialogEntry = {
	promptText: string
	response: string
	portraitVariant: string
	personalityTagAdded: string | null
}

type AdminGymUpgrade = {
	key: string
	name: string
	category: string
	requiredXp: number
	unlocksNpcKey: string | null
	status: "claimed" | "pending" | "locked"
	unlockedAt: string | null
	placementData: unknown | null
}

type AdminSocialPost = {
	id: number
	userId: string
	userName: string
	type: string
	content: Record<string, unknown>
	createdAt: string
	reactionCount: number
}

let users = $state<AdminUser[]>([])
let allBadges = $state<Badge[]>([])
let loading = $state(true)
let loadError = $state<string | null>(null)

let tournaments = $state<AdminTournamentSummary[]>([])
let expandedTournamentId = $state<number | null>(null)
let tournamentDetail = $state<AdminTournamentDetail | null>(null)
let tournamentDetailLoading = $state(false)
let tournamentDetailError = $state<string | null>(null)

let seedTournamentCreatorId = $state("")
let seedTournamentType = $state<
	"weight_loss" | "step_count" | "streak" | "food_challenge"
>("streak")
let seedTournamentName = $state("")
let seedTournamentParticipantIds = $state<string[]>([])
let seedTournamentStatus = $state<{ text: string; ok: boolean } | null>(null)

let socialPosts = $state<AdminSocialPost[]>([])

let injectPostUserId = $state("")
let injectPostType = $state<
	| "food_photo"
	| "ai_message"
	| "milestone"
	| "weight_update"
	| "challenge_completion"
>("milestone")
let injectPostContent = $state("")
let injectPostStatus = $state<{ text: string; ok: boolean } | null>(null)

let newName = $state("")
let newEmail = $state("")
let newPassword = $state("TestPass1!")
let creating = $state(false)
let createResult = $state<{ text: string; ok: boolean } | null>(null)

let expandedId = $state<string | null>(null)
let seedTab = $state<
	"checkins" | "weight" | "badges" | "food" | "gym" | "challenges" | "sprints"
>("checkins")
let seedStatus = $state<{ text: string; ok: boolean } | null>(null)

let challengeState = $state<UserChallengeState | null>(null)
let challengeLoading = $state(false)
let challengeError = $state<string | null>(null)

let sprintState = $state<UserSprintState | null>(null)
let sprintLoading = $state(false)
let sprintError = $state<string | null>(null)

let weightEntriesForUser = $state<AdminWeightEntry[]>([])
let weightEntriesLoading = $state(false)
let weightEntriesError = $state<string | null>(null)
let editingWeightId = $state<number | null>(null)
let editWeightKg = $state(0)
let editWeightNote = $state("")

let foodEntriesForUser = $state<AdminFoodEntry[]>([])
let foodEntriesLoading = $state(false)
let foodEntriesError = $state<string | null>(null)
let editingFoodId = $state<number | null>(null)
let editFoodMealType = $state<"breakfast" | "lunch" | "dinner" | "snack">(
	"breakfast",
)
let editFoodLoggedAt = $state("")

let gymNpcsForUser = $state<AdminGymNpc[]>([])
let gymNpcsHasGym = $state(true)
let gymNpcsLoading = $state(false)
let gymNpcsError = $state<string | null>(null)
let editingGymNpcKey = $state<string | null>(null)
let editRelationshipLevel = $state(0)
let editMood = $state(0)
let editGoalSequenceText = $state("[]")
let editGymNpcError = $state<string | null>(null)

let gymHourOverride = $state<number | null>(null)
let gymCurrentHour = $state(0)
let gymHourInput = $state(0)
let gymHourLoading = $state(false)
let gymHourError = $state<string | null>(null)
let gymHourStatus = $state<{ text: string; ok: boolean } | null>(null)

const GYM_PROGRESSION_CHECKPOINTS = [
	{ days: 1, id: "grand_opening", label: "Grand Opening" },
	{ days: 7, id: "first_week", label: "First Week" },
	{ days: 30, id: "one_month_in", label: "One Month In" },
	{ days: 90, id: "established", label: "Established" },
] as const

let gymProgressionDays = $state(0)
let gymProgressionApplying = $state(false)
let gymProgressionStatus = $state<{ text: string; ok: boolean } | null>(null)

let dialogPreviewNpcKey = $state<string | null>(null)
let dialogPreviewStage = $state(0)
let dialogPreviewEntries = $state<AdminDialogEntry[]>([])
let dialogPreviewLoading = $state(false)
let dialogPreviewError = $state<string | null>(null)

let gymUpgradesForUser = $state<AdminGymUpgrade[]>([])
let gymUpgradesGym = $state<{
	level: number
	xp: number
	pendingUpgradeKeys: string[]
} | null>(null)
let gymUpgradesLoading = $state(false)
let gymUpgradesError = $state<string | null>(null)

const now = new Date()
let seedChallengeMonth = $state(now.getUTCMonth() + 1)
let seedChallengeYear = $state(now.getUTCFullYear())
let seedChallengeCompletion = $state<
	"none" | "partial" | "near_complete" | "complete"
>("complete")

function mondayOfWeek(d: Date): Date {
	const date = new Date(d)
	date.setUTCHours(0, 0, 0, 0)
	const day = date.getUTCDay()
	const diff = day === 0 ? 6 : day - 1
	date.setUTCDate(date.getUTCDate() - diff)
	return date
}

let seedSprintWeekStart = $state(mondayOfWeek(now).toISOString().slice(0, 10))
let seedSprintCompletion = $state<
	"none" | "partial" | "near_complete" | "complete"
>("complete")

let checkinDays = $state(7)
let weightCount = $state(5)
let weightStartKg = $state(90)
let weightEndKg = $state(85)
let selectedKeys = $state<Set<string>>(new Set())
let foodCount = $state(3)

const badgesByTier = $derived(
	["platinum", "gold", "silver", "bronze"].flatMap((tier) =>
		allBadges.filter((b) => b.tier === tier),
	),
)

async function load() {
	loading = true
	try {
		;[users, allBadges, tournaments, socialPosts] = await Promise.all([
			api.get<AdminUser[]>("/admin/users"),
			api.get<Badge[]>("/badges"),
			api.get<AdminTournamentSummary[]>("/admin/tournaments"),
			api.get<AdminSocialPost[]>("/admin/social/posts"),
		])
	} catch (e) {
		loadError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		loading = false
	}
}

async function viewTournament(id: number) {
	if (expandedTournamentId === id) {
		expandedTournamentId = null
		tournamentDetail = null
		return
	}
	expandedTournamentId = id
	tournamentDetail = null
	tournamentDetailError = null
	tournamentDetailLoading = true
	try {
		tournamentDetail = await api.get<AdminTournamentDetail>(
			`/admin/tournaments/${id}`,
		)
	} catch (e) {
		tournamentDetailError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		tournamentDetailLoading = false
	}
}

async function seedTournament() {
	seedTournamentStatus = null
	if (!seedTournamentCreatorId) {
		seedTournamentStatus = { text: "Pick a creator first", ok: false }
		return
	}
	try {
		const result = await api.post<{ tournament: { name: string } }>(
			"/admin/tournaments/seed",
			{
				creatorId: seedTournamentCreatorId,
				type: seedTournamentType,
				name: seedTournamentName || undefined,
				participantIds: seedTournamentParticipantIds,
			},
		)
		seedTournamentStatus = {
			text: `Seeded tournament: "${result.tournament.name}"`,
			ok: true,
		}
		seedTournamentName = ""
		seedTournamentParticipantIds = []
		await load()
	} catch (e) {
		seedTournamentStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function forceResolveTournament(id: number) {
	tournamentDetailError = null
	try {
		await api.post(`/admin/tournaments/${id}/resolve`)
		await load()
		tournamentDetail = await api.get<AdminTournamentDetail>(
			`/admin/tournaments/${id}`,
		)
	} catch (e) {
		tournamentDetailError = e instanceof Error ? e.message : "Failed"
	}
}

async function deleteTournament(id: number, name: string) {
	if (!confirm(`Delete tournament "${name}"? This cannot be undone.`)) return
	try {
		await api.del(`/admin/tournaments/${id}`)
		if (expandedTournamentId === id) {
			expandedTournamentId = null
			tournamentDetail = null
		}
		await load()
	} catch (e) {
		alert(`Delete failed: ${e instanceof Error ? e.message : "Unknown error"}`)
	}
}

function socialPostSummary(post: AdminSocialPost): string {
	const c = post.content
	switch (post.type) {
		case "food_photo":
			return String(c.foodName ?? "Food")
		case "weight_update":
			return String(c.text ?? `${c.currentWeightKg ?? "?"} kg`)
		case "milestone":
			return String(c.badgeName ?? c.text ?? "Milestone")
		case "ai_message":
			return String(c.message ?? "")
		case "challenge_completion":
			return String(c.challengeName ?? "Challenge completed")
		default:
			return ""
	}
}

async function deleteSocialPost(id: number) {
	if (!confirm("Delete this post? This cannot be undone.")) return
	try {
		await api.del(`/admin/social/posts/${id}`)
		await load()
	} catch (e) {
		alert(`Delete failed: ${e instanceof Error ? e.message : "Unknown error"}`)
	}
}

async function injectSocialPost() {
	injectPostStatus = null
	if (!injectPostUserId) {
		injectPostStatus = { text: "Pick a user first", ok: false }
		return
	}
	let content: unknown
	try {
		content = injectPostContent.trim() ? JSON.parse(injectPostContent) : {}
	} catch {
		injectPostStatus = { text: "Content must be valid JSON", ok: false }
		return
	}
	try {
		await api.post("/admin/social/posts", {
			userId: injectPostUserId,
			type: injectPostType,
			content,
		})
		injectPostStatus = { text: "Post injected", ok: true }
		injectPostContent = ""
		await load()
	} catch (e) {
		injectPostStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function createUser() {
	creating = true
	createResult = null
	try {
		const r = await api.post<{ email: string; password: string }>(
			"/admin/users",
			{
				name: newName || undefined,
				email: newEmail || undefined,
				password: newPassword || undefined,
			},
		)
		createResult = { text: `Created: ${r.email} / ${r.password}`, ok: true }
		newName = ""
		newEmail = ""
		await load()
	} catch (e) {
		createResult = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	} finally {
		creating = false
	}
}

async function impersonate(userId: string) {
	try {
		await api.post(`/admin/impersonate/${userId}`)
		await fetchSession()
		await fetchUserProfile()
		window.location.href = "/"
	} catch (e) {
		alert(
			`Impersonation failed: ${e instanceof Error ? e.message : "Unknown error"}`,
		)
	}
}

async function deleteUser(userId: string, name: string) {
	if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
	try {
		await api.del(`/admin/users/${userId}`)
		await load()
	} catch (e) {
		alert(`Delete failed: ${e instanceof Error ? e.message : "Unknown error"}`)
	}
}

function toggleExpand(userId: string) {
	if (expandedId === userId) {
		expandedId = null
	} else {
		expandedId = userId
		seedTab = "checkins"
		seedStatus = null
		selectedKeys = new Set()
		challengeState = null
		challengeError = null
		sprintState = null
		sprintError = null
	}
}

async function loadChallengeState(userId: string) {
	challengeLoading = true
	challengeError = null
	try {
		challengeState = await api.get<UserChallengeState>(
			`/admin/users/${userId}/challenge`,
		)
	} catch (e) {
		challengeError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		challengeLoading = false
	}
}

async function loadSprintState(userId: string) {
	sprintLoading = true
	sprintError = null
	try {
		sprintState = await api.get<UserSprintState>(
			`/admin/users/${userId}/sprint`,
		)
	} catch (e) {
		sprintError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		sprintLoading = false
	}
}

async function loadWeightEntries(userId: string) {
	weightEntriesLoading = true
	weightEntriesError = null
	try {
		weightEntriesForUser = await api.get<AdminWeightEntry[]>(
			`/admin/users/${userId}/weight`,
		)
	} catch (e) {
		weightEntriesError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		weightEntriesLoading = false
	}
}

function startEditWeight(entry: AdminWeightEntry) {
	editingWeightId = entry.id
	editWeightKg = entry.weightKg
	editWeightNote = entry.note ?? ""
}

function cancelEditWeight() {
	editingWeightId = null
}

async function saveEditWeight(userId: string, id: number) {
	try {
		await api.patch(`/admin/weight/${id}`, {
			weightKg: editWeightKg,
			note: editWeightNote || null,
		})
		editingWeightId = null
		await loadWeightEntries(userId)
	} catch (e) {
		alert(`Update failed: ${e instanceof Error ? e.message : "Unknown error"}`)
	}
}

async function deleteWeightEntry(userId: string, id: number) {
	if (!confirm("Delete this weight entry? This cannot be undone.")) return
	try {
		await api.del(`/admin/weight/${id}`)
		await loadWeightEntries(userId)
	} catch (e) {
		alert(`Delete failed: ${e instanceof Error ? e.message : "Unknown error"}`)
	}
}

async function loadFoodEntries(userId: string) {
	foodEntriesLoading = true
	foodEntriesError = null
	try {
		foodEntriesForUser = await api.get<AdminFoodEntry[]>(
			`/admin/users/${userId}/food`,
		)
	} catch (e) {
		foodEntriesError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		foodEntriesLoading = false
	}
}

function startEditFood(entry: AdminFoodEntry) {
	editingFoodId = entry.id
	editFoodMealType = entry.mealType as typeof editFoodMealType
	editFoodLoggedAt = new Date(entry.loggedAt).toISOString().slice(0, 10)
}

function cancelEditFood() {
	editingFoodId = null
}

async function saveEditFood(userId: string, id: number) {
	try {
		await api.patch(`/admin/food/${id}`, {
			mealType: editFoodMealType,
			loggedAt: new Date(editFoodLoggedAt).toISOString(),
		})
		editingFoodId = null
		await loadFoodEntries(userId)
	} catch (e) {
		alert(`Update failed: ${e instanceof Error ? e.message : "Unknown error"}`)
	}
}

async function deleteFoodEntry(userId: string, id: number) {
	if (!confirm("Delete this food entry? This cannot be undone.")) return
	try {
		await api.del(`/admin/food/${id}`)
		await loadFoodEntries(userId)
	} catch (e) {
		alert(`Delete failed: ${e instanceof Error ? e.message : "Unknown error"}`)
	}
}

async function loadGymNpcs(userId: string) {
	gymNpcsLoading = true
	gymNpcsError = null
	try {
		const result = await api.get<{ hasGym: boolean; npcs: AdminGymNpc[] }>(
			`/admin/users/${userId}/gym/npcs`,
		)
		gymNpcsHasGym = result.hasGym
		gymNpcsForUser = result.npcs
	} catch (e) {
		gymNpcsError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		gymNpcsLoading = false
	}
}

function startEditGymNpc(npc: AdminGymNpc) {
	editingGymNpcKey = npc.key
	editRelationshipLevel = npc.relationshipLevel
	editMood = npc.mood ?? 0
	editGoalSequenceText = JSON.stringify(npc.goalSequence ?? [], null, 2)
	editGymNpcError = null
}

function cancelEditGymNpc() {
	editingGymNpcKey = null
	editGymNpcError = null
}

async function saveEditGymNpc(userId: string, npcKey: string) {
	editGymNpcError = null
	let goalSequence: unknown
	try {
		goalSequence = JSON.parse(editGoalSequenceText)
	} catch {
		editGymNpcError = "goalSequence must be valid JSON"
		return
	}
	try {
		await api.patch(`/admin/users/${userId}/gym/npcs/${npcKey}`, {
			relationshipLevel: editRelationshipLevel,
			mood: editMood,
			goalSequence,
		})
		editingGymNpcKey = null
		await loadGymNpcs(userId)
	} catch (e) {
		editGymNpcError = e instanceof Error ? e.message : "Update failed"
	}
}

async function loadGymHourOverride(userId: string) {
	gymHourLoading = true
	gymHourError = null
	try {
		const result = await api.get<{
			hasGym: boolean
			hourOverride: number | null
			currentHour: number
		}>(`/admin/users/${userId}/gym/hour-override`)
		gymHourOverride = result.hourOverride
		gymCurrentHour = result.currentHour
		gymHourInput = result.hourOverride ?? result.currentHour
	} catch (e) {
		gymHourError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		gymHourLoading = false
	}
}

async function saveGymHourOverride(userId: string) {
	gymHourStatus = null
	try {
		const result = await api.patch<{ hourOverride: number | null }>(
			`/admin/users/${userId}/gym/hour-override`,
			{ hour: gymHourInput },
		)
		gymHourOverride = result.hourOverride
		gymHourStatus = { text: `Gym clock forced to ${gymHourInput}:00`, ok: true }
	} catch (e) {
		gymHourStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function clearGymHourOverride(userId: string) {
	gymHourStatus = null
	try {
		const result = await api.patch<{ hourOverride: number | null }>(
			`/admin/users/${userId}/gym/hour-override`,
			{ hour: null },
		)
		gymHourOverride = result.hourOverride
		gymHourStatus = { text: "Gym clock returned to real time", ok: true }
	} catch (e) {
		gymHourStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function loadDialogPreview(
	userId: string,
	npcKey: string,
	stage: number,
	regenerate = false,
) {
	dialogPreviewLoading = true
	dialogPreviewError = null
	try {
		const query = `stage=${stage}${regenerate ? "&regenerate=true" : ""}`
		const result = await api.get<{ dialogs: AdminDialogEntry[] }>(
			`/admin/users/${userId}/gym/npcs/${npcKey}/dialogs?${query}`,
		)
		dialogPreviewEntries = result.dialogs
	} catch (e) {
		dialogPreviewError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		dialogPreviewLoading = false
	}
}

function openDialogPreview(userId: string, npc: AdminGymNpc) {
	dialogPreviewNpcKey = npc.key
	dialogPreviewStage = npc.relationshipStage
	dialogPreviewEntries = []
	loadDialogPreview(userId, npc.key, npc.relationshipStage)
}

function closeDialogPreview() {
	dialogPreviewNpcKey = null
}

async function loadGymUpgrades(userId: string) {
	gymUpgradesLoading = true
	gymUpgradesError = null
	try {
		const result = await api.get<{
			hasGym: boolean
			gym: { level: number; xp: number; pendingUpgradeKeys: string[] } | null
			upgrades: AdminGymUpgrade[]
		}>(`/admin/users/${userId}/gym/upgrades`)
		gymUpgradesGym = result.gym
		gymUpgradesForUser = result.upgrades
	} catch (e) {
		gymUpgradesError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		gymUpgradesLoading = false
	}
}

async function applyGymProgression(userId: string, days: number) {
	gymProgressionApplying = true
	gymProgressionStatus = null
	try {
		const result = await api.post<{
			daysElapsed: number
			xp: number
			level: number
			unlockedUpgradeKeys: string[]
			relationshipLevel: number
			gymDaysActive: number
		}>(`/admin/users/${userId}/gym/progression`, { daysElapsed: days })
		gymProgressionDays = result.daysElapsed
		gymProgressionStatus = {
			text: `Applied day ${result.daysElapsed}: Lv ${result.level} (${result.xp} XP), ${result.unlockedUpgradeKeys.length} upgrades unlocked, relationship ${result.relationshipLevel}/100`,
			ok: true,
		}
		await loadGymNpcs(userId)
		await loadGymUpgrades(userId)
	} catch (e) {
		gymProgressionStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	} finally {
		gymProgressionApplying = false
	}
}

async function selectTab(
	userId: string,
	tab:
		| "checkins"
		| "weight"
		| "badges"
		| "food"
		| "gym"
		| "challenges"
		| "sprints",
) {
	seedTab = tab
	seedStatus = null
	if (tab === "challenges") {
		await loadChallengeState(userId)
	} else if (tab === "sprints") {
		await loadSprintState(userId)
	} else if (tab === "weight") {
		await loadWeightEntries(userId)
	} else if (tab === "food") {
		await loadFoodEntries(userId)
	} else if (tab === "gym") {
		await loadGymNpcs(userId)
		await loadGymHourOverride(userId)
		await loadGymUpgrades(userId)
	}
}

async function seedChallenge(userId: string) {
	seedStatus = null
	try {
		await api.post(`/admin/seed/${userId}/challenge`, {
			month: seedChallengeMonth,
			year: seedChallengeYear,
			completion: seedChallengeCompletion,
		})
		seedStatus = {
			text: `Seeded ${seedChallengeMonth}/${seedChallengeYear} at "${seedChallengeCompletion}"`,
			ok: true,
		}
		const isCurrentMonth =
			seedChallengeMonth === now.getUTCMonth() + 1 &&
			seedChallengeYear === now.getUTCFullYear()
		if (isCurrentMonth) {
			await loadChallengeState(userId)
		}
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function forceGenerateChallenge(userId: string) {
	seedStatus = null
	try {
		const generated = await api.post<{ title: string }>(
			"/admin/challenges/generate",
		)
		seedStatus = {
			text: `Generated this month's challenge: "${generated.title}"`,
			ok: true,
		}
		await loadChallengeState(userId)
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function seedSprint(userId: string) {
	seedStatus = null
	try {
		await api.post(`/admin/seed/${userId}/sprint`, {
			weekStart: new Date(seedSprintWeekStart).toISOString(),
			completion: seedSprintCompletion,
		})
		seedStatus = {
			text: `Seeded sprint for week of ${seedSprintWeekStart} at "${seedSprintCompletion}"`,
			ok: true,
		}
		const isCurrentWeek =
			seedSprintWeekStart === mondayOfWeek(now).toISOString().slice(0, 10)
		if (isCurrentWeek) {
			await loadSprintState(userId)
		}
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function forceGenerateSprint(userId: string) {
	seedStatus = null
	try {
		const result = await api.post<{ sprint: { title: string } }>(
			"/admin/sprints/generate",
			{ userId },
		)
		seedStatus = {
			text: `Generated sprint: "${result.sprint.title}"`,
			ok: true,
		}
		await loadSprintState(userId)
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function forceGenerateAllSprints() {
	seedStatus = null
	try {
		const result = await api.post<{ generated: number }>(
			"/admin/sprints/generate",
			{},
		)
		seedStatus = {
			text: `Generated sprints for ${result.generated} user${result.generated === 1 ? "" : "s"}`,
			ok: true,
		}
		if (expandedId) {
			await loadSprintState(expandedId)
		}
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function resetSprintProgress(userId: string) {
	seedStatus = null
	try {
		const result = await api.del<{ deleted: number }>(
			`/admin/users/${userId}/sprint`,
		)
		seedStatus = {
			text:
				result.deleted > 0
					? `Cleared sprint progress (${result.deleted} record${result.deleted === 1 ? "" : "s"})`
					: "No sprint progress to clear",
			ok: true,
		}
		await loadSprintState(userId)
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function resetChallengeProgress(userId: string) {
	seedStatus = null
	try {
		const result = await api.del<{ deleted: number }>(
			`/admin/users/${userId}/challenge`,
		)
		seedStatus = {
			text:
				result.deleted > 0
					? `Cleared challenge progress (${result.deleted} record${result.deleted === 1 ? "" : "s"})`
					: "No challenge progress to clear",
			ok: true,
		}
		await loadChallengeState(userId)
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

function toggleKey(key: string) {
	const next = new Set(selectedKeys)
	if (next.has(key)) next.delete(key)
	else next.add(key)
	selectedKeys = next
}

async function runSeed(path: string, body: object, msg: string) {
	seedStatus = null
	try {
		await api.post(path, body)
		seedStatus = { text: msg, ok: true }
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

onMount(load)
</script>

<div class="admin-wrap">
	<div class="admin-banner">
		<div class="admin-banner-text">
			<p class="admin-banner-sub">⚠ Admin / dev surface</p>
			<h1>Admin Panel</h1>
		</div>
		<button class="btn outline sm" onclick={() => page("/content-tuning")}>
			Content Tuning
		</button>
		<span class="dev-tag">ADMIN ONLY</span>
	</div>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if loadError}
		<p class="error-text">{loadError}</p>
	{:else}
		<section class="card">
			<h2>Create Test User</h2>
			<div class="form-row">
				<input class="inp" placeholder="Name (optional)" bind:value={newName} />
				<input class="inp" placeholder="Email (optional)" bind:value={newEmail} />
				<input class="inp" placeholder="Password" bind:value={newPassword} />
				<button class="btn primary" onclick={createUser} disabled={creating}>
					{creating ? "Creating…" : "Create"}
				</button>
			</div>
			{#if createResult}
				<p class="status-msg" class:ok={createResult.ok} class:fail={!createResult.ok}>
					{createResult.text}
				</p>
			{/if}
		</section>

		<section class="card">
			<h2>Users ({users.length})</h2>
			<table class="user-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Email</th>
						<th>Role</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each users as user (user.id)}
						<tr>
							<td>{user.name}</td>
							<td class="mono">{user.email}</td>
							<td>
								{#if user.isAdmin}<span class="admin-badge">Admin</span>{:else}User{/if}
							</td>
							<td class="actions-cell">
								<button class="btn accent sm" onclick={() => impersonate(user.id)}>
									Impersonate
								</button>
								<button
									class="btn outline sm"
									onclick={() => toggleExpand(user.id)}
								>
									{expandedId === user.id ? "Close" : "Seed"}
								</button>
								<button class="btn danger sm" onclick={() => deleteUser(user.id, user.name)}>
									Delete
								</button>
							</td>
						</tr>
						{#if expandedId === user.id}
							<tr class="seed-row">
								<td colspan="4">
									<div class="seed-panel">
										<div class="tab-bar">
											{#each (["checkins", "weight", "badges", "food", "gym", "challenges", "sprints"] as const) as tab}
												<button
													class="tab"
													class:active={seedTab === tab}
													onclick={() => selectTab(user.id, tab)}
												>
													{tab}
												</button>
											{/each}
										</div>

										<div class="tab-content">
											{#if seedTab === "checkins"}
												<div class="field-row">
													<label>
														Days
														<input type="number" class="inp inp-sm" bind:value={checkinDays} min="1" max="365" />
													</label>
													<button
														class="btn primary sm"
														onclick={() =>
															runSeed(
																`/admin/seed/${user.id}/checkins`,
																{ days: checkinDays },
																`Seeded ${checkinDays} consecutive check-in days`,
															)}
													>
														Seed Checkins
													</button>
												</div>
											{:else if seedTab === "weight"}
												<div class="field-row">
													<label>Entries <input type="number" class="inp inp-sm" bind:value={weightCount} min="1" max="100" /></label>
													<label>Start kg <input type="number" class="inp inp-sm" bind:value={weightStartKg} min="1" /></label>
													<label>End kg <input type="number" class="inp inp-sm" bind:value={weightEndKg} min="1" /></label>
													<button
														class="btn primary sm"
														onclick={async () => {
															await runSeed(
																`/admin/seed/${user.id}/weight`,
																{ count: weightCount, startKg: weightStartKg, endKg: weightEndKg },
																`Seeded ${weightCount} weight entries (${weightStartKg}→${weightEndKg} kg)`,
															)
															await loadWeightEntries(user.id)
														}}
													>
														Seed Weight
													</button>
												</div>
												<div class="challenge-view">
													{#if weightEntriesLoading}
														<p class="muted">Loading…</p>
													{:else if weightEntriesError}
														<p class="error-text">{weightEntriesError}</p>
													{:else if weightEntriesForUser.length === 0}
														<p class="muted">No weight entries yet.</p>
													{:else}
														<ul class="goal-list">
															{#each weightEntriesForUser as entry (entry.id)}
																<li>
																	{#if editingWeightId === entry.id}
																		<input type="number" class="inp inp-sm" bind:value={editWeightKg} step="0.1" min="1" />
																		<input class="inp inp-sm" placeholder="Note" bind:value={editWeightNote} />
																		<button class="btn primary sm" onclick={() => saveEditWeight(user.id, entry.id)}>Save</button>
																		<button class="btn outline sm" onclick={cancelEditWeight}>Cancel</button>
																	{:else}
																		<span class="goal-name">
																			{new Date(entry.recordedAt).toLocaleDateString()}
																		</span>
																		<span class="goal-progress">
																			{entry.weightKg} kg
																			{#if entry.note}· {entry.note}{/if}
																			· {entry.source}
																		</span>
																		<button class="btn outline sm" onclick={() => startEditWeight(entry)}>Edit</button>
																		<button class="btn danger sm" onclick={() => deleteWeightEntry(user.id, entry.id)}>Delete</button>
																	{/if}
																</li>
															{/each}
														</ul>
													{/if}
												</div>
											{:else if seedTab === "badges"}
												<div class="badge-grid">
													{#each badgesByTier as badge (badge.id)}
														<label class="badge-option">
															<input
																type="checkbox"
																checked={selectedKeys.has(badge.key)}
																onchange={() => toggleKey(badge.key)}
															/>
															<span class="tier-dot t-{badge.tier}"></span>
															<span class="badge-name">{badge.name}</span>
														</label>
													{/each}
												</div>
												<button
													class="btn primary sm"
													disabled={selectedKeys.size === 0}
													onclick={() =>
														runSeed(
															`/admin/seed/${user.id}/badges`,
															{ keys: [...selectedKeys] },
															`Awarded ${selectedKeys.size} badge(s)`,
														)}
												>
													Award {selectedKeys.size} Badge{selectedKeys.size !== 1 ? "s" : ""}
												</button>
											{:else if seedTab === "food"}
												<div class="field-row">
													<label>
														Entries
														<input type="number" class="inp inp-sm" bind:value={foodCount} min="1" max="30" />
													</label>
													<button
														class="btn primary sm"
														onclick={async () => {
															await runSeed(
																`/admin/seed/${user.id}/food`,
																{ count: foodCount },
																`Seeded ${foodCount} food log entries`,
															)
															await loadFoodEntries(user.id)
														}}
													>
														Seed Food
													</button>
												</div>
												<div class="challenge-view">
													{#if foodEntriesLoading}
														<p class="muted">Loading…</p>
													{:else if foodEntriesError}
														<p class="error-text">{foodEntriesError}</p>
													{:else if foodEntriesForUser.length === 0}
														<p class="muted">No food entries yet.</p>
													{:else}
														<ul class="goal-list">
															{#each foodEntriesForUser as entry (entry.id)}
																<li>
																	{#if editingFoodId === entry.id}
																		<select class="inp inp-sm" bind:value={editFoodMealType}>
																			<option value="breakfast">Breakfast</option>
																			<option value="lunch">Lunch</option>
																			<option value="dinner">Dinner</option>
																			<option value="snack">Snack</option>
																		</select>
																		<input type="date" class="inp inp-sm" bind:value={editFoodLoggedAt} />
																		<button class="btn primary sm" onclick={() => saveEditFood(user.id, entry.id)}>Save</button>
																		<button class="btn outline sm" onclick={cancelEditFood}>Cancel</button>
																	{:else}
																		<span class="goal-name">
																			{new Date(entry.loggedAt).toLocaleDateString()}
																		</span>
																		<span class="goal-progress">
																			{entry.mealType}
																			{#if entry.isShared}· shared{/if}
																		</span>
																		<button class="btn outline sm" onclick={() => startEditFood(entry)}>Edit</button>
																		<button class="btn danger sm" onclick={() => deleteFoodEntry(user.id, entry.id)}>Delete</button>
																	{/if}
																</li>
															{/each}
														</ul>
													{/if}
												</div>
											{:else if seedTab === "gym"}
												<div class="field-row">
													<button
														class="btn primary sm"
														onclick={() =>
															runSeed(
																"/gym/generate-content",
																{ userId: user.id },
																"Content generated (dialogs + gym event + portraits)",
															)}
													>
														Generate Gym Content
													</button>
													{#if import.meta.env.DEV}
														<button
															class="btn outline sm"
															onclick={() => page("/gym-sprites")}
														>
															Open Sprite/Animation Inspector
														</button>
													{/if}
												</div>
												<div class="progression-slider-row">
													<label class="progression-slider-label">
														Gym progression — day {gymProgressionDays}
														<input
															type="range"
															min="0"
															max="180"
															list="gym-progression-checkpoints"
															bind:value={gymProgressionDays}
															disabled={gymProgressionApplying}
														/>
													</label>
													<datalist id="gym-progression-checkpoints">
														{#each GYM_PROGRESSION_CHECKPOINTS as cp (cp.id)}
															<option value={cp.days}></option>
														{/each}
													</datalist>
													<button
														class="btn primary sm"
														disabled={gymProgressionApplying}
														onclick={() => applyGymProgression(user.id, gymProgressionDays)}
													>
														{gymProgressionApplying ? "Applying…" : `Apply Day ${gymProgressionDays}`}
													</button>
												</div>
												<div class="field-row">
													{#each GYM_PROGRESSION_CHECKPOINTS as cp (cp.id)}
														<button
															class="btn outline sm"
															disabled={gymProgressionApplying}
															onclick={() => applyGymProgression(user.id, cp.days)}
														>
															Day {cp.days} — {cp.label}
														</button>
													{/each}
												</div>
												{#if gymProgressionStatus}
													<p
														class="status-msg"
														class:ok={gymProgressionStatus.ok}
														class:fail={!gymProgressionStatus.ok}
													>
														{gymProgressionStatus.text}
													</p>
												{/if}
												<div class="field-row">
													{#if gymHourLoading}
														<p class="muted">Loading…</p>
													{:else}
														<label>
															Force hour of day
															<input type="number" class="inp inp-sm" bind:value={gymHourInput} min="0" max="23" />
														</label>
														<button class="btn primary sm" onclick={() => saveGymHourOverride(user.id)}>
															Set Gym Clock
														</button>
														{#if gymHourOverride !== null}
															<button class="btn outline sm" onclick={() => clearGymHourOverride(user.id)}>
																Clear (back to real time — {gymCurrentHour}:00)
															</button>
														{/if}
													{/if}
												</div>
												{#if gymHourError}
													<p class="error-text">{gymHourError}</p>
												{/if}
												{#if gymHourStatus}
													<p
														class="status-msg"
														class:ok={gymHourStatus.ok}
														class:fail={!gymHourStatus.ok}
													>
														{gymHourStatus.text}
													</p>
												{/if}
												{#if gymHourOverride !== null}
													<p class="muted">Gym clock forced to {gymHourOverride}:00 (real time is {gymCurrentHour}:00).</p>
												{/if}
												<div class="challenge-view">
													{#if gymNpcsLoading}
														<p class="muted">Loading…</p>
													{:else if gymNpcsError}
														<p class="error-text">{gymNpcsError}</p>
													{:else if !gymNpcsHasGym}
														<p class="muted">This user has no gym yet — editing an NPC below will create one.</p>
													{/if}
													{#if !gymNpcsLoading && !gymNpcsError}
														<ul class="goal-list">
															{#each gymNpcsForUser as npc (npc.key)}
																<li class:gym-npc-row={editingGymNpcKey === npc.key}>
																	{#if editingGymNpcKey === npc.key}
																		<div class="gym-npc-edit">
																			<div class="field-row">
																				<label>
																					Relationship level
																					<input type="number" class="inp inp-sm" bind:value={editRelationshipLevel} min="0" max="100" />
																				</label>
																				<label>
																					Mood
																					<input type="number" class="inp inp-sm" bind:value={editMood} min="-100" max="100" />
																				</label>
																			</div>
																			<label class="gym-npc-goal-label">
																				Goal sequence (JSON array)
																				<textarea class="inp gym-npc-textarea" bind:value={editGoalSequenceText}></textarea>
																			</label>
																			{#if editGymNpcError}
																				<p class="error-text">{editGymNpcError}</p>
																			{/if}
																			<div class="field-row">
																				<button class="btn primary sm" onclick={() => saveEditGymNpc(user.id, npc.key)}>Save</button>
																				<button class="btn outline sm" onclick={cancelEditGymNpc}>Cancel</button>
																			</div>
																		</div>
																	{:else}
																		<span class="goal-name">
																			{npc.name} <span class="muted">({npc.role})</span>
																			{#if !npc.unlocked}· <span class="muted">locked</span>{/if}
																		</span>
																		<span class="goal-progress">
																			Level {npc.relationshipLevel} · {npc.stageLabel}
																			· mood {npc.mood ?? "—"}
																		</span>
																		<button class="btn outline sm" onclick={() => startEditGymNpc(npc)}>Edit</button>
																	<button class="btn outline sm" onclick={() => openDialogPreview(user.id, npc)}>Dialogs</button>
																	{/if}
																</li>
																{#if dialogPreviewNpcKey === npc.key}
																	<li class="gym-npc-row">
																		<div class="gym-npc-edit">
																			<div class="field-row">
																				<label>
																					Relationship stage
																					<select
																						class="inp inp-sm"
																						bind:value={dialogPreviewStage}
																						onchange={() => loadDialogPreview(user.id, npc.key, dialogPreviewStage)}
																					>
																						<option value={0}>0 — Stranger</option>
																						<option value={1}>1 — Acquaintance</option>
																						<option value={2}>2 — Gym Buddy</option>
																						<option value={3}>3 — Friend</option>
																					</select>
																				</label>
																				<button
																					class="btn outline sm"
																					onclick={() => loadDialogPreview(user.id, npc.key, dialogPreviewStage, true)}
																				>
																					Regenerate
																				</button>
																				<button class="btn outline sm" onclick={closeDialogPreview}>Close</button>
																			</div>
																			{#if dialogPreviewLoading}
																				<p class="muted">Loading…</p>
																			{:else if dialogPreviewError}
																				<p class="error-text">{dialogPreviewError}</p>
																			{:else}
																				<ul class="dialog-preview-list">
																					{#each dialogPreviewEntries as entry, i (i)}
																						<li>
																							<p class="dialog-prompt">🗨 {entry.promptText}</p>
																							<p class="dialog-response">{npc.name}: {entry.response}</p>
																							<p class="muted dialog-meta">
																								{entry.portraitVariant}
																								{#if entry.personalityTagAdded}· learned: {entry.personalityTagAdded}{/if}
																							</p>
																						</li>
																					{/each}
																				</ul>
																			{/if}
																		</div>
																	</li>
																{/if}
															{/each}
														</ul>
													{/if}
												</div>
												<div class="challenge-view">
													<h3 class="challenge-title">Equipment / Upgrades</h3>
													{#if gymUpgradesLoading}
														<p class="muted">Loading…</p>
													{:else if gymUpgradesError}
														<p class="error-text">{gymUpgradesError}</p>
													{:else}
														{#if gymUpgradesGym}
															<p class="challenge-meta">
																Level {gymUpgradesGym.level} · {gymUpgradesGym.xp} XP
															</p>
														{/if}
														<table class="upgrades-table">
															<thead>
																<tr>
																	<th>Name</th>
																	<th>Category</th>
																	<th>Status</th>
																	<th>Req. XP</th>
																	<th>Unlocked</th>
																	<th>Placement</th>
																</tr>
															</thead>
															<tbody>
																{#each gymUpgradesForUser as upgrade (upgrade.key)}
																	<tr>
																		<td>
																			{upgrade.name}
																			{#if upgrade.unlocksNpcKey}<span class="muted">· unlocks {upgrade.unlocksNpcKey}</span>{/if}
																		</td>
																		<td>{upgrade.category}</td>
																		<td>
																			<span class="upgrade-status status-{upgrade.status}">{upgrade.status}</span>
																		</td>
																		<td>{upgrade.requiredXp}</td>
																		<td>
																			{upgrade.unlockedAt ? new Date(upgrade.unlockedAt).toLocaleDateString() : "—"}
																		</td>
																		<td class="upgrade-placement">
																			{upgrade.placementData ? JSON.stringify(upgrade.placementData) : "—"}
																		</td>
																	</tr>
																{/each}
															</tbody>
														</table>
													{/if}
												</div>
											{:else if seedTab === "challenges"}
												<div class="field-row">
													<button
														class="btn outline sm"
														onclick={() => forceGenerateChallenge(user.id)}
													>
														Force-generate this month's challenge
													</button>
												</div>
												<p class="muted challenge-generate-note">
													Global action — creates the current month's AI challenge
													for all users, not just this one.
												</p>

												<div class="field-row">
													<label>
														Month
														<input type="number" class="inp inp-sm" bind:value={seedChallengeMonth} min="1" max="12" />
													</label>
													<label>
														Year
														<input type="number" class="inp inp-sm" bind:value={seedChallengeYear} min="2000" />
													</label>
													<label>
														Completion
														<select class="inp inp-sm" bind:value={seedChallengeCompletion}>
															<option value="none">Not joined</option>
															<option value="partial">Partial</option>
															<option value="near_complete">Near-complete</option>
															<option value="complete">Complete</option>
														</select>
													</label>
													<button
														class="btn primary sm"
														onclick={() => seedChallenge(user.id)}
													>
														Seed Challenge
													</button>
													<button
														class="btn outline sm"
														onclick={() => resetChallengeProgress(user.id)}
													>
														Reset all challenge progress
													</button>
												</div>

												<div class="challenge-view">
													{#if challengeLoading}
														<p class="muted">Loading…</p>
													{:else if challengeError}
														<p class="error-text">{challengeError}</p>
													{:else if !challengeState?.challenge}
														<p class="muted">No challenge exists for the current month.</p>
													{:else}
														<h3 class="challenge-title">{challengeState.challenge.title}</h3>
														{#if !challengeState.joined}
															<p class="muted">This user has not joined the current challenge.</p>
														{:else}
															<p class="challenge-meta">
																{challengeState.goalsCompleted} / {challengeState.totalGoals} goals complete
																{#if challengeState.completedAt}
																	— completed {new Date(challengeState.completedAt).toLocaleString()}
																{:else}
																	— not yet completed
																{/if}
															</p>
															<ul class="goal-list">
																{#each challengeState.challenge.goals as goal (goal.id)}
																	<li>
																		<span class="goal-name">{goal.title}</span>
																		<span class="goal-progress">
																			{challengeState.completedTasks?.[goal.id] ?? 0} / {goal.target} {goal.unit}
																		</span>
																	</li>
																{/each}
															</ul>
														{/if}
													{/if}
												</div>
											{:else if seedTab === "sprints"}
												<div class="field-row">
													<button
														class="btn outline sm"
														onclick={() => forceGenerateSprint(user.id)}
													>
														Force-generate this user's sprint
													</button>
													<button
														class="btn outline sm"
														onclick={() => forceGenerateAllSprints()}
													>
														Force-generate for all users
													</button>
												</div>
												<p class="muted challenge-generate-note">
													"For all users" is a global action — generates this week's
													sprint for every user who doesn't already have one.
												</p>

												<div class="field-row">
													<label>
														Week of
														<input type="date" class="inp inp-sm" bind:value={seedSprintWeekStart} />
													</label>
													<label>
														Completion
														<select class="inp inp-sm" bind:value={seedSprintCompletion}>
															<option value="none">Not started</option>
															<option value="partial">Partial</option>
															<option value="near_complete">Near-complete</option>
															<option value="complete">Complete</option>
														</select>
													</label>
													<button
														class="btn primary sm"
														onclick={() => seedSprint(user.id)}
													>
														Seed Sprint
													</button>
													<button
														class="btn outline sm"
														onclick={() => resetSprintProgress(user.id)}
													>
														Reset all sprint progress
													</button>
												</div>

												<div class="challenge-view">
													{#if sprintLoading}
														<p class="muted">Loading…</p>
													{:else if sprintError}
														<p class="error-text">{sprintError}</p>
													{:else if !sprintState?.sprint}
														<p class="muted">No sprint exists for the current week.</p>
													{:else}
														<h3 class="challenge-title">{sprintState.sprint.title}</h3>
														<p class="challenge-meta">
															{sprintState.progress}% complete
															{#if sprintState.completedAt}
																— completed {new Date(sprintState.completedAt).toLocaleString()}
															{:else}
																— not yet completed
															{/if}
														</p>
														<ul class="goal-list">
															{#each sprintState.sprint.tasks as task (task.id)}
																<li>
																	<span class="goal-name">{task.title}</span>
																	<span class="goal-progress">
																		{sprintState.completedTasks?.includes(task.id) ? "Done" : "Not done"}
																	</span>
																</li>
															{/each}
														</ul>
													{/if}
												</div>
											{/if}

											{#if seedStatus}
												<p
													class="status-msg"
													class:ok={seedStatus.ok}
													class:fail={!seedStatus.ok}
												>
													{seedStatus.text}
												</p>
											{/if}
										</div>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</section>
		<section class="card">
			<h2>Tournaments ({tournaments.length})</h2>
			<div class="field-row">
				<label>
					Creator
					<select class="inp inp-sm" bind:value={seedTournamentCreatorId}>
						<option value="">Select a user…</option>
						{#each users as u (u.id)}
							<option value={u.id}>{u.name}</option>
						{/each}
					</select>
				</label>
				<label>
					Type
					<select class="inp inp-sm" bind:value={seedTournamentType}>
						<option value="streak">Streak</option>
						<option value="step_count">Step count</option>
						<option value="weight_loss">Weight loss</option>
						<option value="food_challenge">Food challenge</option>
					</select>
				</label>
				<label>
					Name (optional)
					<input class="inp inp-sm" bind:value={seedTournamentName} />
				</label>
				<button class="btn primary sm" onclick={seedTournament}>
					Seed Tournament
				</button>
			</div>
			<p class="muted challenge-generate-note">
				Defaults to a "one day from auto-resolving" window (started 7 days ago,
				ends tomorrow) unless overridden via the API. Creator auto-joins; add more
				participants below.
			</p>
			<div class="field-row">
				<label>
					Additional participants
					<select
						class="inp inp-sm"
						multiple
						bind:value={seedTournamentParticipantIds}
					>
						{#each users as u (u.id)}
							<option value={u.id}>{u.name}</option>
						{/each}
					</select>
				</label>
			</div>
			{#if seedTournamentStatus}
				<p
					class="status-msg"
					class:ok={seedTournamentStatus.ok}
					class:fail={!seedTournamentStatus.ok}
				>
					{seedTournamentStatus.text}
				</p>
			{/if}
			{#if tournaments.length === 0}
				<p class="muted">No tournaments yet.</p>
			{:else}
				<table class="user-table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Type</th>
							<th>Start</th>
							<th>End</th>
							<th>Participants</th>
							<th>Resolved</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each tournaments as t (t.id)}
							<tr>
								<td>{t.name}</td>
								<td>{t.type}</td>
								<td>{new Date(t.startDate).toLocaleDateString()}</td>
								<td>{new Date(t.endDate).toLocaleDateString()}</td>
								<td>{t.participantCount}</td>
								<td>{t.resolvedAt ? "Yes" : "No"}</td>
								<td>
									<button class="btn outline sm" onclick={() => viewTournament(t.id)}>
										{expandedTournamentId === t.id ? "Hide" : "View"}
									</button>
									<button
										class="btn danger sm"
										onclick={() => deleteTournament(t.id, t.name)}
									>
										Delete
									</button>
								</td>
							</tr>
							{#if expandedTournamentId === t.id}
								<tr>
									<td colspan="7">
										<div class="challenge-view">
											{#if tournamentDetailLoading}
												<p class="muted">Loading…</p>
											{:else if tournamentDetailError}
												<p class="error-text">{tournamentDetailError}</p>
											{:else if tournamentDetail}
												{#if !tournamentDetail.tournament.resolvedAt}
													<div class="field-row">
														<button
															class="btn outline sm"
															onclick={() => forceResolveTournament(tournamentDetail.tournament.id)}
														>
															Force-resolve now
														</button>
													</div>
												{/if}
												{#if tournamentDetail.tournament.winnerId}
													<p class="challenge-meta">
														Winner: {tournamentDetail.participants.find(
															(p) => p.userId === tournamentDetail?.tournament.winnerId,
														)?.userName ?? tournamentDetail.tournament.winnerId}
														{#if tournamentDetail.tournament.victoryMessage}
															— {tournamentDetail.tournament.victoryMessage}
														{/if}
													</p>
												{/if}
												<ul class="goal-list">
													{#each tournamentDetail.participants as p (p.userId)}
														<li>
															<span class="goal-name">{p.userName}</span>
															<span class="goal-progress">
																score {p.score}
																{p.completed ? "· completed" : ""}
															</span>
														</li>
													{/each}
												</ul>
											{/if}
										</div>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
		<section class="card">
			<h2>Social Feed ({socialPosts.length})</h2>
			<div class="field-row">
				<label>
					User
					<select class="inp inp-sm" bind:value={injectPostUserId}>
						<option value="">Select a user…</option>
						{#each users as u (u.id)}
							<option value={u.id}>{u.name}</option>
						{/each}
					</select>
				</label>
				<label>
					Type
					<select class="inp inp-sm" bind:value={injectPostType}>
						<option value="milestone">Milestone</option>
						<option value="food_photo">Food photo</option>
						<option value="weight_update">Weight update</option>
						<option value="ai_message">AI message</option>
						<option value="challenge_completion">Challenge completion</option>
					</select>
				</label>
				<label>
					Content (JSON)
					<input
						class="inp inp-sm"
						placeholder={'{"text": "Lost 5kg!"}'}
						bind:value={injectPostContent}
					/>
				</label>
				<button class="btn primary sm" onclick={injectSocialPost}>
					Inject Post
				</button>
			</div>
			{#if injectPostStatus}
				<p
					class="status-msg"
					class:ok={injectPostStatus.ok}
					class:fail={!injectPostStatus.ok}
				>
					{injectPostStatus.text}
				</p>
			{/if}
			{#if socialPosts.length === 0}
				<p class="muted">No posts yet.</p>
			{:else}
				<table class="user-table">
					<thead>
						<tr>
							<th>Author</th>
							<th>Type</th>
							<th>Content</th>
							<th>Created</th>
							<th>Reactions</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each socialPosts as p (p.id)}
							<tr>
								<td>{p.userName}</td>
								<td>{p.type}</td>
								<td>{socialPostSummary(p)}</td>
								<td>{new Date(p.createdAt).toLocaleString()}</td>
								<td>{p.reactionCount}</td>
								<td>
									<button
										class="btn danger sm"
										onclick={() => deleteSocialPost(p.id)}
									>
										Delete
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{/if}
</div>

<style>
.admin-wrap {
	--admin-on-warning: #1a1200;
	max-width: 960px;
	margin: var(--space-8) auto;
	padding: 0 var(--space-6) var(--space-10);
}

.admin-banner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-4);
	background: repeating-linear-gradient(
		135deg,
		color-mix(in srgb, var(--color-warning) 16%, var(--color-surface)),
		color-mix(in srgb, var(--color-warning) 16%, var(--color-surface)) 14px,
		color-mix(in srgb, var(--color-warning) 28%, var(--color-surface)) 14px,
		color-mix(in srgb, var(--color-warning) 28%, var(--color-surface)) 28px
	);
	border: 2px solid var(--color-warning);
	border-radius: var(--radius-lg);
	padding: var(--space-4) var(--space-6);
	margin: var(--space-6) 0 var(--space-5);
}

.admin-banner-text {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
}

.admin-banner-sub {
	margin: 0;
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-bold);
	color: var(--color-warning);
	text-transform: uppercase;
	letter-spacing: 0.08em;
}

.admin-banner h1 {
	margin: 0;
	font-family: var(--font-display);
	font-size: var(--font-size-xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.dev-tag {
	background: var(--color-warning);
	color: var(--admin-on-warning);
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-bold);
	letter-spacing: 0.05em;
	padding: var(--space-1) var(--space-3);
	border-radius: var(--radius-full);
	white-space: nowrap;
}

.card {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-left: 3px solid var(--color-warning);
	border-radius: var(--radius-lg);
	box-shadow: var(--shadow-sm);
	padding: var(--space-5);
	margin-bottom: var(--space-5);
}

.card h2 {
	margin: 0 0 var(--space-4);
	font-family: var(--font-display);
	font-size: var(--font-size-base);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.form-row {
	display: flex;
	gap: var(--space-2);
	flex-wrap: wrap;
}

.inp {
	background: var(--color-bg);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	padding: var(--space-2) var(--space-3);
	color: var(--color-text);
	font-size: var(--font-size-sm);
	min-width: 0;
}

.inp-sm {
	width: 5rem;
}

.btn {
	border: none;
	border-radius: var(--radius-sm);
	padding: var(--space-2) var(--space-4);
	font-size: var(--font-size-sm);
	cursor: pointer;
	font-weight: var(--font-weight-medium);
	font-family: var(--font-sans);
	white-space: nowrap;
}

.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.btn.sm {
	padding: var(--space-1) var(--space-3);
	font-size: var(--font-size-xs);
}

.btn.primary {
	background: var(--color-warning);
	color: var(--admin-on-warning);
}

.btn.primary:hover:not(:disabled) {
	opacity: 0.9;
}

.btn.accent {
	background: var(--color-warning);
	color: var(--admin-on-warning);
}

.btn.outline {
	background: transparent;
	border: 1px solid var(--color-border);
	color: var(--color-text-muted);
}

.btn.outline:hover {
	background: var(--color-surface-2);
}

.btn.danger {
	background: #ef4444;
	color: #fff;
}

.btn.danger:hover {
	background: #dc2626;
}

.status-msg {
	margin: var(--space-2) 0 0;
	font-size: var(--font-size-xs);
}

.status-msg.ok {
	color: var(--color-success);
}

.status-msg.fail {
	color: var(--color-danger);
}

.user-table {
	width: 100%;
	border-collapse: collapse;
	font-size: var(--font-size-sm);
}

.user-table th,
.user-table td {
	text-align: left;
	padding: var(--space-2) var(--space-3);
	border-bottom: 1px solid var(--color-border);
}

.user-table th {
	color: var(--color-text-muted);
	font-weight: var(--font-weight-medium);
	font-size: var(--font-size-xs);
}

.mono {
	font-family: monospace;
	font-size: var(--font-size-xs);
}

.admin-badge {
	background: var(--color-warning);
	color: var(--admin-on-warning);
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-semibold);
	padding: 0.1rem var(--space-2);
	border-radius: var(--radius-sm);
}

.actions-cell {
	display: flex;
	gap: var(--space-2);
	flex-wrap: wrap;
}

.seed-row td {
	padding: 0;
	background: var(--color-bg);
}

.seed-panel {
	padding: var(--space-3) var(--space-4);
}

.tab-bar {
	display: flex;
	gap: var(--space-1);
	margin-bottom: var(--space-3);
}

.tab {
	background: transparent;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-sm);
	padding: var(--space-1) var(--space-3);
	font-size: var(--font-size-xs);
	cursor: pointer;
	color: var(--color-text-muted);
	text-transform: capitalize;
}

.tab.active {
	background: var(--color-warning);
	color: var(--admin-on-warning);
	border-color: var(--color-warning);
}

.tab-content {
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
}

.field-row {
	display: flex;
	align-items: center;
	gap: var(--space-3);
	flex-wrap: wrap;
}

.field-row label {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.badge-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 0.25rem;
	max-height: 240px;
	overflow-y: auto;
}

.badge-option {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.8rem;
	cursor: pointer;
	padding: 0.125rem 0;
}

.tier-dot {
	display: inline-block;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	flex-shrink: 0;
}

.t-bronze { background: #b45309; }
.t-silver { background: #6b7280; }
.t-gold   { background: #d97706; }
.t-platinum { background: #6366f1; }

.badge-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.muted {
	color: var(--color-text-muted);
}

.error-text {
	color: var(--color-danger);
}

.challenge-generate-note {
	margin: var(--space-1) 0 var(--space-3);
	font-size: var(--font-size-xs);
}

.challenge-view {
	display: flex;
	flex-direction: column;
	gap: var(--space-2);
}

.challenge-title {
	margin: 0;
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
}

.challenge-meta {
	margin: 0;
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.goal-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
}

.goal-list li {
	display: flex;
	justify-content: space-between;
	gap: var(--space-3);
	font-size: var(--font-size-sm);
	padding: var(--space-1) 0;
	border-bottom: 1px solid var(--color-border);
}

.goal-progress {
	color: var(--color-text-muted);
	white-space: nowrap;
}

.gym-npc-row {
	flex-direction: column;
	align-items: stretch;
}

.gym-npc-edit {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	width: 100%;
}

.gym-npc-goal-label {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	font-size: 0.8rem;
}

.gym-npc-textarea {
	min-height: 5rem;
	font-family: monospace;
	font-size: 0.8rem;
	resize: vertical;
}

.dialog-preview-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.dialog-preview-list li {
	border-bottom: 1px solid var(--color-border);
	padding-bottom: 0.5rem;
}

.dialog-prompt {
	margin: 0 0 0.15rem;
	font-size: 0.85rem;
	color: var(--color-text-muted);
}

.dialog-response {
	margin: 0 0 0.15rem;
	font-size: 0.85rem;
}

.dialog-meta {
	margin: 0;
	font-size: 0.75rem;
}

.upgrades-table {
	width: 100%;
	border-collapse: collapse;
	font-size: var(--font-size-xs);
}

.upgrades-table th {
	text-align: left;
	color: var(--color-text-muted);
	font-weight: var(--font-weight-semibold);
	padding: 0.3rem var(--space-2);
	border-bottom: 1px solid var(--color-border);
}

.upgrades-table td {
	padding: 0.3rem var(--space-2);
	border-bottom: 1px solid var(--color-border);
}

.upgrade-placement {
	font-family: monospace;
	font-size: 0.7rem;
	color: var(--color-text-muted);
}

.upgrade-status {
	padding: 0.1rem var(--space-2);
	border-radius: var(--radius-sm);
	font-size: 0.7rem;
	text-transform: uppercase;
}

.upgrade-status.status-claimed {
	background: color-mix(in srgb, var(--color-success) 25%, var(--color-surface));
	color: var(--color-success);
}

.upgrade-status.status-pending {
	background: color-mix(in srgb, var(--color-warning) 25%, var(--color-surface));
	color: var(--color-warning);
}

.upgrade-status.status-locked {
	background: var(--color-surface-2);
	color: var(--color-text-muted);
}

.progression-slider-row {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	margin: 0.5rem 0;
}

.progression-slider-label {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	flex: 1;
	font-size: 0.85rem;
}

.progression-slider-label input[type="range"] {
	flex: 1;
}
</style>
