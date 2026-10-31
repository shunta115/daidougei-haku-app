import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const crowdLab = mode === 'crowd-lab'
  if (crowdLab && process.env.VERCEL_ENV === 'production') throw new Error('CROWD lab cannot be included in a production release')
  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          'haku-admin': fileURLToPath(new URL('./haku-admin.html', import.meta.url)),
          ...(crowdLab ? { 'haku-crowd-live': fileURLToPath(new URL('./haku-crowd-live.html', import.meta.url)) } : {}),
        },
      },
    },
  }
})
