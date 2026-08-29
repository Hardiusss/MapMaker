# Aetheria Cartographer

An offline, self-contained fantasy map editor for tabletop RPGs — world maps,
theatres of operations, cities, dungeons, caves and battle maps — with
first-class export to Foundry VTT and the Universal VTT format.

It is a desktop application. No account, no subscription, no network calls, and
no bundled image library. All 623 stamps are geometry rather than pictures:
every texture, mountain, tree, building, creature token and dungeon prop is
drawn at the size you ask for and seeded per instance, so nothing repeats and
nothing pixelates on a 300 dpi print. 441 of them are original code; the other
182 — heraldic charges, site markers, hazard and unit symbols — are built from
CC BY vector outlines and credited in Help → About and in
[`docs/THIRD-PARTY-NOTICES.md`](docs/THIRD-PARTY-NOTICES.md).

---

## What it does

**Seven generators, all seeded and re-rollable**

| Generator | What you get |
|---|---|
| Operational / Theatre | A few kilometres of ground between the world map and the table: every cell classified by movement cost, cover and line of sight, one watercourse with two or three crossings, roads routed through them, lettered sectors, ranked chokepoints, and objectives that say why they are objectives |
| Region / World | Continents from a real heightmap: erosion, a depression-filled drainage network with proper dendritic rivers, rainfall from a prevailing wind so deserts sit in rain shadows, settlements sited near water, political realms, roads routed over the terrain, and named ranges, forests and seas |
| City / Settlement | A street network first, then terraces built along both frontages of every street, backland plots filling the block interiors, curtain walls with towers and gates, castle, temple, market, docks, farmland and district labels |
| Castle / Fortress | Six plans that are actually different buildings — motte and bailey, concentric, shell keep, coastal, star fort, hillfort — each with a curtain wall thick enough to fight from, mural towers at the corners and along the long runs, a twin-drum gatehouse with portcullis and drawbridge, a postern, a keep entered at first-floor level, and a ruin slider that breaks the exported wall set as well as the picture |
| Dungeon | BSP room partitioning, corridors, doors (including secret and locked ones), furnishings chosen to match each room's purpose and set against the walls, torchlight, numbered rooms and GM notes |
| Cave | Chambers and tunnels, a warren of small pockets, or one big cellular-automata cavern — your choice — with dead-end spurs, organic walls, pools, stalagmites, glowing crystals and fungal blooms |
| Battle Map | Thirteen terrain recipes on a 5 ft grid, props clustered by a density field so you get groves and clearings, water with banks and shallows, elevation shading, and blocking terrain wired up as walls |

**A stamp library of 623 pieces, in eleven groups**

| Group | What is in it |
|---|---|
| Prefabs | 29 whole scenes — see below |
| Landforms & Vegetation | 96 — mountains, cliffs, chasms, canopies by species, undergrowth, rock, sand, ice, lava, water |
| Settlements & Structures | 81 — top-down cottages, barns, chapels, warehouses and ruins; walls, gatehouses, bastions, siege engines; bridges, docks and boats; plus side-view world icons for abbeys, forts, quarries and shipyards |
| Dungeon & Furnishings | 116 — doors, stairs, traps, and the interior sets: kitchen, tavern, library, laboratory, bedchamber, prison, forge, temple, shop, and the rugs, sconces and tapestries that dress them |
| Creatures | 42 top-down tokens on a common base, sized by category from Small to Huge, with the faction ring taking your tint |
| Battle Props | 18 — wagons, tents, fences, ballistae, fords, blood and scorch marks |
| Cartography & Markers | 241 — heraldry, cartouches, compass roses, wax seals, and tactical counters for objectives, deployment zones and chokepoints; plus 182 imported symbols: heraldic charges, sites and landmarks, resources, hazards, bestiary marks and unit counters, each of which draws as a bare silhouette, a struck medallion or a blazoned shield |

Every stamp takes a tint, so a green wood turns autumn with one colour, and a
warband's shields turn red while the enemy's turn blue. Favourite the ones you
reach for and they stay on their own shelf across every map you open.

**Prefabs: a furnished room in one click**

Placing a tavern means a bar, six tables, a hearth, benches and lanterns, spaced
so it looks lived in. A prefab is that arrangement already decided. Drop
*Tavern Common Room*, *Blacksmith's Workshop*, *Wizard's Study*, *Prison Block*,
*Throne Room* or *Noble Bedchamber* and you get the floor, the walls, the
doorways and the furniture in one stamp — plus outdoor set pieces like
*Camp Site*, *Bandit Ambush*, *Farmstead Yard*, *Market Row*, *Dock Landing* and
*Siege Battery*.

They are compositions, not pictures: a prefab calls the same stamps you would
place by hand, so every copy is seeded differently and a fix to a chair fixes
every room that has one. Drop two taverns and they are laid out alike and
detailed differently.

**Building a castle by hand**

