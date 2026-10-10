import { mount } from "svelte"
import App from "./app.svelte"
import { prefetch } from "./lib/api.js"
import { wasSignedIn } from "./lib/auth.svelte.js"
import "./styles/app.css"

// Apply cached theme before first render to prevent flash of unstyled content
const cachedTheme = localStorage.getItem("sp:theme") ?? "midnight"
document.documentElement.setAttribute("data-theme", cachedTheme)

// A returning player: start fetching the gym (its code and its first two
// answers) now, while the session and the app shell are still loading.
if (wasSignedIn()) {
	prefetch("/gym/layout?open=1")
	prefetch("/gym/npcs")
	void import("./components/gym3d/Gym3D.svelte").catch(() => {})
}

const target = document.getElementById("app")
if (!target) throw new Error("Missing #app mount target")
mount(App, { target })
