/** The map viewport: rendering loop, pointer routing, zoom and pan. */
import React from 'react';
import { useEditor } from './useEditor';
import { renderToScreen } from '../render/renderer';
import { getTool } from '../tools';
import type { PointerCtx } from '../tools/types';
import type { Vec2 } from '../core/types';
import { measureDistance } from '../render/grid';

export function CanvasView() {
  const editor = useEditor();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const dirty = React.useRef(true);
  const spaceDown = React.useRef(false);
  const middlePan = React.useRef<Vec2 | null>(null);
  const [cursorPos, setCursorPos] = React.useState<Vec2>({ x: 0, y: 0 });
  const [toast, setToast] = React.useState<string | null>(null);

  // ---- Redraw loop -------------------------------------------------------
  React.useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas || !dirty.current) return;
      dirty.current = false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      renderToScreen(ctx, editor.doc, editor.camera, {
        paletteId: editor.paletteId,
        showGrid: editor.view.showGrid,
        showWalls: editor.view.showWalls,
        showLights: editor.view.showLights,
        showNotes: editor.view.showNotes,
        showLightingPreview: editor.view.showLightingPreview,
        soloLayerId: editor.view.soloLayerId,
        showLightRadii: editor.tool === 'light',
        highlightIds: new Set([...editor.selection.lightIds, ...editor.selection.wallIds, ...editor.selection.noteIds]),
        liveLayerId: editor.strokeLayerId,
        liveSurface: editor.stroke?.paint ?? null,
        liveComposite: editor.stroke?.composite,
        forExport: false,
      });

      // Tool overlays sit above everything, in map space.
      const tool = getTool(editor.tool);
      if (tool.drawOverlay || editor.overlayDraw) {
        ctx.save();
        ctx.translate(editor.camera.viewW / 2, editor.camera.viewH / 2);
        ctx.scale(editor.camera.zoom, editor.camera.zoom);
        ctx.translate(-editor.camera.x, -editor.camera.y);
        tool.drawOverlay?.(ctx, editor);
        ctx.restore();
      }

      // Brush cursor ring.
      if ((editor.tool === 'brush' || editor.tool === 'eraser') && !editor.stroke) {
        const r = (editor.brush.size / 2) * editor.camera.zoom;
        if (r > 1.5 && r < 4000) {
          const p = editor.camera.toScreen(cursorPos);
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 1, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [editor, cursorPos]);

  const invalidate = React.useCallback(() => { dirty.current = true; }, []);

  React.useEffect(() => {
    const offs = [
      editor.events.on('change', invalidate),
      editor.events.on('camera', invalidate),
      editor.events.on('selection', invalidate),
      editor.events.on('view', invalidate),
      editor.events.on('tool', invalidate),
    ];
    return () => offs.forEach((o) => o());
  }, [editor, invalidate]);

  React.useEffect(() => {
    const off = editor.events.on('status', (msg) => {
      setToast(msg);
      window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2600);
    });
    return off;
  }, [editor]);

  // ---- Sizing ------------------------------------------------------------
  React.useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth, h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      editor.camera.setViewport(w, h);
      invalidate();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [editor, invalidate]);

  // Fit the map the first time the viewport has a size.
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      editor.camera.fit(editor.doc.width, editor.doc.height);
      editor.events.emit('camera', undefined);
    }, 40);
    return () => window.clearTimeout(t);
  }, [editor]);

  // ---- Pointer -----------------------------------------------------------
  const toCtx = (e: React.PointerEvent): PointerCtx => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    return {
      editor,
      screen,
      map: editor.camera.toMap(screen),
      pressure: e.pressure > 0 ? e.pressure : 1,
      shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey,
      button: e.button,
      native: e.nativeEvent,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const c = toCtx(e);
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      middlePan.current = c.screen;
      return;
    }
    if (e.button === 2) return;
    editor.overlayDraw = null;
    getTool(editor.tool).onPointerDown?.(c);
    invalidate();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const c = toCtx(e);
    setCursorPos(c.map);
    if (middlePan.current) {
      editor.camera.panBy(c.screen.x - middlePan.current.x, c.screen.y - middlePan.current.y);
      middlePan.current = c.screen;
      editor.events.emit('camera', undefined);
      return;
    }
    getTool(editor.tool).onPointerMove?.(c);
    invalidate();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    canvasRef.current?.releasePointerCapture(e.pointerId);
    if (middlePan.current) { middlePan.current = null; return; }
    getTool(editor.tool).onPointerUp?.(toCtx(e));
    invalidate();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    getTool(editor.tool).onDoubleClick?.({
      editor, screen, map: editor.camera.toMap(screen), pressure: 1,
      shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey,
      button: 0, native: e.nativeEvent as unknown as PointerEvent,
    });
    invalidate();
  };

  // Wheel: zoom, or resize the brush with Alt.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (e.altKey && (editor.tool === 'brush' || editor.tool === 'eraser')) {
        const next = Math.max(2, Math.min(3000, editor.brush.size * (e.deltaY < 0 ? 1.1 : 0.9)));
        editor.setBrush({ size: Math.round(next) });
        return;
      }
      const factor = Math.pow(1.0016, -e.deltaY);
      editor.camera.zoomAt(p, factor);
      editor.events.emit('camera', undefined);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [editor]);

  // Space to pan.
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = true; };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const tool = getTool(editor.tool);
  const dist = measureDistance({ x: 0, y: 0 }, cursorPos, editor.doc.grid);

  return (
    <div className="canvas-area" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="map-canvas"
        style={{ cursor: middlePan.current ? 'grabbing' : (tool.cursor || 'default') }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="canvas-hud">
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink-dim)' }}>
          {Math.round(cursorPos.x)}, {Math.round(cursorPos.y)}
        </span>
        <span style={{ color: 'var(--ink-faint)' }}>·</span>
        <span style={{ color: 'var(--ink-faint)' }}>{Math.round(editor.camera.zoom * 100)}%</span>
      </div>
      {toast && <div className="canvas-toast">{toast}</div>}
    </div>
  );
}
