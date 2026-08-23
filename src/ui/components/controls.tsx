/** Small, shared form controls. */
import React from 'react';
import { IconClose } from './Icons';
import { useLang } from '../../i18n/useLang';

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

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size === 'default' ? '' : size}`}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} title={t('action.close')}><IconClose size={16} /></button>
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

export function Slider({
  label, value, min, max, step = 1, onChange, format,
}: {
  label?: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div className="slider-row">
        <input type="range" min={min} max={max} step={step} value={value}
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
  return (
    <div className="field">
      <label>{label}{suffix ? ` (${suffix})` : ''}</label>
      <input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step}
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
  return (
    <div className="field">
      <label>{label}</label>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function TextArea({ label, value, onChange, rows = 4 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function SelectField<T extends string>({
  label, value, options, onChange,
}: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="field-row" style={{ marginBottom: 7 }}>
      <label>{label}</label>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field-row" style={{ marginBottom: 7 }}>
      <label>{label}</label>
      <input type="color" value={normalizeHex(value)} onChange={(e) => onChange(e.target.value)} />
      <input type="text" style={{ width: 78 }} value={value} onChange={(e) => onChange(e.target.value)} />
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
        <div key={c} className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'active' : ''}`}
          style={{ background: c }} onClick={() => onChange(c)} title={c} />
      ))}
    </div>
  );
}
