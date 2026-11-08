import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const helpRoot = new URL('../docs/help/', import.meta.url)
function bundledHelp() {
  return { name: 'vaultor-bundled-help',
    buildStart() { execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/validate-help.mjs', import.meta.url))], { stdio: 'inherit' }) },
    generateBundle() {
      const catalogue = JSON.parse(readFileSync(new URL('catalogue.json', helpRoot), 'utf8'))
      const files: Record<string, string> = { 'catalogue.json': JSON.stringify(catalogue) }
      for (const article of catalogue.articles) files[article.path] = readFileSync(new URL(article.path, helpRoot), 'utf8')
      const hashes = Object.fromEntries(Object.entries(files).map(([path, content]) => [path, createHash('sha256').update(content).digest('hex')]))
      for (const [path, source] of Object.entries(files)) this.emitFile({ type: 'asset' as const, fileName: 'help/' + path, source })
      this.emitFile({ type: 'asset' as const, fileName: 'help/provenance.json', source: JSON.stringify({ schemaVersion: 1, reviewed: catalogue.reviewed, hashes }) })
    }
  } satisfies import('vite').Plugin
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), bundledHelp()],
  // Markdown's named-entity decoder has a DOM-free worker export. The same
  // module worker is also independently executed by the owner-local validator.
  resolve: { conditions: ['worker', 'module', 'browser', 'development|production'] },
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
