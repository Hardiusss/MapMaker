/** Shortcuts, Foundry guide and about. */
import React from 'react';
import { Modal } from '../components/controls';
import { assetCount } from '../../assets/library';
import { iconCredits } from '../../assets/procedural/icons';
import { useLang } from '../../i18n/useLang';

/**
 * Key, then the dictionary key for what it does. The key names themselves are
 * printed on the keyboard, so only the second half is translated — except the
 * one chord that spells a word.
 */
const SHORTCUTS: [string, string][] = [
  ['V', 'sc.select'],
  ['B', 'sc.brush'],
  ['E', 'sc.eraser'],
  ['G', 'sc.fill'],
  ['S', 'sc.stamp'],
  ['T', 'sc.text'],
  ['R', 'sc.shape'],
  ['P', 'sc.path'],
  ['C', 'sc.castle'],
  ['W', 'sc.wall'],
  ['L', 'sc.light'],
  ['N', 'sc.note'],
  ['K', 'sc.token'],
  ['M', 'sc.measure'],
  ['I', 'sc.eyedropper'],
  ['sc.keySpace', 'sc.pan'],
  ['[ / ]', 'sc.brushSize'],
  ['Alt + wheel', 'sc.brushSizeWheel'],
  ['Wheel', 'sc.zoom'],
  ['Ctrl + 0', 'sc.fit'],
  ['Ctrl + 1', 'sc.actualSize'],
  ['Ctrl + =/-', 'sc.zoomInOut'],
  ['Ctrl + Z', 'sc.undo'],
  ['Ctrl + Shift + Z', 'sc.redo'],
  ['Ctrl + D', 'sc.duplicate'],
  ['Ctrl + C / V', 'sc.copyPaste'],
  ['Delete', 'sc.deleteSel'],
  ['Ctrl + G', 'sc.toggleGrid'],
  ['Ctrl + W', 'sc.toggleWalls'],
  ['Ctrl + L', 'sc.toggleLighting'],
  ['Ctrl + S', 'sc.save'],
  ['Ctrl + E', 'sc.export'],
  ['Ctrl + N', 'sc.new'],
  ['Ctrl + Shift + G', 'sc.generators'],
  ['Arrows', 'sc.nudge'],
  ['Esc', 'sc.escape'],
];

/** Named once because the credit paragraph is split on it in every language. */
const ICONS_HOST = 'game-icons.net';

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  // The credits live in About, and About used to be reachable only from the
  // native menu bar — which several desktops hide by default. An attribution
  // you have to hunt for is not much of an attribution.
  const [showAbout, setShowAbout] = React.useState(false);
  const { t } = useLang();
  if (showAbout) return <AboutDialog onClose={onClose} />;
  const half = Math.ceil(SHORTCUTS.length / 2);
  return (
    <Modal title={t('about.shortcuts')} onClose={onClose} footer={<>
      <button className="btn" onClick={() => setShowAbout(true)}>{t('about.creditsButton')}</button>
      <button className="btn primary" onClick={onClose}>{t('action.close')}</button>
    </>}>
      <div className="grid-2">
        {[SHORTCUTS.slice(0, half), SHORTCUTS.slice(half)].map((part, i) => (
          <table key={i} className="shortcut-table">
            <tbody>
              {part.map(([k, v]) => (
                <tr key={k}>
                  <td><span className="kbd">{k.startsWith('sc.') ? t(k) : k}</span></td>
                  <td>{t(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </Modal>
  );
}

export function FoundryHelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  return (
    <Modal title={t('help.foundry.title')} onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>{t('action.close')}</button>}>
      <div style={{ lineHeight: 1.7, fontSize: 13 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>{t('help.foundry.short')}</h3>
        <ol>
          <li>{t('help.foundry.step1')}</li>
          <li>{t('help.foundry.step2', { path: 'Data/worlds/<your world>/scenes/' })}</li>
          <li>{t('help.foundry.step3')}</li>
          <li>{t('help.foundry.step4')}</li>
        </ol>

        <h3 style={{ fontFamily: 'var(--font-display)' }}>{t('help.foundry.what')}</h3>
        <table className="shortcut-table">
          <tbody>
            <tr><td>{t('map.walls')}</td><td>{t('help.foundry.walls')}</td></tr>
            <tr><td>{t('map.doors')}</td><td>{t('help.foundry.doors')}</td></tr>
            <tr><td>{t('wall.window')}</td><td>{t('help.foundry.windows')}</td></tr>
            <tr><td>{t('map.lights')}</td><td>{t('help.foundry.lights')}</td></tr>
            <tr><td>{t('map.notes')}</td><td>{t('help.foundry.notes')}</td></tr>
            <tr><td>{t('map.grid')}</td><td>{t('help.foundry.grid')}</td></tr>
            <tr><td>{t('layer.tokens')}</td><td>{t('help.foundry.tokens')}</td></tr>
          </tbody>
        </table>

        <h3 style={{ fontFamily: 'var(--font-display)' }}>{t('help.foundry.gridRight')}</h3>
        <p className="hint">{t('help.foundry.gridBody')}</p>

        <h3 style={{ fontFamily: 'var(--font-display)' }}>{t('help.foundry.altTitle')}</h3>
        <p className="hint">{t('help.foundry.altBody')}</p>
      </div>
    </Modal>
  );
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [info, setInfo] = React.useState<Record<string, string> | null>(null);
  React.useEffect(() => {
    window.aetheria?.info().then((i) => setInfo(i as unknown as Record<string, string>));
  }, []);
  return (
    <Modal title={t('about.title')} size="narrow" onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>{t('action.close')}</button>}>
      <p style={{ marginTop: 0, lineHeight: 1.7 }}>{t('about.blurb')}</p>
      <table className="shortcut-table">
        <tbody>
          <tr><td>{t('about.version')}</td><td>0.9.0</td></tr>
          <tr><td>{t('about.stamps')}</td><td>{assetCount()}</td></tr>
          {info && <>
            <tr><td>{t('about.platform')}</td><td>{info.platform} · {info.arch}</td></tr>
            <tr><td>{t('about.electron')}</td><td>{info.electron}</td></tr>
            <tr><td>{t('about.chromium')}</td><td>{info.chrome}</td></tr>
            <tr><td>{t('about.dataFolder')}</td><td style={{ wordBreak: 'break-all' }}>{info.userData}</td></tr>
          </>}
        </tbody>
      </table>

      <h3 style={{ marginBottom: 6 }}>{t('about.credits')}</h3>
      {/* The licence asks for a link, not just a mention, so the domain inside
          the translated sentence is turned back into one wherever it lands. */}
      <p style={{ marginTop: 0, lineHeight: 1.7 }}>
        {t('about.creditsBody').split(ICONS_HOST).flatMap((part, i) => (i === 0 ? [part] : [
          <a key={i} href={`https://${ICONS_HOST}`} target="_blank" rel="noreferrer">{ICONS_HOST}</a>,
          part,
        ]))}
      </p>
      <p style={{ marginTop: 0, lineHeight: 1.7 }}>
        {iconCredits().map((c, i) => (
          <span key={c.author}>
            {i > 0 && ', '}
            {c.author} <span className="hint">({c.count})</span>
          </span>
        ))}
      </p>
      <p className="hint" style={{ lineHeight: 1.6 }}>{t('about.creditsNote')}</p>
    </Modal>
  );
}
