// Compila la web en un único archivo HTML (todo incluido) para probarla sin servidor ni licencia.
//   npm run build:single -w @gml/web   →   apps/web/dist-single/index.html
import { defineConfig, mergeConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import base from './vite.config';

export default mergeConfig(base, defineConfig({
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false },
}));
