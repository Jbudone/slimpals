import { mount } from "svelte"
import App from "./app.svelte"
import "./styles/app.css"

const target = document.getElementById("app")
if (!target) throw new Error("Missing #app mount target")
mount(App, { target })
