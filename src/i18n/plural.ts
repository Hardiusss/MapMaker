/**
 * Plural forms.
 *
 * "1 undo steps" is the kind of thing a GM reads once, decides the tool is
 * unfinished, and never mentions. English needs two forms and Russian needs
 * three — шаг / шага / шагов — and the interesting part is that they do not
 * line up: Russian's `one` covers 21 and 101 but not 11, and its `few` covers
 * 2–4 but not 12–14. So a count cannot simply be pasted next to a noun in
 * either language, and the same key has a different number of variants
 * depending on who is reading it.
 *
 * The variants live in the dictionaries under `count.`, as `count.<noun>.one`,
 * `.few`, `.many`, `.other` — whichever a language actually uses. The
 * namespace is what lets the checker tell a plural family apart from a key
 * that merely ends in `.other`.
 * `tools/check-i18n.mjs` knows the rule below and checks each language brings
 * exactly the forms its own grammar needs, so a family added in English and
 * forgotten in Russian fails the build rather than rendering half-translated.
 */
import { t, getLang, type Lang } from './index';

export type PluralCategory = 'one' | 'few' | 'many' | 'other';

/** Which categories a language's dictionaries must supply. CLDR cardinal rules. */
export const PLURAL_FORMS: Record<Lang, PluralCategory[]> = {
  en: ['one', 'other'],
  ru: ['one', 'few', 'many'],
};

export function pluralCategory(lang: Lang, n: number): PluralCategory {
  const i = Math.abs(Math.trunc(n));
  const fraction = n !== Math.trunc(n);
  if (lang === 'ru') {
    // A decimal always takes the genitive singular — полтора дня, 2,5 дня,
    // 10,5 дня — which is the same form as `few`, and never the form the
    // integer would have taken.
    if (fraction) return 'few';
    const mod10 = i % 10, mod100 = i % 100;
    if (mod10 === 1 && mod100 !== 11) return 'one';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
    return 'many';
  }
  return i === 1 && !fraction ? 'one' : 'other';
}

/**
 * Translate a counted phrase. `key` names the family, not a variant.
 *
 * `{count}` is filled in automatically; anything else in `vars` is passed
 * through. Falling back through `other` and then the bare key means a family
 * that is mid-edit degrades to something readable instead of printing the key.
 */
export function plural(key: string, count: number, vars?: Record<string, string | number>): string {
  const cat = pluralCategory(getLang(), count);
  const all = { count, ...vars };
  const tried = t(`${key}.${cat}`, all);
  if (tried !== `${key}.${cat}`) return tried;
  const other = t(`${key}.other`, all);
  return other === `${key}.other` ? t(key, all) : other;
}
