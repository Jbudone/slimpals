<script lang="ts">
import { authState, fetchSession } from "../lib/auth.svelte.js"
import { fetchUserProfile } from "../lib/user.svelte.js"
import { page } from "../router.svelte.js"

let name = $state("")
let email = $state("")
let password = $state("")
let inviteCode = $state("")
let error = $state<string | null>(null)
let submitting = $state(false)

async function handleSubmit(e: SubmitEvent) {
	e.preventDefault()
	error = null
	submitting = true
	try {
		const res = await fetch("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ name, email, password, inviteCode }),
		})
		const data = await res.json().catch(() => ({}))
		if (!res.ok) {
			error = data?.error ?? data?.message ?? "Registration failed"
			return
		}
		await fetchSession()
		await fetchUserProfile()
		page("/")
	} catch {
		error = "Network error — please try again"
	} finally {
		submitting = false
	}
}
</script>

<div class="auth-page">
	<div class="auth-card">
		<h1>Join SlimPals</h1>
		<p class="subtitle">You'll need an invite code from an existing member.</p>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<form onsubmit={handleSubmit}>
			<label>
				Name
				<input
					type="text"
					autocomplete="name"
					required
					bind:value={name}
				/>
			</label>

			<label>
				Email
				<input
					type="email"
					autocomplete="email"
					required
					bind:value={email}
				/>
			</label>

			<label>
				Password
				<input
					type="password"
					autocomplete="new-password"
					required
					minlength={8}
					bind:value={password}
				/>
			</label>

			<label>
				Invite code
				<input
					type="text"
					placeholder="XXXX-XXXX"
					required
					bind:value={inviteCode}
				/>
			</label>

			<button type="submit" disabled={submitting}>
				{submitting ? "Creating account…" : "Create account"}
			</button>
		</form>

		<p class="switch-link">
			Already have an account? <a href="/login" onclick={(e) => { e.preventDefault(); page("/login") }}>Sign in</a>
		</p>
	</div>
</div>

<style>
.auth-page {
	min-height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--color-bg);
	padding: 1rem;
}

.auth-card {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 0.75rem;
	padding: 2rem;
	width: 100%;
	max-width: 400px;
}

h1 {
	font-size: 1.5rem;
	font-weight: 700;
	color: var(--color-text);
	margin-bottom: 0.5rem;
}

.subtitle {
	font-size: 0.875rem;
	color: var(--color-text-muted);
	margin-bottom: 1.5rem;
}

.error {
	background: color-mix(in srgb, var(--color-danger) 15%, transparent);
	border: 1px solid var(--color-danger);
	color: var(--color-danger);
	border-radius: 0.375rem;
	padding: 0.75rem 1rem;
	margin-bottom: 1rem;
	font-size: 0.875rem;
}

form {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

label {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
	font-size: 0.875rem;
	color: var(--color-text-muted);
}

input {
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	border-radius: 0.375rem;
	padding: 0.625rem 0.75rem;
	color: var(--color-text);
	font-size: 1rem;
}

input:focus {
	outline: 2px solid var(--color-accent);
	outline-offset: 1px;
	border-color: var(--color-accent);
}

button[type="submit"] {
	background: var(--color-accent);
	color: #fff;
	border: none;
	border-radius: 0.375rem;
	padding: 0.75rem;
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
	margin-top: 0.5rem;
}

button[type="submit"]:hover:not(:disabled) {
	background: var(--color-accent-hover);
}

button[type="submit"]:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.switch-link {
	text-align: center;
	font-size: 0.875rem;
	color: var(--color-text-muted);
	margin-top: 1.5rem;
}

.switch-link a {
	color: var(--color-accent);
	text-decoration: none;
}
</style>
