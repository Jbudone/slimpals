export const IMPERSONATOR_COOKIE = "slimpals_impersonator"

export function parseCookies(
	header: string | undefined,
): Record<string, string> {
	const cookies: Record<string, string> = {}
	if (!header) return cookies
	for (const part of header.split(";")) {
		const eq = part.indexOf("=")
		if (eq === -1) continue
		const name = part.slice(0, eq).trim()
		const value = part.slice(eq + 1).trim()
		if (name) cookies[name] = decodeURIComponent(value)
	}
	return cookies
}
