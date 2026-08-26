import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // One .env at the workspace root serves both apps.
  envDir: '../..',
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
