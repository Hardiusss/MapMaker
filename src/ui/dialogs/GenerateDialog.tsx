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
import { generateCastle, DEFAULT_CASTLE_OPTIONS, type CastleGenOptions } from '../../gen/castle/castleGen';
import { generateBattleMap, DEFAULT_BATTLE_OPTIONS, type BattleGenOptions } from '../../gen/battle/battleGen';
import {
  generateOperational, DEFAULT_OPERATIONAL_OPTIONS, type OperationalGenOptions,
} from '../../gen/operational/operationalGen';
import { TEXTURES } from '../../render/textures';
import type { MapKind } from '../../core/types';
import { useLang } from '../../i18n/useLang';
import { paletteName, textureLabel } from '../../i18n/display';

export type GenKind = 'region' | 'operational' | 'dungeon' | 'cave' | 'city' | 'castle' | 'battle';

const TAB_IDS: GenKind[] = ['region', 'operational', 'city', 'castle', 'dungeon', 'cave', 'battle'];

export function kindToGen(kind: MapKind): GenKind {
  switch (kind) {
    case 'dungeon': return 'dungeon';
    case 'cave': return 'cave';
    case 'city': return 'city';
    case 'castle': return 'castle';
    case 'battle': return 'battle';
    case 'operational': return 'operational';
    default: return 'region';
  }
}

export function GenerateDialog({ initial, onClose }: { initial: GenKind; onClose: () => void }) {
  const editor = useEditor();
  const { t } = useLang();
  const [kind, setKind] = React.useState<GenKind>(initial);
  const [busy, setBusy] = React.useState(false);

  const [region, setRegion] = React.useState<RegionGenOptions>({ ...DEFAULT_REGION_OPTIONS, seed: randomSeed(), paletteId: editor.paletteId });
  const [dungeon, setDungeon] = React.useState<DungeonGenOptions>({ ...DEFAULT_DUNGEON_OPTIONS, seed: randomSeed() });
  const [cave, setCave] = React.useState<CaveGenOptions>({ ...DEFAULT_CAVE_OPTIONS, seed: randomSeed() });
  const [city, setCity] = React.useState<CityGenOptions>({ ...DEFAULT_CITY_OPTIONS, seed: randomSeed(), paletteId: editor.paletteId });
  const [castle, setCastle] = React.useState<CastleGenOptions>({ ...DEFAULT_CASTLE_OPTIONS, seed: randomSeed() });
  const [battle, setBattle] = React.useState<BattleGenOptions>({ ...DEFAULT_BATTLE_OPTIONS, seed: randomSeed() });
  const [operational, setOperational] = React.useState<OperationalGenOptions>({ ...DEFAULT_OPERATIONAL_OPTIONS, seed: randomSeed(), paletteId: editor.paletteId });

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
        } else if (kind === 'operational') {
          const o = newSeed ? { ...operational, seed: randomSeed() } : operational;
          if (newSeed) setOperational(o);
          doc = generateOperational(o).doc;
          paletteId = o.paletteId;
        } else if (kind === 'city') {
          const o = newSeed ? { ...city, seed: randomSeed() } : city;
          if (newSeed) setCity(o);
          doc = generateCity(o).doc;
          paletteId = o.paletteId;
        } else if (kind === 'castle') {
          const o = newSeed ? { ...castle, seed: randomSeed() } : castle;
          if (newSeed) setCastle(o);
          doc = generateCastle(o).doc;
          paletteId = o.paletteId;
        } else {
          const o = newSeed ? { ...battle, seed: randomSeed() } : battle;
          if (newSeed) setBattle(o);
          doc = generateBattleMap(o).doc;
          paletteId = o.paletteId;
        }
        editor.setPalette(paletteId);
        editor.setDocument(doc);
        editor.status(t('gen.status.done', { title: doc.meta.title }));
        onClose();
      } catch (err) {
        console.error(err);
        editor.status(t('gen.status.failed', { error: (err as Error).message }));
        setBusy(false);
      }
    }, 30);
  };

  return (
    <Modal
      title={t('gen.title')}
      size="wide"
      onClose={onClose}
      footer={
        <>
          <span className="grow hint">
            {t('gen.hint')}
          </span>
          <button className="btn" onClick={onClose}>{t('action.cancel')}</button>
          <button className="btn" onClick={() => run(true)} disabled={busy}>{t('gen.reroll')}</button>
          <button className="btn primary" onClick={() => run(false)} disabled={busy}>
            {busy ? t('gen.busy') : t('action.generate.short')}
          </button>
        </>
      }
    >
      <div className="panel-tabs" style={{ marginBottom: 16, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line)' }}>
        {TAB_IDS.map((id) => (
          <button key={id} className={`panel-tab ${kind === id ? 'active' : ''}`} onClick={() => setKind(id)}>
            {t(`gen.tab.${id}`)}
          </button>
        ))}
      </div>

      {busy && (
        <div className="empty">
          <div className="spinner" />
          {t('gen.building')}
        </div>
      )}

      {!busy && kind === 'region' && <RegionForm value={region} onChange={setRegion} />}
      {!busy && kind === 'operational' && <OperationalForm value={operational} onChange={setOperational} />}
      {!busy && kind === 'city' && <CityForm value={city} onChange={setCity} />}
      {!busy && kind === 'castle' && <CastleForm value={castle} onChange={setCastle} />}
      {!busy && kind === 'dungeon' && <DungeonForm value={dungeon} onChange={setDungeon} />}
      {!busy && kind === 'cave' && <CaveForm value={cave} onChange={setCave} />}
      {!busy && kind === 'battle' && <BattleForm value={battle} onChange={setBattle} />}
    </Modal>
  );
}

