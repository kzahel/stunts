/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/stunts/',
  test: {
    environment: 'jsdom',
  },
});
