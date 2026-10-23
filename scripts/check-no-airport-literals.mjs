// Fails if an airport fact appears in src/ outside comments (REQUIREMENTS AG-11,
// DESIGN section 4c). Facts checked: the ICAO code, every runway name and every
// mode id of each pack under refdata/airports/* and tests/fixtures/*.
//
// Matching is by whole token (letters, digits, underscore) and case-INsensitive,
// anywhere in code including string literals, so "16L", "16l", 'SODPROPS' and
// 'sodprops' match but "16Left" and "NOSODPROPS" do not. Comments are removed
// first. Code, CSS, HTML/SVG/XML and data files (.json, .txt, .csv, .yaml ...)
// under src/ are scanned.
//
// LIMITS (by design):
//  - Hyphenated names split into tokens, so a CSS class such as "text-yssy" is
//    reported (a false positive that is acceptable). 3-digit hex colours such as
//    #14a are ignored.
//  - A token directly preceded by '.' and directly followed by '(' is a method call
//    (for example re.test(x)) and is not reported.
//  - Evasion by building a value at run time (string concatenation, template
//    pieces, character codes, reading it from elsewhere) CANNOT be detected by
//    a static token check. It is caught only by review and by running the
//    scenario suite against the fictional TEST pack.
//  - Ids of 2 characters or fewer and purely numeric ids are NOT checked: they
//    collide with ordinary code (0, 1, 25, "A"). That means numeric mode ids
//    (for example "1", "5") and two-digit runway names (for example "07", "25")
//    cannot be checked by this script. Reviewers must catch those.
//  - Comment stripping is a small scanner that tracks strings, template literals
//    and regex literals (a regex after an identifier or ')' is read as division);
//    template ${} nesting is not tracked. Unusual code can still confuse it.
//
// Usage: node scripts/check-no-airport-literals.mjs [--root <dir>]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.css']);
// Markup and data files: scanned too, so a pack fact cannot hide in src/data.json.
const MARKUP_EXTENSIONS = new Set(['.html', '.svg', '.xml']);
const DATA_EXTENSIONS = new Set(['.json', '.jsonc', '.txt', '.csv', '.tsv', '.yaml', '.yml', '.toml']);
const SCANNED = new Set([...CODE_EXTENSIONS, ...MARKUP_EXTENSIONS, ...DATA_EXTENSIONS]);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((p) => statSync(p).isDirectory());
}

/** Facts worth checking from one pack folder. */
export function packFacts(packDir) {
  const facts = [];
  const add = (value, kind) => {
    if (typeof value !== 'string') return;
    if (value.length <= 2) return; // too short to check safely
    if (/^[0-9]+$/.test(value)) return; // purely numeric: cannot be checked
    facts.push({ value, kind, pack: packDir });
  };
  const airportFile = join(packDir, 'airport.json');
  if (!existsSync(airportFile)) return facts;
  add(readJson(airportFile).icao, 'ICAO code');
  const runwaysFile = join(packDir, 'runways.json');
  if (existsSync(runwaysFile)) {
    for (const r of readJson(runwaysFile).runways ?? []) add(r?.name, 'runway name');
  }
  const modesFile = join(packDir, 'modes.json');
  if (existsSync(modesFile)) {
    for (const m of readJson(modesFile).modes ?? []) add(m?.id === undefined ? undefined : String(m.id), 'mode id');
  }
  return facts;
}

export function findPacks(root) {
  return [...listDirs(join(root, 'refdata', 'airports')), ...listDirs(join(root, 'tests', 'fixtures'))].filter((d) =>
    existsSync(join(d, 'airport.json')),
  );
}

const blank = (s) => s.replace(/[^\n]/g, ' ');

// A '/' after one of these characters or keywords starts a regex literal;
// after anything else (identifier, number, ')' or ']') it is division.
const REGEX_AFTER_CHARS = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await', 'instanceof']);

/** Replace comments with spaces (newlines kept so line numbers stay right).
 *  For code files it tracks strings, template literals and regex literals so a
 *  comment marker inside them (for example /[/*]/) is not taken for a comment. */
