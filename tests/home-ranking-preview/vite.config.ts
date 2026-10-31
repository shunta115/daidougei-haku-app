import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const fixture = fileURLToPath(new URL('./fixture.ts', import.meta.url))
export default defineConfig({
  plugins: [{ name: 'home-qa-isolation', enforce: 'pre', resolveId(source) {
    if (/\/lib\/(api|auth|track)$/.test(source) || source === './supabase') return fixture
  } }, react()],
  publicDir: 'tests/home-ranking-preview/public',
  build: { outDir: '/private/tmp/haku-ranking-preview', emptyOutDir: true, rollupOptions: { input: 'tests/home-ranking-preview/index.html' } },
  server: { host:'127.0.0.1', port: 4185, strictPort: true },
})
