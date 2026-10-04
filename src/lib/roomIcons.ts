// One picture per room type, for the places that list gear without a 3D view
// (the unlock path, rewards).
export const ROOM_ICON: Readonly<Record<string, string>> = {
	cardio: "🏃",
	weights: "🏋️",
	boxing: "🥊",
	recovery: "🧖",
	juice: "🥤",
	pool: "🏊",
	court: "🏀",
}

export const roomIcon = (roomType: string): string =>
	ROOM_ICON[roomType] ?? "✨"
