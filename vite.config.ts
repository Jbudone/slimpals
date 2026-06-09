import { svelte } from "@sveltejs/vite-plugin-svelte"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [tailwindcss(), svelte()],
	server: {
		proxy: {
			"/api": "http://localhost:3000",
			"/uploads": "http://localhost:3000",
		},
	},
	resolve: {
		alias: {
			shared: new URL("./shared", import.meta.url).pathname,
		},
	},
})
