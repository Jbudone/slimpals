// Shared Zod schemas for API request validation.
// Populated in subsequent slices.
import { z } from "zod"

export const healthResponseSchema = z.object({
	status: z.literal("ok"),
})
