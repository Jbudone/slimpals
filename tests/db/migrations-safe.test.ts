// Guard: a migration must never throw player data away without somebody
// deciding so on purpose. Destructive statements are listed here, so adding
// one fails this test until it is reviewed and written down.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const DIR = join(__dirname, "../../server/db/migrations")

/** file -> reviewed destructive statements it may contain. */
const REVIEWED: Record<string, string[]> = {
	// the pet system was replaced by the gym; nothing of it is kept
	"0003_gym_replaces_pets.sql": ["DROP TABLE"],
}

const DESTRUCTIVE = /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM)\b/gi

describe("migrations", () => {
	it("hold no destructive statement that was not reviewed", () => {
		const found: Record<string, string[]> = {}
		for (const f of readdirSync(DIR).filter((n) => n.endsWith(".sql"))) {
			const hits = readFileSync(join(DIR, f), "utf8").match(DESTRUCTIVE)
			if (!hits) continue
			found[f] = [...new Set(hits.map((h) => h.toUpperCase().replace(/\s+/g, " ")))]
		}
		expect(found).toEqual(REVIEWED)
	})
})
