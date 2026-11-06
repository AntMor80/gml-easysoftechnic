import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@gml/core/commerce': fileURLToPath(new URL('../../packages/core/src/commerce.ts', import.meta.url)),
      '@gml/core/catastro-urls': fileURLToPath(new URL('../../packages/core/src/catastroUrls.ts', import.meta.url)),
    },
  },
});
