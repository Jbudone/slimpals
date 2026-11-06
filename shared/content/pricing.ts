// What a model call costs. Prices are USD per million tokens and change, so
// they are defaults the owner can override in the content config (the
// `prices` entry); OpenRouter reports the real cost of a call and that wins.
// Gemini figures are the published list prices as I last knew them: verify.

export type ModelPrice = {
	/** USD per million input tokens. */
	inUsd: number
	/** USD per million output tokens. */
	outUsd: number
	/** USD per generated image (image models). */
	imageUsd?: number
}

export const DEFAULT_PRICES: Readonly<Record<string, ModelPrice>> = {
	"gemini-2.5-flash": { inUsd: 0.3, outUsd: 2.5 },
	"gemini-2.5-flash-lite": { inUsd: 0.1, outUsd: 0.4 },
	"gemini-2.5-pro": { inUsd: 1.25, outUsd: 10 },
	"anthropic/claude-3.5-sonnet": { inUsd: 3, outUsd: 15 },
	"deepseek/deepseek-chat": { inUsd: 0.3, outUsd: 1.2 },
	"mistralai/mistral-large-2407": { inUsd: 2, outUsd: 6 },
	"meta-llama/llama-3.3-70b-instruct": { inUsd: 0.12, outUsd: 0.3 },
	"gemini-2.5-flash-image": { inUsd: 0.3, outUsd: 30, imageUsd: 0.039 },
}

/** Used for a model with no entry, so an unknown model is never free. */
export const FALLBACK_PRICE: ModelPrice = { inUsd: 1, outUsd: 5 }

export function priceOf(
	model: string,
	overrides: Readonly<Record<string, ModelPrice>> = {},
): ModelPrice {
	return overrides[model] ?? DEFAULT_PRICES[model] ?? FALLBACK_PRICE
}

export function costUsd(
	model: string,
	tokensIn: number,
	tokensOut: number,
	images = 0,
	overrides: Readonly<Record<string, ModelPrice>> = {},
): number {
	const p = priceOf(model, overrides)
	const text = (tokensIn * p.inUsd + tokensOut * p.outUsd) / 1_000_000
	return text + images * (p.imageUsd ?? 0)
}
