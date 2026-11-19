import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // The Markdown parser runs in a worker and needs the DOM-free entity decoder.
  resolve: { conditions: ['worker', 'module', 'browser', 'development|production'] },
  base: './',
  server: { port: 5174, strictPort: true },
  build: { outDir: 'dist-next', rollupOptions: { input: 'next.html' } },
});
