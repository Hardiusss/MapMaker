/** Right-hand dock. */
import React from 'react';
import { LayerPanel } from './LayerPanel';
import { AssetPanel } from './AssetPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { MapPanel } from './MapPanel';
import { useLang } from '../i18n/useLang';

export type PanelTab = 'layers' | 'assets' | 'props' | 'map';

export function SidePanel({ tab, onTab }: { tab: PanelTab; onTab: (t: PanelTab) => void }) {
  const { t } = useLang();
  return (
    <div className="side-panel">
      <div className="panel-tabs">
        {([
          ['layers', t('panel.layers')],
          ['assets', t('panel.assets')],
          ['props', t('panel.inspect')],
          ['map', t('panel.map')],
        ] as [PanelTab, string][]).map(([id, label]) => (
          <button key={id} className={`panel-tab ${tab === id ? 'active' : ''}`} onClick={() => onTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'layers' && <LayerPanel />}
        {tab === 'assets' && <AssetPanel />}
        {tab === 'props' && <PropertiesPanel />}
        {tab === 'map' && <MapPanel />}
      </div>
    </div>
  );
}
