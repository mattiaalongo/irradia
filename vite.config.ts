import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/  —  https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Il motore di calcolo è TypeScript puro: non serve simulare un browser.
    environment: 'node',
  },
})
