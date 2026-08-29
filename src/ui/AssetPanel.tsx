/** Asset & texture browser. Doubles as the picker for the stamp and brush tools. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import {
  ASSET_GROUPS, assetPreview, searchAssets, assetById, assetCount, subgroupsOf,
  registerImageFromDataURL, clearPreviewCache, matchesAsset,
} from '../assets/library';
import { useLang } from '../i18n/useLang';
import { plural } from '../i18n/plural';
import { assetLabel, shelfLabel, assetAlias } from '../i18n/assetNames';
import { TEXTURES, texturePreview, type TextureGroup } from '../render/textures';
import { t } from '../i18n';
import { stampSettings } from '../tools';
import { Section } from './components/controls';
import type { AssetDef, AssetGroup } from '../assets/types';

const TEXTURE_GROUPS: TextureGroup[] = ['ground', 'vegetation', 'water', 'rock', 'interior', 'special'];

/** Texture names live in the UI dictionary; `t()` already falls back to English. */
function textureLabel(id: string, label: string): string {
  const s = t(`texture.${id}`);
  return s === `texture.${id}` ? label : s;
}

/**
 * Favourites and recents are per-install, not per-map, so they live in the
 * shell's own storage rather than the document. A GM who always reaches for
 * the same eight stamps should not have to find them again in a list of four
 * hundred every time they open a new map.
 */
const FAV_KEY = 'aetheria.assets.favourites';
const RECENT_KEY = 'aetheria.assets.recent';
const RECENT_MAX = 24;

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const val = raw ? JSON.parse(raw) : [];
    return Array.isArray(val) ? val.filter((v) => typeof v === 'string') : [];
  } catch { return []; }
}

function writeList(key: string, ids: string[]): void {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage may be unavailable */ }
}

type Shelf = AssetGroup | 'all' | 'fav' | 'recent';

/**
 * Where the browser was left.
 *
 * The panel unmounts whenever the dock switches tab, and a GM who goes to
 * Layers to unlock something and comes back should find the shelf they were
 * on, not the whole library again. Module-level for the same reason the tool
 * settings are: it has to outlive the component, and it is per-session rather
 * than per-map so it has no business in the document.
 */
const view: { mode: 'assets' | 'textures' | null; group: Shelf; sub: string | null; query: string } = {
  mode: null, group: 'all', sub: null, query: '',
};

