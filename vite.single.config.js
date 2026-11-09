// Build « fichier unique » : tout (JS, CSS, polices) intégré dans un seul index.html autonome.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022', outDir: 'dist-single', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 },
});
