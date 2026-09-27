// Per-device switch for the beta 3D gym. Order: ?gym3d=1|0 in the URL (also
// saved, so the choice sticks) > the saved choice > off.

export const GYM3D_STORAGE_KEY = "sp:gym3d"

type StorageLike = Pick<Storage, "getItem" | "setItem">

function safeStorage(): StorageLike | null {
	try {
		return typeof localStorage === "undefined" ? null : localStorage
	} catch {
		return null
	}
}

function parse(v: string | null | undefined): boolean | null {
	if (v === "1" || v === "true" || v === "on") return true
	if (v === "0" || v === "false" || v === "off") return false
	return null
}

/** Reads the flag. A ?gym3d= value in `search` wins and is saved. */
export function readGym3dFlag(
	search: string = typeof location === "undefined" ? "" : location.search,
	storage: StorageLike | null = safeStorage(),
): boolean {
	const fromUrl = parse(new URLSearchParams(search).get("gym3d"))
	if (fromUrl != null) {
		try {
			storage?.setItem(GYM3D_STORAGE_KEY, fromUrl ? "1" : "0")
		} catch {
			// private mode: the URL still decides for this visit
		}
		return fromUrl
	}
	try {
		return parse(storage?.getItem(GYM3D_STORAGE_KEY)) ?? false
	} catch {
		return false
	}
}

export function setGym3dFlag(
	on: boolean,
	storage: StorageLike | null = safeStorage(),
): void {
	try {
		storage?.setItem(GYM3D_STORAGE_KEY, on ? "1" : "0")
	} catch {
		// nothing to do: the switch just will not stick
	}
}