export function AssetPanel() {
  const editor = useEditorEvents('brush', 'tool', 'change');
  // Captions come from the registry, not from `t()`, so the panel has to
  // subscribe to the language itself or it keeps painting English.
  const { lang } = useLang();
  const [query, setQuery] = React.useState(view.query);
  const [group, setGroup] = React.useState<Shelf>(view.group);
  const [sub, setSub] = React.useState<string | null>(view.sub);
  // The tool still wins on the first visit — reaching for the brush should land
  // on textures — but after that the GM's own choice sticks.
  const [mode, setMode] = React.useState<'assets' | 'textures'>(
    view.mode ?? (editor.tool === 'brush' || editor.tool === 'fill' ? 'textures' : 'assets'),
  );
  React.useEffect(() => { view.query = query; }, [query]);
  React.useEffect(() => { view.group = group; }, [group]);
  React.useEffect(() => { view.sub = sub; }, [sub]);
  React.useEffect(() => { view.mode = mode; }, [mode]);
  const [favourites, setFavourites] = React.useState<string[]>(() => readList(FAV_KEY));
  const [recent, setRecent] = React.useState<string[]>(() => readList(RECENT_KEY));
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  const subs = React.useMemo(
    () => (group === 'all' || group === 'fav' || group === 'recent' ? [] : subgroupsOf(group)),
    [group],
  );

  // Switching group invalidates whatever shelf was selected inside the old one —
  // but not on the first render, which is restoring a shelf, not changing one.
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setSub(null);
  }, [group]);

  const assets = React.useMemo(() => {
    if (group === 'fav' || group === 'recent') {
      const ids = group === 'fav' ? favourites : recent;
      const q = query.trim().toLowerCase();
      return ids
        .map((id) => assetById(id))
        .filter((a): a is AssetDef => !!a)
        .filter((a) => matchesAsset(a, q, assetAlias));
    }
    let list = searchAssets(query, editor.doc.kind, assetAlias);
    if (group !== 'all') list = list.filter((a) => a.group === group);
    if (sub) list = list.filter((a) => a.sub === sub);
    return list;
  }, [query, group, sub, editor.doc.kind, favourites, recent]);

  const pickAsset = (id: string) => {
    if (editor.tool === 'brush' && editor.brush.mode === 'scatter') {
      editor.setBrush({ scatterAssetId: id });
    } else {
      stampSettings.assetId = id;
      if (editor.tool !== 'stamp') editor.setTool('stamp');
    }
    const next = [id, ...recent.filter((r) => r !== id)].slice(0, RECENT_MAX);
    setRecent(next);
    writeList(RECENT_KEY, next);
    force();
  };

  const toggleFavourite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = favourites.includes(id) ? favourites.filter((f) => f !== id) : [id, ...favourites];
    setFavourites(next);
    writeList(FAV_KEY, next);
  };

  const pickTexture = (id: string) => {
    editor.setBrush({ textureId: id, mode: editor.brush.mode === 'scatter' ? 'texture' : editor.brush.mode === 'color' ? 'texture' : editor.brush.mode });
    if (editor.tool !== 'brush' && editor.tool !== 'fill') editor.setTool('brush');
  };

  const importImage = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const url = String(reader.result);
      const id = `user/${file.name.replace(/\.[^.]+$/, '')}-${Date.now().toString(36)}`;
      await registerImageFromDataURL(id, file.name.replace(/\.[^.]+$/, ''), url, 'battle');
      clearPreviewCache();
      stampSettings.assetId = id;
      editor.setTool('stamp');
      editor.status(t('panel.imported', { file: file.name }));
      force();
    };
    reader.readAsDataURL(file);
  };

  const textures = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEXTURES.filter((x) => !q
      || x.label.toLowerCase().includes(q)
      || x.id.includes(q)
      || textureLabel(x.id, x.label).toLowerCase().includes(q));
  }, [query, lang]);

  const activeAsset = editor.tool === 'brush' && editor.brush.mode === 'scatter'
    ? editor.brush.scatterAssetId
    : stampSettings.assetId;

  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
        <button className={`btn small ${mode === 'assets' ? 'active' : ''}`} style={{ flex: 1 }}
          onClick={() => setMode('assets')}>{t('panel.stamps')}</button>
        <button className={`btn small ${mode === 'textures' ? 'active' : ''}`} style={{ flex: 1 }}
          onClick={() => setMode('textures')}>{t('panel.textures')}</button>
      </div>

      <div className="asset-search">
        <input type="text" placeholder={t('panel.search', { stamps: plural('count.stamps', assetCount()) })} value={query}
          onChange={(e) => setQuery(e.target.value)} />
      </div>

      {mode === 'assets' ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
            <button className={`btn small ${group === 'all' ? 'active' : ''}`} onClick={() => setGroup('all')}>{t('panel.all')}</button>
            <button className={`btn small ${group === 'fav' ? 'active' : ''}`} title={t('panel.favourites')}
              onClick={() => setGroup('fav')}>★ {favourites.length || ''}</button>
            <button className={`btn small ${group === 'recent' ? 'active' : ''}`} title={t('panel.recent')}
              onClick={() => setGroup('recent')}>{t('panel.recent')}</button>
            {ASSET_GROUPS.map((g) => (
              <button key={g.group} className={`btn small ${group === g.group ? 'active' : ''}`}
                onClick={() => setGroup(g.group)}>{t(`group.${g.group}`)}</button>
            ))}
          </div>

          {subs.length > 0 && (
            <div className="asset-shelves">
              <button className={`chip ${sub === null ? 'active' : ''}`} onClick={() => setSub(null)}>{t('panel.everything')}</button>
              {subs.map((s) => (
                <button key={s} className={`chip ${sub === s ? 'active' : ''}`} onClick={() => setSub(s)}>{shelfLabel(s)}</button>
              ))}
            </div>
          )}

          <div className="asset-grid">
            {assets.map((a) => {
              const name = assetLabel(a);
              return (
                <div key={a.id}
                  className={`asset-cell ${activeAsset === a.id ? 'active' : ''}`}
                  title={`${name}\n${a.tags.join(', ')}`}
                  onClick={() => pickAsset(a.id)}>
                  <img src={assetPreview(a.id, editor.paletteId, 72)} alt={name} draggable={false} />
                  <button className={`fav ${favourites.includes(a.id) ? 'on' : ''}`}
                    title={t(favourites.includes(a.id) ? 'panel.removeFavourite' : 'panel.addFavourite')}
                    onClick={(e) => toggleFavourite(a.id, e)}>★</button>
                  <span className="cap">{name}</span>
                </div>
              );
            })}
          </div>
          {assets.length === 0 && (
            <div className="empty">
              {group === 'fav' ? t('panel.noFavourites')
                : group === 'recent' ? t('panel.noRecent')
                  : t('panel.noMatch', { query })}
            </div>
          )}

          <Section title={t('panel.customArt')}>
            <label className="btn small" style={{ width: '100%' }}>
              {t('panel.importStamp')}
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importImage(f); e.currentTarget.value = ''; }} />
            </label>
            <p className="hint" style={{ marginTop: 6 }}>
              {t('panel.importHint')}
            </p>
          </Section>
        </>
      ) : (
        <>
          {TEXTURE_GROUPS.map((tg) => {
            const items = textures.filter((x) => x.group === tg);
            if (!items.length) return null;
            return (
              <Section key={tg} title={t(`texgroup.${tg}`)}>
                <div className="texture-grid">
                  {items.map((x) => {
                    const name = textureLabel(x.id, x.label);
                    return (
                      <div key={x.id}
                        className={`texture-cell ${editor.brush.textureId === x.id ? 'active' : ''}`}
                        style={{ backgroundImage: `url(${texturePreview(x.id, editor.paletteId, 64)})` }}
                        title={name}
                        onClick={() => pickTexture(x.id)}>
                        <span className="cap">{name}</span>
                      </div>
                    );
                  })}
                </div>
              </Section>
            );
          })}
        </>
      )}
    </>
  );
}
