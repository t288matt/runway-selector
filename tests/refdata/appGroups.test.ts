// app.json groups: named lists of airports shown together on the summary screen.
import { describe, expect, it } from 'vitest';
import { PackValidationError, parseAppConfig } from '../../src/refdata';

const app = (groups?: unknown): string =>
  JSON.stringify({ schemaVersion: 1, airports: ['YSSY', 'YMML', 'YBBN'], default: 'YSSY', ...(groups === undefined ? {} : { groups }) });

function issuesOf(text: string) {
  try {
    parseAppConfig(text);
  } catch (e) {
    return (e as PackValidationError).issues;
  }
  return [];
}

describe('app.json groups', () => {
  it('accepts a group whose airports are all listed', () => {
    const parsed = parseAppConfig(app([{ name: 'Test group', airports: ['YMML', 'YSSY'] }]));
    expect(parsed.groups).toEqual([{ name: 'Test group', airports: ['YMML', 'YSSY'] }]);
  });
  it('refuses a group member not in airports', () => {
    const issues = issuesOf(app([{ name: 'Test group', airports: ['YSSY', 'YPPH'] }]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: 'app.json', path: 'groups[0].airports[1]' });
  });
  it('refuses a duplicate member within a group', () => {
    const issues = issuesOf(app([{ name: 'Test group', airports: ['YSSY', 'YMML', 'YSSY'] }]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: 'app.json', path: 'groups[0].airports[2]' });
  });
  it('refuses a duplicate group name', () => {
    const issues = issuesOf(app([{ name: 'Same', airports: ['YSSY'] }, { name: 'Other', airports: ['YMML'] }, { name: 'Same', airports: ['YBBN'] }]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: 'app.json', path: 'groups[2].name' });
    expect(issues[0]?.message).toContain('Same');
  });
  it('accepts app.json with no groups', () => {
    expect(parseAppConfig(app()).groups).toBeUndefined();
  });
});
