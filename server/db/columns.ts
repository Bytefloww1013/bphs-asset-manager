// Column helpers every schema file uses, the kernel's and each module's `server/schema.ts`.
import { sql } from 'drizzle-orm'
import { integer } from 'drizzle-orm/sqlite-core'

export const ms = (name: string) => integer(name, { mode: 'timestamp_ms' })
export const createdAt = () =>
  ms('created_at')
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
