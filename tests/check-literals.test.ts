// Self-test for scripts/check-no-airport-literals.mjs: it passes on a clean
// tree and fails when a pack fact is planted in src/ outside a comment.
// Numeric mode ids and ids of two characters or fewer cannot be checked.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const script = join(root, 'scripts', 'check-no-airport-literals.mjs');
let tmp = '';

function run(dir: string) {
  return spawnSync(process.execPath, [script, '--root', dir], { encoding: 'utf8' });
}
function plant(file: string, text: string) {
  mkdirSync(join(tmp, 'src', 'engine'), { recursive: true });
  writeFileSync(join(tmp, 'src', 'engine', file), text);
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'literals-'));
  cpSync(join(root, 'refdata'), join(tmp, 'refdata'), { recursive: true });
  plant('clean.ts', 'export const add = (a: number, b: number) => a + b;\n');
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('check-no-airport-literals', () => {
  it('passes on the real tree', () => {
    const r = run(root);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('passes on a clean temporary copy', () => {
    expect(run(tmp).status).toBe(0);
  });

  it('fails when a runway name is planted in src/', () => {
    plant('bad.ts', "export const r = '16L';\n");
    const r = run(tmp);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('16L');
  });

  it('fails on a planted ICAO code and a planted mode id', () => {
    plant('bad.ts', 'const YSSY = 1;\nexport const m = "SODPROPS";\n');
    const r = run(tmp);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('YSSY');
    expect(r.stderr).toContain('SODPROPS');
  });

  it('ignores facts inside comments', () => {
    plant('ok.ts', '// 16L and YSSY\n/* SODPROPS\n 34R */\nexport const x = 1; // 16R\n');
    expect(run(tmp).status).toBe(0);
  });

  it('matches whole tokens only', () => {
    plant('ok.ts', "export const x = '16Left'; export const NOSODPROPS = 1;\n");
    expect(run(tmp).status).toBe(0);
  });

  it('does not check ids of two characters or fewer, or numeric ids', () => {
    plant('ok.ts', "export const a = ['07', '25', '1', '5'];\n");
    expect(run(tmp).status).toBe(0);
  });

  it('scans tests/fixtures/* packs when present', () => {
    const fx = join(tmp, 'tests', 'fixtures', 'TEST');
    mkdirSync(fx, { recursive: true });
    writeFileSync(join(fx, 'airport.json'), JSON.stringify({ icao: 'ZZTT' }));
    writeFileSync(join(fx, 'runways.json'), JSON.stringify({ runways: [{ name: '09X' }] }));
    plant('bad.ts', "export const r = '09X';\n");
    const r = run(tmp);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('09X');
  });

  it('refuses to pass when no pack exists', () => {
    rmSync(join(tmp, 'refdata'), { recursive: true });
    expect(run(tmp).status).toBe(2);
  });
});
