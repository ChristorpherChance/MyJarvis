import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlineShell } from './build/offline-shell';
export default defineConfig({
  plugins: [react(), offlineShell()],
  build: { rollupOptions: { input: { index: 'index.html', offlineCapture: 'offline-capture.html' } } },
  server: { port: 5173, strictPort: true, proxy: { '/api': {target:'http://127.0.0.1:3140',changeOrigin:false} } },
});
