import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    // En desarrollo, /api va a la API de NestJS.
    proxy: { '/api': 'http://localhost:3002' },
  },
});
