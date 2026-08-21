/** Right-hand dock. */
import React from 'react';
import { LayerPanel } from './LayerPanel';
import { AssetPanel } from './AssetPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { MapPanel } from './MapPanel';

export type PanelTab = 'layers' | 'assets' | 'props' | 'map';

export function SidePanel({ tab, onTab }: { tab: PanelTab; onTab: (t: PanelTab) => void }) {
  return (
    <div className="side-panel">
      <div className="panel-tabs">
        {([
          ['layers', 'Layers'],
          ['assets', 'Assets'],
          ['props', 'Inspect'],
          ['map', 'Map'],
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
