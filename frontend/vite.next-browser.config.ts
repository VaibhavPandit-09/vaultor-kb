import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/browser/',
  plugins: [react()],
  build: {outDir: 'dist-next-browser', rollupOptions: {input: 'browser.html'}},
});
