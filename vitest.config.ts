import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: { include: ['tests/**/*.test.{ts,tsx}'], environmentOptions: { jsdom: { url: 'http://localhost/live/register' } } },
})
