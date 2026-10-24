import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],resolve:{conditions:['worker','module','browser','development|production']},build:{outDir:'node_modules/.cache/markdown-g3-build',rollupOptions:{input:'markdown-g3.html'}}});
