/** Small, shared form controls. */
import React from 'react';
import { IconClose } from './Icons';
import { useLang } from '../../i18n/useLang';

/** Everything a keyboard can land on inside a dialog. */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  title, onClose, children, footer, size = 'default',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'narrow' | 'default' | 'wide';
}) {
  const { t } = useLang();
  const panel = React.useRef<HTMLDivElement>(null);

  /**
   * Keyboard containment.
   *
   * Escape closes, which it always did. The rest is new: Tab used to walk out
   * of the dialog and into the toolbar behind it, so a GM working by keyboard
   * ended up tabbing through a whole editor they could not see to get back to
   * the Cancel button. Wrapping at both ends keeps the ring inside the dialog,
   * which is what a modal means.
   */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (active && !panel.current.contains(active)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  /**
   * Focus in, and back out again on close.
   *
   * The close button is skipped when there is anything else to land on: a
   * dialog that opens with its dismiss control focused invites you to press
   * Enter and lose the dialog you just asked for.
   */
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const items = panel.current ? [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
    const target = items.find((el) => !el.classList.contains('ghost')) ?? items[0];
    target?.focus();
    return () => { previous?.focus?.(); };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size === 'default' ? '' : size}`} ref={panel}
        role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} title={t('action.close')}
            aria-label={t('action.close')}><IconClose size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

/*
 * Every control below mints its own id and binds its label to it. A bare
 * `<label>` beside an input looks identical and does nothing: clicking the
 * word "Opacity" did not put the cursor in the box, and a screen reader read
 * a row of unnamed inputs. `useId` gives each one a stable id without the
 * caller having to invent one.
 */

export function Slider({
  label, value, min, max, step = 1, onChange, format,
}: {
  label?: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const id = React.useId();
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <div className="slider-row">
        <input id={id} type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))} />
        <span className="value">{format ? format(value) : (Math.round(value * 100) / 100).toString()}</span>
      </div>
    </div>
  );
}

export function NumberField({
  label, value, onChange, min, max, step = 1, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}{suffix ? ` (${suffix})` : ''}</label>
      <input id={id} type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }} />
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function TextArea({ label, value, onChange, rows = 4 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function SelectField<T extends string>({
  label, value, options, onChange,
}: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function Toggle({ label, value, onChange, title }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
  /** Hover text for the pair, on the switches whose name is not the whole story. */
  title?: string;
}) {
  const id = React.useId();
  return (
    <div className="field-row" style={{ marginBottom: 7 }} title={title}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = React.useId();
  const { t } = useLang();
  return (
    <div className="field-row" style={{ marginBottom: 7 }}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="color" value={normalizeHex(value)} onChange={(e) => onChange(e.target.value)} />
      <input type="text" style={{ width: 78 }} value={value} aria-label={t('field.hex', { field: label })}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function normalizeHex(v: string): string {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000';
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-title"><span>{title}</span>{action}</div>
      {children}
    </div>
  );
}

export function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button key={c} type="button"
          className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'active' : ''}`}
          style={{ background: c }} onClick={() => onChange(c)} title={c}
          aria-label={c} aria-pressed={c.toLowerCase() === value.toLowerCase()} />
      ))}
    </div>
  );
}
