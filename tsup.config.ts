import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.js'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'node16',
  external: ['discord-player', 'youtubei.js'],
  esbuildOptions(options) {
    options.banner = {
      js: '"use strict";',
    };
  },
});

