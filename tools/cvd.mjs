/**
 * Dichromatic vision simulation and perceptual colour distance.
 *
 * Split out from the audit harness so the numbers can be checked without
 * booting a browser, and so the simulation used on a rendered map is provably
 * the same one used on the palette entries.
 *
 * The simulation is Viénot, Brettel & Mollon (1999): the missing cone's
 * response is reconstructed from the two that remain, which is what collapses
 * the red-green axis and leaves blue-yellow intact. It runs on linear-light
 * RGB, not on the gamma-encoded bytes.
 */
const srgbToLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

/**
 * Dichromatic simulation. `kind` is 'protan' or 'deutan'.
 *
 * The missing cone's response is reconstructed from the two that remain, which
 * is what collapses the red-green axis and leaves the blue-yellow one intact.
 */
export function simulate(rgb255, kind) {
  if (kind === 'normal') return rgb255.slice();
  const [r, g, b] = rgb255.map((v) => srgbToLinear(v / 255));
  const L = 17.8824 * r + 43.5161 * g + 4.11935 * b;
  const M = 3.45565 * r + 27.1554 * g + 3.86714 * b;
  const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b;
  let L2 = L, M2 = M;
  if (kind === 'protan') L2 = 2.02344 * M - 2.52581 * S;
  else M2 = 0.494207 * L + 1.24827 * S;
  const S2 = S;
  const rr = 0.080944 * L2 - 0.130504 * M2 + 0.116721 * S2;
  const gg = -0.0102485 * L2 + 0.0540194 * M2 - 0.113615 * S2;
  const bb = -0.000365294 * L2 - 0.00412163 * M2 + 0.693513 * S2;
  return [rr, gg, bb].map((v) => Math.round(clamp01(linearToSrgb(clamp01(v))) * 255));
}

function rgbToLab(rgb255) {
  const [r, g, b] = rgb255.map((v) => srgbToLinear(v / 255));
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.0;
  const Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000. */
export function deltaE(rgbA, rgbB) {
  const [L1, a1, b1] = rgbToLab(rgbA);
  const [L2, a2, b2] = rgbToLab(rgbB);
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (ap, bp) => { if (ap === 0 && bp === 0) return 0; const x = Math.atan2(bp, ap) * deg; return x < 0 ? x + 360 : x; };
  const h1p = h(a1p, b1), h2p = h(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
  else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
    + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
    + Rt * (dCp / Sc) * (dHp / Sh));
}


/** Smallest ΔE2000 across normal, protanopic and deuteranopic vision. */
export const worstDeltaE = (a, b) => Math.min(
  ...['normal', 'protan', 'deutan'].map((k) => deltaE(simulate(a, k), simulate(b, k))));