The generator gives you a whole fortress; the castle tool lets you draw one.
Click out a wall run and you get a curtain of real thickness with a wall walk,
mural towers at the corners and along the long stretches, and a twin-drum
gatehouse with a portcullis. Shift constrains to 45°, clicking the first point
closes the ring, and the ruin slider breaks the wall where an attacker got in.
Stone, timber palisade or earth rampart. The whole construction is one undo
step, and its VTT walls, doors, arrow slits and tower braziers are emitted with
it — including the gaps, so a breach is a hole your players can walk through.

**A real editor, not just a generator**

Layers with opacity, blend modes, clipping and merge. A textured brush engine
with hardness, flow, edge noise and pressure response. Stamps, labels with
curved text and halos, shapes, and a path tool for rivers, roads, borders and
ridges. Undo and redo for everything, including individual brush strokes.

**One map, a campaign of battles**

An operational map is a theatre a few kilometres across, divided into lettered
sectors. `Aetheria.generate.battleFromSector(theatre, 'C3')` builds the tactical
map that sector is fought on — its terrain mix chooses the recipe, and the seed
comes from the theatre plus the designation, so C3 is the same ground every time
the campaign goes back to it. Plan the operation on one sheet; play each
engagement on a table generated from it.

**Torchlight that stops at the walls**

Dungeons and caves export with their lighting baked in. Every torch casts a
visibility mask occluded by the wall set, so a brazier lights its own chamber,
throws a wedge through an open door, and leaves the corridor beyond it dark.
Room keys and GM notes sit above the darkness, because a key you cannot read in
the unlit half of the map is not a key.

**Hex crawls and planning maps**

Switch the grid to hexes and the fill tool to single-cell mode, and you can
paint terrain a hex at a time — click for one, drag for a ridge. The same mode
works on square grids for tile-style dungeons.

**Built for virtual tabletops**

Walls, doors, windows, one-way barriers, light sources with radii in game units,
and journal note pins are all first-class objects in the document — not
afterthoughts bolted onto an image. They export straight into Foundry with the
correct constants, and into Universal VTT as line-of-sight polygons and portals.

**Bring your own artwork**

Import a battle map you already own, let the grid detector find its cell size
(or drag a box over a few squares and have it solved for you), then add walls
and lighting and push the whole thing to your VTT.

**GM and player versions from one file**

Mark any layer GM-only — room keys, secret annotations, the token layer — and
the export dialog will give you a clean player copy alongside the full one,
with a `-player` suffix so the two never get mixed up.

**Two interface languages**

English and Russian, switched from the pair of codes in the top bar. The choice
is remembered, and on first launch the app follows the operating system rather
than assuming English. All 883 interface strings are translated, and so are the
623 stamp names — searching «башня» finds the towers, because the search index
carries both languages.

**Six palettes, including a printer-friendly one**

The whole map recolours from a single palette, textures and procedural art
alike. "Pure Ink" collapses the stamps to a two-tone pen drawing, which is what
you want on paper.

---

## Install and run

Requires Node.js 18 or newer.

```bash
npm install
npm start          # build the renderer, then launch the desktop app
```

For development with hot reload:

```bash
npm run dev:desktop    # Vite dev server + Electron
npm run dev            # renderer only, in a browser at localhost:5173
```

To produce installers:

```bash
npm run dist          # for the current platform
npm run dist:win      # NSIS installer + portable .exe
npm run dist:mac      # .dmg + .zip
npm run dist:linux    # AppImage + .deb
```

Everything runs locally. The Electron shell blocks navigation away from the app
and the renderer has a Content-Security-Policy that permits no remote origins.

---

## Exporting

| Format | Contents |
|---|---|
| **Image** | PNG, JPEG or WebP at any resolution, with presets for web, 300 dpi print, Foundry 1:1 and Roll20's 70 px per cell |
| **Foundry VTT** | A .zip with the image, a Scene document and a README. Walls, doors, windows, lights, notes, grid and token vision all carry across |
| **Universal VTT** | A single `.dd2vtt` with the image embedded, plus line-of-sight chains, door portals and lights. Read by Foundry (via Universal Battlemap Importer), Fantasy Grounds, Arkenforge and others |
| **Roll20** | A 70 px/cell image, the exact Page Settings numbers, and wall paths as JSON for the community dynamic-lighting import scripts |
| **Print PDF** | One page, or tiled across A4/Letter sheets at true one-inch-per-square with crop marks and overlap for taping |
| **Project** | `.aethermap` — a plain ZIP holding the document and one image per raster layer. Fully self-contained and openable with any zip tool |

See [`docs/FOUNDRY.md`](docs/FOUNDRY.md) for the import walkthrough and exactly
what is translated.

---

## Keyboard

`V` select · `B` brush · `E` eraser · `G` fill · `S` stamp · `T` label · `R` shape
· `P` river/road · `W` walls · `L` lights · `N` note · `K` token · `M` measure
· `I` eyedropper · `H` or hold Space to pan

`[` `]` brush size · `Alt`+wheel brush size · wheel zoom · `Ctrl`+`0` fit

