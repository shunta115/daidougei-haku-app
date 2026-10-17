import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // PGlite boots an in-process Postgres instance. Running multiple migration
    // suites beside jsdom workers causes CPU contention and false timeouts in CI.
    fileParallelism: false,
    environmentOptions: { jsdom: { url: 'http://localhost/live/register' } },
  },
})
