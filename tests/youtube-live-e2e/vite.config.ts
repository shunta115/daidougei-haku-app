import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  plugins: [{ name: 'youtube-local-supabase', enforce: 'pre', resolveId(source, importer) {
    if (source === './supabase' && importer?.endsWith('/youtubeLivePublish.ts')) return fileURLToPath(new URL('./fixture-supabase.ts', import.meta.url))
  } }, react()],
  optimizeDeps: { entries: ['tests/youtube-live-e2e/harness.html'] },
  server: { host: '127.0.0.1', port: 4187, strictPort: true },
})
