import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
const publicSite = new URL(process.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5173');
if (!['http:', 'https:'].includes(publicSite.protocol))
  throw new Error('VITE_PUBLIC_SITE_URL must be an HTTP(S) URL');
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'absolute-social-metadata',
      transformIndexHtml: (html) => html.replaceAll('__PUBLIC_SITE_URL__', publicSite.origin),
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000' } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/tests/**', 'src/types/**', 'src/main.tsx'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 80, statements: 75, functions: 70, branches: 65 },
    },
  },
});
