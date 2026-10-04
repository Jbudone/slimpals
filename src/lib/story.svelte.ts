// The story's state on the client (the server decides which chapter waits and
// records it as seen, see shared/gym3d/story.ts).
import type { StoryDto } from "../../shared/gym3d/story"
import { api } from "./api.js"
import { loadWallet } from "./wallet.svelte.js"

export const story = $state<{ data: StoryDto | null }>({ data: null })

/** Off in the e2e runs (VITE_STORY=off) unless the page asks with ?story=1. */
function storyOn(): boolean {
	if (import.meta.env.VITE_STORY !== "off") return true
	return (
		new URLSearchParams(globalThis.location?.search ?? "").get("story") === "1"
	)
}

export async function loadStory(): Promise<void> {
	if (!storyOn()) return
	try {
		story.data = await api.get<StoryDto>("/gym/story")
	} catch {
		// the story is a nicety: the gym works without it
	}
}

/** The waiting chapter has been watched (or skipped). */
export async function markStorySeen(id: string): Promise<void> {
	try {
		story.data = await api.post<StoryDto>(`/gym/story/${id}/seen`, {})
		// a chapter can pay coins
		void loadWallet()
	} catch {
		// seen again on the next load if this failed
		if (story.data?.pending?.id === id)
			story.data = { ...story.data, pending: null }
	}
}