export function stripComments(text, ext) {
  const cssOnly = ext === '.css';
  const htmlOnly = MARKUP_EXTENSIONS.has(ext);
  if (DATA_EXTENSIONS.has(ext)) return text; // data files have no comments
  let out = '';
  let i = 0;
  const n = text.length;
  let prevChar = ''; // last significant (non-space, non-comment) character
  let prevWord = ''; // identifier/keyword that ended just before, if any
  let word = '';
  const sig = (c) => {
    if (/[A-Za-z0-9_$]/.test(c)) {
      word += c;
    } else if (!/\s/.test(c)) {
      prevWord = '';
      word = '';
      prevChar = c;
      return;
    } else {
      if (word) prevWord = word;
      word = '';
      return;
    }
    prevChar = c;
    prevWord = '';
  };
  const regexAllowed = () => {
    const w = word || prevWord;
    if (w) return REGEX_AFTER_WORDS.has(w);
    return REGEX_AFTER_CHARS.has(prevChar);
  };
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (htmlOnly) {
      if (text.startsWith('<!--', i)) {
        const end = text.indexOf('-->', i + 4);
        const stop = end === -1 ? n : end + 3;
        out += blank(text.slice(i, stop));
        i = stop;
      } else {
        out += c;
        i += 1;
      }
      continue;
    }
    if (c === '/' && d === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += blank(text.slice(i, stop));
      i = stop;
      continue;
    }
    if (!cssOnly && c === '/' && d === '/') {
      let stop = text.indexOf('\n', i);
      if (stop === -1) stop = n;
      out += blank(text.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || (c === '`' && !cssOnly)) {
      // copy the string literal verbatim (template ${} nesting is not tracked)
      let j = i + 1;
      while (j < n && text[j] !== c) {
        if (text[j] === '\\') j += 1;
        if (c !== '`' && text[j] === '\n') break; // unterminated: stop at line end
        j += 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
      sig('"');
      continue;
    }
    if (!cssOnly && c === '/' && regexAllowed()) {
      // regex literal: copy verbatim up to the closing '/', honouring [...] classes
      let j = i + 1;
      let inClass = false;
      while (j < n && text[j] !== '\n') {
        const ch = text[j];
        if (ch === '\\') j += 1;
        else if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) break;
        j += 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
      sig(')');
      continue;
    }
    out += c;
    sig(c);
    i += 1;
  }
  return out;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules') yield* walk(p);
    } else if (SCANNED.has(extname(name).toLowerCase())) {
      yield p;
    }
  }
}

const rel = (root, p) => relative(root, p).replaceAll('\\', '/');

/** Returns { packs, violations }. Throws if no pack is found (never pass silently). */
export function check(root) {
  const packs = findPacks(root);
  if (packs.length === 0) throw new Error(`No airport packs found under ${root}; refusing to pass silently.`);
  const facts = packs.flatMap(packFacts);
  const violations = [];
  const srcDir = join(root, 'src');
  const files = existsSync(srcDir) ? [...walk(srcDir)] : [];
  // index.html is part of the shipped page too
  if (existsSync(join(root, 'index.html'))) files.push(join(root, 'index.html'));
  for (const file of files) {
    const code = stripComments(readFileSync(file, 'utf8'), extname(file).toLowerCase());
    code.split('\n').forEach((line, idx) => {
      // 3-digit hex colours (#14a) are not facts: blank them before tokenising
      const text = line.replace(/#[0-9A-Fa-f]{3}(?![A-Za-z0-9_])/g, "    ");
      for (const m of text.matchAll(/[A-Za-z0-9_]+/g)) {
        // a method call such as re.name( is not a fact: the token is directly after '.' and before '('
        if (text[m.index - 1] === '.' && text[m.index + m[0].length] === '(') continue;
        for (const f of facts) {
          if (m[0].toLowerCase() === f.value.toLowerCase()) {
            violations.push({ file: rel(root, file), line: idx + 1, value: f.value, kind: f.kind, pack: rel(root, f.pack) });
          }
        }
      }
    });
  }
  return { packs, violations };
}

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--root');
  const root = resolve(rootIdx >= 0 ? (args[rootIdx + 1] ?? '.') : join(fileURLToPath(import.meta.url), '..', '..'));
  let result;
  try {
    result = check(root);
  } catch (e) {
    console.error(`check-literals: ${e.message}`);
    process.exit(2);
  }
  if (result.violations.length > 0) {
    console.error('check-literals: airport facts found in src/ (they belong in the airport pack):');
    for (const v of result.violations) {
      console.error(`  ${v.file}:${v.line}  ${v.kind} "${v.value}" (from ${v.pack})`);
    }
    process.exit(1);
  }
  console.log(`check-literals: OK (${result.packs.length} pack(s) checked: ${result.packs.map((p) => rel(root, p)).join(', ')})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
