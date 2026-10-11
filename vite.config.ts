import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

const apiTarget = process.env.API_ORIGIN ?? 'http://localhost:3000'

// The SPA lives in /web. In development Vite serves it and proxies /api to the
// Hono server; in production the server serves the built files from dist/web.
export default defineConfig({
  root: 'web',
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'web/src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': apiTarget },
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    // Hashed files live under /static so they never collide with the /assets pages of the app.
    assetsDir: 'static',
    sourcemap: true,
  },
})