/** Palette options, named in the interface language rather than by their id. */
function paletteOptions(): { value: string; label: string }[] {
  return PALETTES.map((p) => ({ value: p.id, label: paletteName(p.id, p.name) }));
}

function SeedRow<T extends { seed: number }>({ value, onChange }: { value: T; onChange: (v: T) => void }) {
  const { t } = useLang();
  return (
    <div className="field-row" style={{ marginBottom: 12 }}>
      <label>{t('gen.seed')}</label>
      <input type="number" style={{ width: 130 }} value={value.seed}
        onChange={(e) => onChange({ ...value, seed: parseInt(e.target.value, 10) || 1 })} />
      <button className="btn small" onClick={() => onChange({ ...value, seed: randomSeed() })}>{t('gen.roll')}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RegionForm({ value, onChange }: { value: RegionGenOptions; onChange: (v: RegionGenOptions) => void }) {
  const { t } = useLang();
  const set = (p: Partial<RegionGenOptions>) => onChange({ ...value, ...p });
  return (
    <div className="grid-2">
      <div>
        <Section title={t('gen.region.worldShape')}>
          <SeedRow value={value} onChange={onChange} />
          <SelectField label={t('gen.region.landmass')} value={value.shape}
            options={[
              { value: 'continent', label: t('gen.region.shape.continent') },
              { value: 'pangaea', label: t('gen.region.shape.pangaea') },
              { value: 'archipelago', label: t('gen.region.shape.archipelago') },
              { value: 'atoll', label: t('gen.region.shape.atoll') },
              { value: 'inland-sea', label: t('gen.region.shape.inlandSea') },
              { value: 'coastline', label: t('gen.region.shape.coastline') },
            ] as { value: RegionGenOptions['shape']; label: string }[]}
            onChange={(v) => set({ shape: v })} />
          <Slider label={t('gen.region.landRatio')} value={value.landRatio} min={0.15} max={0.85} step={0.01}
            onChange={(v) => set({ landRatio: v })}
            format={(v) => t('gen.region.landPercent', { percent: Math.round(v * 100) })} />
          <Slider label={t('gen.region.roughness')} value={value.roughness} min={0} max={1} step={0.02}
            onChange={(v) => set({ roughness: v })} />
          <Slider label={t('gen.region.relief')} value={value.relief} min={0} max={1} step={0.02}
            onChange={(v) => set({ relief: v })} />
          <Slider label={t('gen.region.moisture')} value={value.moisture} min={-1} max={1} step={0.05}
            onChange={(v) => set({ moisture: v })}
            format={(v) => (v < -0.3 ? t('gen.region.moisture.arid') : v > 0.3 ? t('gen.region.moisture.wet') : t('gen.region.moisture.temperate'))} />
          <Slider label={t('gen.region.temperature')} value={value.temperature} min={-1} max={1} step={0.05}
            onChange={(v) => set({ temperature: v })}
            format={(v) => (v < -0.3 ? t('gen.region.temp.frigid') : v > 0.3 ? t('gen.region.temp.tropical') : t('gen.region.temp.temperate'))} />
        </Section>
        <Section title={t('map.canvas')}>
          <div className="grid-2">
            <NumberField label={t('field.width')} value={value.width} min={512} max={8000} step={64} onChange={(v) => set({ width: v })} />
            <NumberField label={t('field.height')} value={value.height} min={512} max={8000} step={64} onChange={(v) => set({ height: v })} />
          </div>
          <SelectField label={t('field.palette')} value={value.paletteId}
            options={paletteOptions()}
            onChange={(v) => set({ paletteId: v })} />
          <SelectField label={t('gen.region.overlayGrid')} value={value.gridType}
            options={[
              { value: 'none', label: t('grid.none') },
              { value: 'square', label: t('grid.square') },
              { value: 'hexPointy', label: t('grid.hexCrawl') },
            ] as { value: RegionGenOptions['gridType']; label: string }[]}
            onChange={(v) => set({ gridType: v })} />
        </Section>
      </div>
      <div>
        <Section title={t('gen.region.features')}>
          <Toggle label={t('gen.region.rivers')} value={value.rivers} onChange={(v) => set({ rivers: v })} />
          {value.rivers && (
            <Slider label={t('gen.region.riverCount')} value={value.riverCount} min={0} max={40} step={1}
              onChange={(v) => set({ riverCount: v })} />
          )}
          <Toggle label={t('gen.region.mountainStamps')} value={value.mountainStamps} onChange={(v) => set({ mountainStamps: v })} />
          <Toggle label={t('gen.region.hillStamps')} value={value.hillStamps} onChange={(v) => set({ hillStamps: v })} />
          <Toggle label={t('gen.region.forestStamps')} value={value.forestStamps} onChange={(v) => set({ forestStamps: v })} />
          <Slider label={t('gen.region.settlements')} value={value.settlements} min={0} max={40} step={1}
            onChange={(v) => set({ settlements: v })} />
          <Toggle label={t('gen.region.labels')} value={value.labels} onChange={(v) => set({ labels: v })} />
          <Toggle label={t('gen.region.roads')} value={value.roads} onChange={(v) => set({ roads: v })} />
          {value.roads && (
            <>
              <Slider label={t('gen.region.roadRedundancy')} value={value.roadRedundancy} min={0} max={1} step={0.05}
                onChange={(v) => set({ roadRedundancy: v })}
                format={(v) => (v < 0.15 ? t('gen.region.roads.bare') : v > 0.6 ? t('gen.region.roads.dense') : t('gen.region.roads.loops'))} />
              <Toggle label={t('gen.region.bridges')} value={value.bridges} onChange={(v) => set({ bridges: v })} />
              <p className="hint">
                {t('gen.region.roadsHint')}
              </p>
            </>
          )}
        </Section>
        <Section title={t('gen.region.politics')}>
          <Slider label={t('gen.region.realms')} value={value.realms} min={0} max={12} step={1}
            onChange={(v) => set({ realms: v })}
            format={(v) => (v === 0 ? t('gen.region.realms.none') : String(v))} />
          {value.realms > 0 && (
            <>
              <Toggle label={t('gen.region.realmBorders')} value={value.realmBorders} onChange={(v) => set({ realmBorders: v })} />
              <Slider label={t('gen.region.realmTint')} value={value.realmTint} min={0} max={0.8} step={0.05}
                onChange={(v) => set({ realmTint: v })}
                format={(v) => `${Math.round(v * 100)}%`} />
              <p className="hint">
                {t('gen.region.realmsHint')}
              </p>
            </>
          )}
        </Section>
        <Section title={t('gen.region.cartography')}>
          <Toggle label={t('gen.region.compass')} value={value.compass} onChange={(v) => set({ compass: v })} />
          <Toggle label={t('gen.region.scaleBar')} value={value.scaleBar} onChange={(v) => set({ scaleBar: v })} />
          <Toggle label={t('gen.region.border')} value={value.border} onChange={(v) => set({ border: v })} />
          <Toggle label={t('gen.region.aged')} value={value.aged} onChange={(v) => set({ aged: v })} />
          <SelectField label={t('gen.region.culture')} value={value.culture}
            options={[
              { value: 'common', label: t('culture.common') }, { value: 'elvish', label: t('culture.elvish') },
              { value: 'dwarven', label: t('culture.dwarven') }, { value: 'orcish', label: t('culture.orcish') },
              { value: 'northern', label: t('culture.northern') }, { value: 'desert', label: t('culture.desert') },
              { value: 'imperial', label: t('culture.imperial') },
            ] as { value: RegionGenOptions['culture']; label: string }[]}
            onChange={(v) => set({ culture: v })} />
          <TextField label={t('gen.region.titleOptional')} value={value.title || ''} onChange={(v) => set({ title: v })} />
        </Section>
      </div>
    </div>
  );
}

function CityForm({ value, onChange }: { value: CityGenOptions; onChange: (v: CityGenOptions) => void }) {
  const { t } = useLang();
  const set = (p: Partial<CityGenOptions>) => onChange({ ...value, ...p });
  return (
    <div className="grid-2">
      <div>
        <Section title={t('gen.city.settlement')}>
          <SeedRow value={value} onChange={onChange} />
          <SelectField label={t('field.size')} value={value.size}
            options={[
              { value: 'hamlet', label: t('gen.city.size.hamlet') }, { value: 'village', label: t('gen.city.size.village') },
              { value: 'town', label: t('gen.city.size.town') }, { value: 'city', label: t('gen.city.size.city') },
              { value: 'metropolis', label: t('gen.city.size.metropolis') },
            ] as { value: CityGenOptions['size']; label: string }[]}
            onChange={(v) => set({ size: v })} />
          <SelectField label={t('gen.city.plan')} value={value.plan}
            options={[
              { value: 'organic', label: t('gen.city.plan.organic') },
              { value: 'radial', label: t('gen.city.plan.radial') },
              { value: 'grid', label: t('gen.city.plan.grid') },
              { value: 'river', label: t('gen.city.plan.river') },
              { value: 'coastal', label: t('gen.city.plan.coastal') },
            ] as { value: CityGenOptions['plan']; label: string }[]}
            onChange={(v) => set({ plan: v })} />
          <div className="grid-2">
            <NumberField label={t('field.width')} value={value.width} min={512} max={6000} step={64} onChange={(v) => set({ width: v })} />
            <NumberField label={t('field.height')} value={value.height} min={512} max={6000} step={64} onChange={(v) => set({ height: v })} />
          </div>
          <SelectField label={t('field.palette')} value={value.paletteId}
            options={paletteOptions()}
            onChange={(v) => set({ paletteId: v })} />
        </Section>
      </div>
      <div>
        <Section title={t('gen.region.features')}>
          <Toggle label={t('gen.city.walls')} value={value.walls} onChange={(v) => set({ walls: v })} />
          {value.walls && (
            <Slider label={t('gen.city.wallTowers')} value={value.wallTowers} min={4} max={24} step={1}
              onChange={(v) => set({ wallTowers: v })} />
          )}
          <Toggle label={t('gen.city.castle')} value={value.castle} onChange={(v) => set({ castle: v })} />
          <Toggle label={t('gen.city.temple')} value={value.temple} onChange={(v) => set({ temple: v })} />
          <Toggle label={t('gen.city.market')} value={value.market} onChange={(v) => set({ market: v })} />
          <Toggle label={t('gen.city.docks')} value={value.docks} onChange={(v) => set({ docks: v })} />
          <Toggle label={t('gen.city.farmland')} value={value.farmland} onChange={(v) => set({ farmland: v })} />
          <Toggle label={t('gen.city.labels')} value={value.labels} onChange={(v) => set({ labels: v })} />
          <Toggle label={t('gen.city.streetLamps')} value={value.streetLamps} onChange={(v) => set({ streetLamps: v })} />
          <SelectField label={t('gen.region.culture')} value={value.culture}
            options={[
              { value: 'common', label: t('culture.common') }, { value: 'elvish', label: t('culture.elvish') },
              { value: 'dwarven', label: t('culture.dwarven') }, { value: 'northern', label: t('culture.northern') },
              { value: 'desert', label: t('culture.desert') }, { value: 'imperial', label: t('culture.imperial') },
            ] as { value: CityGenOptions['culture']; label: string }[]}
            onChange={(v) => set({ culture: v })} />
        </Section>
      </div>
    </div>
  );
}

function CastleForm({ value, onChange }: { value: CastleGenOptions; onChange: (v: CastleGenOptions) => void }) {
  const { t } = useLang();
  const set = (p: Partial<CastleGenOptions>) => onChange({ ...value, ...p });
  const cols = Math.floor(value.width / value.cell), rows = Math.floor(value.height / value.cell);
  const earthwork = value.style === 'hillfort';
  return (
    <div className="grid-2">
      <div>
        <Section title={t('gen.castle.fortification')}>
          <SeedRow value={value} onChange={onChange} />
          <SelectField label={t('field.style')} value={value.style}
            options={[
              { value: 'motte-bailey', label: t('gen.castle.style.motte') },
              { value: 'concentric', label: t('gen.castle.style.concentric') },
              { value: 'shell-keep', label: t('gen.castle.style.shellKeep') },
              { value: 'coastal', label: t('gen.castle.style.coastal') },
              { value: 'star-fort', label: t('gen.castle.style.starFort') },
              { value: 'hillfort', label: t('gen.castle.style.hillfort') },
            ] as { value: CastleGenOptions['style']; label: string }[]}
            onChange={(v) => set({ style: v })} />
          <Slider label={t('gen.castle.footprint')} value={value.size} min={0.3} max={1} step={0.05}
            onChange={(v) => set({ size: v })}
            format={(v) => (v < 0.5 ? t('gen.castle.footprint.tower') : v < 0.75 ? t('gen.castle.footprint.baron') : t('gen.castle.footprint.royal'))} />
          <Slider label={t('gen.castle.baileys')} value={value.baileys} min={1} max={2} step={1}
            onChange={(v) => set({ baileys: v })}
            format={(v) => (v === 1 ? t('gen.castle.baileys.one') : t('gen.castle.baileys.two'))} />
          <Slider label={t('gen.castle.towerSpacing')} value={value.towerSpacing} min={5} max={18} step={1}
            onChange={(v) => set({ towerSpacing: v })}
            format={(v) => t('gen.castle.towerSpacing.value', { cells: v, feet: v * 5 })} />
        </Section>
        <Section title={t('gen.castle.ditch')}>
          <Toggle label={earthwork ? t('gen.castle.wetDitches') : t('gen.castle.moat')} value={value.moat} onChange={(v) => set({ moat: v })} />
          <Slider label={t('field.width')} value={value.moatWidth} min={1} max={6} step={0.5}
            onChange={(v) => set({ moatWidth: v })} format={(v) => t('gen.castle.moatWidth', { feet: v * 5 })} />
          <p className="hint">
            {t('gen.castle.moatHint')}
          </p>
        </Section>
        <Section title={t('map.canvas')}>
          <div className="grid-2">
            <NumberField label={t('field.width')} value={value.width} min={1400} max={8400} step={70} onChange={(v) => set({ width: v })} />
            <NumberField label={t('field.height')} value={value.height} min={1400} max={8400} step={70} onChange={(v) => set({ height: v })} />
          </div>
          <NumberField label={t('field.cellSize')} value={value.cell} min={30} max={200} suffix={t('field.px')} onChange={(v) => set({ cell: v })} />
          <p className="hint">{t('gen.castle.squares', { cols, rows, fw: cols * 5, fh: rows * 5 })}</p>
        </Section>
      </div>
      <div>
        <Section title={t('gen.castle.contents')}>
          <Toggle label={t('gen.castle.courtyardBuildings')} value={value.courtyardBuildings}
            onChange={(v) => set({ courtyardBuildings: v })} />
          <Toggle label={t('gen.castle.lights')} value={value.lights} onChange={(v) => set({ lights: v })} />
          <Toggle label={t('gen.castle.labels')} value={value.labels} onChange={(v) => set({ labels: v })} />
          <Toggle label={t('gen.castle.notes')} value={value.notes} onChange={(v) => set({ notes: v })} />
        </Section>
        <Section title={t('gen.castle.condition')}>
          <Slider label={t('gen.castle.ruined')} value={value.ruined} min={0} max={1} step={0.05}
            onChange={(v) => set({ ruined: v })}
            format={(v) => (v < 0.05 ? t('gen.castle.ruined.held')
              : v < 0.35 ? t('gen.castle.ruined.slighted')
              : v < 0.7 ? t('gen.castle.ruined.half') : t('gen.castle.ruined.shell'))} />
          <p className="hint">
            {t('gen.castle.ruinHint')}
          </p>
        </Section>
        <Section title={t('gen.castle.look')}>
          <SelectField label={t('field.palette')} value={value.paletteId}
            options={paletteOptions()}
            onChange={(v) => set({ paletteId: v })} />
          <TextField label={t('gen.region.titleOptional')} value={value.title || ''} onChange={(v) => set({ title: v })} />
        </Section>
      </div>
    </div>
  );
}

function DungeonForm({ value, onChange }: { value: DungeonGenOptions; onChange: (v: DungeonGenOptions) => void }) {
  const { t } = useLang();
  const set = (p: Partial<DungeonGenOptions>) => onChange({ ...value, ...p });
  const cols = Math.floor(value.width / value.cell), rows = Math.floor(value.height / value.cell);
  return (
    <div className="grid-2">
      <div>
        <Section title={t('gen.dungeon.layout')}>
          <SeedRow value={value} onChange={onChange} />
          <SelectField label={t('field.style')} value={value.layout}
            options={[
              { value: 'classic', label: t('gen.dungeon.style.classic') },
              { value: 'sprawl', label: t('gen.dungeon.style.sprawl') },
              { value: 'tomb', label: t('gen.dungeon.style.tomb') },
              { value: 'keep', label: t('gen.dungeon.style.keep') },
              { value: 'mine', label: t('gen.dungeon.style.mine') },
              { value: 'temple', label: t('gen.dungeon.style.temple') },
            ] as { value: DungeonGenOptions['layout']; label: string }[]}
            onChange={(v) => set({ layout: v })} />
          <Slider label={t('gen.dungeon.rooms')} value={value.rooms} min={3} max={40} step={1} onChange={(v) => set({ rooms: v })} />
          <div className="grid-2">
            <NumberField label={t('gen.dungeon.roomMin')} value={value.roomMin} min={2} max={12} suffix={t('field.cells')} onChange={(v) => set({ roomMin: v })} />
            <NumberField label={t('gen.dungeon.roomMax')} value={value.roomMax} min={3} max={24} suffix={t('field.cells')} onChange={(v) => set({ roomMax: v })} />
          </div>
          <Slider label={t('gen.dungeon.loopiness')} value={value.loopiness} min={0} max={1} step={0.05}
            onChange={(v) => set({ loopiness: v })} />
          <NumberField label={t('gen.dungeon.corridorWidth')} value={value.corridorWidth} min={1} max={5} suffix={t('field.cells')}
            onChange={(v) => set({ corridorWidth: Math.round(v) })} />
        </Section>
        <Section title={t('map.canvas')}>
          <div className="grid-2">
            <NumberField label={t('field.width')} value={value.width} min={512} max={8000} step={70} onChange={(v) => set({ width: v })} />
            <NumberField label={t('field.height')} value={value.height} min={512} max={8000} step={70} onChange={(v) => set({ height: v })} />
          </div>
          <NumberField label={t('field.cellSize')} value={value.cell} min={20} max={200} suffix={t('field.px')} onChange={(v) => set({ cell: v })} />
          <p className="hint">{t('gen.castle.squares', { cols, rows, fw: cols * 5, fh: rows * 5 })}</p>
        </Section>
      </div>
      <div>
        <Section title={t('gen.castle.contents')}>
          <Toggle label={t('gen.dungeon.doors')} value={value.doors} onChange={(v) => set({ doors: v })} />
          <Slider label={t('gen.dungeon.secretDoors')} value={value.secretDoors} min={0} max={6} step={1}
            onChange={(v) => set({ secretDoors: v })} />
          <Toggle label={t('gen.dungeon.furnish')} value={value.furnish} onChange={(v) => set({ furnish: v })} />
          <Toggle label={t('gen.dungeon.lights')} value={value.lights} onChange={(v) => set({ lights: v })} />
          <Toggle label={t('gen.dungeon.labels')} value={value.labels} onChange={(v) => set({ labels: v })} />
          <Toggle label={t('gen.dungeon.notes')} value={value.notes} onChange={(v) => set({ notes: v })} />
        </Section>
        <Section title={t('gen.castle.look')}>
          <SelectField label={t('gen.dungeon.floorTexture')} value={value.floorTexture}
            options={TEXTURES.filter((x) => x.group === 'interior' || x.group === 'ground').map((x) => ({ value: x.id, label: textureLabel(x.id, x.label) }))}
            onChange={(v) => set({ floorTexture: v })} />
          <SelectField label={t('gen.dungeon.wallTexture')} value={value.wallTexture}
            options={TEXTURES.filter((x) => x.group === 'rock' || x.group === 'interior').map((x) => ({ value: x.id, label: textureLabel(x.id, x.label) }))}
            onChange={(v) => set({ wallTexture: v })} />
          <Slider label={t('gen.dungeon.edgeRoughness')} value={value.edgeRoughness} min={0} max={1} step={0.05}
            onChange={(v) => set({ edgeRoughness: v })} />
          <SelectField label={t('field.palette')} value={value.paletteId}
            options={paletteOptions()}
            onChange={(v) => set({ paletteId: v })} />
        </Section>
      </div>
    </div>
  );
}

function OperationalForm({ value, onChange }: { value: OperationalGenOptions; onChange: (v: OperationalGenOptions) => void }) {
  const { t } = useLang();
  const set = (p: Partial<OperationalGenOptions>) => onChange({ ...value, ...p });
  const cols = Math.max(10, Math.floor(value.width / value.cell));
  const rows = Math.max(8, Math.floor(value.height / value.cell));
  return (
    <div className="grid-2">
      <div>
        <Section title={t('gen.op.ground')}>
          <SeedRow value={value} onChange={onChange} />
          <Slider label={t('gen.op.relief')} value={value.relief} min={0} max={1} step={0.05}
            format={(v) => (v < 0.3 ? t('gen.op.relief.plain') : v < 0.65 ? t('gen.op.relief.rolling') : t('gen.op.relief.pass'))}
            onChange={(v) => set({ relief: v })} />
          <Slider label={t('gen.op.woodland')} value={value.woodland} min={0} max={1} step={0.05}
            onChange={(v) => set({ woodland: v })} />
          <Slider label={t('gen.op.wetness')} value={value.wetness} min={0} max={1} step={0.05}
            onChange={(v) => set({ wetness: v })} />
          <Slider label={t('gen.op.settlement')} value={value.settlement} min={0} max={1} step={0.05}
            onChange={(v) => set({ settlement: v })} />
        </Section>
        <Section title={t('gen.op.extent')}>
          <div className="grid-2">
            <NumberField label={t('field.width')} value={value.width} min={960} max={6000} step={96} onChange={(v) => set({ width: v })} />
            <NumberField label={t('field.height')} value={value.height} min={768} max={6000} step={96} onChange={(v) => set({ height: v })} />
          </div>
          <NumberField label={t('field.cellSize')} value={value.cell} min={48} max={200} suffix={t('field.px')} onChange={(v) => set({ cell: v })} />
          <div className="grid-2">
            <NumberField label={t('gen.op.perCell')} value={value.unitsPerCell} min={10} max={2000}
              onChange={(v) => set({ unitsPerCell: Math.round(v) })} />
            <TextField label={t('gen.op.units')} value={value.unitLabel} onChange={(v) => set({ unitLabel: v })} />
          </div>
          <p className="hint" style={{ margin: '2px 0 0' }}>
            {t('gen.op.summary', {
              cols, rows,
              gw: (cols * value.unitsPerCell).toLocaleString(),
              gh: (rows * value.unitsPerCell).toLocaleString(),
              unit: value.unitLabel,
            })}
          </p>
        </Section>
      </div>
      <div>
        <Section title={t('gen.op.staffOverlay')}>
          <Toggle label={t('gen.op.overlay')} value={value.overlay} onChange={(v) => set({ overlay: v })} />
          <Toggle label={t('gen.op.contours')} value={value.contours} onChange={(v) => set({ contours: v })} />
          <NumberField label={t('gen.op.sectorSize')} value={value.sectorSize} min={2} max={8} suffix={t('field.cells')}
            onChange={(v) => set({ sectorSize: Math.round(v) })} />
          <NumberField label={t('gen.op.objectives')} value={value.objectives} min={0} max={12}
            onChange={(v) => set({ objectives: Math.round(v) })} />
          <p className="hint" style={{ margin: '2px 0 0' }}>
            {t('gen.op.sectorHintPre')}
            {/* The call is API, not prose — it stays as written in every language. */}
            <code> Aetheria.generate.battleFromSector(theatre, 'C3')</code>{' '}
            {t('gen.op.sectorHintPost')}
          </p>
        </Section>
        <Section title={t('gen.castle.look')}>
          <SelectField label={t('field.palette')} value={value.paletteId}
            options={paletteOptions()}
            onChange={(v) => set({ paletteId: v })} />
        </Section>
      </div>
    </div>
  );
}

function CaveForm({ value, onChange }: { value: CaveGenOptions; onChange: (v: CaveGenOptions) => void }) {
  const { t } = useLang();
  const set = (p: Partial<CaveGenOptions>) => onChange({ ...value, ...p });
  return (
    <div className="grid-2">
      <div>
        <Section title={t('gen.cave.caverns')}>
          <SeedRow value={value} onChange={onChange} />
          <SelectField label={t('gen.dungeon.layout')} value={value.style}
            options={[
              { value: 'chambers', label: t('gen.cave.style.chambers') },
              { value: 'warren', label: t('gen.cave.style.warren') },
              { value: 'cavern', label: t('gen.cave.style.cavern') },
            ]}
            onChange={(v) => set({ style: v as CaveGenOptions['style'] })} />
          {value.style !== 'cavern' && (
            <NumberField label={t('gen.cave.chambers')} value={value.chambers} min={0} max={60}
              suffix={value.chambers === 0 ? t('gen.cave.auto') : ''}
              onChange={(v) => set({ chambers: Math.round(v) })} />
          )}
          {value.style === 'cavern' && (
            <Slider label={t('gen.cave.density')} value={value.density} min={0.3} max={0.6} step={0.01}
              onChange={(v) => set({ density: v })} />
          )}
          <Slider label={t('gen.cave.smoothing')} value={value.smoothing} min={1} max={10} step={1}
            onChange={(v) => set({ smoothing: v })} />
          <NumberField label={t('gen.cave.minPocket')} value={value.minPocket} min={5} max={300} suffix={t('field.cells')}
            onChange={(v) => set({ minPocket: Math.round(v) })} />
          <div className="grid-2">
            <NumberField label={t('field.width')} value={value.width} min={512} max={8000} step={70} onChange={(v) => set({ width: v })} />
            <NumberField label={t('field.height')} value={value.height} min={512} max={8000} step={70} onChange={(v) => set({ height: v })} />
          </div>
          <NumberField label={t('field.cellSize')} value={value.cell} min={20} max={200} suffix={t('field.px')} onChange={(v) => set({ cell: v })} />
        </Section>
      </div>
      <div>
        <Section title={t('gen.castle.contents')}>
          <Toggle label={t('gen.cave.water')} value={value.water} onChange={(v) => set({ water: v })} />
          {value.water && <Slider label={t('gen.cave.waterLevel')} value={value.waterLevel} min={0} max={0.4} step={0.01} onChange={(v) => set({ waterLevel: v })} />}
          <Toggle label={t('gen.cave.crystals')} value={value.crystals} onChange={(v) => set({ crystals: v })} />
          <Toggle label={t('gen.cave.mushrooms')} value={value.mushrooms} onChange={(v) => set({ mushrooms: v })} />
          <Toggle label={t('gen.cave.lights')} value={value.lights} onChange={(v) => set({ lights: v })} />
        </Section>
        <Section title={t('gen.castle.look')}>
          <SelectField label={t('gen.dungeon.floorTexture')} value={value.floorTexture}
            options={TEXTURES.filter((x) => x.group === 'interior' || x.group === 'rock' || x.group === 'ground').map((x) => ({ value: x.id, label: textureLabel(x.id, x.label) }))}
            onChange={(v) => set({ floorTexture: v })} />
          <SelectField label={t('gen.dungeon.wallTexture')} value={value.wallTexture}
            options={TEXTURES.filter((x) => x.group === 'rock' || x.group === 'interior').map((x) => ({ value: x.id, label: textureLabel(x.id, x.label) }))}
            onChange={(v) => set({ wallTexture: v })} />
          <SelectField label={t('field.palette')} value={value.paletteId}
            options={paletteOptions()}
            onChange={(v) => set({ paletteId: v })} />
        </Section>
      </div>
    </div>
  );
}

function BattleForm({ value, onChange }: { value: BattleGenOptions; onChange: (v: BattleGenOptions) => void }) {
  const { t } = useLang();
  const set = (p: Partial<BattleGenOptions>) => onChange({ ...value, ...p });
  return (
    <div className="grid-2">
      <div>
        <Section title={t('gen.battle.encounter')}>
          <SeedRow value={value} onChange={onChange} />
          <SelectField label={t('gen.battle.terrain')} value={value.biome}
            options={[
              { value: 'forest', label: t('gen.battle.biome.forest') }, { value: 'clearing', label: t('gen.battle.biome.clearing') },
              { value: 'riverbank', label: t('gen.battle.biome.riverbank') }, { value: 'swamp', label: t('gen.battle.biome.swamp') },
              { value: 'desert', label: t('gen.battle.biome.desert') }, { value: 'snow', label: t('gen.battle.biome.snow') },
              { value: 'ruins', label: t('gen.battle.biome.ruins') }, { value: 'cavern', label: t('gen.battle.biome.cavern') },
              { value: 'crossroads', label: t('gen.battle.biome.crossroads') }, { value: 'camp', label: t('gen.battle.biome.camp') },
              { value: 'graveyard', label: t('gen.battle.biome.graveyard') }, { value: 'coast', label: t('gen.battle.biome.coast') },
              { value: 'volcanic', label: t('gen.battle.biome.volcanic') },
            ] as { value: BattleGenOptions['biome']; label: string }[]}
            onChange={(v) => set({ biome: v })} />
          <div className="grid-2">
            <NumberField label={t('gen.battle.cols')} value={value.cols} min={8} max={80} suffix={t('field.cells')} onChange={(v) => set({ cols: Math.round(v) })} />
            <NumberField label={t('gen.battle.rows')} value={value.rows} min={8} max={80} suffix={t('field.cells')} onChange={(v) => set({ rows: Math.round(v) })} />
          </div>
          <NumberField label={t('field.cellSize')} value={value.cell} min={30} max={200} suffix={t('field.px')} onChange={(v) => set({ cell: v })} />
          <p className="hint">
            {t('gen.battle.summary', {
              w: value.cols * value.cell, h: value.rows * value.cell,
              fw: value.cols * 5, fh: value.rows * 5,
            })}
          </p>
        </Section>
      </div>
      <div>
        <Section title={t('gen.battle.terrain')}>
          <Slider label={t('gen.battle.density')} value={value.density} min={0} max={1} step={0.05} onChange={(v) => set({ density: v })} />
          <Slider label={t('gen.battle.water')} value={value.water} min={0} max={1} step={0.05} onChange={(v) => set({ water: v })} />
          <Slider label={t('gen.battle.elevation')} value={value.elevation} min={0} max={1} step={0.05} onChange={(v) => set({ elevation: v })} />
          <Toggle label={t('gen.battle.props')} value={value.props} onChange={(v) => set({ props: v })} />
          <Toggle label={t('gen.battle.walls')} value={value.walls} onChange={(v) => set({ walls: v })} />
          <Toggle label={t('gen.battle.lights')} value={value.lights} onChange={(v) => set({ lights: v })} />
          <Toggle label={t('gen.battle.gridVisible')} value={value.gridVisible} onChange={(v) => set({ gridVisible: v })} />
          <SelectField label={t('field.palette')} value={value.paletteId}
            options={paletteOptions()}
            onChange={(v) => set({ paletteId: v })} />
        </Section>
      </div>
    </div>
  );
}
