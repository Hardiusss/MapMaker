/**
 * Fantasy name generation.
 *
 * Syllable-based with per-culture inventories, plus templated names for
 * settlements, rivers, ranges, dungeons and taverns. Everything is seeded, so a
 * regenerated map keeps its names.
 */
import { RNG } from '../core/rng';

export type Culture = 'common' | 'elvish' | 'dwarven' | 'orcish' | 'northern' | 'desert' | 'imperial';

interface Inventory {
  onset: string[];
  nucleus: string[];
  coda: string[];
  suffix: string[];
  minSyl: number;
  maxSyl: number;
}

const INVENTORIES: Record<Culture, Inventory> = {
  common: {
    onset: ['b', 'br', 'c', 'cr', 'd', 'dr', 'f', 'fl', 'g', 'gl', 'gr', 'h', 'k', 'l', 'm', 'n', 'p', 'pr', 'r', 's', 'st', 'str', 't', 'th', 'tr', 'v', 'w', 'wh'],
    nucleus: ['a', 'e', 'i', 'o', 'u', 'ae', 'ea', 'ei', 'ou', 'y'],
    coda: ['', '', 'n', 'r', 'l', 'm', 'th', 'ck', 'ld', 'nd', 'rn', 'st', 'sh'],
    suffix: ['ton', 'ford', 'wick', 'field', 'hollow', 'bury', 'mere', 'stead', 'moor', 'bridge', 'gate', 'hill', 'crest', 'watch', 'reach'],
    minSyl: 2, maxSyl: 3,
  },
  elvish: {
    onset: ['ae', 'al', 'c', 'el', 'f', 'g', 'il', 'l', 'll', 'm', 'n', 'r', 's', 'sh', 't', 'th', 'v', 'y'],
    nucleus: ['a', 'e', 'i', 'ia', 'ie', 'io', 'ae', 'ea', 'ei', 'u'],
    coda: ['', '', 'l', 'n', 'r', 'th', 'ss', 'll', 'nd'],
    suffix: ['iel', 'wen', 'dor', 'lond', 'thil', 'rian', 'aleth', 'mar', 'seth', 'lorn'],
    minSyl: 2, maxSyl: 4,
  },
  dwarven: {
    onset: ['b', 'br', 'd', 'dr', 'g', 'gr', 'k', 'kh', 'm', 'n', 'r', 't', 'th', 'v', 'z'],
    nucleus: ['a', 'o', 'u', 'i', 'ai', 'au', 'ou'],
    coda: ['n', 'r', 'k', 'm', 'g', 'rd', 'rn', 'lk', 'zg', 'nd'],
    suffix: ['heim', 'dun', 'delve', 'forge', 'hold', 'deep', 'grim', 'stone', 'anvil', 'mor'],
    minSyl: 2, maxSyl: 3,
  },
  orcish: {
    onset: ['b', 'br', 'd', 'g', 'gr', 'gh', 'k', 'kr', 'm', 'n', 'r', 'sk', 'sn', 't', 'th', 'v', 'z', 'zh'],
    nucleus: ['a', 'o', 'u', 'ua', 'oo', 'ar'],
    coda: ['g', 'k', 'r', 'sh', 'z', 'gh', 'rk', 'th', 'nk'],
    suffix: ['gash', 'mog', 'krul', 'nak', 'thak', 'skar', 'brog', 'zul'],
    minSyl: 2, maxSyl: 3,
  },
  northern: {
    onset: ['b', 'bj', 'd', 'f', 'g', 'h', 'hr', 'j', 'k', 'kn', 'r', 's', 'sk', 'sn', 'st', 'sv', 't', 'th', 'v'],
    nucleus: ['a', 'e', 'i', 'o', 'u', 'ei', 'au', 'ja', 'y'],
    coda: ['n', 'r', 'l', 'ld', 'rd', 'ss', 'k', 'g', 'st'],
    suffix: ['heim', 'vik', 'fjord', 'gard', 'skar', 'holm', 'ness', 'dal', 'berg'],
    minSyl: 2, maxSyl: 3,
  },
  desert: {
    onset: ['b', 'd', 'f', 'h', 'j', 'k', 'kh', 'm', 'n', 'q', 'r', 's', 'sh', 't', 'z', 'zh'],
    nucleus: ['a', 'i', 'u', 'aa', 'ai', 'ee'],
    coda: ['b', 'd', 'h', 'l', 'm', 'n', 'r', 's', 'z', 'q'],
    suffix: ['abad', 'ahar', 'zir', 'sar', 'mesh', 'kesh', 'rah', 'dun'],
    minSyl: 2, maxSyl: 3,
  },
  imperial: {
    onset: ['c', 'cl', 'd', 'f', 'g', 'l', 'm', 'n', 'p', 'pr', 'r', 's', 'str', 't', 'tr', 'v'],
    nucleus: ['a', 'e', 'i', 'o', 'u', 'ia', 'io', 'au'],
    coda: ['', 'n', 'r', 's', 'm', 'l', 'nt', 'st', 'ct'],
    suffix: ['ium', 'ia', 'us', 'anum', 'ora', 'entia', 'aris', 'ium'],
    minSyl: 2, maxSyl: 3,
  },
};

