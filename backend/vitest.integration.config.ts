import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/tests/**/*.integration.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
