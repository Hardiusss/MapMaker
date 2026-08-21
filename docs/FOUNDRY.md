# Foundry VTT

Aetheria treats walls, doors, lights and note pins as real objects in the
document rather than decoration painted onto an image, so exporting to Foundry
is a translation rather than a re-drawing exercise.

---

## The 30-second version

1. **Export → Foundry VTT.** You get a `.zip`.
2. Unzip it. Copy the image into your Foundry data folder, typically
   `Data/worlds/<your-world>/scenes/`.
3. In Foundry, open the **Scenes** sidebar, right-click a folder →
   **Import Data**, and pick the `.scene.json`.
4. Activate the scene.

Walls, doors, lights and pins are already in place, and the grid is already the
right size with the right distance per square.

If the image ends up somewhere other than the path baked into the scene, open
the scene's configuration afterwards and repoint **Background Image**. Nothing
else needs adjusting — wall coordinates are in image pixels, independent of
where the file lives.

---

## Alternative: one file, no copying

Install the community module **Universal Battlemap Importer**, then use
**Export → Universal VTT** instead. The `.dd2vtt` has the image embedded, so you
drag one file onto the Scenes tab and you are done. The trade-off is that UVTT
carries line-of-sight polygons and portals rather than Foundry's full wall
model — one-way walls, sound blocking and window semantics are flattened.

Use the Foundry export when you want fidelity. Use UVTT when you want speed, or
when you are sharing the map with someone who uses a different table.

---

## What is translated

### Walls

Each segment carries movement, sight and sound flags independently, which map
onto Foundry's constants:

| Aetheria wall type | move | sight | sound | door |
|---|---|---|---|---|
| Wall | blocked | blocked | blocked | — |
| Door | blocked when closed | blocked when closed | blocked | Door |
| Secret door | as door | as door | blocked | Secret |
| Window | blocked | limited | open | — |
| Terrain | open | limited | open | — |
| Invisible barrier | blocked | open | open | — |
| Ethereal | open | blocked | open | — |

Door state (closed / open / locked) is exported. An open door exports with its
blocking flags cleared, so Foundry shows it open and light passes through.

One-way walls export using Foundry's `dir` field.

### Lights

Bright and dim radii are stored internally in map pixels and converted to scene
distance units on export using the grid scale — so a torch authored as 20/40 ft
arrives in Foundry as 20/40 ft, whatever the pixel size of your cells.

Colour, cone angle, rotation and the animation type (torch, pulse, flame,
chroma, hexa) all carry across. `walls: true` is set so lights respect the walls
you exported alongside them.

### Notes

Note pins export at their map coordinates with their title as the pin label.
The body text rides along in `flags.aetheria.body`; link the pin to a real
journal entry in Foundry when you want a full page behind it.

### Grid

Type (square, hex pointy-top, hex flat-top, gridless), pixel size, distance per
cell and unit label are all exported, along with colour and opacity. Foundry
measures correctly from the moment the scene loads.

### Tokens

Optional. Tokens placed in the editor export with their size in grid squares
and their disposition (friendly / neutral / hostile / secret) mapped onto
Foundry's values. They arrive using Foundry's default mystery-man art, tinted
with the colour you gave them — they are placeholders for encounter planning,
not linked actors.

### Scene settings

Padding, token vision, fog exploration, global illumination and darkness level
are all part of the export, taken from the Map panel.

---

## Getting the grid exactly right

**Export the image with the grid switched off.** Foundry draws its own grid. If
you bake one into the image and it is a pixel out of phase, every token will sit
very slightly wrong and it is impossible to unsee.

**Keep the map a whole number of cells.** The generators do this already. If you
resize by hand, use the Map panel's cell readout to check — it shows fractional
cells when the dimensions do not divide evenly.

**For imported artwork**, use the Align Grid tool: set how many cells your box
will span, then drag it over exactly that many squares of the artwork. The tool
solves for both cell size and offset. The nudge buttons in the tool options move
the grid by one pixel at a time when you want to fine-tune.

---

## Version support

The exporter targets Foundry v10 and later. It writes both the modern nested
shape (`grid: { … }`, `environment: { … }`) and the legacy flat keys
(`gridType`, `gridDistance`, `globalLight`, `darkness`) so the same file imports
cleanly across versions. Pick your target generation in the export dialog if you
want the `coreVersion` stamp to match your server.

---

## Troubleshooting

**"The walls are all offset."** The scene's `padding` and the image are
consistent with each other, but if you replaced the background image with a
differently-sized file, the walls will no longer line up. Re-export rather than
swapping the image.

**"Doors do not open."** Check that the wall type is Door or Secret Door rather
than plain Wall — the wall overlay colours them differently (blue for doors,
violet for secret doors).

**"Lights are far too large or small."** The conversion uses the grid scale, so
this almost always means the grid's *units per cell* is wrong. Check the Map
panel: a battle map should say 5 ft per cell, not 5 miles.

**"Import Data is greyed out."** You are on the compendium tab rather than the
Scenes directory, or you lack the Assistant GM role.
