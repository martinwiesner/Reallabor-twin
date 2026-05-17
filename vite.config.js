import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import controlPlugin from './vite-plugin-control.js'

export default defineConfig({
  plugins: [react(), controlPlugin()],
  base: '/reallabor-twin/',
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})