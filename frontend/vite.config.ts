import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (outgoing, incoming) => {
            // Only the fixed local development origin can use this same-origin proxy.
            // Other origins pass through unchanged and the host rejects them.
            if (['http://localhost:5173', 'http://127.0.0.1:5173'].includes(incoming.headers.origin || '')) outgoing.setHeader('Origin', 'http://127.0.0.1:8080');
          });
        }
      },
      '/access': { target: 'http://127.0.0.1:8080', changeOrigin: true }
    },
    port: 5173,
    strictPort: true
  }
})
