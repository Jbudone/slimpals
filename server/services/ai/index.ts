import { GoogleGenerativeAI } from "@google/generative-ai"

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

	async analyzeFood(imageUrl: string, _userId: string): Promise<FoodAnalysis> {
		const model = this.client.getGenerativeModel({
			model: "gemini-2.0-flash",
		})

		// Fetch the image and convert to base64 for Gemini vision
		const imgRes = await fetch(imageUrl)
		const imgBuffer = await imgRes.arrayBuffer()
		const base64 = Buffer.from(imgBuffer).toString("base64")
		const mimeType = imgRes.headers.get("content-type") ?? "image/jpeg"

		const prompt = `Analyze this meal photo and respond with a JSON object only (no markdown, no explanation):
{
  "foodName": "short name of the meal",
  "macros": { "calories": number, "protein": number, "carbs": number, "fat": number },
  "coachMessage": "1–2 sentence encouraging coaching response",
  "alternatives": ["up to 2 healthier swap suggestions"],
  "rating": number between 1 and 10 for healthiness
}`

		const result = await model.generateContent([
			prompt,
			{ inlineData: { data: base64, mimeType } },
		])

		const text = result.response.text().trim()
		const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
		return JSON.parse(cleaned) as FoodAnalysis
	}
}
