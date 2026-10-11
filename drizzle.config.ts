import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: { url: process.env.DATA_DIR ? `${process.env.DATA_DIR}/bphs.sqlite` : './data/bphs.sqlite' },
})
