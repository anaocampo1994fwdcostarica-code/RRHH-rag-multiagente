import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // El backend solo acepta CORS desde FRONTEND_URL (http://localhost:5173). strictPort hace que Vite falle
  // con un error claro si el puerto está ocupado, en lugar de pasar en silencio a 5174, 5175…
  server: { port: 5173, strictPort: true },
})
