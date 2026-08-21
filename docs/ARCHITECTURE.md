# Architecture

A tour of how the pieces fit together, and the reasoning behind the decisions
that are not obvious from the code.

---

## Shape of the thing

```
Electron main  ──ipc──►  preload bridge  ──►  React renderer
                                                  │
                                                  ▼
                                              Editor  ◄── tools
                                                │
                                    ┌───────────┼───────────┐
                                    ▼           ▼           ▼
                              MapDocument   Camera      History
                                    │
                                    ▼
                          renderer → canvas / export
```

The **Editor** is the hub. It owns the document, the camera, the selection and
the undo stack, and it is the only object the React layer talks to. React
components subscribe to editor events and re-render; they never own map state.
This keeps the 60 fps canvas loop away from React's reconciler entirely.

---

## The document model

`MapDocument` is plain data apart from one thing: raster layers hold a live
`HTMLCanvasElement`. That single exception is what makes painting fast, and it
is the reason the history system has two kinds of patch.

Layers come in five kinds — raster, object, wall, light, note. Walls, lights and
notes get their own layer types rather than being "objects with a special flag"
because the exporters, the overlay renderer and the property panels all want to
find them without walking every object on the map.

The palette id lives on the document, not in the render options. It used to be
an option with a default, which meant a map exported from a script — where
nobody passed the option — came out silently recoloured to the default palette.
Anything that is a property of the map belongs on the map.

## Undo, and why it is two systems

A naive undo stack snapshots the document. That is fine for moving a label and
catastrophic for painting — a 2400×1600 canvas is 15 MB, and a brush stroke
would cost that much per step.

So history records two patch types:

- **doc patches** hold a structural clone of the document. Raster surfaces are
  shared by reference, so these are cheap: a few KB of JSON.
- **raster patches** hold the `ImageData` of just the dirty rectangle, before
  and after.

A stroke therefore costs the pixels it actually touched. `Editor.batch()` groups
several patches into a single undo step when an operation does both at once.

## The brush engine

A stroke accumulates into an **alpha mask**, and the mask is composited with a
texture into a **paint buffer**. Two buffers, not one.

The reason is overlap. If you stamp a soft dab straight onto the layer, each
overlapping dab darkens the previous one and a slow stroke develops ugly seams.
Accumulating alpha in a mask first — with `lighter`, so alpha saturates rather
than multiplying — and colouring it once at the end gives a flat, even stroke.

Only the dirty rectangle of the paint buffer is rebuilt per dab, so cost scales
with brush size rather than canvas size.

---

## Procedural art

There is no bundled artwork. Two libraries generate everything:

**Textures** (`src/render/textures.ts`) synthesise seamless 256×256 tiles from
tileable gradient noise and Worley noise. Tileability comes from a lattice that
wraps at an integer period — a plain Perlin field cannot tile, and blending the
edges of one that does not produces the smeared seams you see in a lot of
procedural terrain.

`WorleyNoise.f1f2id` returns, along with the two nearest feature distances, a
stable pseudo-random id for the nearest cell. Without it every cell in a
cellular texture has an identical interior and the only variation in the result
is the seam between cells, which reads as machine-cut paving. The id is what
lets each stone in the scree, each enclosure in the farmland and each lichen
crust in the tundra carry its own tone.

**Assets** (`src/assets/`) are drawing functions, not images. Each one takes a
box and a seeded RNG and draws itself. Two mountains from the same asset never
look the same because the seed differs; the same seed always redraws
identically, which is what makes projects reproducible.

A stamp's variant is normally derived from its seed, so a forest is not one tree
repeated. `StampObject.variant` overrides that for the few assets whose variant
is data rather than style — a numbered room marker's variant *is* its number,
and it has to survive a reseed.

Both are cached — textures by (id, palette, size), asset bitmaps by every
parameter that affects the result.

### Mixing ground textures

`blendTextures` resolves a whole layer of mixed ground in one per-pixel pass
rather than compositing each texture through its own full-canvas mask.

Each layer gets **its own noise field**, and the winner at each point is
whichever field scores highest after a per-layer bias. The obvious alternative —
one field sliced by cumulative weight thresholds — has a nasty failure mode: a
low-weight texture is assigned a narrow band of a smooth scalar field's range,
and a narrow band of a smooth scalar field is a *contour line*. Instead of small
patches of dirt in the grass you get long winding filaments of it tracing level
sets across the whole map, which read as scratches on the paper. The biases are
calibrated against the actual fields before painting, so the area each texture
ends up with still matches the weight it asked for.

