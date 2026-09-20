import type { CoachPersonality } from "../../../../shared/types.js"
import { readTuningDoc } from "../../contentTuning/fs.js"

export const PERSONALITY_KEYS: CoachPersonality[] = [
	"drill_sergeant",
	"friendly",
	"roaster",
	"anime_sensei",
	"bro",
]

// Read from disk on every call (not cached at import time) so edits made via
// the /content-tuning admin page take effect immediately, without a restart.
export function getPersonalityPrompt(key: CoachPersonality): string {
	return readTuningDoc(`server/services/ai/prompts/${key}.md`)
}
