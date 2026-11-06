import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // En desarrollo se usa el código fuente del motor directamente.
      '@gml/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  optimizeDeps: { include: ['pdfmake/build/pdfmake', 'pdfmake/build/vfs_fonts', 'docx', 'sql.js'] },
  build: { chunkSizeWarningLimit: 4000 },
});
