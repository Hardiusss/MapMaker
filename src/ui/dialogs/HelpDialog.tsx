/** Shortcuts, Foundry guide and about. */
import React from 'react';
import { Modal } from '../components/controls';

const SHORTCUTS: [string, string][] = [
  ['V', 'Select & transform'],
  ['B', 'Terrain brush'],
  ['E', 'Eraser'],
  ['G', 'Flood fill'],
  ['S', 'Stamp'],
  ['T', 'Label'],
  ['R', 'Shape'],
  ['P', 'River / road'],
  ['W', 'Walls & doors'],
  ['L', 'Lights'],
  ['N', 'GM note'],
  ['K', 'Token'],
  ['M', 'Measure'],
  ['I', 'Eyedropper'],
  ['H / Space', 'Pan the view'],
  ['[ / ]', 'Brush size down / up'],
  ['Alt + wheel', 'Brush size'],
  ['Wheel', 'Zoom'],
  ['Ctrl + 0', 'Fit map to window'],
  ['Ctrl + =/-', 'Zoom in / out'],
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Shift + Z', 'Redo'],
  ['Ctrl + D', 'Duplicate selection'],
  ['Ctrl + C / V', 'Copy / paste'],
  ['Delete', 'Delete selection'],
  ['Ctrl + G', 'Toggle grid'],
  ['Ctrl + W', 'Toggle wall overlay'],
  ['Ctrl + L', 'Toggle lighting preview'],
  ['Ctrl + S', 'Save project'],
  ['Ctrl + E', 'Export'],
  ['Ctrl + N', 'New map'],
  ['Ctrl + Shift + G', 'Open the generators'],
  ['Arrows', 'Nudge selection (Shift = 10 px)'],
  ['Esc', 'Cancel the current path / wall run'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard Shortcuts" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      <div className="grid-2">
        {[SHORTCUTS.slice(0, Math.ceil(SHORTCUTS.length / 2)), SHORTCUTS.slice(Math.ceil(SHORTCUTS.length / 2))].map((half, i) => (
          <table key={i} className="shortcut-table">
            <tbody>
              {half.map(([k, v]) => (
                <tr key={k}><td><span className="kbd">{k}</span></td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </Modal>
  );
}

export function FoundryHelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Foundry VTT — how the export works" onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      <div style={{ lineHeight: 1.7, fontSize: 13 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>The short version</h3>
        <ol>
          <li>Export → <strong>Foundry VTT</strong>. You get a .zip.</li>
          <li>Copy the image into <code>Data/worlds/&lt;your world&gt;/scenes/</code>.</li>
          <li>In Foundry: Scenes sidebar → right-click a folder → <strong>Import Data</strong> → the .scene.json.</li>
          <li>Activate the scene. Done.</li>
        </ol>

        <h3 style={{ fontFamily: 'var(--font-display)' }}>What travels with it</h3>
        <table className="shortcut-table">
          <tbody>
            <tr><td>Walls</td><td>Movement, sight and sound blocking flags per segment.</td></tr>
            <tr><td>Doors</td><td>Door / secret door type and closed / open / locked state.</td></tr>
            <tr><td>Windows</td><td>Exported as limited-sight walls, so you can see through but not walk through.</td></tr>
            <tr><td>Lights</td><td>Bright and dim radii converted from pixels into scene units, plus colour and animation.</td></tr>
            <tr><td>Notes</td><td>Journal pins at the right coordinates; the note body rides along in scene flags.</td></tr>
            <tr><td>Grid</td><td>Type, size, distance and units, so measurement is correct immediately.</td></tr>
            <tr><td>Tokens</td><td>Optional: editor tokens become Foundry tokens with matching disposition.</td></tr>
          </tbody>
        </table>

        <h3 style={{ fontFamily: 'var(--font-display)' }}>Getting the grid right</h3>
        <p className="hint">
          Export the image with <strong>Draw grid</strong> switched off. Foundry draws its own grid;
          if you bake one in and it is even a pixel off, everything looks subtly wrong forever.
          Keep the map dimensions a whole number of cells and the two will line up exactly.
        </p>

        <h3 style={{ fontFamily: 'var(--font-display)' }}>Universal VTT as an alternative</h3>
        <p className="hint">
          If you would rather drag one file onto Foundry, install the community module
          <strong> Universal Battlemap Importer</strong> and use our <strong>Universal VTT</strong> export
          instead — the image lives inside the .dd2vtt, so there is nothing to copy by hand.
        </p>
      </div>
    </Modal>
  );
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = React.useState<Record<string, string> | null>(null);
  React.useEffect(() => {
    window.aetheria?.info().then((i) => setInfo(i as unknown as Record<string, string>));
  }, []);
  return (
    <Modal title="About Aetheria Cartographer" size="narrow" onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      <p style={{ marginTop: 0, lineHeight: 1.7 }}>
        An offline fantasy map editor for tabletop RPGs. Every texture, stamp and
        landform in it is generated by code rather than shipped as artwork, so the
        whole thing runs with no account, no subscription and no network.
      </p>
      <table className="shortcut-table">
        <tbody>
          <tr><td>Version</td><td>0.9.0</td></tr>
          {info && <>
            <tr><td>Platform</td><td>{info.platform} · {info.arch}</td></tr>
            <tr><td>Electron</td><td>{info.electron}</td></tr>
            <tr><td>Chromium</td><td>{info.chrome}</td></tr>
            <tr><td>Data folder</td><td style={{ wordBreak: 'break-all' }}>{info.userData}</td></tr>
          </>}
        </tbody>
      </table>
    </Modal>
  );
}
