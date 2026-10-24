import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { manifests } from './shared/registry.ts'

const apiTarget = process.env.API_ORIGIN ?? 'http://localhost:3000'

/** What `bun run modules:gen` reads: the module list and each module's manifest and sides. */
const REGISTRY_INPUT =
  /(?:^|\/)(?:app\.modules\.ts|(?:foundation|modules)\/[^/]+\/(?:shared\/manifest|server\/module|web\/module)\.ts)$/

/**
 * Vite only watches its root (web/), so the route generator would miss a new page file in a module folder. The same watcher
 * reruns `bun run modules:gen` (in its own process, so every manifest is read afresh) when the module list or a manifest changes.
 */
function watchModules(): Plugin {
  return {
    name: 'bphs:watch-modules',
    apply: 'serve',
    configureServer(server) {
      const generate = () =>
        execFile(
          process.execPath,
          ['scripts/gen-modules.ts'],
          { cwd: import.meta.dirname },
          (error, _stdout, stderr) => {
            if (error) server.config.logger.error(stderr.trim() || error.message, { timestamp: true })
          },
        )
      const changed = (file: string) => {
        if (REGISTRY_INPUT.test(file.split(path.sep).join('/'))) generate()
      }
      server.watcher.add([
        path.resolve(import.meta.dirname, 'modules'),
        path.resolve(import.meta.dirname, 'foundation'),
        path.resolve(import.meta.dirname, 'app.modules.ts'),
      ])
      server.watcher.on('add', changed).on('change', changed).on('unlink', changed)
      generate()
    },
  }
}

const ROUTES = path.resolve(import.meta.dirname, 'web/src/routes')

/**
 * The pages (issue #23): the kernel's own in web/src/routes, then each module's, in registry order. A module's
 * `web/routes/` mounts under the app layout at its `routePrefix`, and its `web/print/` at the root, outside the layout.
 * Plain data in the shape of @tanstack/virtual-file-routes, so it needs no dependency of its own.
 */
function routeConfig() {
  const route = (path: string, file: string) => ({ type: 'route' as const, path, file })
  const physical = (pathPrefix: string, directory: string) => ({ type: 'physical' as const, pathPrefix, directory })
  // The kernel's own pages under the layout: Home's, the Users page, Lists and Import/Export.
  const pages = [physical('', '_app')]
  const print = []
  for (const { id, tier, routePrefix = '' } of manifests()) {
    const web = path.resolve(import.meta.dirname, tier === 'foundation' ? 'foundation' : 'modules', id, 'web')
    const from = (folder: string) => path.relative(ROUTES, path.join(web, folder)).split(path.sep).join('/')
    if (existsSync(path.join(web, 'routes'))) pages.push(physical(routePrefix, from('routes')))
    if (existsSync(path.join(web, 'print'))) print.push(physical('', from('print')))
  }
  return {
    type: 'root' as const,
    file: '__root.tsx',
    children: [
      route('/login', 'login.tsx'),
      route('/password-change', 'password-change.tsx'),
      ...print,
      { type: 'layout' as const, id: '_app', file: '_app.tsx', children: pages },
    ],
  }
}

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
      virtualRouteConfig: routeConfig(),
    }),
    react(),
    tailwindcss(),
    watchModules(),
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
    sourcemap: false,
  },
})
