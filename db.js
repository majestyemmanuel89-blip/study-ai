import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!url || !authToken) {
  throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to initialize the Turso client.')
}

export const db = createClient({ url, authToken })
