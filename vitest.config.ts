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
    environment: 'node',
    testTimeout: 20_000,
    // Each side's tests run with that side's modules installed, as its entry point installs them (the registries never import them).
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          include: [
            'server/**/*.test.ts',
            'shared/**/*.test.ts',
            '{foundation,modules}/*/{server,shared}/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
          setupFiles: ['server/testing/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'web',
          include: ['web/src/*.test.ts', 'web/src/lib/**/*.test.ts', '{foundation,modules}/*/web/**/*.test.ts'],
          setupFiles: ['web/src/test-setup.ts'],
        },
      },
    ],
  },
})
