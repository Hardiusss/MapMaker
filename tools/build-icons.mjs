/**
 * Turns a curated slice of game-icons.net into a generated source file.
 *
 * The icons are CC BY 3.0 single-path SVGs on a 512×512 grid, which is why
 * they suit this project: a path is not a picture. We keep the geometry and
 * throw the raster away, so an imported icon still draws at whatever size is
 * asked for, still takes the palette, and still recolours with a tint —
 * everything a bundled PNG library would have cost us.
 *
 * The upstream directory name is the author, so attribution is carried per
 * icon rather than as a blanket credit. See docs/THIRD-PARTY-NOTICES.md.
 *
 *   git clone --depth 1 https://github.com/game-icons/icons /tmp/gi
 *   node tools/build-icons.mjs /tmp/gi
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || '/tmp/gi';

/**
 * The curation. Four thousand icons is not a library, it is a haystack — most
 * of game-icons is sci-fi, modern weaponry and UI furniture that has no place
 * on a fantasy map. These are the ones that do.
 */
const CURATED = {
  'Heraldic charges': [
    'lion', 'eagle-emblem', 'eagle-head', 'dragon-head', 'wolf-head', 'bear-head', 'stag-head',
    'boar', 'raven', 'horse-head', 'unicorn', 'griffin-symbol', 'sea-serpent',
    'fleur-de-lys', 'rose', 'oak-leaf', 'trefoil-lily', 'shamrock', 'sun', 'crescent-blade',
    'crown', 'tower-flag', 'castle', 'key', 'chalice-drops', 'anvil', 'broadsword',
    'crossed-swords', 'axe-in-stump', 'spear-hook', 'bowman', 'shield', 'gauntlet',
    'star-formation', 'moon', 'lightning-arc', 'flame', 'water-drop', 'mountains',
    'pine-tree', 'wheat', 'grapes', 'boar-tusks', 'snake', 'falcon-moon', 'harp', 'anchor',
  ],
  'Sites & landmarks': [
    'castle-ruins', 'ancient-ruins', 'medieval-village-01', 'village', 'temple-gate',
    'greek-temple', 'byzantin-temple', 'egyptian-pyramids', 'stone-tower', 'guarded-tower',
    'watchtower', 'lighthouse', 'windmill', 'water-mill', 'barn',
    'cave-entrance', 'mountain-cave', 'gold-mine', 'mine-wagon', 'well',
    'arch-bridge', 'drawbridge', 'harbor-dock', 'anchor', 'sailboat', 'wooden-pier',
    'tavern-sign', 'beer-stein', 'shop', 'blacksmith', 'stable',
    'obelisk', 'dolmen', 'menhir', 'graveyard', 'tombstone', 'church',
    'magic-portal', 'campfire', 'tipi', 'oasis',
  ],
  'Resources & trade': [
    'wheat', 'grapes', 'olive', 'corn', 'carrot', 'fish-bucket', 'meat', 'cheese-wedge',
    'salt-shaker', 'wool', 'sheep', 'cow', 'pig', 'chicken-leg', 'beehive',
    'gold-bar', 'gold-nuggets', 'ore', 'coal-wagon', 'crystal-cluster', 'gems',
    'wood-pile', 'logging', 'stone-block', 'brick-pile', 'amphora', 'barrel',
    'knapsack', 'coins', 'scales', 'hammer-nails',
  ],
  'Hazards & magic': [
    'flame', 'burning-embers', 'poison-bottle', 'death-skull', 'death-zone',
    'spider-web', 'wolf-trap', 'mantrap', 'spikes', 'falling-rocks',
    'quicksand', 'swamp', 'thorn-helix', 'frozen-orb', 'ice-spear', 'lightning-storm',
    'tornado', 'vortex', 'lava', 'plague-doctor-profile',
    'magic-swirl', 'pentagram-rose', 'triple-yin', 'rune-stone', 'crystal-ball',
    'magic-portal', 'holy-symbol', 'cursed-star', 'eclipse', 'evil-eyes',
    'fairy-wand',
  ],
  'Bestiary marks': [
    'dragon-head', 'sea-serpent', 'kraken-tentacle', 'griffin-symbol', 'unicorn',
    'werewolf', 'direwolf', 'bear-face', 'boar', 'wolf-howl', 'giant-squid',
    'spider-alt', 'scorpion', 'snake', 'bat', 'raven', 'crow-dive', 'shark-fin',
    'whale-tail', 'goblin-head', 'orc-head', 'troll', 'minotaur', 'centaur',
    'skeleton', 'ghost',
  ],
  'Military symbols': [
    'crossed-swords', 'swords-power', 'bowman', 'crossbow', 'spear-hook', 'cavalry',
    'horse-head', 'siege-tower', 'catapult', 'trebuchet', 'siege-ram', 'shield-bash',
    'knight-banner', 'flying-flag', 'tower-flag', 'castle', 'gate', 'barracks-tent',
    'cargo-crate', 'caravan', 'walking-scout', 'hunting-horn', 'war-pick', 'helmet',
  ],
};

