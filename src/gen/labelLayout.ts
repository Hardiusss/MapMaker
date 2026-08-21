/**
 * Label de-collision.
 *
 * Generated maps place labels from several independent passes — settlements,
 * biome regions, realms — and they inevitably land on top of each other. This
 * runs a short relaxation over the finished set, nudging labels apart along the
 * axis that costs the least, and dropping the least important ones if a knot
 * refuses to untangle.
 */
import type { MapDocument, MapObject, TextObject, Rect } from '../core/types';
import { objectBounds } from '../core/objectBounds';

export interface LabelLayoutOptions {
  /** Iterations of the relaxation. */
  passes: number;
  /** Extra breathing room around each label, in pixels. */
  padding: number;
  /** Labels smaller than this are considered droppable when overcrowded. */
  minorSizeBelow: number;
  /** Give up and hide a label after this many failed pushes. */
  dropAfter: number;
  /** Keep labels inside the page. */
  clampToPage: boolean;
}

export const DEFAULT_LABEL_LAYOUT: LabelLayoutOptions = {
  passes: 24,
  padding: 6,
  minorSizeBelow: 30,
  dropAfter: 3,
  clampToPage: true,
};

interface Entry {
  object: TextObject;
  rect: Rect;
  /** Bigger labels win ties and move less. */
  weight: number;
  /** How far it has already been pushed from where the generator wanted it. */
  drift: number;
  homeY: number;
  collisions: number;
}

function overlap(a: Rect, b: Rect, pad: number): { dx: number; dy: number } | null {
  const ax0 = a.x - pad, ax1 = a.x + a.w + pad;
  const ay0 = a.y - pad, ay1 = a.y + a.h + pad;
  const bx0 = b.x, bx1 = b.x + b.w;
  const by0 = b.y, by1 = b.y + b.h;
  if (ax1 <= bx0 || bx1 <= ax0 || ay1 <= by0 || by1 <= ay0) return null;
  // Minimum translation vector on each axis.
  const dx = ax1 - bx0 < bx1 - ax0 ? -(ax1 - bx0) : bx1 - ax0;
  const dy = ay1 - by0 < by1 - ay0 ? -(ay1 - by0) : by1 - ay0;
  return { dx, dy };
}

/**
 * Nudge overlapping text objects apart. Mutates the objects in place and
 * returns how many labels were moved and how many were hidden.
 */
export function layoutLabels(doc: MapDocument, opts: Partial<LabelLayoutOptions> = {}): { moved: number; hidden: number } {
  const o = { ...DEFAULT_LABEL_LAYOUT, ...opts };

  const entries: Entry[] = [];
  for (const layer of doc.layers) {
    if (layer.kind !== 'object' || !layer.visible) continue;
    for (const obj of layer.objects) {
      if (obj.kind !== 'text' || !obj.visible) continue;
      // Some text is set, not placed: a legend, a title block, a column of
      // figures. Nudging it apart to resolve a collision destroys the very
      // alignment that makes it readable, so anything marked as fixed is left
      // exactly where it was put.
      if (obj.locked) continue;
      const t = obj as TextObject;
      entries.push({
        object: t,
        rect: objectBounds(t, doc.grid),
        weight: t.size * (t.bold ? 1.4 : 1),
        drift: 0,
        homeY: t.y,
        collisions: 0,
      });
    }
  }
  if (entries.length < 2) return { moved: 0, hidden: 0 };

  // Heaviest labels are effectively anchors; light ones do the moving.
  entries.sort((a, b) => b.weight - a.weight);

  let moved = 0;
  for (let pass = 0; pass < o.passes; pass++) {
    let touched = 0;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j];
        if (!a.object.visible || !b.object.visible) continue;
        const push = overlap(a.rect, b.rect, o.padding);
        if (!push) continue;

        // Move along the cheaper axis, and mostly move the lighter label.
        const useY = Math.abs(push.dy) <= Math.abs(push.dx) * 1.6;
        const share = a.weight / (a.weight + b.weight);
        const amount = useY ? push.dy : push.dx;

        if (useY) {
          a.object.y += amount * (1 - share) * 0.55;
          b.object.y -= amount * share * 0.55;
        } else {
          a.object.x += amount * (1 - share) * 0.35;
          b.object.x -= amount * share * 0.35;
        }
        a.rect = objectBounds(a.object, doc.grid);
        b.rect = objectBounds(b.object, doc.grid);
        a.collisions++;
        b.collisions++;
        touched++;
        moved++;
      }
    }
    if (!touched) break;
  }

  // Anything still buried after the relaxation gets hidden rather than left as
  // an unreadable overlap — but only the small stuff.
  let hidden = 0;
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    if (!a.object.visible) continue;
    if (a.object.size >= o.minorSizeBelow) continue;
    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      const b = entries[j];
      if (!b.object.visible) continue;
      if (overlap(a.rect, b.rect, 0) && a.collisions > o.dropAfter && a.weight <= b.weight) {
        a.object.visible = false;
        hidden++;
        break;
      }
    }
  }

  if (o.clampToPage) {
    for (const e of entries) {
      if (!e.object.visible) continue;
      const r = objectBounds(e.object, doc.grid);
      const dx = r.x < 0 ? -r.x : r.x + r.w > doc.width ? doc.width - (r.x + r.w) : 0;
      const dy = r.y < 0 ? -r.y : r.y + r.h > doc.height ? doc.height - (r.y + r.h) : 0;
      e.object.x += dx;
      e.object.y += dy;
    }
  }

  return { moved, hidden };
}
