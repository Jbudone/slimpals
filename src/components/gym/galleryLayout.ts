export type GalleryCell = {
	key: string
	col: number
	row: number
}

export function computeGalleryLayout(
	entries: { key: string }[],
	columns: number,
): GalleryCell[] {
	return entries.map((entry, index) => ({
		key: entry.key,
		col: index % columns,
		row: Math.floor(index / columns),
	}))
}