The winner map is one value per coarse field cell, so the per-pixel lookup
jitters its coordinates by up to a cell. That frays each patch boundary into a
stipple instead of an axis-aligned staircase — cheaper than interpolating, and
closer to how ground actually changes.

---

## Rendering

One function, `paintDocument`, draws a map into a context that is already in map
coordinates. The editor calls it with the camera transform applied; the
exporters call it with a plain scale. That is deliberate: it means what you
export is pixel-for-pixel what you were looking at, with no second code path to
drift out of sync.

Layer blend modes map onto `globalCompositeOperation` directly. Two cases need a
scratch surface — a layer that clips to the one below it, and a live erase
stroke, which must not eat the layers underneath.

### Blur before you enlarge

Chromium implements the canvas blur filter in tiles. Blurring an image that has
already been enlarged ten- or twelve-fold spreads the filter over a fraction of
a source pixel, which leaves both the bilinear facets and faint seams at the
tile boundaries — and on a map that reads as mysterious horizontal bands across
the terrain, or as a quilt of light and dark squares printed onto the grass.
Every low-resolution field in the codebase is therefore blurred **at its own
resolution** and only then drawn up to full size.

---

## The generators

All six follow the same shape: build a field or a grid, resolve it to pixels,
then place objects on top. Everything is seeded from a single integer.

### Region

`generateFields` produces elevation from warped fbm plus a ridged multifractal,
shapes it with a landmass mask, erodes it, picks a sea level that hits the
requested land fraction, and floods from the borders to distinguish lakes from
ocean.

**Hydrology.** Flow accumulation runs on a **depression-filled** copy of the
terrain (Priority-Flood, Barnes/Lehman/Mulla 2014), not on the raw surface.
Fractal terrain is full of pits and thermal erosion makes more of them; plain
D8 routing dead-ends in every one. The symptom is a continent with no rivers
worth the name — drainage fragments into a few hundred private basins, the
largest accumulation anywhere is a couple of hundred cells, and the river
extractor quite correctly finds almost nothing to draw. Filling first takes peak
accumulation on a 320×220 grid from about 500 cells to about 4,700, and the map
from four rivers to forty. The filled surface is used only for hydrology; the
elevation the map is drawn from keeps its pits, because real basins are a
feature.

`computeFlow` returns downstream pointers alongside the accumulation, and
`extractRivers` follows those pointers from each head. That is what guarantees
every river it draws reaches the sea rather than stopping halfway across the
continent in a hollow the renderer then has to pretend is a lake.

**Climate.** Moisture comes from a prevailing wind rather than a second noise
field. An air parcel is walked across the grid from one edge: it picks up water
over the sea and drops it when the ground rises under it, so it arrives on the
far side of a range with nothing left. Deserts then appear in the lee of
mountains and rainforests on the slopes that face the wind, which is both
correct and — more usefully — legible: a player looking at the map can see *why*
the dry country is dry.

The result is histogram-equalised over land. Raw rainfall clumps hard around its
mean, and a classifier with thresholds at 0.24 and 0.70 finds almost nothing on
either side of them. Before equalisation, deserts and jungles were unreachable
branches: 0.0% and 0.2% of land across every seed tested.

Temperature is latitude plus altitude, with the *latitude itself* warped by
noise. A pure function of latitude puts every biome boundary on a perfectly
horizontal line, which reads as banding across the whole map.

**Painting.** The terrain is resolved in a **single per-pixel pass**. The first
version painted each biome through its own full-canvas mask: sixteen blurs and
sixteen pattern fills, about five seconds for one map. The current pass samples
the fields bilinearly at noise-warped coordinates, classifies per pixel, and
reads the colour straight out of that biome's tile. Ten times faster, and it
looks better, because warped sampling gives interlocking borders where
cross-fading gave mud.

The shoreline ink and the continental shelf are read from bilinearly-sampled
**distance fields** — distance to water for land, distance to land for sea.
Probing the water mask cell by cell instead quantises the shelf into visible
rectangles a dozen pixels across.

Snow is painted as a patchy **overlay** on top of whatever biome is underneath,
not as a biome of its own. A hard threshold gives a white blob whose edge is a
clean temperature isoline, which is the single most obviously synthetic thing a
map can show.

`classifyCell` delegates to `classifyValues`, so there is exactly one copy of
the biome thresholds. Two parallel ladders — one for grid cells, one for
interpolated pixels — are guaranteed to drift apart, and the symptom is a map
whose painted terrain disagrees with the terrain its own generators think is
there: forests stamped onto rendered desert, roads costed against biomes the
renderer never drew.

