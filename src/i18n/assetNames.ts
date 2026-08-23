/**
 * Localised names for stamps and shelves.
 *
 * Kept apart from `t()` because the failure mode is different. A missing UI
 * key is a bug and should be loud; a missing stamp name is Tuesday — someone
 * added a stamp this morning and the translation lands next week. So these
 * fall back to the English `label` from the registry rather than to a key: a
 * new stamp reads as "Lion", never as `gi/lion`.
 */
import type { AssetDef } from '../assets/types';
import { getLang } from './index';
import { ASSETS_RU, SHELVES_RU } from './assets.ru';

/** The stamp's caption in the current language. */
export function assetLabel(a: AssetDef): string {
  if (getLang() === 'ru') {
    const ru = ASSETS_RU[a.id];
    if (ru) return ru;
  }
  return a.label;
}

/** A shelf chip's caption. `sub` is the English shelf name from the registry. */
export function shelfLabel(sub: string): string {
  if (getLang() === 'ru') {
    const ru = SHELVES_RU[sub];
    if (ru) return ru;
  }
  return sub;
}

/**
 * Extra text to fold into the search index for an asset.
 *
 * Deliberately language-independent: a Cyrillic query cannot collide with the
 * English label or the id, so indexing the Russian name in both languages
 * costs nothing and means a bilingual table — one GM typing "tower", the next
 * typing «башня» — finds the same stamp without touching the switch.
 */
export function assetAlias(a: AssetDef): string {
  return ASSETS_RU[a.id] ?? '';
}
