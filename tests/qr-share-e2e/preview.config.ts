import { defineConfig, mergeConfig } from 'vite'
import fixtureConfig from './vite.config'
import { fileURLToPath } from 'node:url'
export default mergeConfig(fixtureConfig, defineConfig({
  publicDir: false,
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(''),
  },
  build: {
    outDir: 'qr-share-static-preview',
    emptyOutDir: false,
    rollupOptions: { input: fileURLToPath(new URL('./harness.html', import.meta.url)) },
  },
}))
