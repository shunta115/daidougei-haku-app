import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fixture = resolve(repository, 'experiments/live-ui/browser-fixture.tsx')
const mocked = new Set(['api', 'auth', 'supabase', 'livekit', 'liveCamera', 'useLiveFever', 'track'].map((name) => resolve(repository, `src/platform/lib/${name}`)))

// This config is used only by the localhost QA command. The production Vite
// config and entry points never import this fixture or its aliases.
export default defineConfig({
  root: repository,
  plugins: [{
    name: 'haku-live-local-fixture',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null
      const path = resolve(dirname(importer.split('?')[0]), source).replace(/\.[cm]?[jt]sx?$/, '')
      return mocked.has(path) ? fixture : null
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/api/')) { response.statusCode = 410; response.end('The UI QA fixture cannot access application APIs.'); return }
        next()
      })
    },
  }, react()],
  server: { host: '127.0.0.1', port: 4179, strictPort: true },
})
