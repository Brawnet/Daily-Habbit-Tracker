import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.js', 'api/**/*.test.js', '../gas-backend/tests/**/*.test.js'],
    environment: 'node',
  },
});
