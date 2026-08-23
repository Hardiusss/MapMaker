/**
 * Interface language.
 *
 * A tiny store rather than a library: the app has one process, no server, no
 * lazy-loaded locales and no pluralisation beyond counting things, so a
 * dependency would cost more than it saves. Components subscribe through
 * `useLang()`, everything else calls `t()` directly.
 *
 * Keys are dotted and grouped by where the string appears — `tool.*`,
 * `panel.*`, `dialog.*`. A missing key falls back to English and, in dev,
 * complains once, because a silently English button in a Russian interface is
 * the failure mode that survives review.
 */
import { EN } from './en';
import { RU } from './ru';

export type Lang = 'en' | 'ru';
export type Dict = Record<string, string>;

export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'ru', label: 'Русский', short: 'RU' },
];

const DICTS: Record<Lang, Dict> = { en: EN, ru: RU };

const STORAGE_KEY = 'aetheria.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ru') return saved;
  } catch { /* storage may be unavailable */ }
  // Fall back to the OS language rather than to English: someone running a
  // Russian desktop almost certainly wants a Russian interface on first launch.
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  return nav.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

let current: Lang = initialLang();
const listeners = new Set<() => void>();
const warned = new Set<string>();

export function getLang(): Lang { return current; }

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const fn of listeners) fn();
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Translate. `vars` interpolates `{name}` placeholders — used for counts and
 * file names, which are the only things that vary inside a string here.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[current];
  let s = dict[key];
  if (s === undefined) {
    s = EN[key];
    if (s === undefined) {
      if (!warned.has(key)) {
        warned.add(key);
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key: ${key}`);
      }
      // The key itself is a better placeholder than an empty button.
      return key;
    }
  }
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/** Every key that exists in English, for the coverage check in the test tools. */
export function allKeys(): string[] { return Object.keys(EN); }

/** Keys English has and the given language does not. */
export function missingKeys(lang: Lang): string[] {
  const d = DICTS[lang];
  return Object.keys(EN).filter((k) => d[k] === undefined);
}

if (typeof document !== 'undefined') document.documentElement.lang = current;
