import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5199,
    strictPort: false,
    host: '127.0.0.1',
    // the lab server (pnpm server) owns persistence, jobs and the assistant; one origin for the browser
    proxy: { '/api': { target: 'http://127.0.0.1:5198', changeOrigin: false } },
  },
  // the app bundle (React, Redux, d3) stays under 900 kB; MathJax is its own lazily loaded chunk (~1.4 MB),
  // fetched only when a board shows a formula, and each extra glyph range is a further small chunk
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
