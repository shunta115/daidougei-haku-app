import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const fixture = fileURLToPath(new URL('./fixture.ts', import.meta.url))
export default defineConfig({
  plugins: [{ name: 'home-qa-isolation', enforce: 'pre', resolveId(source) {
    if (/\/lib\/(api|auth|track|homeDiscoveryApi)$/.test(source) || source === './supabase') return fixture
  } }, react()],
  publicDir: 'tests/home-integration-preview/public',
  build: { outDir: '/private/tmp/haku-home-integrated-preview', emptyOutDir: true, rollupOptions: { input: 'tests/home-integration-preview/index.html' } },
  server: { host:'127.0.0.1', port: 4191, strictPort: true },
})
