import { beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn()
vi.mock("../../src/lib/api.js", () => ({ api: { get: (p: string) => get(p) } }))

const { cached, refresh, setCacheOwner, swr } = await import(
	"../../src/lib/net/swr.js"
)

beforeEach(() => {
	get.mockReset()
	setCacheOwner(null)
	setCacheOwner("u1")
})

describe("swr", () => {
	it("shows the remembered answer first, then the fresh one", async () => {
		get.mockResolvedValueOnce({ n: 1 })
		const seen: [unknown, boolean][] = []
		await swr("/x", (d, fresh) => seen.push([d, fresh]))
		expect(seen).toEqual([[{ n: 1 }, true]])

		get.mockResolvedValueOnce({ n: 2 })
		seen.length = 0
		await swr("/x", (d, fresh) => seen.push([d, fresh]))
		expect(seen).toEqual([
			[{ n: 1 }, false],
			[{ n: 2 }, true],
		])
	})

	it("keeps the old answer showing when the network fails", async () => {
		get.mockResolvedValueOnce({ n: 1 })
		await refresh("/y")
		get.mockRejectedValueOnce(new Error("offline"))
		const seen: [unknown, boolean][] = []
		const r = await swr("/y", (d, fresh) => seen.push([d, fresh]))
		expect(r).toBeNull()
		expect(seen).toEqual([[{ n: 1 }, false]])
	})

	it("asks once for callers asking at the same time", async () => {
		get.mockResolvedValue({ ok: true })
		await Promise.all([refresh("/z"), refresh("/z"), refresh("/z")])
		expect(get).toHaveBeenCalledTimes(1)
	})

	it("does not show one player's answer to another", async () => {
		get.mockResolvedValueOnce({ mine: true })
		await refresh("/w")
		setCacheOwner("u2")
		expect(await cached("/w")).toBeUndefined()
	})
})