/**
 * Substrings a randomly-concatenated syllable name must never contain.
 *
 * Gluing syllables together will eventually produce something unfortunate, and
 * a map that hands the table an accidental obscenity in 48-point display type
 * is not a map anyone wants to show their players. Cheap to check, so checked
 * on every generated name.
 */
const BANNED = [
  'fuck', 'shit', 'cunt', 'piss', 'cock', 'dick', 'wank', 'twat', 'bitch',
  'slut', 'whore', 'rape', 'nigg', 'fagg', 'spic', 'kike', 'chink', 'retard',
  'anus', 'arse', 'ass', 'tits', 'boob', 'penis', 'vagin', 'semen', 'turd',
  'poo', 'wee', 'jizz', 'crap', 'damn', 'hell', 'dild', 'phal', 'scat',
];

function isUnfortunate(name: string): boolean {
  const flat = name.toLowerCase().replace(/[^a-z]/g, '');
  return BANNED.some((bad) => flat.includes(bad));
}

/** Longest a bare syllable stem may get before it stops reading as a word. */
const MAX_STEM = 10;

const CONSONANT_RUN = /[bcdfghjklmnpqrstvwxz]{4,}/;
const VOWEL_RUN = /[aeiouy]{4,}/;

/**
 * Rejects stems that are technically pronounceable but not actually readable.
 *
 * Concatenating an onset like `str` onto a coda like `nd` is how you get
 * "Kestthaemflol" — every piece is legal, the whole is unpronounceable, and it
 * takes up half the map when set in display type. Three cheap rules catch
 * almost all of it: overall length, four consonants in a row, and four vowels
 * in a row.
 */
function isAwkward(stem: string): boolean {
  if (stem.length > MAX_STEM) return true;
  const flat = stem.toLowerCase();
  return CONSONANT_RUN.test(flat) || VOWEL_RUN.test(flat);
}

export function syllableName(rng: RNG, culture: Culture = 'common'): string {
  const inv = INVENTORIES[culture];
  for (let attempt = 0; attempt < 12; attempt++) {
    // Bias towards the short end: two-syllable names carry a map far better
    // than four-syllable ones, and the long tail is where the unreadable
    // consonant pile-ups live. Later attempts shorten further, so a culture
    // with a crowded inventory still terminates on something usable.
    const span = inv.maxSyl - inv.minSyl;
    const relax = attempt >= 6 ? 0 : rng.bool(0.65) ? 0 : rng.int(1, Math.max(1, span));
    const n = inv.minSyl + Math.min(span, relax);
    let out = '';
    for (let i = 0; i < n; i++) {
      const onset = rng.pick(inv.onset);
      // Don't let a coda's consonants run straight into the next onset's.
      out += (out.endsWith(onset.charAt(0)) ? onset.slice(1) || onset : onset) + rng.pick(inv.nucleus);
      if (i < n - 1 ? rng.bool(0.5) : rng.bool(0.4)) out += rng.pick(inv.coda);
    }
    const name = capitalize(out.replace(/(.)\1\1+/g, '$1$1'));
    if (!isUnfortunate(name) && !isAwkward(name)) return name;
  }
  // Fall back to something guaranteed clean rather than looping forever.
  return capitalize(rng.pick(inv.onset) + rng.pick(inv.nucleus) + rng.pick(inv.suffix));
}

