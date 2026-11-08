/// <reference types="vitest/config" />
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  /* Yard play (the fling mini-game) is an optional install: with YARD_PLAY=on in the repo's .env
     (or the build's environment) it ships as its own lazy chunk; otherwise none of it is built. */
  define: {
    __YARD_PLAY__: JSON.stringify(
      (process.env.YARD_PLAY ??
        loadEnv(mode, path.resolve(import.meta.dirname, '../..'), '').YARD_PLAY) === 'on',
    ),
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  build: { sourcemap: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
}));
