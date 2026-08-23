/** Small focused editors reached by double-clicking things on the map. */
import React from 'react';
import { Modal, TextArea, TextField, ColorField, SelectField } from '../components/controls';
import { useEditor } from '../useEditor';
import { useLang } from '../../i18n/useLang';
import type { TextObject } from '../../core/types';

export function TextEditDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const editor = useEditor();
  const { t } = useLang();
  const found = React.useMemo(() => {
    for (const l of editor.doc.layers) {
      if (l.kind !== 'object') continue;
      const o = l.objects.find((x) => x.id === id);
      if (o && o.kind === 'text') return o as TextObject;
    }
    return null;
  }, [editor.doc, id]);

  const [text, setText] = React.useState(found?.text || '');
  if (!found) return null;

  const apply = () => {
    editor.updateObjects([id], () => ({ text }), 'Edit label');
    onClose();
  };

  return (
    <Modal title={t('dlg.text.title')} size="narrow" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('action.cancel')}</button>
        <button className="btn primary" onClick={apply}>{t('action.apply')}</button>
      </>}>
      <TextArea label={t('props.text')} value={text} rows={3} onChange={setText} />
      <p className="hint">{t('dlg.text.hint')}</p>
    </Modal>
  );
}

export function NoteEditDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const editor = useEditor();
  const { t } = useLang();
  const note = React.useMemo(() => {
    for (const l of editor.doc.layers) {
      if (l.kind !== 'note') continue;
      const n = l.notes.find((x) => x.id === id);
      if (n) return n;
    }
    return null;
  }, [editor.doc, id]);

  const [title, setTitle] = React.useState(note?.title || '');
  const [body, setBody] = React.useState(note?.body || '');
  const [icon, setIcon] = React.useState(note?.icon || 'i');
  const [color, setColor] = React.useState(note?.color || '#d4b34a');
  if (!note) return null;

  const apply = () => {
    editor.updateNote(id, { title, body, icon, color });
    onClose();
  };

  return (
    <Modal title={t('tool.note')} size="narrow" onClose={onClose}
      footer={<>
        <button className="btn danger" onClick={() => {
          editor.mutate('Delete note', (d) => {
            for (const l of d.layers) if (l.kind === 'note') l.notes = l.notes.filter((n) => n.id !== id);
          });
          onClose();
        }}>{t('action.delete')}</button>
        <span className="grow" />
        <button className="btn" onClick={onClose}>{t('action.cancel')}</button>
        <button className="btn primary" onClick={apply}>{t('action.saveShort')}</button>
      </>}>
      <TextField label={t('field.title')} value={title} onChange={setTitle} />
      <TextArea label={t('dlg.note.body')} value={body} rows={6} onChange={setBody} />
      <TextField label={t('dlg.note.pinLetter')} value={icon} onChange={setIcon} />
      <ColorField label={t('dlg.note.pinColour')} value={color} onChange={setColor} />
      <p className="hint">{t('dlg.note.hint')}</p>
    </Modal>
  );
}
