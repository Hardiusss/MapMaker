/** The left tool rail. */
import React from 'react';
import { useEditorEvents } from './useEditor';
import type { ToolId } from '../core/editor';
import { getTool, TOOLS } from '../tools';
import {
  IconCursor, IconBrush, IconEraser, IconFill, IconStamp, IconText, IconShape,
  IconPath, IconWall, IconLight, IconNote, IconToken, IconRuler, IconDropper, IconHand, IconGrid,
} from './components/Icons';

const ICONS: Record<ToolId, React.ComponentType<{ size?: number }>> = {
  select: IconCursor,
  brush: IconBrush,
  eraser: IconEraser,
  fill: IconFill,
  stamp: IconStamp,
  text: IconText,
  shape: IconShape,
  path: IconPath,
  wall: IconWall,
  light: IconLight,
  note: IconNote,
  token: IconToken,
  measure: IconRuler,
  eyedropper: IconDropper,
  pan: IconHand,
  gridalign: IconGrid,
};

const GROUPS: ToolId[][] = [
  ['select'],
  ['brush', 'eraser', 'fill', 'eyedropper'],
  ['stamp', 'shape', 'path', 'text'],
  ['wall', 'light', 'note', 'token'],
  ['measure', 'gridalign', 'pan'],
];

export function Toolbar() {
  const editor = useEditorEvents('tool');

  const pick = (id: ToolId) => {
    const prev = getTool(editor.tool);
    prev.onDeactivate?.(editor);
    editor.setTool(id);
    const next = getTool(id);
    next.onActivate?.(editor);
    if (next.hint) editor.status(next.hint);
  };

  return (
    <div className="rail">
      {GROUPS.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div className="divider" />}
          {group.map((id) => {
            const tool = TOOLS.find((t) => t.id === id)!;
            const Icon = ICONS[id];
            return (
              <button
                key={id}
                className={`tool-btn ${editor.tool === id ? 'active' : ''}`}
                onClick={() => pick(id)}
                title={`${tool.label}${tool.shortcut ? `  (${tool.shortcut.toUpperCase()})` : ''}`}
              >
                <Icon />
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
