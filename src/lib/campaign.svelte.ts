// The campaign in play and the Hall of fame (server: services/gym/campaign.ts).
import type { CampaignDto } from "../../shared/gym3d/campaign"
import { api } from "./api.js"

export const campaign = $state<{ data: CampaignDto | null; error: string }>({
	data: null,
	error: "",
})

export async function loadCampaign(): Promise<void> {
	try {
		campaign.data = await api.get<CampaignDto>("/gym/campaign")
	} catch {
		// the card keeps what it has
	}
}

/** Archives the gym in play and starts the next campaign; the page reloads
 * into the fresh gym. */
export async function beginNextCampaign(): Promise<boolean> {
	campaign.error = ""
	try {
		campaign.data = await api.post<CampaignDto>("/gym/campaign/next", {})
		return true
	} catch (e) {
		campaign.error = e instanceof Error ? e.message : "Could not begin it"
		return false
	}
}
