import type { ContentTuningType } from "./registry.js"

const MONTH_NAMES = [
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

export const monthlyChallengeType: ContentTuningType = {
	key: "monthly_challenge",
	label: "Monthly Challenge",
	subcategories: [
		{
			key: "default",
			label: "Goal Rules",
			tuningDocPath: "server/services/contentTuning/docs/monthly_challenge.md",
		},
	],
	contextParamFields: [
		{
			key: "month",
			label: "Sample month",
			type: "select",
			options: MONTH_NAMES.map((label, i) => ({
				value: String(i + 1),
				label,
			})),
		},
	],
	feedbackTags: [
		"Goals too hard",
		"Goals too easy",
		"Not cohesive",
		"Off-tone",
		"Perfect",
	],
	generateSample: async ({ contextParams, aiService }) => {
		const month = Number(contextParams.month) || 1
		const year = new Date().getFullYear()
		const result = await aiService.generateMonthlyChallenge(month, year)
		const goals = result.goals
			.map(
				(g) =>
					`- ${g.title}: ${g.description} (target ${g.target} ${g.unit}, ${g.dailyAmount}/day)`,
			)
			.join("\n")
		return `${result.title}\n${result.description}\nTheme: ${result.theme}\n${goals}`
	},
}
