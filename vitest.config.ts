import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		setupFiles: ["./tests/setup.ts"],
		testTimeout: 30000,
		hookTimeout: 60000,
		// Tests hit a real DB — run sequentially to avoid race conditions
		fileParallelism: false,
	},
})
