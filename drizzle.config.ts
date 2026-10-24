import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  // The kernel's tables, then each module's. One migrations folder for all of them.
  schema: ['./server/db/schema.ts', './foundation/*/server/schema.ts', './modules/*/server/schema.ts'],
  out: './server/db/migrations',
  dbCredentials: { url: process.env.DATA_DIR ? `${process.env.DATA_DIR}/bphs.sqlite` : './data/bphs.sqlite' },
})
