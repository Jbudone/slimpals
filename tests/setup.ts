// Override DATABASE_URL before any server modules are imported so Better Auth
// and the server's Drizzle pool both point at the test database.
const testUrl =
	process.env.TEST_DATABASE_URL ??
	"mysql://slimpals:slimpalspass@127.0.0.1:3307/slimpals_test"

process.env.DATABASE_URL = testUrl
process.env.BETTER_AUTH_SECRET = "test-secret-not-for-production"
process.env.BETTER_AUTH_URL = "http://localhost:3000"
