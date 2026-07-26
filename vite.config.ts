import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Project site: https://manishsharma004.github.io/retro-games/
  base: '/retro-games/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        emulatorFrame: resolve(__dirname, 'emulator-frame.html'),
      },
    },
  },
})
