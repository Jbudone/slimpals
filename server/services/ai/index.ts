import { GoogleGenerativeAI } from "@google/generative-ai"
import { eq } from "drizzle-orm"
import type { CoachPersonality } from "../../../shared/types.js"
import { db } from "../../db/index.js"
import { users } from "../../db/schema.js"
import { getPersonalityPrompt, PERSONALITY_KEYS } from "./prompts/index.js"

export type FoodAnalysis = {
	foodName: string
	macros: { calories: number; protein: number; carbs: number; fat: number }
	coachMessage: string
	alternatives: string[]
	rating: number
}

export type WeeklyStats = {
	checkins: number
	weightDeltaKg: number | null
	foodLogs: number
	badgesEarned: number
}

export type ChallengeGoal = {
	id: string
	title: string
	description: string
	target: number
	unit: string
	dailyAmount: number
	dailyPrompt: string
}

export type GeneratedChallenge = {
	title: string
	description: string
	theme: string
	goals: ChallengeGoal[]
}

export interface AIService {
	analyzeFood(imageUrl: string, userId: string): Promise<FoodAnalysis>
	generateVictoryMessage(
		userName: string,
		tournamentName: string,
		tournamentType: string,
		personality: string,
	): Promise<string>
	generateWeeklyInspiration(
		userName: string,
		stats: WeeklyStats,
		personality: string,
	): Promise<string>
	generateMonthlyChallenge(
		month: number,
		year: number,
	): Promise<GeneratedChallenge>
	generateWeeklySprint(
		userName: string,
		recentActivity: SprintContext,
	): Promise<SprintResult>
	generateNpcDialogs(prompt: string): Promise<NpcDialogEntry[]>
	generateGymEvent(prompt: string): Promise<GymEventData>
	generateNpcPortrait(
		prompt: string,
		outputPath: string,
	): Promise<string | null>
	generateCoachSample(
		systemInstruction: string,
		scenarioText: string,
	): Promise<string>
	refineTuningDoc(
		params: TuningRefinementParams,
	): Promise<TuningRefinementResult>
}

export type TuningRefinementParams = {
	contentTypeLabel: string
	subcategoryLabel: string
	currentDoc: string
	sample: string
	tags: string[]
	note: string | null
	noteScope: "sample" | "global"
}

export type TuningRefinementResult = {
	updatedDoc: string
	changelog: string
}

export type NpcDialogEntry = {
	promptText: string
	response: string
	portraitVariant: "happy" | "neutral" | "determined"
	personalityTagAdded: string | null
}

export type GymEventData = {
	type: "competition" | "class" | "delivery" | "special_guest" | "maintenance"
	title: string
	description: string
	npcKey: string | null
	activeHours: [number, number]
	effects: { allNpcMoodBonus?: number; xpMultiplier?: number }
}

export type SprintContext = {
	checkins: number
	foodLogs: number
	weightEntries: number
	hasChallenge: boolean
}

export type SprintTask = {
	id: string
	title: string
}

export type SprintResult = {
	title: string
	tasks: SprintTask[]
}

export class GeminiAIService implements AIService {
	private client: GoogleGenerativeAI

