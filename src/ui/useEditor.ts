/** React ↔ Editor glue. The editor is a plain object; these hooks re-render on its events. */
import React from 'react';
import type { Editor, EditorEvents } from '../core/editor';

export const EditorContext = React.createContext<Editor>(null as unknown as Editor);

export function useEditor(): Editor {
  const e = React.useContext(EditorContext);
  if (!e) throw new Error('useEditor must be used inside <EditorContext.Provider>');
  return e;
}

/** Re-render whenever any of the named editor events fire. */
export function useEditorEvents(...events: (keyof EditorEvents)[]): Editor {
  const editor = useEditor();
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const offs = events.map((ev) => editor.events.on(ev, () => force()));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, events.join('|')]);
  return editor;
}

export function useDocument(): Editor {
  return useEditorEvents('change');
}

/** Throttled re-render for high-frequency events like painting. */
export function useAnimationEvents(...events: (keyof EditorEvents)[]): Editor {
  const editor = useEditor();
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const pending = React.useRef(false);
  React.useEffect(() => {
    const trigger = () => {
      if (pending.current) return;
      pending.current = true;
      requestAnimationFrame(() => { pending.current = false; force(); });
    };
    const offs = events.map((ev) => editor.events.on(ev, trigger));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, events.join('|')]);
  return editor;
}