// -- resolve -----------------------------------------------------------------

const byName = new Map(); // name -> [{author, file}]
for (const author of fs.readdirSync(src)) {
  const dir = path.join(src, author);
  if (!fs.statSync(dir).isDirectory() || author === 'badges') continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.svg')) continue;
    const name = f.replace(/\.svg$/, '');
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push({ author, file: path.join(dir, f) });
  }
}

function title(name) {
  return name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** The foreground path — the second one; the first is the black backing square. */
function foregroundPath(file) {
  const svg = fs.readFileSync(file, 'utf8');
  const vb = /viewBox="0 0 512 512"/.test(svg);
  if (!vb) return null;
  const ds = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  if (ds.length !== 2) return null;
  return ds[1];
}

const out = [];
const seen = new Set();
const missing = [];
const authors = new Map();

for (const [sub, names] of Object.entries(CURATED)) {
  for (const name of names) {
    const hits = byName.get(name);
    if (!hits) { missing.push(`${sub}/${name}`); continue; }
    // Deterministic pick when two authors drew the same subject.
    const hit = [...hits].sort((a, b) => a.author.localeCompare(b.author))[0];
    const d = foregroundPath(hit.file);
    if (!d) { missing.push(`${sub}/${name} (unexpected svg shape)`); continue; }
    const id = `gi/${name}`;
    if (seen.has(id)) continue; // a few subjects earn a place in two shelves
    seen.add(id);
    authors.set(hit.author, (authors.get(hit.author) || 0) + 1);
    out.push({ id, name, label: title(name), sub, author: hit.author, d });
  }
}

const header = `/**
 * GENERATED — do not edit. Run \`node tools/build-icons.mjs <path-to-game-icons>\`.
 *
 * Path geometry from game-icons.net, CC BY 3.0, on the original 512×512 grid.
 * Each record carries its author because the licence asks for credit per work,
 * not a blanket line at the bottom of a readme.
 */

export interface IconPath {
  id: string;
  label: string;
  sub: string;
  /** Upstream author, for the credits panel. */
  author: string;
  /** Single path on a 0..512 grid. */
  d: string;
}

export const ICON_PATHS: IconPath[] = [
`;

const body = out.map((r) =>
  `  { id: ${JSON.stringify(r.id)}, label: ${JSON.stringify(r.label)}, sub: ${JSON.stringify(r.sub)}, author: ${JSON.stringify(r.author)}, d: ${JSON.stringify(r.d)} },`,
).join('\n');

const target = path.join(root, 'src/assets/procedural/iconPaths.ts');
fs.writeFileSync(target, `${header}${body}\n];\n`);

// -- notices -----------------------------------------------------------------
// Written from the same data as the icons themselves, so the credit file cannot
// drift out of step with what actually ships.

const byAuthor = new Map();
for (const r of out) {
  if (!byAuthor.has(r.author)) byAuthor.set(r.author, []);
  byAuthor.get(r.author).push(r);
}
const ordered = [...byAuthor.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

const notices = `# Third-party notices

GENERATED — run \`node tools/build-icons.mjs <path-to-game-icons>\` to refresh.

Everything in Aetheria Cartographer is original work under the MIT licence,
with one exception: ${out.length} of the map symbols are built from vector
outlines published on [game-icons.net](https://game-icons.net).

## game-icons.net

**Licence:** [Creative Commons Attribution 3.0 Unported (CC BY 3.0)](https://creativecommons.org/licenses/by/3.0/)

**Source:** https://github.com/game-icons/icons

Only the path geometry is used. It is scaled, recoloured and composited into
medallions and shields by \`src/assets/procedural/icons.ts\`; the upstream files
themselves are not redistributed. Each icon keeps its author in the asset's
tags and in the application's About box, and the licence is satisfied by that
credit remaining visible.

If you redistribute maps that contain these symbols, keep the attribution with
them.

${ordered.map(([author, rows]) =>
  `### ${author} — ${rows.length} icon${rows.length === 1 ? '' : 's'}\n\n` +
  rows.map((r) => `- ${r.label} (\`${r.name}\`)`).join('\n'),
).join('\n\n')}
`;

fs.writeFileSync(path.join(root, 'docs/THIRD-PARTY-NOTICES.md'), notices);

const kb = (fs.statSync(target).size / 1024).toFixed(0);
console.log(`wrote ${out.length} icons (${kb} KiB) to ${path.relative(root, target)}`);
console.log('authors:', [...authors.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a}(${n})`).join(' '));
if (missing.length) {
  console.log(`\n${missing.length} not found upstream:`);
  for (const m of missing) console.log('  ', m);
}
