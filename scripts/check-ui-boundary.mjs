// Keeps the two front ends apart (issue 94, owner rule 25-10-2026): nothing under
// src/v2 may import from src/ui, and nothing under src/ui may import from
// src/v2. Both share the engine, weather, traffic, refdata, store and net
// modules, never each other's screen code. Tests may import both (the parity
// test does); only src/ is checked. Comments are ignored.
//
// It reads every import, export-from, dynamic import(), require() and CSS
// @import specifier written as a string literal, resolves relative ones against
// the importing file (the whole text, so a specifier may sit on another line from its keyword), and fails when the result lies inside the other front end.
//
// LIMITS (by design): this is a static text check, like check-banned-imports.mjs.
// It cannot see a specifier that is built at run time (concatenation, a template
// with a variable, a value read from elsewhere) or one hidden by a bundler alias;
// review covers those. Only .ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts and .css files
// under src/ are scanned.
//
// Usage: node scripts/check-ui-boundary.mjs [--root <dir>]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './check-no-airport-literals.mjs';

const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.css']);
export const MESSAGE = 'src/v2 and src/ui must not import each other (found imports across the v1/v2 boundary)';

/** [directory of one front end, directory of the other]. */
const PAIRS = [
  ['src/v2', 'src/ui'],
  ['src/ui', 'src/v2'],
];

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bglob\s*\(\s*|@import\s+(?:url\(\s*)?)(['"`])([^'"`\n]+)\1/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules') yield* walk(p);
    } else if (EXT.has(extname(name))) yield p;
  }
}

const inside = (path, dir) => path === dir || path.startsWith(`${dir}/`);

export function checkUiBoundary(root) {
  const found = [];
  const src = join(root, 'src');
  if (!existsSync(src)) return found;
  for (const file of walk(src)) {
    const rel = relative(root, file).split(sep).join('/');
    const pair = PAIRS.find(([own]) => inside(rel, own));
    if (pair === undefined) continue;
    const other = pair[1];
    // The whole text is scanned, not line by line, so a specifier on a different line from its keyword is still seen.
    const text = stripComments(readFileSync(file, 'utf8'), extname(file));
    for (const m of text.matchAll(SPECIFIER)) {
      const spec = m[2] ?? '';
      const target = spec.startsWith('.') ? relative(root, resolve(dirname(file), spec)).split(sep).join('/') : spec.replace(/^\/+/, '');
      if (inside(target, other)) found.push(`${rel}:${text.slice(0, m.index).split('\n').length} imports ${spec}`);
    }
  }
  return found;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--root');
  const root = resolve(i >= 0 ? (a[i + 1] ?? '.') : join(fileURLToPath(import.meta.url), '..', '..'));
  const found = checkUiBoundary(root);
  if (found.length > 0) {
    console.error(`check-ui-boundary: ${MESSAGE}:`);
    for (const f of found) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('check-ui-boundary: OK');
}
