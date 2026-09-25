import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Dev-only server for the Cube Stress Test example. Not part of the published
// package's build (that's vite.config.ts at the project root, lib mode). Root is set
// to example/ so `index.html` resolves at the server root; `../src/index.js` imports
// inside example/*.ts resolve against src/ on disk (real .ts files) since Vite's dev
// server transpiles on the fly and follows the `.js`-suffixed specifier straight to the
// sibling `.ts` file — no extension-rewrite plugin needed (verified by running the
// server, not assumed).
export default defineConfig({
  root: resolve(__dirname),
  server: {
    fs: {
      // allow importing ../src/** which lives outside example/
      allow: [resolve(__dirname, '..')],
    },
  },
});
