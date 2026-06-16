import { GoogleGenerativeAI } from "@google/generative-ai"
import { eq } from "drizzle-orm"
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

export interface AIService {
	analyzeFood(imageUrl: string, userId: string): Promise<FoodAnalysis>
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
}
