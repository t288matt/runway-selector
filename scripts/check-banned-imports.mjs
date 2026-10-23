// Complements the oxlint no-restricted-imports rule, which only sees ES
// `import` statements. Fails if the module name 'metar-taf-parser' (or any
// subpath of it) appears as a string literal in source outside
// src/weather/decode/, which catches require(), dynamic import() and
// re-exports (DESIGN section 4: only the decode adapter may import it).
// Comments are ignored.
//
// LIMITS (by design): this is a static text check. It cannot see a module name
// that is split (['metar-', 'taf-parser'].join('')), written with escape sequences (a hex escape for one letter),
// built from an interpolated template, or read from elsewhere. Inline <script>
// blocks in HTML are not scanned, and only .ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts
// files under src/ are. The oxlint rule covers ES imports; review covers the rest.
//
// Usage: node scripts/check-banned-imports.mjs [--root <dir>]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './check-no-airport-literals.mjs';

const BANNED = /(['"`])metar-taf-parser(\/[^'"`]*)?\1/;
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const ALLOWED = 'src/weather/decode/';

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules') yield* walk(p);
    } else if (EXT.has(extname(name))) yield p;
  }
}

export function checkBannedImports(root) {
  const found = [];
  const src = join(root, 'src');
  if (!existsSync(src)) return found;
  for (const file of walk(src)) {
    const rel = relative(root, file).replaceAll('\\', '/');
    if (rel.startsWith(ALLOWED)) continue;
    stripComments(readFileSync(file, 'utf8'), extname(file))
      .split('\n')
      .forEach((line, i) => {
        if (BANNED.test(line)) found.push(`${rel}:${i + 1}`);
      });
  }
  return found;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--root');
  const root = resolve(i >= 0 ? (a[i + 1] ?? '.') : join(fileURLToPath(import.meta.url), '..', '..'));
  const found = checkBannedImports(root);
  if (found.length > 0) {
    console.error(`check-banned-imports: metar-taf-parser used outside ${ALLOWED}:`);
    for (const f of found) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('check-banned-imports: OK');
}
