import { GoogleGenerativeAI } from "@google/generative-ai"
import { eq } from "drizzle-orm"
import type { CoachPersonality } from "../../../shared/types.js"
import { db } from "../../db/index.js"
import { users } from "../../db/schema.js"
import { PERSONALITIES } from "./prompts/index.js"

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
}

export class GeminiAIService implements AIService {
	private client: GoogleGenerativeAI

	constructor() {
		this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "")
	}

	async analyzeFood(imageUrl: string, userId: string): Promise<FoodAnalysis> {
		const [user] = await db.select().from(users).where(eq(users.id, userId))
		const personality = user?.coachPersonality ?? "friendly"
		const systemInstruction = PERSONALITIES[personality]

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
			personality in PERSONALITIES ? personality : "friendly"
		) as CoachPersonality
		const systemInstruction = PERSONALITIES[coachKey]

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
			personality in PERSONALITIES ? personality : "friendly"
		) as CoachPersonality
		const systemInstruction = PERSONALITIES[coachKey]

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
}
