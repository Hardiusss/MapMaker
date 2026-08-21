/** Asset & texture browser. Doubles as the picker for the stamp and brush tools. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import { ASSET_GROUPS, assetPreview, searchAssets, allAssets, registerImageFromDataURL, clearPreviewCache } from '../assets/library';
import { TEXTURES, texturePreview, type TextureGroup } from '../render/textures';
import { stampSettings } from '../tools';
import { Section } from './components/controls';
import type { AssetGroup } from '../assets/types';

const TEXTURE_GROUPS: { group: TextureGroup; label: string }[] = [
  { group: 'ground', label: 'Ground' },
  { group: 'vegetation', label: 'Vegetation' },
  { group: 'water', label: 'Water' },
  { group: 'rock', label: 'Rock' },
  { group: 'interior', label: 'Interiors' },
  { group: 'special', label: 'Special' },
];

export function AssetPanel() {
  const editor = useEditorEvents('brush', 'tool', 'change');
  const [query, setQuery] = React.useState('');
  const [group, setGroup] = React.useState<AssetGroup | 'all'>('all');
  const [mode, setMode] = React.useState<'assets' | 'textures'>(
    editor.tool === 'brush' || editor.tool === 'fill' ? 'textures' : 'assets',
  );
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  const assets = React.useMemo(() => {
    let list = searchAssets(query, editor.doc.kind);
    if (group !== 'all') list = list.filter((a) => a.group === group);
    return list;
  }, [query, group, editor.doc.kind]);

  const textures = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEXTURES.filter((t) => !q || t.label.toLowerCase().includes(q) || t.id.includes(q));
  }, [query]);

  const pickAsset = (id: string) => {
    if (editor.tool === 'brush' && editor.brush.mode === 'scatter') {
      editor.setBrush({ scatterAssetId: id });
    } else {
      stampSettings.assetId = id;
      if (editor.tool !== 'stamp') editor.setTool('stamp');
    }
    force();
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
      editor.status(`Imported ${file.name} as a stamp.`);
      force();
    };
    reader.readAsDataURL(file);
  };

  const activeAsset = editor.tool === 'brush' && editor.brush.mode === 'scatter'
    ? editor.brush.scatterAssetId
    : stampSettings.assetId;

  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
        <button className={`btn small ${mode === 'assets' ? 'active' : ''}`} style={{ flex: 1 }}
          onClick={() => setMode('assets')}>Stamps</button>
        <button className={`btn small ${mode === 'textures' ? 'active' : ''}`} style={{ flex: 1 }}
          onClick={() => setMode('textures')}>Textures</button>
      </div>

      <div className="asset-search">
        <input type="text" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {mode === 'assets' ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 9 }}>
            <button className={`btn small ${group === 'all' ? 'active' : ''}`} onClick={() => setGroup('all')}>All</button>
            {ASSET_GROUPS.map((g) => (
              <button key={g.group} className={`btn small ${group === g.group ? 'active' : ''}`}
                onClick={() => setGroup(g.group)}>{g.label}</button>
            ))}
          </div>

          <div className="asset-grid">
            {assets.map((a) => (
              <div key={a.id}
                className={`asset-cell ${activeAsset === a.id ? 'active' : ''}`}
                title={`${a.label}\n${a.tags.join(', ')}`}
                onClick={() => pickAsset(a.id)}>
                <img src={assetPreview(a.id, editor.paletteId, 72)} alt={a.label} draggable={false} />
                <span className="cap">{a.label}</span>
              </div>
            ))}
          </div>
          {assets.length === 0 && <div className="empty">Nothing matches “{query}”.</div>}

          <Section title="Custom art">
            <label className="btn small" style={{ width: '100%' }}>
              Import PNG / SVG as stamp
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importImage(f); e.currentTarget.value = ''; }} />
            </label>
            <p className="hint" style={{ marginTop: 6 }}>
              Imported art is embedded in the project file, so maps stay self-contained.
            </p>
          </Section>
        </>
      ) : (
        <>
          {TEXTURE_GROUPS.map((tg) => {
            const items = textures.filter((t) => t.group === tg.group);
            if (!items.length) return null;
            return (
              <Section key={tg.group} title={tg.label}>
                <div className="texture-grid">
                  {items.map((t) => (
                    <div key={t.id}
                      className={`texture-cell ${editor.brush.textureId === t.id ? 'active' : ''}`}
                      style={{ backgroundImage: `url(${texturePreview(t.id, editor.paletteId, 64)})` }}
                      title={t.label}
                      onClick={() => pickTexture(t.id)}>
                      <span className="cap">{t.label}</span>
                    </div>
                  ))}
                </div>
              </Section>
            );
          })}
        </>
      )}
    </>
  );
}
