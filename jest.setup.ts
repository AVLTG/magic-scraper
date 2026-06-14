// Stub environment variables needed by auth modules
// (GROUP_PASSWORD removed with shared-password auth — issue #6)
process.env.COOKIE_SECRET = 'test-secret-at-least-32-characters-long-for-hmac'
process.env.ADMIN_PASSWORD = 'test-admin-password'
