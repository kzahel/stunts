/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/stunts/',
  test: {
    environment: 'jsdom',
  },
});
