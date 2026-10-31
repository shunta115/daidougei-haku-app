import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig({ optimizeDeps: { entries: ['tests/browser/haribow/index.html'] }, plugins: [react(), { name: 'isolated-audit-fixtures', enforce: 'pre', resolveId(source) { if (/\/lib\/(api|auth|track|supabase|livekit|liveCamera|useLiveFever)$/.test(source)) return resolve('tests/browser/haribow/fixture.tsx') } }], server: { host: '127.0.0.1', port: 5189 } })