/**
 * Glue a stem to a place-name suffix the way English place names actually do
 * it: elide the seam when the two would double a letter, and drop the suffix
 * altogether rather than produce a fifteen-character label nobody can say.
 */
function joinSuffix(stem: string, suffix: string): string {
  let s = stem;
  if (s.slice(-1).toLowerCase() === suffix.charAt(0).toLowerCase()) s = s.slice(0, -1);
  const joined = s + suffix;
  if (joined.length > 13 || CONSONANT_RUN.test(joined.toLowerCase())) return stem;
  return joined;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const SETTLEMENT_PATTERNS = [
  (r: RNG, c: Culture) => joinSuffix(syllableName(r, c), r.pick(INVENTORIES[c].suffix)),
  (r: RNG, c: Culture) => `${syllableName(r, c)}`,
  (r: RNG, c: Culture) => `${r.pick(ADJECTIVES)} ${syllableName(r, c)}`,
  (r: RNG, c: Culture) => `${syllableName(r, c)} ${r.pick(SETTLEMENT_NOUNS)}`,
  (r: RNG, c: Culture) => `${r.pick(SAINTS)}'s ${r.pick(SETTLEMENT_NOUNS)}`,
];

const ADJECTIVES = ['Old', 'New', 'High', 'Low', 'Grey', 'Black', 'White', 'Red', 'Iron', 'Silver', 'Golden', 'Far', 'Deep', 'Cold', 'Wild', 'Quiet', 'Bitter', 'Broken', 'Hidden', 'Last', 'First', 'Storm', 'Sun', 'Moon', 'Frost', 'Ember'];
const SETTLEMENT_NOUNS = ['Crossing', 'Landing', 'Rest', 'Watch', 'Keep', 'Hollow', 'Harbour', 'Bend', 'Ferry', 'Market', 'Barrow', 'Fold', 'Hearth', 'Anchor', 'Gate', 'Reach', 'Vale', 'Haven'];
const SAINTS = ['Aldric', 'Berrin', 'Cadmus', 'Doriel', 'Ellery', 'Faron', 'Gale', 'Halvard', 'Ilith', 'Jorund', 'Kestrel', 'Lyra', 'Morrow', 'Neriah', 'Orin', 'Peris', 'Quill', 'Roswyn', 'Sable', 'Tamsin'];

const WATER_NOUNS = ['River', 'Run', 'Brook', 'Water', 'Flow', 'Stream', 'Rill', 'Race'];
const RANGE_NOUNS = ['Mountains', 'Peaks', 'Range', 'Spine', 'Teeth', 'Crags', 'Heights', 'Wall', 'Horns', 'Shoulders'];
const FOREST_NOUNS = ['Wood', 'Forest', 'Thicket', 'Wilds', 'Grove', 'Weald', 'Copse', 'Tangle'];
// No 'Isles' here: these name inland biome regions, and an archipelago label
// on a snowfield is the kind of detail that makes a reader stop trusting the
// rest of the map.
const REGION_NOUNS = ['Reach', 'March', 'Vale', 'Downs', 'Expanse', 'Fields', 'Wastes', 'Barrens', 'Heath', 'Kingdom', 'Domain', 'Frontier', 'Hollows', 'Steppe', 'Flats'];
const SEA_NOUNS = ['Sea', 'Gulf', 'Bay', 'Straits', 'Deep', 'Sound', 'Ocean', 'Reach'];
const DUNGEON_PREFIX = ['Tomb', 'Crypt', 'Vault', 'Halls', 'Delve', 'Warrens', 'Catacombs', 'Sanctum', 'Labyrinth', 'Pits', 'Undercroft', 'Barrow', 'Redoubt', 'Oubliette'];
const DUNGEON_OF = ['the Forgotten King', 'the Silent Choir', 'a Thousand Sighs', 'the Drowned God', 'the Pale Warden', 'Broken Oaths', 'the Iron Abbot', 'Restless Ash', 'the Hollow Crown', 'the Weeping Saint'];
const TAVERNS = ['The Gilded Griffin', 'The Rusty Anchor', 'The Laughing Lich', 'The Bent Nail', 'The Crooked Crown', 'The Drowned Rat', 'The Silver Stag', 'The Wandering Wyrm', 'The Salted Boar', 'The Quiet Hearth'];

export interface NameGen {
  settlement(size?: 'hamlet' | 'village' | 'town' | 'city'): string;
  river(): string;
  range(): string;
  forest(): string;
  region(): string;
  sea(): string;
  dungeon(): string;
  tavern(): string;
  person(): string;
}

export function createNamer(seed: number | string, culture: Culture = 'common'): NameGen {
  const rng = new RNG(seed);
  const used = new Set<string>();
  const unique = (fn: () => string): string => {
    for (let i = 0; i < 12; i++) {
      const n = fn();
      // The syllable builder screens itself, but a suffix or template can
      // still combine into something unfortunate — check the finished string.
      if (isUnfortunate(n)) continue;
      if (!used.has(n)) { used.add(n); return n; }
    }
    const fallback = `${fn()} ${rng.int(2, 9)}`;
    used.add(fallback);
    return fallback;
  };

  return {
    settlement(size = 'town') {
      return unique(() => {
        const pattern = size === 'city' ? rng.pick(SETTLEMENT_PATTERNS.slice(0, 3)) : rng.pick(SETTLEMENT_PATTERNS);
        return pattern(rng, culture);
      });
    },
    river() {
      return unique(() => rng.bool(0.5)
        ? `${syllableName(rng, culture)} ${rng.pick(WATER_NOUNS)}`
        : `The ${rng.pick(ADJECTIVES)} ${rng.pick(WATER_NOUNS)}`);
    },
    range() {
      return unique(() => rng.bool(0.5)
        ? `The ${rng.pick(ADJECTIVES)} ${rng.pick(RANGE_NOUNS)}`
        : `${syllableName(rng, culture)} ${rng.pick(RANGE_NOUNS)}`);
    },
    forest() {
      return unique(() => rng.bool(0.5)
        ? `The ${rng.pick(ADJECTIVES)} ${rng.pick(FOREST_NOUNS)}`
        : `${syllableName(rng, culture)}${rng.pick(['wood', 'shaw', 'holt'])}`);
    },
    region() {
      return unique(() => rng.bool(0.5)
        ? `The ${rng.pick(ADJECTIVES)} ${rng.pick(REGION_NOUNS)}`
        : `${syllableName(rng, culture)} ${rng.pick(REGION_NOUNS)}`);
    },
    sea() {
      return unique(() => rng.bool(0.6)
        ? `The ${rng.pick(ADJECTIVES)} ${rng.pick(SEA_NOUNS)}`
        : `${syllableName(rng, culture)} ${rng.pick(SEA_NOUNS)}`);
    },
    dungeon() {
      return unique(() => rng.bool(0.55)
        ? `${rng.pick(DUNGEON_PREFIX)} of ${rng.pick(DUNGEON_OF)}`
        : `The ${rng.pick(ADJECTIVES)} ${rng.pick(DUNGEON_PREFIX)}`);
    },
    tavern() { return unique(() => rng.pick(TAVERNS)); },
    person() { return unique(() => `${syllableName(rng, culture)} ${syllableName(rng, culture)}`); },
  };
}

/** Room purposes used to label generated dungeons. */
export const ROOM_PURPOSES = [
  'Guard Post', 'Barracks', 'Storeroom', 'Shrine', 'Library', 'Crypt', 'Armoury',
  'Kitchen', 'Mess Hall', 'Cistern', 'Workshop', 'Prison', 'Torture Chamber',
  'Throne Room', 'Audience Hall', 'Laboratory', 'Summoning Circle', 'Treasury',
  'Kennels', 'Well Room', 'Antechamber', 'Gallery', 'Sepulchre', 'Vault',
  'Ossuary', 'Chapel', 'Refectory', 'Scriptorium', 'Forge', 'Mushroom Farm',
];

export const DUNGEON_HAZARDS = [
  'Collapsed ceiling — difficult terrain',
  'Pressure plate linked to a dart trap',
  'Rusted portcullis, jammed half-open',
  'Pool of stagnant water (disease risk)',
  'Faint necrotic hum; undead nearby',
  'Loose flagstones conceal a pit',
  'Fungal bloom releases spores when disturbed',
  'Arcane glyph inscribed on the threshold',
  'The air is unnaturally cold here',
  'Scratch marks on the inside of the door',
];