**Stamps.** A mountain stamp is anchored on one grid cell but covers dozens of
them, so placing on the anchor's biome alone drops 400-pixel ranges onto
grassland whenever a single peak pokes out of the plains. Every terrain stamp is
instead sized from a summed-area coverage test over the biome mask, and ranges
are rotated to the principal axis of the local massif — a range drawn as a
horizontal row of peaks across a ridge that runs north-east is the most obvious
tell that a map was assembled by a program.

**Realms and roads.** Political realms are grown from the largest towns by a
cost-weighted flood fill (Dijkstra over a terrain step cost, with a reach cap),
and their borders traced by edge chaining. Roads are routed with A* over a
terrain cost field rather than drawn as straight lines: they follow valleys, hug
coasts, avoid mountains and swamps, and merge onto each other where that is
cheaper than cutting new ground. Links are routed busiest-first, and every cell
a road has already claimed is discounted for later routes — which is what makes
the network branch instead of running a dozen parallel tracks.

**Labels** hang on each biome region's **pole of inaccessibility** — the
interior cell furthest from anything that is not part of the region — not on its
centroid. Coastlines are never convex, and the centroid of a C-shaped strait
lands squarely on the headland it wraps around, so the map ends up captioning
dry ground as a sea. The same distance doubles as a budget for how large the
label may be set before it spills out of the thing it is naming. A relaxation
pass then nudges overlapping labels apart and hides the small ones that are
still buried.

### Dungeon

BSP partitioning, corridors, doors, dressing, lighting and a full VTT wall set.
`LAYOUT_RULES` gives each layout its own symmetry, leaf size, corridor
behaviour and room list, so the style dropdown changes how the space is cut up
rather than only what furniture appears in it.

Doors are found where a corridor meets a room, and the same geometry feeds both
`traceWalls` — which breaks its wall runs there, so Foundry gets openable doors
— and the door stamps on the picture. They used to feed only the former, so a
map a GM printed or shared as an image showed every room standing wide open.

Room purposes are dealt from a shuffled deck rather than picked independently.
Picking with replacement gives a dungeon with two throne rooms and three
kitchens roughly as often as not, and a GM reading the key has to decide which
one the plot meant.

### Cave

Cellular automata have no notion of a room, so at any density that keeps the
cave connected they dissolve into a single undifferentiated blob, and at any
density that keeps chambers distinct they disconnect them entirely. The
`chambers` and `warren` styles therefore place the chambers first — rejecting a
candidate whose *radius* would reach an existing chamber, not merely whose
centre is close — link them with a spanning tree plus a few extra passages and
some dead-end spurs, and let the automata only roughen the edges. `cavern` keeps
the pure-CA cave, which is the right shape for a single arena.

The polish pass is deliberately conservative: the usual majority rule fills a
one-cell tunnel on its first iteration and opens the thin rock between two
nearby chambers on its second, so a cell only flips when almost all of its
neighbours disagree.

Both dungeon and cave produce a `CellGrid` and share the painting and
wall-tracing code. `traceWalls` merges collinear runs into long segments, which
is what stops a generated dungeon from arriving in Foundry as three thousand
two-point walls. The cave's organic edges come from blurring the cell raster
heavily and re-thresholding it **against a noise field** rather than a constant:
a constant threshold on a blurred grid gives rounded rectangles; a noisy one
gives rock.

### Operational

The scale between the table and the world: a theatre a few kilometres across on
a grid whose cell is roughly one tactical engagement.

Every terrain class carries movement cost, cover and line of sight in one table,
and the legend is generated from that same table — so the map cannot drift out
of agreement with its own key. The classification is the answer to a commander's
question rather than a climatologist's: not what grows here, but how long it
takes to cross, whether you can see through it, and whether it will stop a
charge.

The terrain is painted **per pixel from the underlying fields**, not per cell.
Filling each cell with one flat colour makes every class boundary a cell edge,
and the result reads as a chequerboard rather than as ground; the cell grid is a
measuring instrument laid over the map, not the map itself.

Slope is measured against a **fixed** reference gradient rather than the map's
own maximum. Normalising by the maximum renormalises every theatre to the same
spread, so one asked for as a mountain pass classifies exactly like one asked
for as a plain — the relief control moves the colours and changes nothing that
matters.

Chokepoints are ranked by how much narrower the corridor *through* a cell is
than the corridor *across* it, and the most constricted few are kept. An
absolute test — impassable ground within one cell on both sides — finds nothing
at all on open country, which is the wrong answer: a plain still has a gap
between the wood and the marsh, and that is still where the defender stands.

