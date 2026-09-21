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
	| "/gym/canvas"
	| "/tournaments"
	| "/badges"
	| "/settings"
	| "/admin"
	| "/gym-sprites"
	| "/ui-kit"
	| "/content-tuning"

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
	page("/gym/canvas", go("/gym/canvas"))
	page("/tournaments", go("/tournaments"))
	page("/badges", go("/badges"))
	page("/settings", go("/settings"))
	page("/admin", go("/admin"))
	if (import.meta.env.DEV) {
		page("/gym-sprites", go("/gym-sprites"))
		page("/ui-kit", go("/ui-kit"))
	}
	page("/content-tuning", go("/content-tuning"))
	page("/", go("/"))
	page()
}

export { page }
