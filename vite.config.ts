import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Front jest w web/, build ląduje w dist/ i serwuje go Fastify (bun start).
// W trybie dev Vite przekazuje /api do serwera. Port bierzemy z PORT (np. z .env), tak samo jak serwer.
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 3000}` },
  },
});
