import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'web/src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
  test: {
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'web/src/lib/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
})
