import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Paths are repo-relative (e.g. "server/services/ai/prompts/friendly.md"),
// resolved against process.cwd() rather than import.meta.url — this works
// identically under `tsx` dev (cwd = repo root) and the compiled `dist/`
// build (tsc doesn't copy non-.ts assets, so the .md files only ever exist
// in the source tree; the Dockerfile copies that tree alongside `dist`).
export function readTuningDoc(relPath: string): string {
	return readFileSync(join(process.cwd(), relPath), "utf-8").trim()
}

export function writeTuningDoc(relPath: string, content: string): void {
	writeFileSync(join(process.cwd(), relPath), `${content.trim()}\n`, "utf-8")
}
