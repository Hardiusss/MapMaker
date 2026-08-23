/**
 * Top-down creature tokens for battle maps.
 *
 * A battle map reads at table scale, not gallery scale: a GM drops these at
 * 40-200px next to a dozen others, so every token shares one visual family —
 * a stamped disc to stand on, a bold ink-outlined silhouette, and (for the
 * bipeds, which is most of the roster) the same head/shoulders/arms rig so a
 * dozen bespoke humanoids don't drift into a dozen different art styles.
 * `tint` recolours the *faction* markers — cloak, tabard, shield, barding,
 * the base ring itself — so a GM can drop a red warband and a blue one from
 * the same stamp and tell them apart across the table.
 */
import type { AssetDef, AssetDrawArgs } from '../types';
import { blob, fillPath, groundShadow, inkLine, lightGradient, radialGlow, regularPolygon, roundRect, star } from '../draw';
import { mix, rgba } from '../../core/color';
import type { Vec2 } from '../../core/types';

// ---------------------------------------------------------------------------
// Shared palette bits
// ---------------------------------------------------------------------------

const STEEL = '#9aa0a6';
const STEEL_DARK = '#5b6066';
const WOOD = '#6b4a2a';
const BONE = '#ded6c4';
const BONE_DARK = '#a89b83';

type SizeCat = 'small' | 'medium' | 'large' | 'huge';
const SIZE_WIDTH: Record<SizeCat, number> = { small: 48, medium: 66, large: 136, huge: 200 };

const ink = (a: AssetDrawArgs) => a.palette.ink;

/** Recolour a faction element — cloak, tabard, shield, barding, base ring. */
function teamColor(a: AssetDrawArgs, base: string): string {
  return a.tint ? mix(base, a.tint, a.tintStrength) : base;
}

// ---------------------------------------------------------------------------
// The token base every creature stands on
// ---------------------------------------------------------------------------

/**
 * The stamped disc every creature stands on: a filled base, a faction-tinted
 * ring, and a soft contact shadow. Drawing this first — and drawing it the
 * same way for all forty-odd tokens — is what makes the set read as one
 * family instead of forty separate pieces of art.
 */
function tokenBase(a: AssetDrawArgs, size: SizeCat, opts: { shadow?: boolean } = {}): { cx: number; cy: number; r: number } {
  const { ctx, w, h, palette } = a;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) * 0.47;
  if (opts.shadow !== false) {
    groundShadow(ctx, cx + r * 0.1, cy + r * 0.14, r * 0.96, r * 0.9, 0.36);
  }
  const disc = mix(palette.parchmentDark, '#241f19', 0.55);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = a.tint ? mix(disc, a.tint, a.tintStrength * 0.25) : disc;
  ctx.fill();

  // Untinted, the ring is dark steel and stays out of the way — the creature is
  // the subject. It only takes a colour when a GM tints the token to mark a
  // side, which is the moment the ring is meant to be the loudest thing on it.
  const ringColor = a.tint ? mix('#2e3339', a.tint, a.tintStrength) : '#2e3339';
  const ringW = size === 'huge' ? r * 0.085 : size === 'large' ? r * 0.075 : size === 'small' ? r * 0.05 : r * 0.062;
  ctx.strokeStyle = rgba(ringColor, a.tint ? 0.95 : 0.8);
  ctx.lineWidth = Math.max(1.5, ringW);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
  if (size === 'huge' || size === 'large') {
    // A second, fainter ring for the big creatures — a Huge token is meant to
    // read as heavier than a Medium one even before the silhouette registers.
    ctx.strokeStyle = rgba(ringColor, 0.4);
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = rgba(palette.ink, 0.55);
  ctx.lineWidth = Math.max(1, r * 0.022);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  return { cx, cy, r };
}

// ---------------------------------------------------------------------------
// Body rigs — the two shapes most of the roster is built from
// ---------------------------------------------------------------------------

interface HandAnchor { x: number; y: number; angle: number; }
interface HumanoidAnchors {
  headX: number; headY: number; headR: number;
  leftHand: HandAnchor; rightHand: HandAnchor;
  torsoR: number; shoulderY: number;
}

/**
 * A humanoid seen from directly above: shoulder mass, two arms reaching out
 * from it, and a head sitting north of centre. Every biped in this file —
 * hero or ogre, skeleton or minotaur — specialises this one rig with its own
 * colours, gear and hand-held weapons rather than getting a bespoke pose.
 */
