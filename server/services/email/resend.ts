// Sends one email through Resend's HTTP API. Needs RESEND_API_KEY; the sender
// is EMAIL_FROM (default is Resend's test sender, which Resend limits to the
// account owner's own address, enough for the owner's report).

export type Email = {
	to: string[]
	subject: string
	text: string
	html?: string
}

export type SendResult =
	| { sent: true; id: string | null }
	| { sent: false; reason: string }

export async function sendEmail(
	email: Email,
	fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
	const key = process.env.RESEND_API_KEY
	if (!key) return { sent: false, reason: "RESEND_API_KEY is not set" }
	if (email.to.length === 0) return { sent: false, reason: "no recipients" }
	const from = process.env.EMAIL_FROM || "SlimPals <onboarding@resend.dev>"
	try {
		const res = await fetchImpl("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from,
				to: email.to,
				subject: email.subject,
				text: email.text,
				html: email.html,
			}),
		})
		const body = (await res.json().catch(() => ({}))) as {
			id?: string
			message?: string
		}
		if (!res.ok)
			return {
				sent: false,
				reason: body.message ?? `Resend answered ${res.status}`,
			}
		return { sent: true, id: body.id ?? null }
	} catch (err) {
		return {
			sent: false,
			reason: err instanceof Error ? err.message : "network error",
		}
	}
}
