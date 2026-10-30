import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url))
export default defineConfig({
  plugins: [{ name: 'qr-share-fixtures', enforce: 'pre', resolveId(source) {
    if (/\/lib\/api$/.test(source)) return here('./fixture-api.ts')
    if (/\/lib\/auth$/.test(source)) return here('./fixture-auth.ts')
    if (/\/lib\/track$/.test(source)) return here('./fixture-track.ts')
  } }, react()],
  optimizeDeps: { entries: ['tests/qr-share-e2e/harness.html'] },
  server: { host: '127.0.0.1', port: 4181, strictPort: true },
})
