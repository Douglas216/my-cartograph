import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Honor the harness-assigned port when present (Claude preview autoPort).
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
})
