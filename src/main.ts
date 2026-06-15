import { mount } from "svelte"
import App from "./app.svelte"
import "./styles/app.css"

// Apply cached theme before first render to prevent flash of unstyled content
const cachedTheme = localStorage.getItem("sp:theme") ?? "midnight"
document.documentElement.setAttribute("data-theme", cachedTheme)

const target = document.getElementById("app")
if (!target) throw new Error("Missing #app mount target")
mount(App, { target })
