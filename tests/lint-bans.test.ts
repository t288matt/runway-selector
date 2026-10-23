// Proves each lint ban fails when its bad fixture is linted explicitly.
// tests/lint-fixtures/ is excluded from the normal lint run (.oxlintrc.json
// ignorePatterns), so each fixture is copied into a temporary tree that
// mirrors src/ (so the src/engine/** override applies) and linted there with
// the repository config minus ignorePatterns.
// Known gap: oxlint 1.89 no-implied-eval flags only globalThis.setTimeout('str'),
// not a bare setTimeout('str'); the other bans have no such gap.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const fixtures = join(root, 'tests', 'lint-fixtures');
const oxlint = join(root, 'node_modules', 'oxlint', 'bin', 'oxlint');

let tmp = '';

function lint(relPath: string) {
  return spawnSync(process.execPath, [oxlint, '-c', '.oxlintrc.json', '--deny-warnings', relPath], {
    cwd: tmp,
    encoding: 'utf8',
  });
}

const general = readdirSync(fixtures).filter((f) => /\.tsx?$/.test(f));
const engine = readdirSync(join(fixtures, 'engine')).filter((f) => f.endsWith('.ts'));

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lint-bans-'));
  const config = JSON.parse(readFileSync(join(root, '.oxlintrc.json'), 'utf8')) as Record<string, unknown>;
  delete config['ignorePatterns'];
  delete config['$schema'];
  writeFileSync(join(tmp, '.oxlintrc.json'), JSON.stringify(config));
  mkdirSync(join(tmp, 'src', 'ui'), { recursive: true });
  mkdirSync(join(tmp, 'src', 'engine'), { recursive: true });
  for (const f of general) cpSync(join(fixtures, f), join(tmp, 'src', 'ui', f));
  for (const f of engine) cpSync(join(fixtures, 'engine', f), join(tmp, 'src', 'engine', f));
  cpSync(join(fixtures, 'clean.ts'), join(tmp, 'src', 'engine', 'clean.ts'));
});

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe('lint bans', () => {
  it('has a fixture for every ban', () => {
    expect(general.length).toBeGreaterThanOrEqual(8);
    expect(engine.length).toBeGreaterThanOrEqual(11);
  });

  it('accepts a clean engine file (control)', () => {
    const r = lint('src/engine/clean.ts');
    expect(r.status).toBe(0);
  });

  it.each(general.filter((f) => f !== 'clean.ts'))('fails lint: %s', (f) => {
    const r = lint(`src/ui/${f}`);
    expect(r.status, r.stdout + r.stderr).not.toBe(0);
  });

  it.each(engine)('fails lint (engine purity): %s', (f) => {
    const r = lint(`src/engine/${f}`);
    expect(r.status, r.stdout + r.stderr).not.toBe(0);
  });

  it('allows the parser import inside src/weather/decode', () => {
    mkdirSync(join(tmp, 'src', 'weather', 'decode'), { recursive: true });
    cpSync(join(fixtures, 'no-metar-import.ts'), join(tmp, 'src', 'weather', 'decode', 'ok.ts'));
    const r = lint('src/weather/decode/ok.ts');
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});
