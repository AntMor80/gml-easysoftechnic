// Empaqueta el servidor en un solo archivo (dist/server.js) con el catálogo común incluido.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  packages: 'external',
  alias: {
    '@gml/core/commerce': fileURLToPath(new URL('../../packages/core/src/commerce.ts', import.meta.url)),
    '@gml/core/catastro-urls': fileURLToPath(new URL('../../packages/core/src/catastroUrls.ts', import.meta.url)),
  },
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
console.log('Servidor empaquetado en dist/server.js');
