import { defineConfig, devices } from "@playwright/test"

// Bot/E2E smoke tests — heavier than the Vitest unit suite, run periodically
// or on-demand (npm run test:e2e), not on every PR. See docs/admin-testing-requirements.md.
//
// Requires: nothing else running on ports 3000/5173 — this config always
// spawns its own dev server (never reuses an already-running one), because
// these tests need real login/register/logout behavior and an ambient dev
// server may have DEV_AUTOLOGIN_EMAIL enabled, which would auto-authenticate
// every request and make the auth flow untestable. The `env` override below
// disables it for the spawned server regardless of what's in .env.
export default defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	fullyParallel: false,
	retries: 0,
	reporter: "list",
	use: {
		baseURL: "http://localhost:5173",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "npm run dev",
		url: "http://localhost:3000/api/health",
		timeout: 60_000,
		reuseExistingServer: false,
		env: {
			DEV_AUTOLOGIN_EMAIL: "",
		},
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
