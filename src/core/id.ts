/** Compact, collision-resistant ids. Deterministic enough for a desktop app. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
let counter = 0;

export function uid(prefix = ''): string {
  counter = (counter + 1) % 0xffff;
  const rnd = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(rnd);
  else for (let i = 0; i < 8; i++) rnd[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[rnd[i] % ALPHABET.length];
  return `${prefix}${out}${counter.toString(36)}`;
}

/** Foundry document ids are exactly 16 alphanumeric characters. */
export function foundryId(): string {
  let out = '';
  const rnd = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(rnd);
  else for (let i = 0; i < 16; i++) rnd[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < 16; i++) out += ALPHABET[rnd[i] % ALPHABET.length];
  return out;
}
