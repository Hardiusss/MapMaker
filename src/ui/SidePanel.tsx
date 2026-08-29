/** Right-hand dock. */
import React from 'react';
import { LayerPanel } from './LayerPanel';
import { AssetPanel } from './AssetPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { MapPanel } from './MapPanel';
import { useLang } from '../i18n/useLang';

export type PanelTab = 'layers' | 'assets' | 'props' | 'map';

/**
 * Where each tab was scrolled to.
 *
 * Switching tabs unmounts the panel, so without this every trip to Layers and
 * back put the stamp library at the top again — and the library is a very long
 * scroll. Module-level rather than component state because the panel that
 * needs restoring is the one that is about to mount, and it does not exist yet
 * when the tab changes.
 */
const scrollTops: Record<PanelTab, number> = { layers: 0, assets: 0, props: 0, map: 0 };

export function SidePanel({ tab, onTab }: { tab: PanelTab; onTab: (t: PanelTab) => void }) {
  const { t } = useLang();
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const shown = React.useRef(tab);

  // Restore before paint, so the panel never flashes at the top first.
  React.useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = scrollTops[tab];
    shown.current = tab;
  }, [tab]);

  const remember = () => {
    const el = bodyRef.current;
    if (el) scrollTops[shown.current] = el.scrollTop;
  };

  return (
    <div className="side-panel">
      <div className="panel-tabs">
        {([
          ['layers', t('panel.layers')],
          ['assets', t('panel.assets')],
          ['props', t('panel.inspect')],
          ['map', t('panel.map')],
        ] as [PanelTab, string][]).map(([id, label]) => (
          <button key={id} className={`panel-tab ${tab === id ? 'active' : ''}`}
            aria-pressed={tab === id}
            onClick={() => { remember(); onTab(id); }}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel-body" ref={bodyRef} onScroll={remember}>
        {tab === 'layers' && <LayerPanel />}
        {tab === 'assets' && <AssetPanel />}
        {tab === 'props' && <PropertiesPanel />}
        {tab === 'map' && <MapPanel />}
      </div>
    </div>
  );
}
