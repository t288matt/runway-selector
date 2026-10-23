import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const refdataDir = resolve(import.meta.dirname, 'refdata');

function* jsonFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* jsonFiles(p);
    else if (name.endsWith('.json')) yield p;
  }
}

/**
 * Serves refdata/ beside the app (DESIGN section 4c, "Pack delivery"): in dev at
 * /refdata/..., and copied into dist/refdata for the build. Only .json files
 * inside refdata/ are served; the pack files are fetched at run time, not bundled.
 */
function refdata(): Plugin {
  return {
    name: 'serve-refdata',
    configureServer(server) {
      server.middlewares.use('/refdata', (req, res, next) => {
        let path: string;
        try {
          path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
        } catch {
          res.statusCode = 400;
          res.end('Bad request');
          return;
        }
        const file = resolve(refdataDir, `.${path}`);
        if (!file.startsWith(refdataDir + sep) || !file.endsWith('.json')) {
          next();
          return;
        }
        try {
          const body = readFileSync(file);
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end('Not found');
        }
      });
    },
    generateBundle() {
      for (const file of jsonFiles(refdataDir)) {
        this.emitFile({ type: 'asset', fileName: `refdata/${relative(refdataDir, file).split(sep).join('/')}`, source: readFileSync(file) });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), refdata()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/lint-fixtures/**', 'node_modules/**'],
  },
});
