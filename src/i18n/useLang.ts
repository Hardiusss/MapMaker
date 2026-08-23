/**
 * React binding for the language store.
 *
 * `useSyncExternalStore` rather than state-plus-effect so that a language
 * change repaints every subscribed component in the same commit — a half
 * translated toolbar for one frame looks like a bug.
 */
import React from 'react';
import { getLang, subscribeLang, t, type Lang } from './index';

export function useLang(): { lang: Lang; t: typeof t } {
  const lang = React.useSyncExternalStore(subscribeLang, getLang, getLang);
  return { lang, t };
}
