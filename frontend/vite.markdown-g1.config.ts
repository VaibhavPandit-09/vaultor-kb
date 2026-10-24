// Separate development-only entry/config. Never imported by the shipped build.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // The named-entity decoder exposes a DOM-free worker export. Browser-only
  // resolution otherwise selects document.createElement inside the parser.
  resolve: { conditions: ['worker', 'module', 'browser', 'development|production'] },
  server: { host: '127.0.0.1', port: 5174, strictPort: true, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  build: { outDir: 'node_modules/.cache/markdown-g1-build', rollupOptions: { input: 'markdown-g1.html' } },
});
