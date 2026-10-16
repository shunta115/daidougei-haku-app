import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const configuredAuthOrigin = process.env.VITE_AUTH_REDIRECT_ORIGIN?.trim()
const vercelBranchUrl = process.env.VERCEL_BRANCH_URL?.trim()
const authRedirectOrigin = configuredAuthOrigin
  || (process.env.VERCEL_ENV === 'preview' && vercelBranchUrl
    ? `https://${vercelBranchUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
    : '')

export default defineConfig({
  plugins: [react()],
  define: {
    // Vercel's branch alias survives individual Preview retention/deletion. An
    // explicit VITE_AUTH_REDIRECT_ORIGIN still wins for non-Vercel staging.
    'import.meta.env.VITE_AUTH_REDIRECT_ORIGIN': JSON.stringify(authRedirectOrigin),
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        'haku-admin': fileURLToPath(new URL('./haku-admin.html', import.meta.url)),
      },
    },
  },
})
