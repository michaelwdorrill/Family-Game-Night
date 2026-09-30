import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
].join('; ');

export default defineConfig(({ command }) => ({
  base: '/',
  plugins: [
    react(),
    {
      name: 'production-content-security-policy',
      transformIndexHtml: {
        order: 'pre',
        handler: () =>
          command === 'build'
            ? [
                {
                  tag: 'meta',
                  attrs: {
                    'http-equiv': 'Content-Security-Policy',
                    content: contentSecurityPolicy,
                  },
                  injectTo: 'head-prepend',
                },
              ]
            : [],
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
}));
