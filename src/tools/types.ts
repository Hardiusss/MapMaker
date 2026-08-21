import type { Editor, ToolId } from '../core/editor';
import type { Vec2 } from '../core/types';

export interface PointerCtx {
  editor: Editor;
  /** Pointer position in map coordinates. */
  map: Vec2;
  /** Pointer position in CSS pixels inside the canvas element. */
  screen: Vec2;
  pressure: number;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  button: number;
  /** Raw event, for tools that need `pointerId` etc. */
  native: PointerEvent;
}

export interface KeyCtx {
  editor: Editor;
  key: string;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  native: KeyboardEvent;
}

export interface Tool {
  id: ToolId;
  label: string;
  /** Single-key shortcut. */
  shortcut?: string;
  cursor?: string;
  /** Short blurb shown in the status bar when the tool becomes active. */
  hint?: string;
  onActivate?(editor: Editor): void;
  onDeactivate?(editor: Editor): void;
  onPointerDown?(c: PointerCtx): void;
  onPointerMove?(c: PointerCtx): void;
  onPointerUp?(c: PointerCtx): void;
  onDoubleClick?(c: PointerCtx): void;
  onKeyDown?(c: KeyCtx): boolean | void;
  /** Draw in map space, above everything else. */
  drawOverlay?(ctx: CanvasRenderingContext2D, editor: Editor): void;
}
