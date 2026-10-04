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
		// through the Vite proxy: ready once both Vite and the API answer (the
		// API alone left the first test racing Vite: ECONNREFUSED :5173)
		url: "http://localhost:5173/api/health",
		timeout: 60_000,
		reuseExistingServer: false,
		env: {
			DEV_AUTOLOGIN_EMAIL: "",
			// Never let the in-process scheduler generate content mid-run.
			SCHEDULER_ENABLED: "0",
			// Story cutscene cards would sit over the gym in every spec: off
			// here, and the story spec turns it on with ?story=1.
			VITE_STORY: "off",
		},
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		// Phone-sized run for the 3D gym (its camera, taps and GPU budget are
		// tuned for phones first).
		{
			name: "mobile-chromium",
			use: { ...devices["Pixel 7"] },
			testMatch: /gym3d-.*\.spec\.ts/,
		},
	],
})
