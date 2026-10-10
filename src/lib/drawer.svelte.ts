// The gym's Today drawer: whether it is open and which segment it shows.
// Old links (/today, /rewards) and the "next unlock" bubble open it here.
export type DrawerTab = "tasks" | "rewards" | "coach"

export const drawerUi = $state<{ open: boolean; tab: DrawerTab }>({
	open: false,
	tab: "tasks",
})

export function openDrawer(tab: DrawerTab = "tasks"): void {
	drawerUi.tab = tab
	drawerUi.open = true
}
