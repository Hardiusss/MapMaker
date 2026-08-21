/** The generator dialog — one tab per generator, all seeded and re-rollable. */
import React from 'react';
import { Modal, Slider, NumberField, SelectField, Toggle, TextField, Section } from '../components/controls';
import { useEditor } from '../useEditor';
import { PALETTES } from '../../core/color';
import { randomSeed } from '../../core/rng';
import { generateRegion, DEFAULT_REGION_OPTIONS, type RegionGenOptions } from '../../gen/region/regionGen';
import { generateDungeon, DEFAULT_DUNGEON_OPTIONS, type DungeonGenOptions } from '../../gen/dungeon/dungeonGen';
import { generateCave, DEFAULT_CAVE_OPTIONS, type CaveGenOptions } from '../../gen/dungeon/caveGen';
import { generateCity, DEFAULT_CITY_OPTIONS, type CityGenOptions } from '../../gen/city/cityGen';
import { generateBattleMap, DEFAULT_BATTLE_OPTIONS, type BattleGenOptions } from '../../gen/battle/battleGen';
import { TEXTURES } from '../../render/textures';
import type { MapKind } from '../../core/types';

export type GenKind = 'region' | 'dungeon' | 'cave' | 'city' | 'battle';

export function kindToGen(kind: MapKind): GenKind {
  switch (kind) {
    case 'dungeon': return 'dungeon';
    case 'cave': return 'cave';
    case 'city': return 'city';
    case 'battle': return 'battle';
    default: return 'region';
  }
}

