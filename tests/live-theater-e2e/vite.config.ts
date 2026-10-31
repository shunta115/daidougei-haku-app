import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  plugins: [{ name: 'isolated-live-theater', enforce: 'pre', resolveId(source, importer) {
    if (/\/lib\/(api|auth|track|supabase|livekit)$/.test(source) || (importer?.includes('/src/platform/lib/') && /^\.\/(api|auth|track|supabase|livekit)$/.test(source))) return fileURLToPath(new URL('./fixtures.ts', import.meta.url))
  } }, react()],
  optimizeDeps: { entries: ['tests/live-theater-e2e/harness.html'] },
  server: { host: '127.0.0.1', port: 4187, strictPort: true },
})