`Ctrl`+`Z` / `Ctrl`+`Shift`+`Z` undo, redo · `Ctrl`+`S` save · `Ctrl`+`E` export
· `Ctrl`+`I` import an image · `Ctrl`+`Shift`+`G` generators

Full list is in the app under Help → Keyboard Shortcuts.

---

## Scripting

The editor exposes a small API on `window.Aetheria` (open the dev tools console
with `Ctrl`+`Shift`+`I`). Useful for batch work:

```js
// Twenty forest encounters, each with walls and lighting, exported to disk.
for (let i = 0; i < 20; i++) {
  const { doc } = Aetheria.generate.battle({ seed: 1000 + i, biome: 'forest', density: 0.6 });
  await Aetheria.save.foundry(doc, { ...Aetheria.save.defaults, includeGrid: false }, {});
}
```

```js
// Inspect what a Foundry scene will contain before exporting.
const { doc } = Aetheria.generate.dungeon({ seed: 42, rooms: 14 });
console.log(Aetheria.build.foundryScene(doc).summary);
```

`Aetheria.debug` reports the numbers behind a world, which is how you catch the
things a rendered map hides — a biome quietly eating a third of the landmass, a
climate field that never leaves the middle of its range, a drainage network that
has fragmented into puddles:

```js
Aetheria.debug.biomeStats(8);    // biome balance, averaged over eight seeds
Aetheria.debug.biomeSpread(12);  // per-seed share, so you see the spread too
Aetheria.debug.fieldStats(6);    // deciles of temperature, moisture, altitude
Aetheria.debug.riverStats(31337) // flow profile and how many rivers survive
```

---

## Project layout

```
electron/          desktop shell (plain CommonJS, no build step)
src/
  core/            document model, layers, history, camera, editor hub
  render/          compositor, brush engine, grid, procedural textures
  assets/          procedural stamp library (terrain, vegetation, towns, dungeon…)
  tools/           brush, stamp, path, wall, light, select, grid-align…
  gen/             the seven generators plus shared painting helpers
  export/          Foundry, Universal VTT, Roll20, PDF, PNG, project file
  ui/              React application shell
tools/             headless test harnesses (Playwright)
```

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how the pieces fit
together and why a few of the less obvious decisions were made.

---

## Testing

```bash
npm run build                   # typecheck + bundle
node tools/verify-exports.mjs   # exercises every exporter in a real browser
node tools/smoke.mjs            # drives the UI and writes screenshots
node tools/gallery.mjs          # renders every generator variant to gallery/
node tools/asset-sheet.mjs      # contact sheet of all 623 stamps, one PNG per group
node tools/bench.mjs            # per-phase generator timings
node tools/check-names.mjs      # bulk-screens generated names
node tools/check-i18n.mjs       # translation key parity and placeholder drift
node tools/check-asset-ru.mjs   # Russian coverage for every stamp and shelf
node tools/check-hex.mjs        # hex numbering, travel time and neighbour maths
node tools/check-determinism.mjs # same seed, same map — compared on the pixels
node tools/check-contrast.mjs   # palette separation, including colour-blind vision
node tools/bench-memory.mjs     # caches and heap across repeats of one workload
node tools/shot.mjs <script.js> # renders whatever you are working on to a PNG
```

`verify-exports.mjs` is the one that matters: it generates a map of each kind,
builds every export payload, and asserts the things a VTT actually checks —
Foundry's wall movement/sight constants and light units, Universal VTT grid
coordinates, Roll20 page settings, PDF structure, project round-trip fidelity
and the grid detector's accuracy.

`asset-sheet.mjs` is the one to run after touching the stamp library. A stamp
that typechecks can still be an illegible smudge at the size a GM actually plays
at; laying all 623 out at map scale makes a bad silhouette obvious in a glance.

`check-names.mjs` generates a hundred-odd maps and screens every label that
comes out of them. Gluing random syllables together will eventually produce
something unfortunate, and a map that hands the table an obscenity in 48-point
display type is not one anyone wants to show their players.

`shot.mjs` is the one to reach for while you are changing something that draws.
It evaluates a short script inside the built app — `window.Aetheria` is in
scope — and writes whatever canvases it returns as PNGs, so a texture at four
palettes or a stamp at six seeds is one command and one look. Nothing else in
this list will tell you that a material reads as stone when it is meant to be
wood; the header of the file has a worked example.

---

## Licence

MIT, and the maps you make are yours.

One qualifier. 182 of the map symbols — the heraldic charges, site markers,
resource and hazard icons and unit counters — are built from vector outlines
published on [game-icons.net](https://game-icons.net) under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Only the geometry is
used: it is scaled, recoloured and composited here, and the upstream files are
not redistributed. Every one of them names its author in the stamp's tags and in
Help → About, and `docs/THIRD-PARTY-NOTICES.md` lists them icon by icon. If you
publish a map that shows those symbols, carry the credit with it. Everything
else in the repository is original.
