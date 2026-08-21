/** Small focused editors reached by double-clicking things on the map. */
import React from 'react';
import { Modal, TextArea, TextField, ColorField, SelectField } from '../components/controls';
import { useEditor } from '../useEditor';
import type { TextObject } from '../../core/types';

export function TextEditDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const editor = useEditor();
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
    <Modal title="Edit Label" size="narrow" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={apply}>Apply</button>
      </>}>
      <TextArea label="Text" value={text} rows={3} onChange={setText} />
      <p className="hint">Everything else about this label lives in the Inspect tab.</p>
    </Modal>
  );
}

export function NoteEditDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const editor = useEditor();
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
    <Modal title="GM Note" size="narrow" onClose={onClose}
      footer={<>
        <button className="btn danger" onClick={() => {
          editor.mutate('Delete note', (d) => {
            for (const l of d.layers) if (l.kind === 'note') l.notes = l.notes.filter((n) => n.id !== id);
          });
          onClose();
        }}>Delete</button>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={apply}>Save</button>
      </>}>
      <TextField label="Title" value={title} onChange={setTitle} />
      <TextArea label="Body" value={body} rows={6} onChange={setBody} />
      <TextField label="Pin letter" value={icon} onChange={setIcon} />
      <ColorField label="Pin colour" value={color} onChange={setColor} />
      <p className="hint">Notes become Foundry journal pins on export.</p>
    </Modal>
  );
}