function humanoidBody(
  a: AssetDrawArgs, cx: number, cy: number, r: number,
  bodyColor: string,
  opts: { skin?: string; headColor?: string; armSpread?: number; armLen?: number; hunch?: number } = {},
): HumanoidAnchors {
  const { ctx, rng, palette } = a;
  const skin = opts.skin ?? '#caa06e';
  const headColor = opts.headColor ?? mix(bodyColor, '#000000', 0.3);
  // Spread is measured away from north. Near a right angle, because a figure
  // seen from directly above shows arms going out to the sides — angling them
  // forward turns every token into a pair of antennae.
  const armSpread = opts.armSpread ?? 1.25;
  const armLen = r * (opts.armLen ?? 0.36);
  const hunch = opts.hunch ?? 0;

  // Shoulders are wider than they are deep from above, and the head covers a
  // good part of them. Getting that proportion right is most of what makes the
  // shape read as a person rather than a shield.
  const torsoR = r * 0.52;
  const torsoRy = torsoR * 0.62;
  const torsoCy = cy + r * 0.12 + hunch * r * 0.1;
  const shoulderY = torsoCy - torsoRy * 0.15;

  // Arms go down first so they emerge from beneath the shoulders.
  ctx.save();
  ctx.strokeStyle = mix(skin, '#000000', 0.14);
  ctx.lineWidth = Math.max(2, r * 0.115);
  ctx.lineCap = 'round';
  const hands: HandAnchor[] = [];
  for (const side of [-1, 1]) {
    const reach = -Math.PI / 2 + side * armSpread;
    const sx = cx + side * torsoR * 0.6, sy = shoulderY;
    const hx = sx + Math.cos(reach) * armLen, hy = sy + Math.sin(reach) * armLen;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
    // The arm hangs out to the side; what it holds still points forward. Those
    // are two different angles, and conflating them made every token a set of
    // antennae with a sword on the end.
    hands.push({ x: hx, y: hy, angle: -Math.PI / 2 + side * 0.34 });
  }
  ctx.restore();

  const torsoPts = blob(cx, torsoCy, torsoR, torsoRy, 6, 0.07, rng);
  fillPath(ctx, torsoPts, lightGradient(ctx, cx - torsoR, torsoCy - torsoRy, cx + torsoR, torsoCy + torsoRy, bodyColor, 0.22, 0.28));
  inkLine(ctx, torsoPts, rgba(palette.ink, 0.6), Math.max(1, r * 0.034), true);

  const headR = r * 0.23;
  const headX = cx, headY = torsoCy - torsoRy * 0.52;
  ctx.save();
  ctx.fillStyle = lightGradient(ctx, headX - headR, headY - headR, headX + headR, headY + headR, headColor, 0.24, 0.3);
  ctx.beginPath(); ctx.arc(headX, headY, headR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgba(palette.ink, 0.65);
  ctx.lineWidth = Math.max(1, r * 0.028);
  ctx.stroke();
  // A sliver of shoulder shadow under the head sells the height difference.
  ctx.beginPath();
  ctx.arc(headX, headY + headR * 0.14, headR * 0.98, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = rgba('#000000', 0.22);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
  ctx.restore();

  return { headX, headY, headR, leftHand: hands[0], rightHand: hands[1], torsoR, shoulderY };
}

interface QuadrupedAnchors { headX: number; headY: number; headR: number; bodyR: number; }

/**
 * A four-legged animal from above: paws, a back, a tail, and a snout pointed
 * "north". Wolves, bears, rats, horses and hounds all share this shape and
 * differ only in proportion, colour and the ears/tusks/mane bolted on after.
 */
function quadrupedBody(
  a: AssetDrawArgs, cx: number, cy: number, r: number, bodyColor: string,
  opts: { tail?: boolean; tailLen?: number; snoutLen?: number; legColor?: string } = {},
): QuadrupedAnchors {
  const { ctx, rng, palette } = a;
  const bodyR = r * 0.52;
  const legColor = opts.legColor ?? mix(bodyColor, '#000000', 0.3);

  ctx.fillStyle = legColor;
  for (const ly of [cy - bodyR * 0.45, cy + bodyR * 0.5]) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * bodyR * 0.75, ly, r * 0.1, r * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (opts.tail !== false) {
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy + bodyR * 0.65);
    ctx.quadraticCurveTo(cx + r * 0.16, cy + bodyR * 1.1, cx + r * 0.05, cy + r * (opts.tailLen ?? 0.55));
    ctx.stroke();
  }

  const bodyPts = blob(cx, cy, bodyR, bodyR * 0.62, 6, 0.1, rng);
  fillPath(ctx, bodyPts, lightGradient(ctx, cx - bodyR, cy - bodyR, cx + bodyR, cy + bodyR, bodyColor, 0.2, 0.26));
  inkLine(ctx, bodyPts, rgba(palette.ink, 0.5), Math.max(1, r * 0.028), true);

  const headR = r * 0.22;
  const headY = cy - bodyR * 0.85 - r * (opts.snoutLen ?? 0.16);
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.ellipse(cx, headY, headR * 0.82, headR * 1.15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgba(palette.ink, 0.5);
  ctx.lineWidth = Math.max(1, r * 0.02);
  ctx.stroke();

  return { headX: cx, headY, headR, bodyR };
}

// ---------------------------------------------------------------------------
// Weapons & gear — held shapes that read as themselves at 40px
// ---------------------------------------------------------------------------

function weaponShaft(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, width);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

/** A leaf-shaped head — spear, glaive — pointing away from the shaft. */
function leafBlade(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, angle: number, len: number, width: number, color: string): void {
  const bx = tipX - Math.cos(angle) * len, by = tipY - Math.sin(angle) * len;
  const nx = Math.cos(angle + Math.PI / 2) * width, ny = Math.sin(angle + Math.PI / 2) * width;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.quadraticCurveTo(bx + nx, by + ny, bx, by);
  ctx.quadraticCurveTo(bx - nx, by - ny, tipX, tipY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** A straight tapered blade — sword, dagger. */
function straightBlade(ctx: CanvasRenderingContext2D, hiltX: number, hiltY: number, angle: number, len: number, width: number, color: string): void {
  const tipX = hiltX + Math.cos(angle) * len, tipY = hiltY + Math.sin(angle) * len;
  const nx = Math.cos(angle + Math.PI / 2) * width, ny = Math.sin(angle + Math.PI / 2) * width;
  ctx.beginPath();
  ctx.moveTo(hiltX + nx, hiltY + ny);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(hiltX - nx, hiltY - ny);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function spearWeapon(a: AssetDrawArgs, hand: HandAnchor, len: number, shaftColor: string, headColor: string): void {
  const { ctx } = a;
  const tipX = hand.x + Math.cos(hand.angle) * len, tipY = hand.y + Math.sin(hand.angle) * len;
  const backX = hand.x - Math.cos(hand.angle) * len * 0.2, backY = hand.y - Math.sin(hand.angle) * len * 0.2;
  weaponShaft(ctx, backX, backY, tipX, tipY, shaftColor, len * 0.045);
  leafBlade(ctx, tipX, tipY, hand.angle, len * 0.2, len * 0.065, headColor);
}

function swordWeapon(a: AssetDrawArgs, hand: HandAnchor, len: number, bladeColor: string, hiltColor: string): void {
  const { ctx } = a;
  weaponShaft(ctx, hand.x, hand.y, hand.x - Math.cos(hand.angle) * len * 0.1, hand.y - Math.sin(hand.angle) * len * 0.1, hiltColor, len * 0.09);
  straightBlade(ctx, hand.x, hand.y, hand.angle, len * 0.85, len * 0.06, bladeColor);
  const nx = Math.cos(hand.angle + Math.PI / 2) * len * 0.1, ny = Math.sin(hand.angle + Math.PI / 2) * len * 0.1;
  weaponShaft(ctx, hand.x - nx, hand.y - ny, hand.x + nx, hand.y + ny, hiltColor, len * 0.05);
}

function daggerWeapon(a: AssetDrawArgs, hand: HandAnchor, len: number, bladeColor: string): void {
  straightBlade(a.ctx, hand.x, hand.y, hand.angle, len, len * 0.16, bladeColor);
}

function maceWeapon(a: AssetDrawArgs, hand: HandAnchor, len: number, shaftColor: string, headColor: string): void {
  const { ctx } = a;
  const tipX = hand.x + Math.cos(hand.angle) * len, tipY = hand.y + Math.sin(hand.angle) * len;
  weaponShaft(ctx, hand.x, hand.y, tipX, tipY, shaftColor, len * 0.07);
  ctx.fillStyle = headColor;
  ctx.beginPath(); ctx.arc(tipX, tipY, len * 0.15, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 6; i++) {
    const fa = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(tipX + Math.cos(fa) * len * 0.13, tipY + Math.sin(fa) * len * 0.13, len * 0.05, len * 0.08, fa, 0, Math.PI * 2);
    ctx.fill();
  }
}

function axeWeapon(a: AssetDrawArgs, hand: HandAnchor, len: number, shaftColor: string, headColor: string, doubleBladed: boolean): void {
  const { ctx } = a;
  const tipX = hand.x + Math.cos(hand.angle) * len, tipY = hand.y + Math.sin(hand.angle) * len;
  weaponShaft(ctx, hand.x, hand.y, tipX, tipY, shaftColor, len * 0.06);
  const sides = doubleBladed ? [-1, 1] : [1];
  for (const s of sides) {
    const nx = Math.cos(hand.angle + Math.PI / 2) * s, ny = Math.sin(hand.angle + Math.PI / 2) * s;
    const backX = tipX - Math.cos(hand.angle) * len * 0.22, backY = tipY - Math.sin(hand.angle) * len * 0.22;
    ctx.beginPath();
    ctx.moveTo(tipX + Math.cos(hand.angle) * len * 0.08, tipY + Math.sin(hand.angle) * len * 0.08);
    ctx.quadraticCurveTo(tipX + nx * len * 0.32, tipY + ny * len * 0.32, backX + nx * len * 0.16, backY + ny * len * 0.16);
    ctx.lineTo(backX, backY);
    ctx.closePath();
    ctx.fillStyle = headColor;
    ctx.fill();
  }
}

function clubWeapon(ctx: CanvasRenderingContext2D, hand: HandAnchor, len: number, color: string): void {
  const tipX = hand.x + Math.cos(hand.angle) * len, tipY = hand.y + Math.sin(hand.angle) * len;
  weaponShaft(ctx, hand.x, hand.y, tipX, tipY, color, len * 0.1);
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(hand.angle);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, 0, len * 0.1, len * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Returns the orb's position so a caller can lay a glow over it. */
function staffWeapon(a: AssetDrawArgs, hand: HandAnchor, len: number, shaftColor: string, orbColor: string): { x: number; y: number } {
  const { ctx } = a;
  const tipX = hand.x + Math.cos(hand.angle) * len, tipY = hand.y + Math.sin(hand.angle) * len;
  weaponShaft(ctx, hand.x, hand.y, tipX, tipY, shaftColor, len * 0.06);
  ctx.fillStyle = orbColor;
  ctx.beginPath(); ctx.arc(tipX, tipY, len * 0.12, 0, Math.PI * 2); ctx.fill();
  return { x: tipX, y: tipY };
}

/** A bow held drawn-back — a "(" curve plus a straight string, not a hairline. */
function bowShape(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number, color: string): void {
  const r = len * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, len * 0.09);
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI * 0.38, Math.PI * 0.38);
  ctx.stroke();
  ctx.strokeStyle = rgba('#e8e2d0', 0.8);
  ctx.lineWidth = Math.max(1, len * 0.025);
  ctx.beginPath();
  ctx.moveTo(Math.cos(-Math.PI * 0.38) * r, Math.sin(-Math.PI * 0.38) * r);
  ctx.lineTo(Math.cos(Math.PI * 0.38) * r, Math.sin(Math.PI * 0.38) * r);
  ctx.stroke();
  ctx.restore();
}

function kiteShield(a: AssetDrawArgs, x: number, y: number, r: number, faceColor: string, emblemColor: string): void {
  const { ctx, palette } = a;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.9, y - r * 0.5, x + r * 0.65, y + r * 0.4);
  ctx.quadraticCurveTo(x, y + r * 1.1, x - r * 0.65, y + r * 0.4);
  ctx.quadraticCurveTo(x - r * 0.9, y - r * 0.5, x, y - r);
  ctx.closePath();
  ctx.fillStyle = faceColor;
  ctx.fill();
  ctx.strokeStyle = rgba(palette.ink, 0.6);
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.stroke();
  ctx.fillStyle = emblemColor;
  ctx.beginPath(); ctx.arc(x, y - r * 0.05, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The roster
// ---------------------------------------------------------------------------

export const CREATURE_ASSETS: AssetDef[] = [

  // === Humanoid ============================================================
  {
    id: 'cre/adventurer', label: 'Adventurer', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'hero', 'pc', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 3,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 3;
      const tunic = teamColor(a, ['#3a6b4a', '#3a5a8a', '#7a3a3a'][v]);
      const body = humanoidBody(a, cx, cy, r, tunic, { skin: '#caa06e' });
      swordWeapon(a, body.rightHand, r * 0.85, STEEL, '#4a3a2a');
      kiteShield(a, body.leftHand.x, body.leftHand.y, r * 0.34, tunic, mix(tunic, '#ffffff', 0.5));
    },
  },
  {
    id: 'cre/guard', label: 'Guard', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'guard', 'soldier', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon', 'city'],
    draw(a) {
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const surcoat = teamColor(a, v === 0 ? '#7a2a2a' : '#2a4a7a');
      const body = humanoidBody(a, cx, cy, r, surcoat, { skin: '#c9895a', headColor: STEEL_DARK });
      spearWeapon(a, body.rightHand, r * 1.1, WOOD, STEEL);
      kiteShield(a, body.leftHand.x, body.leftHand.y, r * 0.3, surcoat, mix(surcoat, '#e8d9b5', 0.6));
    },
  },
  {
    id: 'cre/knight', label: 'Knight', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'knight', 'plate', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const plate = mix(STEEL, '#ffffff', v === 0 ? 0.08 : 0.2);
      const body = humanoidBody(a, cx, cy, r, plate, { skin: plate, headColor: mix(STEEL, '#000000', 0.25), armSpread: 0.5 });
      const tabard = teamColor(a, '#7a2a2a');
      ctx.fillStyle = tabard;
      roundRect(ctx, cx - r * 0.12, body.shoulderY - r * 0.02, r * 0.24, r * 0.4, r * 0.04);
      ctx.fill();
      swordWeapon(a, body.rightHand, r * 0.95, STEEL, mix('#4a3a2a', tabard, 0.3));
    },
  },
  {
    id: 'cre/archer', label: 'Archer', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'archer', 'ranged', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const cloak = teamColor(a, v === 0 ? '#3a6b4a' : '#5a4a2a');
      const body = humanoidBody(a, cx, cy, r, cloak, { skin: '#caa06e', armSpread: 0.35 });
      bowShape(a.ctx, body.leftHand.x, body.leftHand.y, body.leftHand.angle, r * 0.9, WOOD);
      weaponShaft(a.ctx, body.rightHand.x, body.rightHand.y, body.leftHand.x, body.leftHand.y, '#c9a06a', r * 0.02);
    },
  },
  {
    id: 'cre/mage', label: 'Mage', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'mage', 'caster', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 3,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 3;
      const glow = ['#8ad0ff', '#ffb46a', '#c08aff'][v];
      const robe = teamColor(a, ['#3a2a6b', '#6b2a5a', '#2a4a6b'][v]);
      const body = humanoidBody(a, cx, cy, r, robe, { skin: '#caa06e', headColor: robe });
      ctx.fillStyle = mix(robe, '#000000', 0.15);
      ctx.beginPath();
      ctx.moveTo(body.headX, body.headY - body.headR * 1.9);
      ctx.lineTo(body.headX - body.headR * 0.85, body.headY - body.headR * 0.2);
      ctx.lineTo(body.headX + body.headR * 0.85, body.headY - body.headR * 0.2);
      ctx.closePath();
      ctx.fill();
      const tip = staffWeapon(a, body.rightHand, r * 0.95, WOOD, glow);
      radialGlow(ctx, tip.x, tip.y, r * 0.35, glow, 0.55);
    },
  },
  {
    id: 'cre/rogue', label: 'Rogue', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'rogue', 'stealth', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const leather = teamColor(a, v === 0 ? '#3a3a3a' : '#2a2a3a');
      const body = humanoidBody(a, cx, cy, r, leather, { skin: '#c9895a', headColor: mix(leather, '#000000', 0.2), armSpread: 0.4 });
      daggerWeapon(a, body.leftHand, r * 0.4, STEEL);
      daggerWeapon(a, body.rightHand, r * 0.4, STEEL);
    },
  },
  {
    id: 'cre/cleric', label: 'Cleric', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'cleric', 'healer', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const robe = teamColor(a, v === 0 ? '#c9a227' : '#8a8a8a');
      const body = humanoidBody(a, cx, cy, r, robe, { skin: '#caa06e', headColor: robe });
      maceWeapon(a, body.rightHand, r * 0.85, WOOD, mix(STEEL, '#c9a227', 0.4));
      const sym = star(cx, body.shoulderY + r * 0.08, r * 0.12, r * 0.05, 8);
      fillPath(ctx, sym, '#e8d9b5');
    },
  },
  {
    id: 'cre/bandit', label: 'Bandit', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'bandit', 'brigand', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 3,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 3;
      const cloth = teamColor(a, ['#5a4a2a', '#3a3a3a', '#4a5a3a'][v]);
      const body = humanoidBody(a, cx, cy, r, cloth, { skin: '#c9895a', headColor: mix(cloth, '#000000', 0.3) });
      daggerWeapon(a, body.rightHand, r * 0.42, STEEL_DARK);
    },
  },
  {
    id: 'cre/villager', label: 'Villager', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'villager', 'commoner', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 3,
    kinds: ['battle', 'city'],
    draw(a) {
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 3;
      const cloth = teamColor(a, ['#7a6a4a', '#4a6a7a', '#6a4a5a'][v]);
      humanoidBody(a, cx, cy, r, cloth, { skin: '#e0b98a', armSpread: 0.4 });
    },
  },
  {
    id: 'cre/dwarf', label: 'Dwarf', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'dwarf', 'axe', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const tunic = teamColor(a, v === 0 ? '#7a3a2a' : '#2a4a3a');
      const body = humanoidBody(a, cx, cy, r, tunic, { skin: '#d0a878', headColor: '#8a6a4a', armSpread: 0.6, armLen: 0.5 });
      axeWeapon(a, body.rightHand, r * 0.7, WOOD, STEEL, false);
      ctx.fillStyle = '#c9b98a';
      ctx.beginPath();
      ctx.ellipse(body.headX, body.headY + body.headR * 0.7, body.headR * 0.7, body.headR * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'cre/elf', label: 'Elf', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'elf', 'archer', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const cloak = teamColor(a, v === 0 ? '#2a5a4a' : '#4a3a6a');
      const body = humanoidBody(a, cx, cy, r, cloak, { skin: '#e0c8a0', armSpread: 0.35 });
      bowShape(ctx, body.leftHand.x, body.leftHand.y, body.leftHand.angle, r * 0.95, mix(WOOD, '#e8d9b5', 0.3));
      ctx.fillStyle = '#e0c8a0';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(body.headX + side * body.headR * 0.8, body.headY - body.headR * 0.1);
        ctx.lineTo(body.headX + side * body.headR * 1.5, body.headY - body.headR * 0.5);
        ctx.lineTo(body.headX + side * body.headR * 0.6, body.headY - body.headR * 0.6);
        ctx.closePath();
        ctx.fill();
      }
    },
  },
  {
    id: 'cre/barbarian', label: 'Barbarian', group: 'creatures', sub: 'Humanoid',
    tags: ['humanoid', 'barbarian', 'greataxe', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const fur = teamColor(a, v === 0 ? '#6a4a2a' : '#4a3a2a');
      const body = humanoidBody(a, cx, cy, r, '#c9895a', { skin: '#c9895a', armSpread: 0.7, armLen: 0.7 });
      ctx.fillStyle = fur;
      ctx.beginPath(); ctx.ellipse(cx, body.shoulderY, r * 0.5, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      axeWeapon(a, body.rightHand, r * 1.0, WOOD, STEEL, true);
    },
  },

  // === Monstrous ============================================================
  {
    id: 'cre/goblin', label: 'Goblin', group: 'creatures', sub: 'Monstrous',
    tags: ['monstrous', 'goblin', 'small'], aspect: 1, defaultWidth: SIZE_WIDTH.small, variants: 3,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'small');
      const v = a.variant % 3;
      const hide = teamColor(a, ['#5a7a3a', '#4a6a3a', '#6a8a4a'][v]);
      const body = humanoidBody(a, cx, cy, r, hide, { skin: '#7a9a4a', headColor: '#6a9a4a', armSpread: 0.6, armLen: 0.5 });
      daggerWeapon(a, body.rightHand, r * 0.4, STEEL_DARK);
      ctx.fillStyle = '#6a9a4a';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(body.headX + side * body.headR * 0.7, body.headY);
        ctx.lineTo(body.headX + side * body.headR * 1.5, body.headY - body.headR * 0.3);
        ctx.lineTo(body.headX + side * body.headR * 0.5, body.headY + body.headR * 0.35);
        ctx.closePath();
        ctx.fill();
      }
    },
  },
  {
    id: 'cre/orc', label: 'Orc', group: 'creatures', sub: 'Monstrous',
    tags: ['monstrous', 'orc', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const hide = teamColor(a, v === 0 ? '#5a6a3a' : '#4a5a3a');
      const body = humanoidBody(a, cx, cy, r, hide, { skin: '#6a8a4a', headColor: '#5a7a3a', armSpread: 0.6 });
      axeWeapon(a, body.rightHand, r * 0.8, WOOD, STEEL, false);
      ctx.fillStyle = '#e8e2d0';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(body.headX + side * body.headR * 0.3, body.headY + body.headR * 0.5);
        ctx.lineTo(body.headX + side * body.headR * 0.55, body.headY + body.headR * 0.85);
        ctx.lineTo(body.headX + side * body.headR * 0.15, body.headY + body.headR * 0.7);
        ctx.closePath();
        ctx.fill();
      }
    },
  },
  {
    id: 'cre/kobold', label: 'Kobold', group: 'creatures', sub: 'Monstrous',
    tags: ['monstrous', 'kobold', 'small'], aspect: 1, defaultWidth: SIZE_WIDTH.small, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'small');
      const v = a.variant % 2;
      const hide = teamColor(a, v === 0 ? '#8a5a3a' : '#7a6a3a');
      const body = humanoidBody(a, cx, cy, r, hide, { skin: '#9a6a3a', headColor: '#8a5a3a', armSpread: 0.5, armLen: 0.5 });
      spearWeapon(a, body.rightHand, r * 0.85, WOOD, STEEL_DARK);
      ctx.strokeStyle = hide;
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy + body.torsoR * 0.6);
      ctx.quadraticCurveTo(cx + r * 0.3, cy + r * 0.5, cx + r * 0.1, cy + r * 0.7);
      ctx.stroke();
    },
  },
  {
    id: 'cre/gnoll', label: 'Gnoll', group: 'creatures', sub: 'Monstrous',
    tags: ['monstrous', 'gnoll', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const hide = teamColor(a, v === 0 ? '#9a7a3a' : '#8a6a3a');
      const body = humanoidBody(a, cx, cy, r, hide, { skin: '#9a7a3a', headColor: '#8a6a3a', armSpread: 0.55 });
      spearWeapon(a, body.rightHand, r * 0.95, WOOD, STEEL);
      ctx.fillStyle = mix(hide, '#000000', 0.15);
      ctx.beginPath();
      ctx.ellipse(body.headX, body.headY + body.headR * 0.7, body.headR * 0.4, body.headR * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'cre/ogre', label: 'Ogre', group: 'creatures', sub: 'Monstrous',
    tags: ['monstrous', 'ogre', 'large'], aspect: 1, defaultWidth: SIZE_WIDTH.large, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { cx, cy, r } = tokenBase(a, 'large');
      const v = a.variant % 2;
      const hide = teamColor(a, v === 0 ? '#7a8a5a' : '#6a7a4a');
      const body = humanoidBody(a, cx, cy, r, hide, { skin: hide, headColor: mix(hide, '#000000', 0.2), armSpread: 0.65, armLen: 0.6 });
      clubWeapon(a.ctx, body.rightHand, r * 0.9, WOOD);
    },
  },
  {
    id: 'cre/troll', label: 'Troll', group: 'creatures', sub: 'Monstrous',
    tags: ['monstrous', 'troll', 'large'], aspect: 1, defaultWidth: SIZE_WIDTH.large, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'large');
      const v = a.variant % 2;
      const hide = teamColor(a, v === 0 ? '#4a6a5a' : '#5a6a4a');
      const body = humanoidBody(a, cx, cy, r, hide, { skin: hide, headColor: mix(hide, '#000000', 0.15), armSpread: 0.7, armLen: 0.75, hunch: 0.3 });
      ctx.fillStyle = '#e8e2d0';
      for (const hand of [body.leftHand, body.rightHand]) {
        ctx.beginPath(); ctx.arc(hand.x, hand.y, r * 0.08, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  {
    id: 'cre/giant', label: 'Giant', group: 'creatures', sub: 'Monstrous',
    tags: ['monstrous', 'giant', 'huge'], aspect: 1, defaultWidth: SIZE_WIDTH.huge, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { cx, cy, r } = tokenBase(a, 'huge');
      const v = a.variant % 2;
      const tunic = teamColor(a, v === 0 ? '#8a6a4a' : '#6a7a8a');
      const body = humanoidBody(a, cx, cy, r, tunic, { skin: '#c9a878', armSpread: 0.6, armLen: 0.62 });
      clubWeapon(a.ctx, body.rightHand, r * 1.1, WOOD);
    },
  },
  {
    id: 'cre/lizardfolk', label: 'Lizardfolk', group: 'creatures', sub: 'Monstrous',
    tags: ['monstrous', 'lizardfolk', 'reptile', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const hide = teamColor(a, v === 0 ? '#3a6a5a' : '#4a7a4a');
      const body = humanoidBody(a, cx, cy, r, hide, { skin: hide, headColor: mix(hide, '#000000', 0.1), armSpread: 0.55 });
      spearWeapon(a, body.rightHand, r * 0.9, WOOD, STEEL);
      ctx.strokeStyle = hide;
      ctx.lineWidth = Math.max(2, r * 0.1);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy + body.torsoR * 0.6);
      ctx.quadraticCurveTo(cx + r * 0.35, cy + r * 0.6, cx + r * 0.15, cy + r * 0.85);
      ctx.stroke();
    },
  },
  {
    id: 'cre/minotaur', label: 'Minotaur', group: 'creatures', sub: 'Monstrous',
    tags: ['monstrous', 'minotaur', 'large'], aspect: 1, defaultWidth: SIZE_WIDTH.large, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'large');
      const v = a.variant % 2;
      const hide = teamColor(a, v === 0 ? '#6a4a3a' : '#5a3a2a');
      const body = humanoidBody(a, cx, cy, r, hide, { skin: hide, headColor: mix(hide, '#000000', 0.2), armSpread: 0.6 });
      axeWeapon(a, body.rightHand, r * 1.0, WOOD, STEEL, true);
      ctx.strokeStyle = '#e8e2d0';
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(body.headX + side * body.headR * 0.5, body.headY - body.headR * 0.5);
        ctx.quadraticCurveTo(body.headX + side * body.headR * 1.4, body.headY - body.headR * 1.0, body.headX + side * body.headR * 1.6, body.headY - body.headR * 0.3);
        ctx.stroke();
      }
    },
  },

  // === Undead ===============================================================
  {
    id: 'cre/skeleton', label: 'Skeleton Warrior', group: 'creatures', sub: 'Undead',
    tags: ['undead', 'skeleton', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const gear = teamColor(a, v === 0 ? '#5a4a3a' : '#3a3a4a');
      const body = humanoidBody(a, cx, cy, r, BONE, { skin: BONE, headColor: BONE, armSpread: 0.55 });
      swordWeapon(a, body.rightHand, r * 0.85, STEEL_DARK, gear);
      ctx.fillStyle = '#1a1512';
      ctx.beginPath(); ctx.arc(body.headX - body.headR * 0.35, body.headY, body.headR * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(body.headX + body.headR * 0.35, body.headY, body.headR * 0.18, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'cre/zombie', label: 'Zombie', group: 'creatures', sub: 'Undead',
    tags: ['undead', 'zombie', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const rot = teamColor(a, mix('#5a6a4a', '#3a4a3a', v * 0.4));
      const body = humanoidBody(a, cx, cy, r, rot, { skin: '#7a8a6a', headColor: '#6a7a5a', armSpread: 0.22, armLen: 0.5, hunch: 0.4 });
      ctx.fillStyle = '#1a1512';
      ctx.beginPath(); ctx.arc(body.headX - body.headR * 0.3, body.headY, body.headR * 0.15, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'cre/ghost', label: 'Ghost', group: 'creatures', sub: 'Undead',
    tags: ['undead', 'ghost', 'incorporeal', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx, rng } = a;
      ctx.save();
      ctx.globalAlpha = 0.55;
      const { cx, cy, r } = tokenBase(a, 'medium', { shadow: false });
      const v = a.variant % 2;
      const shroud = teamColor(a, v === 0 ? '#cfe0e8' : '#d8cfe8');
      humanoidBody(a, cx, cy, r, shroud, { skin: shroud, headColor: mix(shroud, '#ffffff', 0.3), armSpread: 0.5 });
      const wisp = blob(cx, cy + r * 0.5, r * 0.4, r * 0.35, 5, 0.3, rng);
      fillPath(ctx, wisp, rgba(shroud, 0.4));
      ctx.restore();
    },
  },
  {
    id: 'cre/wight', label: 'Wight', group: 'creatures', sub: 'Undead',
    tags: ['undead', 'wight', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const cloak = teamColor(a, v === 0 ? '#2a2a3a' : '#3a2a3a');
      const body = humanoidBody(a, cx, cy, r, cloak, { skin: '#8a9aa0', headColor: '#8a9aa0', armSpread: 0.5 });
      swordWeapon(a, body.rightHand, r * 0.9, mix(STEEL, '#7ac8ff', 0.3), cloak);
      radialGlow(ctx, body.headX, body.headY, body.headR * 1.4, '#6ad0ff', 0.6);
    },
  },
  {
    id: 'cre/skeletal-hound', label: 'Skeletal Hound', group: 'creatures', sub: 'Undead',
    tags: ['undead', 'skeleton', 'hound', 'small'], aspect: 1, defaultWidth: SIZE_WIDTH.small, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'small');
      const v = a.variant % 2;
      const collar = teamColor(a, v === 0 ? '#5a4a3a' : '#3a3a4a');
      const anchors = quadrupedBody(a, cx, cy, r, BONE, { tailLen: 0.6, snoutLen: 0.22, legColor: BONE_DARK });
      ctx.strokeStyle = collar;
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.beginPath(); ctx.arc(cx, cy - anchors.bodyR * 0.3, anchors.bodyR * 0.5, 0, Math.PI * 2); ctx.stroke();
      radialGlow(ctx, anchors.headX, anchors.headY, anchors.headR * 1.6, '#6ad0ff', 0.55);
    },
  },

  // === Beast ================================================================
  {
    id: 'cre/wolf', label: 'Wolf', group: 'creatures', sub: 'Beast',
    tags: ['beast', 'wolf', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const fur = v === 0 ? '#6a6560' : '#8a7a5a';
      const anchors = quadrupedBody(a, cx, cy, r, fur, { tailLen: 0.65, snoutLen: 0.22 });
      ctx.fillStyle = fur;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(anchors.headX + side * anchors.headR * 0.5, anchors.headY - anchors.headR * 0.6);
        ctx.lineTo(anchors.headX + side * anchors.headR * 0.9, anchors.headY - anchors.headR * 1.4);
        ctx.lineTo(anchors.headX + side * anchors.headR * 0.1, anchors.headY - anchors.headR * 0.7);
        ctx.closePath();
        ctx.fill();
      }
    },
  },
  {
    id: 'cre/dire-bear', label: 'Dire Bear', group: 'creatures', sub: 'Beast',
    tags: ['beast', 'bear', 'large'], aspect: 1, defaultWidth: SIZE_WIDTH.large, variants: 2,
    kinds: ['battle'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'large');
      const v = a.variant % 2;
      const fur = v === 0 ? '#4a3a2a' : '#3a2a1a';
      const anchors = quadrupedBody(a, cx, cy, r, fur, { tailLen: 0.3, snoutLen: 0.2, legColor: mix(fur, '#000000', 0.3) });
      ctx.fillStyle = fur;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(anchors.headX + side * anchors.headR * 0.7, anchors.headY - anchors.headR * 0.8, anchors.headR * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    id: 'cre/giant-spider', label: 'Giant Spider', group: 'creatures', sub: 'Beast',
    tags: ['beast', 'spider', 'large'], aspect: 1, defaultWidth: SIZE_WIDTH.large, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, rng, palette } = a;
      const { cx, cy, r } = tokenBase(a, 'large');
      const v = a.variant % 2;
      const body = v === 0 ? '#2a2420' : '#3a2a3a';
      ctx.strokeStyle = mix(body, '#000000', 0.1);
      ctx.lineWidth = Math.max(2, r * 0.07);
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const legAng = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const kneeX = cx + Math.cos(legAng) * r * 0.55, kneeY = cy + Math.sin(legAng) * r * 0.55;
        const footX = cx + Math.cos(legAng) * r * 0.92, footY = cy + Math.sin(legAng) * r * 0.92;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(kneeX, kneeY); ctx.lineTo(footX, footY); ctx.stroke();
      }
      const abd = blob(cx + r * 0.18, cy + r * 0.18, r * 0.38, r * 0.34, 6, 0.12, rng);
      fillPath(ctx, abd, lightGradient(ctx, cx, cy, cx + r * 0.4, cy + r * 0.4, body, 0.2, 0.3));
      const head = blob(cx - r * 0.22, cy - r * 0.22, r * 0.24, r * 0.22, 6, 0.1, rng);
      fillPath(ctx, head, mix(body, '#000000', 0.1));
      inkLine(ctx, abd, rgba(palette.ink, 0.5), Math.max(1, r * 0.02), true);
      ctx.fillStyle = '#e8302a';
      for (let i = 0; i < 4; i++) {
        const eyeAng = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx - r * 0.22 + Math.cos(eyeAng) * r * 0.08, cy - r * 0.22 + Math.sin(eyeAng) * r * 0.08, r * 0.025, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    id: 'cre/giant-rat', label: 'Giant Rat', group: 'creatures', sub: 'Beast',
    tags: ['beast', 'rat', 'small'], aspect: 1, defaultWidth: SIZE_WIDTH.small, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'small');
      const v = a.variant % 2;
      const fur = v === 0 ? '#6a5a4a' : '#5a4a3a';
      const anchors = quadrupedBody(a, cx, cy, r, fur, { tailLen: 0.9, snoutLen: 0.24, legColor: mix(fur, '#000000', 0.2) });
      ctx.fillStyle = mix(fur, '#000000', 0.1);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(anchors.headX + side * anchors.headR * 0.7, anchors.headY - anchors.headR * 0.3, anchors.headR * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    id: 'cre/horse', label: 'Horse', group: 'creatures', sub: 'Beast',
    tags: ['beast', 'horse', 'mount', 'large'], aspect: 1, defaultWidth: SIZE_WIDTH.large, variants: 2,
    kinds: ['battle', 'city'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'large');
      const v = a.variant % 2;
      const coat = v === 0 ? '#7a5a3a' : '#3a2a1a';
      const anchors = quadrupedBody(a, cx, cy, r, coat, { tailLen: 0.8, snoutLen: 0.32, legColor: mix(coat, '#000000', 0.3) });
      ctx.strokeStyle = mix(coat, '#000000', 0.4);
      ctx.lineWidth = Math.max(2, r * 0.1);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(anchors.headX, anchors.headY + anchors.headR * 0.5);
      ctx.lineTo(cx, cy - anchors.bodyR * 0.8);
      ctx.stroke();
    },
  },
  {
    id: 'cre/warhorse', label: 'Warhorse', group: 'creatures', sub: 'Beast',
    tags: ['beast', 'horse', 'mount', 'barding', 'large'], aspect: 1, defaultWidth: SIZE_WIDTH.large, variants: 2,
    kinds: ['battle'],
    draw(a) {
      const { ctx, palette } = a;
      const { cx, cy, r } = tokenBase(a, 'large');
      const v = a.variant % 2;
      const coat = v === 0 ? '#4a3a2a' : '#6a5a3a';
      const anchors = quadrupedBody(a, cx, cy, r, coat, { tailLen: 0.7, snoutLen: 0.3, legColor: mix(coat, '#000000', 0.3) });
      const barding = teamColor(a, '#7a2a2a');
      ctx.fillStyle = barding;
      ctx.beginPath(); ctx.ellipse(cx, cy, anchors.bodyR * 0.85, anchors.bodyR * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(palette.ink, 0.5);
      ctx.lineWidth = Math.max(1, r * 0.02);
      ctx.stroke();
    },
  },
  {
    id: 'cre/boar', label: 'Boar', group: 'creatures', sub: 'Beast',
    tags: ['beast', 'boar', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle'],
    draw(a) {
      const { ctx } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const hide = v === 0 ? '#4a3a2a' : '#3a2a1a';
      const anchors = quadrupedBody(a, cx, cy, r, hide, { tailLen: 0.25, snoutLen: 0.3, legColor: mix(hide, '#000000', 0.3) });
      ctx.fillStyle = '#e8e2d0';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(anchors.headX + side * anchors.headR * 0.3, anchors.headY + anchors.headR * 0.9);
        ctx.lineTo(anchors.headX + side * anchors.headR * 0.6, anchors.headY + anchors.headR * 1.3);
        ctx.lineTo(anchors.headX + side * anchors.headR * 0.15, anchors.headY + anchors.headR * 1.0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = mix(hide, '#000000', 0.4);
      ctx.lineWidth = Math.max(1, r * 0.03);
      ctx.beginPath();
      ctx.moveTo(cx, cy - anchors.bodyR * 0.5);
      ctx.lineTo(cx, cy + anchors.bodyR * 0.5);
      ctx.stroke();
    },
  },
  {
    id: 'cre/giant-snake', label: 'Giant Snake', group: 'creatures', sub: 'Beast',
    tags: ['beast', 'snake', 'serpent', 'large'], aspect: 1, defaultWidth: SIZE_WIDTH.large, variants: 2,
    kinds: ['battle', 'cave'],
    draw(a) {
      const { ctx, palette } = a;
      const { cx, cy, r } = tokenBase(a, 'large');
      const v = a.variant % 2;
      const scale = v === 0 ? '#3a6a4a' : '#5a4a6a';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const turns = 2.3;
      const n = 40;
      const pts: Vec2[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const ang = t * Math.PI * 2 * turns;
        const rad = r * 0.75 * (1 - t * 0.6);
        pts.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad * 0.9 });
      }
      for (let i = 1; i < pts.length; i++) {
        const t = i / pts.length;
        ctx.strokeStyle = scale;
        ctx.lineWidth = Math.max(2, r * 0.22 * (1 - t * 0.7));
        ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      }
      inkLine(ctx, pts, rgba(palette.ink, 0.35), Math.max(1, r * 0.02));
      ctx.fillStyle = mix(scale, '#000000', 0.1);
      ctx.beginPath(); ctx.ellipse(pts[0].x, pts[0].y, r * 0.16, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8302a';
      ctx.beginPath(); ctx.arc(pts[0].x - r * 0.05, pts[0].y - r * 0.05, r * 0.02, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'cre/eagle', label: 'Eagle', group: 'creatures', sub: 'Beast',
    tags: ['beast', 'eagle', 'raptor', 'bird', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle'],
    draw(a) {
      const { ctx, rng, palette } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 2;
      const plumage = v === 0 ? '#5a4a3a' : '#7a6a4a';
      for (const side of [-1, 1]) {
        const wing = blob(cx + side * r * 0.55, cy, r * 0.55, r * 0.28, 5, 0.16, rng);
        fillPath(ctx, wing, lightGradient(ctx, cx, cy - r * 0.3, cx, cy + r * 0.3, plumage, 0.2, 0.3));
        inkLine(ctx, wing, rgba(palette.ink, 0.5), Math.max(1, r * 0.025), true);
      }
      ctx.fillStyle = mix(plumage, '#000000', 0.1);
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.18, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8e2d0';
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.34, r * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c9a227';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.46); ctx.lineTo(cx - r * 0.06, cy - r * 0.36); ctx.lineTo(cx + r * 0.06, cy - r * 0.36);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = plumage;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.14, cy + r * 0.3); ctx.lineTo(cx + r * 0.14, cy + r * 0.3); ctx.lineTo(cx, cy + r * 0.55);
      ctx.closePath(); ctx.fill();
    },
  },

  // === Aberrant =============================================================
  {
    id: 'cre/ooze', label: 'Gelatinous Ooze', group: 'creatures', sub: 'Aberrant',
    tags: ['aberrant', 'ooze', 'blob', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 3,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx, rng, palette } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const v = a.variant % 3;
      const hue = [palette.grass, palette.swamp, palette.accent][v];
      ctx.save();
      ctx.globalAlpha = 0.75;
      const pts = blob(cx, cy, r * 0.7, r * 0.65, 6, 0.2, rng);
      fillPath(ctx, pts, lightGradient(ctx, cx - r * 0.6, cy - r * 0.6, cx + r * 0.6, cy + r * 0.6, hue, 0.3, 0.2));
      inkLine(ctx, pts, rgba(palette.ink, 0.5), Math.max(1, r * 0.03), true);
      ctx.restore();
      for (let i = 0; i < 6; i++) {
        const bAng = rng.float(0, Math.PI * 2), d = rng.float(0, r * 0.5);
        ctx.fillStyle = rgba('#ffffff', 0.35);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(bAng) * d, cy + Math.sin(bAng) * d, r * rng.float(0.04, 0.09), 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    id: 'cre/fire-elemental', label: 'Fire Elemental', group: 'creatures', sub: 'Aberrant',
    tags: ['aberrant', 'elemental', 'fire', 'glow', 'large'], aspect: 1, defaultWidth: SIZE_WIDTH.large, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx, rng } = a;
      const { cx, cy, r } = tokenBase(a, 'large');
      const v = a.variant % 2;
      const flame = v === 0 ? '#e0662a' : '#e02a3c';
      radialGlow(ctx, cx, cy, r * 1.6, flame, 0.5);
      const pts = blob(cx, cy, r * 0.68, r * 0.72, 7, 0.25, rng);
      fillPath(ctx, pts, lightGradient(ctx, cx, cy - r * 0.6, cx, cy + r * 0.6, flame, 0.35, 0.1));
      inkLine(ctx, pts, rgba('#3a1408', 0.6), Math.max(1, r * 0.025), true);
      const core = blob(cx, cy, r * 0.32, r * 0.34, 6, 0.2, rng);
      fillPath(ctx, core, '#ffd06a');
    },
  },
  {
    id: 'cre/earth-elemental', label: 'Earth Elemental', group: 'creatures', sub: 'Aberrant',
    tags: ['aberrant', 'elemental', 'earth', 'rock', 'large'], aspect: 1, defaultWidth: SIZE_WIDTH.large, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, rng, palette } = a;
      const { cx, cy, r } = tokenBase(a, 'large');
      const rock = palette.rock;
      const chunks = rng.int(6, 8);
      for (let i = 0; i < chunks; i++) {
        const chAng = rng.float(0, Math.PI * 2), d = rng.float(0, r * 0.5);
        const cr = r * rng.float(0.22, 0.4);
        const chCx = cx + Math.cos(chAng) * d, chCy = cy + Math.sin(chAng) * d;
        const pts = regularPolygon(chCx, chCy, cr, rng.int(5, 7), rng.float(0, Math.PI));
        fillPath(ctx, pts, lightGradient(ctx, chCx - cr, chCy - cr, chCx + cr, chCy + cr, rock, 0.3, 0.35));
        inkLine(ctx, pts, rgba(palette.ink, 0.5), Math.max(1, r * 0.02), true);
      }
      ctx.strokeStyle = rgba(palette.accent, 0.6);
      ctx.lineWidth = Math.max(1, r * 0.02);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + rng.float(-r * 0.3, r * 0.3), cy + rng.float(-r * 0.3, r * 0.3));
        ctx.lineTo(cx + rng.float(-r * 0.3, r * 0.3), cy + rng.float(-r * 0.3, r * 0.3));
        ctx.stroke();
      }
    },
  },
  {
    id: 'cre/treant', label: 'Treant', group: 'creatures', sub: 'Aberrant',
    tags: ['aberrant', 'treant', 'plant', 'huge'], aspect: 1, defaultWidth: SIZE_WIDTH.huge, variants: 2,
    kinds: ['battle', 'region'],
    draw(a) {
      const { ctx, rng, palette } = a;
      const { cx, cy, r } = tokenBase(a, 'huge');
      const v = a.variant % 2;
      const bark = v === 0 ? mix('#5a4530', '#3a2c1c', 0.3) : mix('#4a3a28', '#2a2018', 0.3);
      const canopyColor = palette.forest;
      ctx.strokeStyle = bark;
      ctx.lineCap = 'round';
      const arms = 5;
      for (let i = 0; i < arms; i++) {
        const armAng = (i / arms) * Math.PI * 2 + rng.float(-0.15, 0.15);
        ctx.lineWidth = Math.max(3, r * 0.12);
        const mx = cx + Math.cos(armAng) * r * 0.5, my = cy + Math.sin(armAng) * r * 0.5;
        const ex = cx + Math.cos(armAng + rng.float(-0.3, 0.3)) * r * 0.92, ey = cy + Math.sin(armAng + rng.float(-0.3, 0.3)) * r * 0.92;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      }
      const trunk = blob(cx, cy, r * 0.5, r * 0.48, 7, 0.14, rng);
      fillPath(ctx, trunk, lightGradient(ctx, cx - r * 0.4, cy - r * 0.4, cx + r * 0.4, cy + r * 0.4, bark, 0.25, 0.3));
      inkLine(ctx, trunk, rgba(palette.ink, 0.55), Math.max(1, r * 0.025), true);
      for (let i = 0; i < 6; i++) {
        const cAng = (i / 6) * Math.PI * 2, d = r * 0.28, cr = r * 0.22;
        fillPath(ctx, blob(cx + Math.cos(cAng) * d, cy + Math.sin(cAng) * d, cr, cr * 0.9, 6, 0.16, rng), mix(canopyColor, '#0d1c0d', 0.3));
      }
      ctx.fillStyle = rgba('#1a1512', 0.7);
      ctx.beginPath(); ctx.arc(cx - r * 0.1, cy - r * 0.05, r * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r * 0.1, cy - r * 0.05, r * 0.04, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'cre/dragon', label: 'Dragon', group: 'creatures', sub: 'Aberrant',
    tags: ['aberrant', 'dragon', 'wyrm', 'flying', 'huge'], aspect: 1, defaultWidth: SIZE_WIDTH.huge, variants: 3,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx, rng, palette } = a;
      const { cx, cy, r } = tokenBase(a, 'huge');
      const v = a.variant % 3;
      const scales = [
        { base: '#7a2a2a', belly: '#c9a227' },
        { base: '#2a5a3a', belly: '#c9c07a' },
        { base: '#2a2a3a', belly: '#5a5a6a' },
      ][v];
      const scale = teamColor(a, scales.base);

      // Tail first, so the body overlaps its root.
      ctx.strokeStyle = scale;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(3, r * 0.16);
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.3);
      ctx.quadraticCurveTo(cx + r * 0.5, cy + r * 0.75, cx + r * 0.2, cy + r * 1.05);
      ctx.stroke();
      ctx.lineWidth = Math.max(2, r * 0.07);
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.2, cy + r * 1.05);
      ctx.lineTo(cx + r * 0.36, cy + r * 1.2);
      ctx.stroke();

      // Wings, spread wide, behind the body.
      for (const side of [-1, 1]) {
        const shoulderX = cx + side * r * 0.2, shoulderY = cy - r * 0.1;
        const tipX = cx + side * r * 1.05, tipY = cy - r * 0.55;
        const lowX = cx + side * r * 0.85, lowY = cy + r * 0.35;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.quadraticCurveTo(cx + side * r * 0.75, cy - r * 0.65, tipX, tipY);
        ctx.quadraticCurveTo(cx + side * r * 1.0, cy - r * 0.05, lowX, lowY);
        ctx.quadraticCurveTo(cx + side * r * 0.5, cy + r * 0.15, shoulderX, shoulderY);
        ctx.closePath();
        ctx.fillStyle = lightGradient(ctx, shoulderX, shoulderY, tipX, tipY, mix(scale, '#000000', 0.15), 0.1, 0.35);
        ctx.fill();
        ctx.strokeStyle = rgba(palette.ink, 0.6);
        ctx.lineWidth = Math.max(1.2, r * 0.02);
        ctx.stroke();
        ctx.strokeStyle = rgba(palette.ink, 0.35);
        ctx.lineWidth = Math.max(1, r * 0.012);
        for (let k = 1; k <= 3; k++) {
          const t = k / 4;
          ctx.beginPath();
          ctx.moveTo(shoulderX, shoulderY);
          ctx.lineTo(shoulderX + (tipX - shoulderX) * t + side * r * 0.05, shoulderY + (lowY - shoulderY) * t);
          ctx.stroke();
        }
      }

      // Legs tucked to the sides of the body.
      ctx.fillStyle = mix(scale, '#000000', 0.25);
      for (const [dx, dy] of [[-0.32, 0.05], [0.32, 0.05], [-0.22, 0.35], [0.22, 0.35]] as const) {
        ctx.beginPath();
        ctx.ellipse(cx + r * dx, cy + r * dy, r * 0.1, r * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Body.
      const bodyPts = blob(cx, cy, r * 0.42, r * 0.62, 6, 0.08, rng);
      fillPath(ctx, bodyPts, lightGradient(ctx, cx - r * 0.4, cy - r * 0.5, cx + r * 0.4, cy + r * 0.5, scale, 0.22, 0.3));
      inkLine(ctx, bodyPts, rgba(palette.ink, 0.6), Math.max(1.2, r * 0.03), true);
      ctx.fillStyle = scales.belly;
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.1, r * 0.14, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head, horns and jaw, at the north end.
      const headY = cy - r * 0.62;
      ctx.fillStyle = scale;
      ctx.beginPath(); ctx.ellipse(cx, headY, r * 0.2, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(palette.ink, 0.6);
      ctx.lineWidth = Math.max(1, r * 0.02);
      ctx.stroke();
      ctx.fillStyle = mix(scale, '#000000', 0.3);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.1, headY + r * 0.12);
      ctx.lineTo(cx, headY + r * 0.34);
      ctx.lineTo(cx + r * 0.1, headY + r * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e8e2d0';
      ctx.lineWidth = Math.max(1.5, r * 0.05);
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * r * 0.1, headY - r * 0.16);
        ctx.quadraticCurveTo(cx + side * r * 0.28, headY - r * 0.4, cx + side * r * 0.22, headY - r * 0.55);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath(); ctx.arc(cx - r * 0.06, headY - r * 0.02, r * 0.03, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r * 0.06, headY - r * 0.02, r * 0.03, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'cre/bat-swarm', label: 'Swarm of Bats', group: 'creatures', sub: 'Aberrant',
    tags: ['aberrant', 'swarm', 'bat', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon', 'cave'],
    draw(a) {
      const { ctx, rng } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const n = rng.int(9, 14);
      for (let i = 0; i < n; i++) {
        const bAng = rng.float(0, Math.PI * 2), d = rng.float(0, r * 0.75);
        const x = cx + Math.cos(bAng) * d, y = cy + Math.sin(bAng) * d;
        const s = r * rng.float(0.09, 0.16);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rng.float(0, Math.PI * 2));
        ctx.fillStyle = mix('#2a2420', '#000000', rng.float(0, 0.3));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-s * 1.2, -s * 0.6, -s * 1.8, 0);
        ctx.quadraticCurveTo(-s * 0.6, -s * 0.15, 0, 0);
        ctx.quadraticCurveTo(s * 1.2, -s * 0.6, s * 1.8, 0);
        ctx.quadraticCurveTo(s * 0.6, -s * 0.15, 0, 0);
        ctx.fill();
        ctx.restore();
      }
    },
  },
  {
    id: 'cre/rat-swarm', label: 'Swarm of Rats', group: 'creatures', sub: 'Aberrant',
    tags: ['aberrant', 'swarm', 'rat', 'medium'], aspect: 1, defaultWidth: SIZE_WIDTH.medium, variants: 2,
    kinds: ['battle', 'dungeon'],
    draw(a) {
      const { ctx, rng } = a;
      const { cx, cy, r } = tokenBase(a, 'medium');
      const n = rng.int(8, 13);
      for (let i = 0; i < n; i++) {
        const rAng = rng.float(0, Math.PI * 2), d = rng.float(0, r * 0.7);
        const x = cx + Math.cos(rAng) * d, y = cy + Math.sin(rAng) * d;
        const s = r * rng.float(0.08, 0.14);
        const dir = rng.float(0, Math.PI * 2);
        const furColor = mix('#5a4a3a', '#3a2a1a', rng.float(0, 0.4));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(dir);
        ctx.fillStyle = furColor;
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.65, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = furColor;
        ctx.lineWidth = Math.max(1, s * 0.25);
        ctx.beginPath();
        ctx.moveTo(-s, 0);
        ctx.quadraticCurveTo(-s * 1.8, s * 0.3, -s * 2.2, 0);
        ctx.stroke();
        ctx.restore();
      }
    },
  },
];