export function GenerateDialog({ initial, onClose }: { initial: GenKind; onClose: () => void }) {
  const editor = useEditor();
  const [kind, setKind] = React.useState<GenKind>(initial);
  const [busy, setBusy] = React.useState(false);

  const [region, setRegion] = React.useState<RegionGenOptions>({ ...DEFAULT_REGION_OPTIONS, seed: randomSeed(), paletteId: editor.paletteId });
  const [dungeon, setDungeon] = React.useState<DungeonGenOptions>({ ...DEFAULT_DUNGEON_OPTIONS, seed: randomSeed() });
  const [cave, setCave] = React.useState<CaveGenOptions>({ ...DEFAULT_CAVE_OPTIONS, seed: randomSeed() });
  const [city, setCity] = React.useState<CityGenOptions>({ ...DEFAULT_CITY_OPTIONS, seed: randomSeed(), paletteId: editor.paletteId });
  const [battle, setBattle] = React.useState<BattleGenOptions>({ ...DEFAULT_BATTLE_OPTIONS, seed: randomSeed() });

  const run = (newSeed = false) => {
    setBusy(true);
    // Let the overlay paint before we lock the main thread.
    window.setTimeout(() => {
      try {
        let paletteId = editor.paletteId;
        let doc;
        if (kind === 'region') {
          const o = newSeed ? { ...region, seed: randomSeed() } : region;
          if (newSeed) setRegion(o);
          doc = generateRegion(o).doc;
          paletteId = o.paletteId;
        } else if (kind === 'dungeon') {
          const o = newSeed ? { ...dungeon, seed: randomSeed() } : dungeon;
          if (newSeed) setDungeon(o);
          doc = generateDungeon(o).doc;
          paletteId = o.paletteId;
        } else if (kind === 'cave') {
          const o = newSeed ? { ...cave, seed: randomSeed() } : cave;
          if (newSeed) setCave(o);
          doc = generateCave(o).doc;
          paletteId = o.paletteId;
        } else if (kind === 'city') {
          const o = newSeed ? { ...city, seed: randomSeed() } : city;
          if (newSeed) setCity(o);
          doc = generateCity(o).doc;
          paletteId = o.paletteId;
        } else {
          const o = newSeed ? { ...battle, seed: randomSeed() } : battle;
          if (newSeed) setBattle(o);
          doc = generateBattleMap(o).doc;
          paletteId = o.paletteId;
        }
        editor.setPalette(paletteId);
        editor.setDocument(doc);
        editor.status(`Generated “${doc.meta.title}”.`);
        onClose();
      } catch (err) {
        console.error(err);
        editor.status(`Generation failed: ${(err as Error).message}`);
        setBusy(false);
      }
    }, 30);
  };

  const TABS: { id: GenKind; label: string }[] = [
    { id: 'region', label: 'Region / World' },
    { id: 'city', label: 'City' },
    { id: 'dungeon', label: 'Dungeon' },
    { id: 'cave', label: 'Caves' },
    { id: 'battle', label: 'Battle Map' },
  ];

  return (
    <Modal
      title="Generate a Map"
      size="wide"
      onClose={onClose}
      footer={
        <>
          <span className="grow hint">
            Every generator is seeded — note the seed down and you can reproduce the map exactly.
          </span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={() => run(true)} disabled={busy}>Reroll seed & generate</button>
          <button className="btn primary" onClick={() => run(false)} disabled={busy}>
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </>
      }
    >
      <div className="panel-tabs" style={{ marginBottom: 16, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line)' }}>
        {TABS.map((t) => (
          <button key={t.id} className={`panel-tab ${kind === t.id ? 'active' : ''}`} onClick={() => setKind(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {busy && (
        <div className="empty">
          <div className="spinner" />
          Building the world…
        </div>
      )}

      {!busy && kind === 'region' && <RegionForm value={region} onChange={setRegion} />}
      {!busy && kind === 'city' && <CityForm value={city} onChange={setCity} />}
      {!busy && kind === 'dungeon' && <DungeonForm value={dungeon} onChange={setDungeon} />}
      {!busy && kind === 'cave' && <CaveForm value={cave} onChange={setCave} />}
      {!busy && kind === 'battle' && <BattleForm value={battle} onChange={setBattle} />}
    </Modal>
  );
}

function SeedRow<T extends { seed: number }>({ value, onChange }: { value: T; onChange: (v: T) => void }) {
  return (
    <div className="field-row" style={{ marginBottom: 12 }}>
      <label>Seed</label>
      <input type="number" style={{ width: 130 }} value={value.seed}
        onChange={(e) => onChange({ ...value, seed: parseInt(e.target.value, 10) || 1 })} />
      <button className="btn small" onClick={() => onChange({ ...value, seed: randomSeed() })}>Roll</button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RegionForm({ value, onChange }: { value: RegionGenOptions; onChange: (v: RegionGenOptions) => void }) {
  const set = (p: Partial<RegionGenOptions>) => onChange({ ...value, ...p });
  return (
    <div className="grid-2">
      <div>
        <Section title="World shape">
          <SeedRow value={value} onChange={onChange} />
          <SelectField label="Landmass" value={value.shape}
            options={[
              { value: 'continent', label: 'Continent' },
              { value: 'pangaea', label: 'Supercontinent' },
              { value: 'archipelago', label: 'Archipelago' },
              { value: 'atoll', label: 'Atoll / ring isle' },
              { value: 'inland-sea', label: 'Ring around an inland sea' },
              { value: 'coastline', label: 'Coastline (land on one side)' },
            ] as { value: RegionGenOptions['shape']; label: string }[]}
            onChange={(v) => set({ shape: v })} />
          <Slider label="Land vs sea" value={value.landRatio} min={0.15} max={0.85} step={0.01}
            onChange={(v) => set({ landRatio: v })} format={(v) => `${Math.round(v * 100)}% land`} />
          <Slider label="Detail / roughness" value={value.roughness} min={0} max={1} step={0.02}
            onChange={(v) => set({ roughness: v })} />
          <Slider label="Relief (mountainousness)" value={value.relief} min={0} max={1} step={0.02}
            onChange={(v) => set({ relief: v })} />
          <Slider label="Moisture" value={value.moisture} min={-1} max={1} step={0.05}
            onChange={(v) => set({ moisture: v })}
            format={(v) => (v < -0.3 ? 'arid' : v > 0.3 ? 'wet' : 'temperate')} />
          <Slider label="Temperature" value={value.temperature} min={-1} max={1} step={0.05}
            onChange={(v) => set({ temperature: v })}
            format={(v) => (v < -0.3 ? 'frigid' : v > 0.3 ? 'tropical' : 'temperate')} />
        </Section>
        <Section title="Canvas">
          <div className="grid-2">
            <NumberField label="Width" value={value.width} min={512} max={8000} step={64} onChange={(v) => set({ width: v })} />
            <NumberField label="Height" value={value.height} min={512} max={8000} step={64} onChange={(v) => set({ height: v })} />
          </div>
          <SelectField label="Palette" value={value.paletteId}
            options={PALETTES.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => set({ paletteId: v })} />
          <SelectField label="Overlay grid" value={value.gridType}
            options={[
              { value: 'none', label: 'None' },
              { value: 'square', label: 'Square' },
              { value: 'hexPointy', label: 'Hex crawl' },
            ] as { value: RegionGenOptions['gridType']; label: string }[]}
            onChange={(v) => set({ gridType: v })} />
        </Section>
      </div>
      <div>
        <Section title="Features">
          <Toggle label="Rivers" value={value.rivers} onChange={(v) => set({ rivers: v })} />
          {value.rivers && (
            <Slider label="River count" value={value.riverCount} min={0} max={40} step={1}
              onChange={(v) => set({ riverCount: v })} />
          )}
          <Toggle label="Mountain stamps" value={value.mountainStamps} onChange={(v) => set({ mountainStamps: v })} />
          <Toggle label="Hill stamps" value={value.hillStamps} onChange={(v) => set({ hillStamps: v })} />
          <Toggle label="Forest stamps" value={value.forestStamps} onChange={(v) => set({ forestStamps: v })} />
          <Slider label="Settlements" value={value.settlements} min={0} max={40} step={1}
            onChange={(v) => set({ settlements: v })} />
          <Toggle label="Place labels" value={value.labels} onChange={(v) => set({ labels: v })} />
          <Toggle label="Trade roads" value={value.roads} onChange={(v) => set({ roads: v })} />
          {value.roads && (
            <>
              <Slider label="Road redundancy" value={value.roadRedundancy} min={0} max={1} step={0.05}
                onChange={(v) => set({ roadRedundancy: v })}
                format={(v) => (v < 0.15 ? 'bare tree' : v > 0.6 ? 'dense network' : 'some loops')} />
              <Toggle label="Bridges at river crossings" value={value.bridges} onChange={(v) => set({ bridges: v })} />
              <p className="hint">
                Roads are routed with A* over a terrain cost field, so they follow
                valleys, avoid mountains and merge onto one another.
              </p>
            </>
          )}
        </Section>
        <Section title="Politics">
          <Slider label="Realms" value={value.realms} min={0} max={12} step={1}
            onChange={(v) => set({ realms: v })}
            format={(v) => (v === 0 ? 'none' : String(v))} />
          {value.realms > 0 && (
            <>
              <Toggle label="Draw borders" value={value.realmBorders} onChange={(v) => set({ realmBorders: v })} />
              <Slider label="Territory tint" value={value.realmTint} min={0} max={0.8} step={0.05}
                onChange={(v) => set({ realmTint: v })}
                format={(v) => `${Math.round(v * 100)}%`} />
              <p className="hint">
                Realms grow outward from the largest settlements, and mountains and
                open water are expensive to cross — so the borders end up along
                ridgelines and coasts rather than as straight lines.
              </p>
            </>
          )}
        </Section>
        <Section title="Cartography">
          <Toggle label="Compass rose" value={value.compass} onChange={(v) => set({ compass: v })} />
          <Toggle label="Scale bar" value={value.scaleBar} onChange={(v) => set({ scaleBar: v })} />
          <Toggle label="Decorative border" value={value.border} onChange={(v) => set({ border: v })} />
          <Toggle label="Aged parchment vignette" value={value.aged} onChange={(v) => set({ aged: v })} />
          <SelectField label="Naming style" value={value.culture}
            options={[
              { value: 'common', label: 'Common' }, { value: 'elvish', label: 'Elvish' },
              { value: 'dwarven', label: 'Dwarven' }, { value: 'orcish', label: 'Orcish' },
              { value: 'northern', label: 'Northern' }, { value: 'desert', label: 'Desert' },
              { value: 'imperial', label: 'Imperial' },
            ] as { value: RegionGenOptions['culture']; label: string }[]}
            onChange={(v) => set({ culture: v })} />
          <TextField label="Title (optional)" value={value.title || ''} onChange={(v) => set({ title: v })} />
        </Section>
      </div>
    </div>
  );
}

function CityForm({ value, onChange }: { value: CityGenOptions; onChange: (v: CityGenOptions) => void }) {
  const set = (p: Partial<CityGenOptions>) => onChange({ ...value, ...p });
  return (
    <div className="grid-2">
      <div>
        <Section title="Settlement">
          <SeedRow value={value} onChange={onChange} />
          <SelectField label="Size" value={value.size}
            options={[
              { value: 'hamlet', label: 'Hamlet' }, { value: 'village', label: 'Village' },
              { value: 'town', label: 'Town' }, { value: 'city', label: 'City' },
              { value: 'metropolis', label: 'Metropolis' },
            ] as { value: CityGenOptions['size']; label: string }[]}
            onChange={(v) => set({ size: v })} />
          <SelectField label="Street plan" value={value.plan}
            options={[
              { value: 'organic', label: 'Organic (medieval)' },
              { value: 'radial', label: 'Radial' },
              { value: 'grid', label: 'Planned grid' },
              { value: 'river', label: 'Straddling a river' },
              { value: 'coastal', label: 'Coastal' },
            ] as { value: CityGenOptions['plan']; label: string }[]}
            onChange={(v) => set({ plan: v })} />
          <div className="grid-2">
            <NumberField label="Width" value={value.width} min={512} max={6000} step={64} onChange={(v) => set({ width: v })} />
            <NumberField label="Height" value={value.height} min={512} max={6000} step={64} onChange={(v) => set({ height: v })} />
          </div>
          <SelectField label="Palette" value={value.paletteId}
            options={PALETTES.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => set({ paletteId: v })} />
        </Section>
      </div>
      <div>
        <Section title="Features">
          <Toggle label="City walls" value={value.walls} onChange={(v) => set({ walls: v })} />
          {value.walls && (
            <Slider label="Wall towers" value={value.wallTowers} min={4} max={24} step={1}
              onChange={(v) => set({ wallTowers: v })} />
          )}
          <Toggle label="Castle / keep" value={value.castle} onChange={(v) => set({ castle: v })} />
          <Toggle label="Temple" value={value.temple} onChange={(v) => set({ temple: v })} />
          <Toggle label="Market square" value={value.market} onChange={(v) => set({ market: v })} />
          <Toggle label="Docks" value={value.docks} onChange={(v) => set({ docks: v })} />
          <Toggle label="Surrounding farmland" value={value.farmland} onChange={(v) => set({ farmland: v })} />
          <Toggle label="District & tavern labels" value={value.labels} onChange={(v) => set({ labels: v })} />
          <Toggle label="Street lamps (VTT lights)" value={value.streetLamps} onChange={(v) => set({ streetLamps: v })} />
          <SelectField label="Naming style" value={value.culture}
            options={[
              { value: 'common', label: 'Common' }, { value: 'elvish', label: 'Elvish' },
              { value: 'dwarven', label: 'Dwarven' }, { value: 'northern', label: 'Northern' },
              { value: 'desert', label: 'Desert' }, { value: 'imperial', label: 'Imperial' },
            ] as { value: CityGenOptions['culture']; label: string }[]}
            onChange={(v) => set({ culture: v })} />
        </Section>
      </div>
    </div>
  );
}

function DungeonForm({ value, onChange }: { value: DungeonGenOptions; onChange: (v: DungeonGenOptions) => void }) {
  const set = (p: Partial<DungeonGenOptions>) => onChange({ ...value, ...p });
  const cols = Math.floor(value.width / value.cell), rows = Math.floor(value.height / value.cell);
  return (
    <div className="grid-2">
      <div>
        <Section title="Layout">
          <SeedRow value={value} onChange={onChange} />
          <SelectField label="Style" value={value.layout}
            options={[
              { value: 'classic', label: 'Classic corridors & rooms' },
              { value: 'sprawl', label: 'Sprawling complex' },
              { value: 'tomb', label: 'Tomb' },
              { value: 'keep', label: 'Fortified keep' },
              { value: 'mine', label: 'Mine works' },
              { value: 'temple', label: 'Temple' },
            ] as { value: DungeonGenOptions['layout']; label: string }[]}
            onChange={(v) => set({ layout: v })} />
          <Slider label="Rooms" value={value.rooms} min={3} max={40} step={1} onChange={(v) => set({ rooms: v })} />
          <div className="grid-2">
            <NumberField label="Min room" value={value.roomMin} min={2} max={12} suffix="cells" onChange={(v) => set({ roomMin: v })} />
            <NumberField label="Max room" value={value.roomMax} min={3} max={24} suffix="cells" onChange={(v) => set({ roomMax: v })} />
          </div>
          <Slider label="Loops & shortcuts" value={value.loopiness} min={0} max={1} step={0.05}
            onChange={(v) => set({ loopiness: v })} />
          <NumberField label="Corridor width" value={value.corridorWidth} min={1} max={5} suffix="cells"
            onChange={(v) => set({ corridorWidth: Math.round(v) })} />
        </Section>
        <Section title="Canvas">
          <div className="grid-2">
            <NumberField label="Width" value={value.width} min={512} max={8000} step={70} onChange={(v) => set({ width: v })} />
            <NumberField label="Height" value={value.height} min={512} max={8000} step={70} onChange={(v) => set({ height: v })} />
          </div>
          <NumberField label="Cell size" value={value.cell} min={20} max={200} suffix="px" onChange={(v) => set({ cell: v })} />
          <p className="hint">{cols} × {rows} squares · {cols * 5} × {rows * 5} ft</p>
        </Section>
      </div>
      <div>
        <Section title="Contents">
          <Toggle label="Doors" value={value.doors} onChange={(v) => set({ doors: v })} />
          <Slider label="Secret doors" value={value.secretDoors} min={0} max={6} step={1}
            onChange={(v) => set({ secretDoors: v })} />
          <Toggle label="Furnish rooms" value={value.furnish} onChange={(v) => set({ furnish: v })} />
          <Toggle label="Place lights" value={value.lights} onChange={(v) => set({ lights: v })} />
          <Toggle label="Room numbers & purposes" value={value.labels} onChange={(v) => set({ labels: v })} />
          <Toggle label="GM notes with hazards" value={value.notes} onChange={(v) => set({ notes: v })} />
        </Section>
        <Section title="Look">
          <SelectField label="Floor texture" value={value.floorTexture}
            options={TEXTURES.filter((t) => t.group === 'interior' || t.group === 'ground').map((t) => ({ value: t.id, label: t.label }))}
            onChange={(v) => set({ floorTexture: v })} />
          <SelectField label="Wall texture" value={value.wallTexture}
            options={TEXTURES.filter((t) => t.group === 'rock' || t.group === 'interior').map((t) => ({ value: t.id, label: t.label }))}
            onChange={(v) => set({ wallTexture: v })} />
          <Slider label="Edge roughness" value={value.edgeRoughness} min={0} max={1} step={0.05}
            onChange={(v) => set({ edgeRoughness: v })} />
          <SelectField label="Palette" value={value.paletteId}
            options={PALETTES.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => set({ paletteId: v })} />
        </Section>
      </div>
    </div>
  );
}

function CaveForm({ value, onChange }: { value: CaveGenOptions; onChange: (v: CaveGenOptions) => void }) {
  const set = (p: Partial<CaveGenOptions>) => onChange({ ...value, ...p });
  return (
    <div className="grid-2">
      <div>
        <Section title="Caverns">
          <SeedRow value={value} onChange={onChange} />
          <Slider label="Rock density" value={value.density} min={0.3} max={0.6} step={0.01}
            onChange={(v) => set({ density: v })} />
          <Slider label="Smoothing passes" value={value.smoothing} min={1} max={10} step={1}
            onChange={(v) => set({ smoothing: v })} />
          <NumberField label="Minimum pocket" value={value.minPocket} min={5} max={300} suffix="cells"
            onChange={(v) => set({ minPocket: Math.round(v) })} />
          <div className="grid-2">
            <NumberField label="Width" value={value.width} min={512} max={8000} step={70} onChange={(v) => set({ width: v })} />
            <NumberField label="Height" value={value.height} min={512} max={8000} step={70} onChange={(v) => set({ height: v })} />
          </div>
          <NumberField label="Cell size" value={value.cell} min={20} max={200} suffix="px" onChange={(v) => set({ cell: v })} />
        </Section>
      </div>
      <div>
        <Section title="Contents">
          <Toggle label="Water pools" value={value.water} onChange={(v) => set({ water: v })} />
          {value.water && <Slider label="Water amount" value={value.waterLevel} min={0} max={0.4} step={0.01} onChange={(v) => set({ waterLevel: v })} />}
          <Toggle label="Glowing crystals" value={value.crystals} onChange={(v) => set({ crystals: v })} />
          <Toggle label="Fungal growth" value={value.mushrooms} onChange={(v) => set({ mushrooms: v })} />
          <Toggle label="Ambient light sources" value={value.lights} onChange={(v) => set({ lights: v })} />
        </Section>
        <Section title="Look">
          <SelectField label="Floor texture" value={value.floorTexture}
            options={TEXTURES.filter((t) => t.group === 'interior' || t.group === 'rock' || t.group === 'ground').map((t) => ({ value: t.id, label: t.label }))}
            onChange={(v) => set({ floorTexture: v })} />
          <SelectField label="Wall texture" value={value.wallTexture}
            options={TEXTURES.filter((t) => t.group === 'rock' || t.group === 'interior').map((t) => ({ value: t.id, label: t.label }))}
            onChange={(v) => set({ wallTexture: v })} />
          <SelectField label="Palette" value={value.paletteId}
            options={PALETTES.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => set({ paletteId: v })} />
        </Section>
      </div>
    </div>
  );
}

function BattleForm({ value, onChange }: { value: BattleGenOptions; onChange: (v: BattleGenOptions) => void }) {
  const set = (p: Partial<BattleGenOptions>) => onChange({ ...value, ...p });
  return (
    <div className="grid-2">
      <div>
        <Section title="Encounter">
          <SeedRow value={value} onChange={onChange} />
          <SelectField label="Terrain" value={value.biome}
            options={[
              { value: 'forest', label: 'Deep forest' }, { value: 'clearing', label: 'Forest clearing' },
              { value: 'riverbank', label: 'Riverbank' }, { value: 'swamp', label: 'Swamp' },
              { value: 'desert', label: 'Desert' }, { value: 'snow', label: 'Snowfield' },
              { value: 'ruins', label: 'Ruins' }, { value: 'cavern', label: 'Cavern' },
              { value: 'crossroads', label: 'Crossroads' }, { value: 'camp', label: 'Camp' },
              { value: 'graveyard', label: 'Graveyard' }, { value: 'coast', label: 'Coast' },
              { value: 'volcanic', label: 'Volcanic' },
            ] as { value: BattleGenOptions['biome']; label: string }[]}
            onChange={(v) => set({ biome: v })} />
          <div className="grid-2">
            <NumberField label="Columns" value={value.cols} min={8} max={80} suffix="cells" onChange={(v) => set({ cols: Math.round(v) })} />
            <NumberField label="Rows" value={value.rows} min={8} max={80} suffix="cells" onChange={(v) => set({ rows: Math.round(v) })} />
          </div>
          <NumberField label="Cell size" value={value.cell} min={30} max={200} suffix="px" onChange={(v) => set({ cell: v })} />
          <p className="hint">
            {value.cols * value.cell} × {value.rows * value.cell} px · {value.cols * 5} × {value.rows * 5} ft
          </p>
        </Section>
      </div>
      <div>
        <Section title="Terrain">
          <Slider label="Cover density" value={value.density} min={0} max={1} step={0.05} onChange={(v) => set({ density: v })} />
          <Slider label="Water" value={value.water} min={0} max={1} step={0.05} onChange={(v) => set({ water: v })} />
          <Slider label="Elevation shading" value={value.elevation} min={0} max={1} step={0.05} onChange={(v) => set({ elevation: v })} />
          <Toggle label="Scatter props" value={value.props} onChange={(v) => set({ props: v })} />
          <Toggle label="Wall off blocking terrain" value={value.walls} onChange={(v) => set({ walls: v })} />
          <Toggle label="Light sources" value={value.lights} onChange={(v) => set({ lights: v })} />
          <Toggle label="Show grid" value={value.gridVisible} onChange={(v) => set({ gridVisible: v })} />
          <SelectField label="Palette" value={value.paletteId}
            options={PALETTES.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => set({ paletteId: v })} />
        </Section>
      </div>
    </div>
  );
}
