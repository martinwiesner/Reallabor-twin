import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import controlPlugin from './vite-plugin-control.js'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), controlPlugin()],
  base: '/reallabor-twin/',
  resolve: {
    dedupe: ['react', 'react-dom', 'three'],
    alias: {
      // web-ifc is loaded via <script> in index.html to avoid Vite's ESM
      // transform breaking the emscripten WASM import object (Import #0 "a").
      'web-ifc': resolve(__dirname, './src/web-ifc-shim.js'),
    },
  },
  optimizeDeps: {
    exclude: ['@thatopen/components', '@thatopen/components-front', 'three'],
  },
  assetsInclude: ['**/*.wasm'],
})