`battleFromSector` is the join that makes the whole thing worth having. A
sector's terrain mix picks the battle-map recipe, its tree share sets the prop
density, and the seed is derived from the theatre's seed and the sector's
designation — so C3 is the same ground whoever generates it and whenever, and a
campaign fought across the theatre stays consistent between sessions.

### City

Streets are laid first, then buildings are placed **along the frontages**. The
placement walks each street and sets plots down on both sides, short side to the
road, stepping by each plot's own frontage width; backland plots then fill the
block interiors.

The obvious alternative — scatter rectangles and reject the ones that land on a
road — produces a field of detached rectangles at random angles, because nothing
in it knows which street a given building belongs to. A town read from above is
the opposite of that: buildings stand shoulder to shoulder in a continuous line
with their backs to a shared block interior, and the gaps between them are the
exceptions.

Overlap testing is a separating-axis test on the oriented rectangles. A circular
approximation cannot express "shoulder to shoulder": it gives a plot 16 wide and
28 deep a 12-unit exclusion radius in every direction, which pushes its
neighbour along the street 25 units away and makes a terrace impossible.

### Lighting

Baked lighting gives each source a visibility mask: its radial gradient, minus a
shadow quad projected away from the light behind every sight-blocking wall in
range. The mask is carved out of the darkness and used again for the warm tint,
so a torch lights the room it is in, throws a wedge through an open door, and
stops at the wall. Without the occlusion the light pours through everything and
a dungeon exports as a bright orange page with a dungeon-shaped smudge in it.

Two details matter more than they look. The mask is blurred by a radius-scaled
penumbra, because a shadow cast from walls traced along cell edges has a razor
edge at right angles and lights a cave floor in hard rectangles. And the
brightest point stops short of full opacity, because carving a light all the way
to zero leaves a flat white hole that reads as damage to the image rather than
as a lit floor.

Layers can be drawn above the darkness (`aboveLighting`) and above the grid
(`aboveGrid`). The first is for room keys and GM notes; the second is for the
operational map's legend, which is a sheet of paper pinned to the corner of the
map rather than something with rulings through it.

### Battle map

Thirteen terrain recipes on a 5 ft grid, props clustered by a density field,
water with a bank and shallows, elevation shading, and blocking terrain wired up
as walls.

---

## Names

Names are syllable-based with per-culture inventories. Two filters run on every
generated stem.

The first is a banned-substring list. Gluing random syllables together will
eventually produce something unfortunate, and a map that hands the table an
obscenity in 48-point display type is not one anyone wants to show their
players. `tools/check-names.mjs` bulk-screens a hundred-odd maps' worth of
labels to keep the list honest.

The second is a readability filter: overall length, four consonants in a row,
four vowels in a row. Concatenating an onset like `str` onto a coda like `nd` is
how you get "Kestthaemflol" — every piece legal, the whole unpronounceable, and
half the map wide when set in display type.

---

## Export

Every exporter is a pure function from `MapDocument` to bytes, with a thin
wrapper that routes through the desktop save dialog or a browser download.

The Foundry exporter inlines the constants it needs rather than depending on a
Foundry install, and writes both the modern nested scene shape and the legacy
flat keys so one file imports across versions.

The project format is a ZIP written by hand with STORE (no compression) — the
payloads are already-compressed images, so DEFLATE would buy nothing and cost a
dependency. Fully opaque layers are stored as JPEG rather than PNG, which takes
a typical battle-map project from about 11 MB to under 5.

The PDF writer is also hand-rolled: a page tree, one DCTDecode image XObject per
page, and an xref table. Tiled output slices the map at true one-inch-per-square
so a battle map can be printed and taped together.

---

## Testing

There is no unit-test suite; the interesting behaviour is all pixels and file
formats, which unit tests are bad at. Instead `tools/verify-exports.mjs` runs
the real application in a real browser, generates one map of each kind, builds
every export payload, and asserts the properties a VTT will actually check.
`tools/smoke.mjs` drives the UI and writes screenshots, and `tools/bench.mjs`
reports per-phase generator timings — which is how the region generator's five
second texture pass was found in the first place.

`window.Aetheria.debug` exposes the numbers that catch the failures a rendered
map hides. `biomeStats` and `biomeSpread` report biome balance across seeds;
`fieldStats` reports the deciles of the raw temperature, moisture and altitude
fields; `riverStats` reports the flow-accumulation profile and how many river
heads survive extraction. Eyeballing a map is a poor way to notice that
highlands have quietly grown to a third of the landmass, that the moisture field
never leaves the middle of its range, or that the drainage network has
fragmented — all three were found this way, and none of them looked wrong until
the numbers said so.
