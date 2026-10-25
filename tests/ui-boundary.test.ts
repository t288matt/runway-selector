// Proves the v1/v2 import guard (scripts/check-ui-boundary.mjs, issue 94): it
// fails when src/v2 imports from src/ui or src/ui imports from src/v2, passes on
// the real tree, and is wired into `npm run lint`. If the guard is removed,
// neutered (always exits 0), or taken out of the lint script, a test here fails.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const guard = join(root, 'scripts', 'check-ui-boundary.mjs');
const fixtures = join(root, 'tests', 'lint-fixtures', 'boundary');
const MARKER = 'imports across the v1/v2 boundary';

const all = readdirSync(fixtures);
const fromV2 = all.filter((f) => f.startsWith('v2-') && f !== 'v2-clean.ts');
const fromUi = all.filter((f) => f.startsWith('ui-'));

let tmp = '';
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ui-boundary-'));
});
afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function runOn(dir: string) {
  return spawnSync(process.execPath, [guard, '--root', dir], { encoding: 'utf8' });
}

/** A tree with one fixture copied into src/<front end>/. */
function treeWith(fixture: string, frontEnd: 'v2' | 'ui', as: string = fixture): string {
  const dir = join(tmp, `${frontEnd}-${fixture}`);
  mkdirSync(join(dir, 'src', frontEnd), { recursive: true });
  cpSync(join(fixtures, fixture), join(dir, 'src', frontEnd, as));
  return dir;
}

describe('v1/v2 import guard', () => {
  it('has a fixture for every way of importing in each direction', () => {
    expect(fromV2.length).toBeGreaterThanOrEqual(5);
    expect(fromUi.length).toBeGreaterThanOrEqual(2);
  });

  it('exists', () => {
    expect(existsSync(guard)).toBe(true);
  });

  it.each(fromV2)('fails when src/v2 imports src/ui: %s', (f) => {
    const r = runOn(treeWith(f, 'v2'));
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stderr).toContain(MARKER);
    expect(r.stderr).toContain(`src/v2/${f}`);
  });

  it.each(fromUi)('fails when src/ui imports src/v2: %s', (f) => {
    const r = runOn(treeWith(f, 'ui'));
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stderr).toContain(MARKER);
    expect(r.stderr).toContain(`src/ui/${f}`);
  });

  it('passes a v2 file that only names src/ui in a comment and imports the shared engine', () => {
    const r = runOn(treeWith('v2-clean.ts', 'v2'));
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('allows a file outside both front ends to import either (the shared main entry)', () => {
    const dir = join(tmp, 'outside');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'main-v2.ts'), ["import { App } from './v2/App';", "import { Old } from './ui/App';", 'export const a = [App, Old];', ''].join('\n'));
    const r = runOn(dir);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('passes on the real tree', () => {
    const r = runOn(root);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('is part of npm run lint, so CI runs it', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['lint']).toContain('node scripts/check-ui-boundary.mjs');
  });
});
