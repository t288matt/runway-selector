import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createAtisMiddleware } from './scripts/atisMiddleware.ts';

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

/**
 * The real-world ATIS endpoint (issue 159, DESIGN section 8b): /api/atis/<ICAO>, dev server only. The NAIPS
 * credentials are read from the environment at request time (NAIPS_ prefix, never VITE_, so never bundled) and
 * never leave the server. Not part of the build: a static build has no endpoint and the page hides the indicator.
 */
function atisEndpoint(): Plugin {
  return {
    name: 'serve-atis',
    configureServer(server) {
      server.middlewares.use(
        '/api/atis',
        createAtisMiddleware({
          getCredentials: () => {
            const env = loadEnv(server.config.mode, server.config.envDir || server.config.root, 'NAIPS_');
            return { username: env['NAIPS_USERNAME'], password: env['NAIPS_PASSWORD'] };
          },
          fetch: (input, init) => fetch(input, init),
          now: () => Date.now(),
        }),
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), refdata(), atisEndpoint()],
  // Two page entries: the v2 front end (index.html, now the root) and legacy v1 (v1.html). refdata/ is still copied once, by the plugin above.
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), v1: resolve(import.meta.dirname, 'v1.html') },
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/lint-fixtures/**', 'node_modules/**'],
  },
});