	constructor() {
		this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "")
	}

	async analyzeFood(imageUrl: string, userId: string): Promise<FoodAnalysis> {
		const [user] = await db.select().from(users).where(eq(users.id, userId))
		const personality = user?.coachPersonality ?? "friendly"
		const systemInstruction = getPersonalityPrompt(personality)

		const model = this.client.getGenerativeModel({
			model: "gemini-2.5-flash",
			systemInstruction,
		})

		const imgRes = await fetch(imageUrl)
		const imgBuffer = await imgRes.arrayBuffer()
		const base64 = Buffer.from(imgBuffer).toString("base64")
		const mimeType = imgRes.headers.get("content-type") ?? "image/jpeg"

		const prompt = `Analyze this meal photo and respond with a JSON object only (no markdown, no explanation):
{
  "foodName": "short name of the meal",
  "macros": { "calories": number, "protein": number, "carbs": number, "fat": number },
  "coachMessage": "1–2 sentence coaching response in your personality's voice",
  "alternatives": ["up to 2 healthier swap suggestions"],
  "rating": number between 1 and 10 for healthiness
}`

		const result = await model.generateContent([
			prompt,
			{ inlineData: { data: base64, mimeType } },
		])

		const text = result.response.text().trim()
		const match = text.match(/\{[\s\S]*\}/)
		if (!match)
			throw new Error(`No JSON object in AI response: ${text.slice(0, 200)}`)
		return JSON.parse(match[0]) as FoodAnalysis
	}

	async generateVictoryMessage(
		userName: string,
		tournamentName: string,
		tournamentType: string,
		personality: string,
	): Promise<string> {
		const coachKey = (
			PERSONALITY_KEYS.includes(personality as CoachPersonality)
				? personality
				: "friendly"
		) as CoachPersonality
		const systemInstruction = getPersonalityPrompt(coachKey)

		const model = this.client.getGenerativeModel({
			model: "gemini-2.5-flash",
			systemInstruction,
		})

		const typeLabels: Record<string, string> = {
			weight_loss: "weight loss",
			streak: "check-in streak",
			food_challenge: "food quality",
			step_count: "step count",
		}

		const prompt = `Write a short, enthusiastic victory message (2-3 sentences max) for ${userName} who just won the "${tournamentName}" ${typeLabels[tournamentType] ?? tournamentType} tournament. Speak in your coaching personality's voice. Make it celebratory and motivating. Plain text only, no markdown.`

		const result = await model.generateContent(prompt)
		return result.response.text().trim()
	}

	async generateWeeklyInspiration(
		userName: string,
		stats: WeeklyStats,
		personality: string,
	): Promise<string> {
		const coachKey = (
			PERSONALITY_KEYS.includes(personality as CoachPersonality)
				? personality
				: "friendly"
		) as CoachPersonality
		const systemInstruction = getPersonalityPrompt(coachKey)

		const model = this.client.getGenerativeModel({
			model: "gemini-2.5-flash",
			systemInstruction,
		})

		const weightLine =
			stats.weightDeltaKg !== null
				? `Weight change: ${stats.weightDeltaKg > 0 ? "+" : ""}${stats.weightDeltaKg.toFixed(1)}kg`
				: "No weight entries this week"

		const prompt = `Write a short, personalized weekly inspiration message (2-4 sentences) for ${userName} based on their past week's activity. Speak in your coaching personality's voice. Make it motivating and specific to their stats. Plain text only, no markdown.

Their week in review:
- Check-ins: ${stats.checkins}/7 days
- ${weightLine}
- Food logs: ${stats.foodLogs} meals tracked
- Badges earned: ${stats.badgesEarned}

Focus on what they did well and encourage them for the coming week.`

		const result = await model.generateContent(prompt)
		return result.response.text().trim()
	}

	async generateMonthlyChallenge(
		month: number,
		year: number,
	): Promise<GeneratedChallenge> {
		const monthNames = [
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		]
		const monthName = monthNames[month - 1] ?? "January"

		const model = this.client.getGenerativeModel({
			model: "gemini-2.5-flash",
		})

		const prompt = `Generate a themed monthly wellness challenge for ${monthName} ${year}. Respond with a JSON object only (no markdown, no explanation):
{
  "title": "short, encouraging challenge name (2-4 words)",
  "description": "1 friendly sentence about the theme",
  "theme": "one-word theme",
  "goals": [
    {
      "id": "goal_1",
      "title": "120 Glasses of Water",
      "description": "Stay hydrated — about 6 glasses a day",
      "target": 120,
      "unit": "glasses",
      "dailyAmount": 6,
      "dailyPrompt": "Did you drink your 6 glasses today?"
    }
  ]
}

Generate exactly 3 goals. Each goal is a cumulative monthly total built from a simple daily habit. The target is the full-month total (dailyAmount × ~20 days). Each day the user taps a button and dailyAmount is added to their running total.
- target should be an impressive-sounding cumulative number (e.g. 120 glasses, 400 minutes, 60 servings).
- dailyAmount is the per-day portion that makes the goal easy (e.g. 6 glasses, 20 minutes, 3 servings).
- unit should be the thing being counted (glasses, minutes, servings, steps), never "days".
- Keep goals beginner-friendly — the daily amount should feel effortless.
- Each dailyPrompt should be a yes/no question starting with "Did you".
- Theme the 3 goals around a cohesive wellness concept.
- Goal IDs: goal_1, goal_2, goal_3.`

		const result = await model.generateContent(prompt)
		const text = result.response.text().trim()
		const match = text.match(/\{[\s\S]*\}/)
		if (!match)
			throw new Error(`No JSON object in AI response: ${text.slice(0, 200)}`)
		return JSON.parse(match[0]) as GeneratedChallenge
	}

	async generateWeeklySprint(
		userName: string,
		ctx: SprintContext,
	): Promise<SprintResult> {
		const model = this.client.getGenerativeModel({
			model: "gemini-2.5-flash",
		})

		const activityLines = [
			`Check-ins last week: ${ctx.checkins}/7`,
			`Food logs: ${ctx.foodLogs}`,
			`Weight entries: ${ctx.weightEntries}`,
			ctx.hasChallenge
				? "Currently in a monthly challenge"
				: "No active monthly challenge",
		]

		const prompt = `Generate a personalized weekly sprint for ${userName}. These are 5-7 light, achievable tasks for this week. Respond with JSON only (no markdown):
{
  "title": "short sprint name (2-4 words)",
  "tasks": [
    { "id": "task_1", "title": "short task description (under 10 words)" },
    ...
  ]
}

Their recent activity:
${activityLines.join("\n")}

Generate exactly 6 tasks. Make them specific to their activity level — if they've been active, push a bit harder; if quiet, start easy. Tasks should be completable within a single week. Mix: exercise, nutrition, mindfulness, social. Task IDs: task_1 through task_6.`

		const result = await model.generateContent(prompt)
		const text = result.response.text().trim()
		const match = text.match(/\{[\s\S]*\}/)
		if (!match)
			throw new Error(`No JSON object in AI response: ${text.slice(0, 200)}`)
		return JSON.parse(match[0]) as SprintResult
	}

	async generateNpcDialogs(prompt: string): Promise<NpcDialogEntry[]> {
		const model = this.client.getGenerativeModel({
			model: "gemini-2.5-flash",
		})

		const result = await model.generateContent(prompt)
		const text = result.response.text().trim()
		const match = text.match(/\[[\s\S]*\]/)
		if (!match)
			throw new Error(`No JSON array in AI response: ${text.slice(0, 200)}`)
		return JSON.parse(match[0]) as NpcDialogEntry[]
	}

	async generateGymEvent(prompt: string): Promise<GymEventData> {
		const model = this.client.getGenerativeModel({
			model: "gemini-2.5-flash",
		})

		const result = await model.generateContent(prompt)
		const text = result.response.text().trim()
		const match = text.match(/\{[\s\S]*\}/)
		if (!match)
			throw new Error(`No JSON object in AI response: ${text.slice(0, 200)}`)
		return JSON.parse(match[0]) as GymEventData
	}

	async generateNpcPortrait(
		prompt: string,
		outputPath: string,
	): Promise<string | null> {
		try {
			const model = this.client.getGenerativeModel({
				model: "gemini-2.0-flash-preview-image-generation",
			})

			const result = await model.generateContent({
				contents: [{ role: "user", parts: [{ text: prompt }] }],
				generationConfig: {
					// @ts-expect-error responseModalities not yet in TS types
					responseModalities: ["IMAGE"],
				},
			})

			const parts = result.response.candidates?.[0]?.content?.parts ?? []
			const imgPart = parts.find(
				(p: { inlineData?: { data: string; mimeType: string } }) =>
					p.inlineData,
			)
			if (!imgPart?.inlineData) return null

			const { writeFile, mkdir } = await import("node:fs/promises")
			const { dirname } = await import("node:path")
			await mkdir(dirname(outputPath), { recursive: true })
			const buf = Buffer.from(imgPart.inlineData.data, "base64")
			await writeFile(outputPath, buf)
			return outputPath
		} catch (err) {
			console.warn("[portrait] generation skipped:", (err as Error).message)
			return null
		}
	}

	async generateCoachSample(
		systemInstruction: string,
		scenarioText: string,
	): Promise<string> {
		const model = this.client.getGenerativeModel({
			model: "gemini-2.5-flash",
			systemInstruction,
		})

		const prompt = `A user just logged this meal: "${scenarioText}". Write your 1-2 sentence coaching response in your personality's voice, exactly as you would after analyzing a food photo. Plain text only, no markdown, no JSON.`

		const result = await model.generateContent(prompt)
		return result.response.text().trim()
	}

	async refineTuningDoc(
		params: TuningRefinementParams,
	): Promise<TuningRefinementResult> {
		const {
			contentTypeLabel,
			subcategoryLabel,
			currentDoc,
			sample,
			tags,
			note,
			noteScope,
		} = params

		const model = this.client.getGenerativeModel({
			model: "gemini-2.5-flash",
		})

		const scopeInstruction =
			noteScope === "global"
				? "This note describes a durable rule that should apply to every future sample for this subcategory going forward — fold it in as a lasting instruction."
				: "This note is anecdotal feedback on this one sample — generalize it into the doc only if it looks like a systemic issue, not a one-off."

		const prompt = `You refine a content-generation instruction document based on human feedback on a sample it produced. Preserve the document's existing intent and voice; integrate the new feedback precisely; consolidate and prune rather than endlessly appending — keep the document tight and non-redundant even after many rounds of edits. Don't contradict earlier accepted guidance unless the new feedback clearly overrides it.

Content type: ${contentTypeLabel} — ${subcategoryLabel}

Current tuning document:
"""
${currentDoc}
"""

The sample this document produced:
"""
${sample}
"""

Feedback tags selected: ${tags.length > 0 ? tags.join(", ") : "(none)"}
Free-text note: ${note ?? "(none)"}
${scopeInstruction}

Respond with a JSON object only (no markdown, no explanation):
{
  "updatedDoc": "the full revised tuning document text",
  "changelog": "one short sentence describing what changed and why"
}`

		const result = await model.generateContent(prompt)
		const text = result.response.text().trim()
		const match = text.match(/\{[\s\S]*\}/)
		if (!match)
			throw new Error(`No JSON object in AI response: ${text.slice(0, 200)}`)
		return JSON.parse(match[0]) as TuningRefinementResult
	}
}
