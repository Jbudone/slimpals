import { describe, expect, it } from "vitest"
import {
	GYM3D_STORAGE_KEY,
	readGym3dFlag,
	setGym3dFlag,
} from "../../src/lib/gym3dFlag.js"

function mem(init: Record<string, string> = {}) {
	const m = new Map(Object.entries(init))
	return {
		getItem: (k: string) => m.get(k) ?? null,
		setItem: (k: string, v: string) => {
			m.set(k, v)
		},
		map: m,
	}
}

describe("gym3d flag", () => {
	it("is off by default", () => {
		expect(readGym3dFlag("", mem())).toBe(false)
		expect(readGym3dFlag("", null)).toBe(false)
	})

	it("?gym3d=1 turns it on and remembers it", () => {
		const s = mem()
		expect(readGym3dFlag("?gym3d=1", s)).toBe(true)
		expect(s.map.get(GYM3D_STORAGE_KEY)).toBe("1")
		expect(readGym3dFlag("", s)).toBe(true)
	})

	it("?gym3d=0 wins over a saved on and saves off", () => {
		const s = mem({ [GYM3D_STORAGE_KEY]: "1" })
		expect(readGym3dFlag("?gym3d=0", s)).toBe(false)
		expect(s.map.get(GYM3D_STORAGE_KEY)).toBe("0")
		expect(readGym3dFlag("", s)).toBe(false)
	})

	it("ignores junk values and falls back to storage", () => {
		const s = mem({ [GYM3D_STORAGE_KEY]: "1" })
		expect(readGym3dFlag("?gym3d=maybe", s)).toBe(true)
		expect(readGym3dFlag("?other=1", mem())).toBe(false)
	})

	it("survives storage that throws", () => {
		const bad = {
			getItem: () => {
				throw new Error("denied")
			},
			setItem: () => {
				throw new Error("denied")
			},
		}
		expect(readGym3dFlag("?gym3d=1", bad)).toBe(true)
		expect(readGym3dFlag("", bad)).toBe(false)
		expect(() => setGym3dFlag(true, bad)).not.toThrow()
	})

	it("setGym3dFlag writes the switch", () => {
		const s = mem()
		setGym3dFlag(true, s)
		expect(readGym3dFlag("", s)).toBe(true)
		setGym3dFlag(false, s)
		expect(readGym3dFlag("", s)).toBe(false)
	})
})
