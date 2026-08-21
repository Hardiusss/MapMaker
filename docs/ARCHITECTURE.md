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

**Assets** (`src/assets/`) are drawing functions, not images. Each one takes a
box and a seeded RNG and draws itself. Two mountains from the same asset never
look the same because the seed differs; the same seed always redraws
identically, which is what makes projects reproducible.

Both are cached — textures by (id, palette, size), asset bitmaps by every
parameter that affects the result.

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

---

## The generators

All five follow the same shape: build a field or a grid, resolve it to pixels,
then place objects on top. Everything is seeded from a single integer.

### Region

`generateFields` produces elevation from warped fbm plus a ridged multifractal,
shapes it with a landmass mask, erodes it, picks a sea level that hits the
requested land fraction, floods from the borders to distinguish lakes from
ocean, and runs D8 flow accumulation.

Rivers are traced from **heads** — cells above the flow threshold with no
upstream neighbour that also clears it — rather than from the highest-flow
cells. Sorting by flow and tracing from the top finds river *mouths*, which
produces two-pixel rivers and consumes the best candidates. That bug is easy to
write and hard to spot.

The terrain is then resolved in a **single per-pixel pass**. The first version
painted each biome through its own full-canvas mask: sixteen blurs and sixteen
pattern fills, about five seconds for one map. The current pass samples the
field bilinearly at noise-warped coordinates, classifies per pixel, and reads
the colour straight out of that biome's tile. Shoreline ink and the offshore
shelf fall out of the same lookup by probing the water flag a few pixels away —
no blur, no threshold, no erosion pass. Ten times faster and it looks better,
because warped sampling gives interlocking borders where cross-fading gave mud.

### Dungeon and cave

Both produce a `CellGrid` of open cells and share the painting and wall-tracing
code. `traceWalls` walks the boundary between open and solid cells, merges
collinear runs into long segments and breaks the runs where doors sit — which is
what stops a generated dungeon from arriving in Foundry as three thousand
two-point walls.

The cave's organic edges come from blurring the cell raster heavily and then
re-thresholding it **against a noise field** rather than a constant. A constant
threshold on a blurred grid gives rounded rectangles; a noisy one gives rock.

### City

Streets are laid first, then buildings are rejection-sampled against the street
network and rotated to face the nearest one. That ordering is the whole trick:
scatter buildings first and no amount of subsequent work makes them read as a
town.

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
