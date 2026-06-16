import page from "page"

export type RoutePath =
	| "/"
	| "/login"
	| "/register"
	| "/weight"
	| "/food"
	| "/challenges"
	| "/social"
	| "/gym"
	| "/tournaments"
	| "/badges"
	| "/settings"
	| "/admin"

export const nav = $state<{ path: RoutePath; params: Record<string, string> }>({
	path: "/",
	params: {},
})

export function initRouter() {
	const go = (path: RoutePath) => (ctx: { params: Record<string, string> }) => {
		nav.path = path
		nav.params = ctx.params ?? {}
	}

	page("/login", go("/login"))
	page("/register", go("/register"))
	page("/weight", go("/weight"))
	page("/food", go("/food"))
	page("/challenges", go("/challenges"))
	page("/social", go("/social"))
	page("/gym", go("/gym"))
	page("/tournaments", go("/tournaments"))
	page("/badges", go("/badges"))
	page("/settings", go("/settings"))
	page("/admin", go("/admin"))
	page("/", go("/"))
	page()
}

export { page }
