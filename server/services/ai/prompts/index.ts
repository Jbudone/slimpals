import type { CoachPersonality } from "../../../../shared/types.js"
import { animeSenseiPrompt } from "./anime_sensei.js"
import { broPrompt } from "./bro.js"
import { drillSergeantPrompt } from "./drill_sergeant.js"
import { friendlyPrompt } from "./friendly.js"
import { roasterPrompt } from "./roaster.js"

export const PERSONALITIES: Record<CoachPersonality, string> = {
	drill_sergeant: drillSergeantPrompt,
	friendly: friendlyPrompt,
	roaster: roasterPrompt,
	anime_sensei: animeSenseiPrompt,
	bro: broPrompt,
}
