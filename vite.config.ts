import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Lib mode, multi-entry: `.` -> dist/index.js, `./react` -> dist/react/index.js,
// `./matter` -> dist/matter/index.js.
// Keeps adapters/react out of non-React consumers' bundles (exports map in package.json).
export default defineConfig({
  build: {
    // tsc --emitDeclarationOnly runs before vite build (package.json "build" script);
    // default emptyOutDir would wipe the .d.ts files tsc just wrote into dist/.
    emptyOutDir: false,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'react/index': resolve(__dirname, 'src/adapters/react/index.ts'),
        'matter/index': resolve(__dirname, 'src/matter/index.ts'),
      },
      formats: ['es'],
    },
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      external: (id) =>
        id === 'three' ||
        id.startsWith('three/') ||
        id === 'react' ||
        id === 'react-dom' ||
        id === 'react/jsx-runtime' ||
        id === 'gsap' ||
        id === 'lenis',
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
});
