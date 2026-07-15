import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Coverage instrumentation plus axe/jsdom work can cross Vitest's 5s
    // default on constrained local and CI runners without indicating a hang.
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test-a11y.ts',
        'src/test-setup.ts',
        'src/types/database.ts',
        'src/vite-env.d.ts',
      ],
      thresholds: {
        statements: 87,
        branches: 74,
        functions: 84,
        lines: 90,
      },
    },
  },
})
