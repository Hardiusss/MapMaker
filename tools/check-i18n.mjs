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

/**
 * Plural families.
 *
 * A counted phrase is not one key but a family — `count.objects.one`,
 * `.other` in English; `.one`, `.few`, `.many` in Russian — so the flat
 * key-set comparison below would report every Russian `.few` as orphaned and
 * every English `.other` as missing. The families are pulled out first and
 * checked on their own terms: both languages must know the same *families*,
 * and each must bring exactly the variants its own grammar uses. That is what
 * catches the failure this check exists for — a family added in one language
 * and forgotten in the other.
 *
 * Families live under `count.` and nowhere else, so that a key which merely
 * ends in `.one` or `.other` — a bailey count option, a material family called
 * "Other" — is not mistaken for one.
 *
 * Kept in step with `PLURAL_FORMS` in `src/i18n/plural.ts`.
 */
const PLURAL_FORMS = { en: ['one', 'other'], ru: ['one', 'few', 'many'] };
const CATEGORIES = ['one', 'few', 'many', 'other'];

function splitPlurals(keys) {
  const plain = [];
  const families = new Map();
  for (const k of keys) {
    const dot = k.lastIndexOf('.');
    const tail = dot < 0 ? '' : k.slice(dot + 1);
    if (k.startsWith('count.') && CATEGORIES.includes(tail)) {
      const base = k.slice(0, dot);
      if (!families.has(base)) families.set(base, new Set());
      families.get(base).add(tail);
    } else {
      plain.push(k);
    }
  }
  return { plain, families };
}

let bad = 0;

const dupes = en.filter((k, i) => en.indexOf(k) !== i);
if (dupes.length) {
  bad++;
  console.log(`FAIL  en.ts has ${new Set(dupes).size} duplicate keys:`);
  for (const k of new Set(dupes)) console.log(`        ${k}`);
}

const enSplit = splitPlurals(en);
const enSet = new Set(enSplit.plain);
for (const lang of langs) {
  const keys = keysOf(`${lang}.ts`);
  const laSplit = splitPlurals(keys);
  const set = new Set(laSplit.plain);
  const missing = enSplit.plain.filter((k) => !set.has(k));
  const extra = laSplit.plain.filter((k) => !enSet.has(k));
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);

  // --- plural families ---------------------------------------------------
  const want = PLURAL_FORMS[lang];
  const famBad = [];
  // A `count.` key that is not a variant is a family somebody forgot to fan out.
  for (const k of [...enSplit.plain, ...laSplit.plain]) {
    if (k.startsWith('count.')) famBad.push(`${k} is under count. but names no plural form`);
  }
  for (const base of enSplit.families.keys()) {
    if (!laSplit.families.has(base)) { famBad.push(`missing family   ${base}`); continue; }
  }
  for (const base of laSplit.families.keys()) {
    if (!enSplit.families.has(base)) famBad.push(`orphaned family  ${base}`);
  }
  for (const [base, forms] of enSplit.families) {
    for (const c of PLURAL_FORMS.en) if (!forms.has(c)) famBad.push(`en ${base}.${c} missing`);
    for (const c of forms) if (!PLURAL_FORMS.en.includes(c)) famBad.push(`en ${base}.${c} is not an English form`);
  }
  for (const [base, forms] of laSplit.families) {
    if (!enSplit.families.has(base)) continue;
    for (const c of want) if (!forms.has(c)) famBad.push(`${lang} ${base}.${c} missing`);
    for (const c of forms) if (!want.includes(c)) famBad.push(`${lang} ${base}.${c} is not a ${lang} form`);
  }
  if (famBad.length) {
    bad++;
    console.log(`FAIL  ${lang}: ${famBad.length} problem(s) in the plural families`);
    for (const f of famBad.slice(0, 25)) console.log(`        ${f}`);
  } else {
    console.log(`PASS  ${lang}: ${enSplit.families.size} plural families, ${PLURAL_FORMS.en.join('/')} in en and ${want.join('/')} in ${lang}`);
  }

  if (missing.length || extra.length || dup.length) {
    bad++;
    console.log(`FAIL  ${lang}: ${missing.length} missing, ${extra.length} orphaned, ${new Set(dup).size} duplicated`);
    for (const k of missing.slice(0, 25)) console.log(`        missing   ${k}`);
    for (const k of extra.slice(0, 25)) console.log(`        orphaned  ${k}`);
    for (const k of new Set(dup)) console.log(`        duplicate ${k}`);
  } else {
    console.log(`PASS  ${lang}: ${laSplit.plain.length} keys, exact parity with en`);
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
