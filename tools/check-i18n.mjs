/**
 * Translation key parity.
 *
 * English is the source of truth; every other dictionary is checked against
 * its key set. A key added to en.ts without a translation renders English in
 * the middle of a translated panel, which is exactly the kind of defect that
 * survives a review — nobody reads eight hundred strings looking for the two
 * that did not get done.
 *
 * Reads the source files rather than importing them, so it runs without a
 * build and without a browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src/i18n');

/** Top-level entries only — nested object literals are not translation keys. */
function keysOf(file) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  return [...src.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1]);
}

const en = keysOf('en.ts');
const langs = ['ru'];

let bad = 0;

const dupes = en.filter((k, i) => en.indexOf(k) !== i);
if (dupes.length) {
  bad++;
  console.log(`FAIL  en.ts has ${new Set(dupes).size} duplicate keys:`);
  for (const k of new Set(dupes)) console.log(`        ${k}`);
}

const enSet = new Set(en);
for (const lang of langs) {
  const keys = keysOf(`${lang}.ts`);
  const set = new Set(keys);
  const missing = en.filter((k) => !set.has(k));
  const extra = keys.filter((k) => !enSet.has(k));
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);

  if (missing.length || extra.length || dup.length) {
    bad++;
    console.log(`FAIL  ${lang}: ${missing.length} missing, ${extra.length} orphaned, ${new Set(dup).size} duplicated`);
    for (const k of missing.slice(0, 25)) console.log(`        missing   ${k}`);
    for (const k of extra.slice(0, 25)) console.log(`        orphaned  ${k}`);
    for (const k of new Set(dup)) console.log(`        duplicate ${k}`);
  } else {
    console.log(`PASS  ${lang}: ${keys.length} keys, exact parity with en`);
  }

  // A translated string that drops a {placeholder} silently loses the number
  // or file name it was carrying.
  const enSrc = fs.readFileSync(path.join(dir, 'en.ts'), 'utf8');
  const laSrc = fs.readFileSync(path.join(dir, `${lang}.ts`), 'utf8');
  const vars = (src) => {
    const out = new Map();
    for (const m of src.matchAll(/^ {2}'([^']+)': *'((?:[^'\\]|\\.)*)'/gm)) {
      out.set(m[1], new Set([...m[2].matchAll(/\{(\w+)\}/g)].map((v) => v[1])));
    }
    return out;
  };
  const ev = vars(enSrc), lv = vars(laSrc);
  const drift = [];
  for (const [k, want] of ev) {
    const got = lv.get(k);
    if (!got) continue;
    for (const v of want) if (!got.has(v)) drift.push(`${k}: {${v}}`);
  }
  if (drift.length) {
    bad++;
    console.log(`FAIL  ${lang}: ${drift.length} strings dropped a placeholder`);
    for (const d of drift.slice(0, 20)) console.log(`        ${d}`);
  } else {
    console.log(`PASS  ${lang}: every placeholder survives translation`);
  }
}

console.log(`\n${en.length} keys in en.ts`);
if (bad) process.exit(1);
