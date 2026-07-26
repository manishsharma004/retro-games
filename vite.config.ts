import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Project site: https://manishsharma004.github.io/retro-games/
  base: '/retro-games/',
})
