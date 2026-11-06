import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Rutas relativas: la misma compilación sirve en Hostinger y dentro de la aplicación de escritorio (file://).
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // En desarrollo se usa el código fuente del motor directamente.
      '@gml/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  optimizeDeps: { include: ['pdfmake/build/pdfmake', 'pdfmake/build/vfs_fonts', 'docx', 'sql.js'] },
  build: { chunkSizeWarningLimit: 4000 },
  // Sin servidor (iniciar-web.bat) las consultas al Catastro pasan por Vite, porque el
  // Catastro no permite llamadas directas desde el navegador.
  server: { proxy: { '/ovc': { target: 'https://ovc.catastro.meh.es', changeOrigin: true, rewrite: (p) => p.replace(/^\/ovc/, '') } } },
  preview: { proxy: { '/ovc': { target: 'https://ovc.catastro.meh.es', changeOrigin: true, rewrite: (p) => p.replace(/^\/ovc/, '') } } },
});
