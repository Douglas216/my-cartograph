// ---------------------------------------------------------------------------
// Typographic hierarchy for map labels.
//
// Rule: the same class of feature always uses the same lettering. Each token
// bundles the *identity* of a label class — font, casing, letter-spacing, size
// ramp, color, halo. Layers spread a token and add only placement concerns
// (text-field, anchor, offset, padding, sort-key, opacity behavior).
//
// Classes:
//   WATER    — italic, water-blue. Sub-ramps: ocean > sea > lake.
//   POLITICAL — country (bold caps) > subdivision (regular).
//   CITY     — capital (bold) > major city (regular).
// Future classes (reserved): PHYSICAL (spaced small-caps for ranges/deserts),
// LANDMARK (for wonders/landmarks).
// ---------------------------------------------------------------------------
import type { SymbolLayerSpecification } from 'maplibre-gl';

type LabelToken = {
  layout: NonNullable<SymbolLayerSpecification['layout']>;
  paint: NonNullable<SymbolLayerSpecification['paint']>;
};

const zoomRamp = (...stops: [number, unknown][]) =>
  ['interpolate', ['linear'], ['zoom'], ...stops.flat()] as never;

// --- NATIVE second line -------------------------------------------------------
// Curated features carry `name_native` plus NATIVE_ON_MAP — true only when the
// glyph pipeline can draw the script (CJK/kana/hangul via the browser's local
// fonts, Latin/Cyrillic/Greek via the Noto Sans PBFs; Arabic/Devanagari etc.
// stay card-only). This wraps a label's primary expression with the endonym as
// a slightly smaller second line — same lettering as its class, subordinate
// size, and never case-transformed (the layer must not set text-transform;
// upcase the primary expression instead).
export const withNativeLine = (primary: unknown): never =>
  [
    'case',
    ['==', ['get', 'NATIVE_ON_MAP'], true],
    ['format', primary, {}, '\n', {}, ['get', 'name_native'], { 'font-scale': 0.85 }],
    primary,
  ] as never;

// --- WATER ------------------------------------------------------------------

const WATER_COLOR = '#5b8fa8';
const WATER_HALO = 'rgba(181, 220, 232, 0.55)';

export const waterName: Record<'ocean' | 'sea' | 'lake' | 'river', LabelToken> = {
  ocean: {
    layout: {
      'text-font': ['Noto Sans Italic'],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.25,
      'text-size': zoomRamp([0, 13], [3, 18], [6, 26]),
    },
    paint: {
      'text-color': WATER_COLOR,
      'text-halo-color': WATER_HALO,
      'text-halo-width': 1.5,
    },
  },
  sea: {
    layout: {
      'text-font': ['Noto Sans Italic'],
      'text-letter-spacing': 0.15,
      'text-size': zoomRamp([3, 10], [6, 13]),
    },
    paint: {
      'text-color': WATER_COLOR,
      'text-halo-color': WATER_HALO,
      'text-halo-width': 1,
    },
  },
  lake: {
    layout: {
      'text-font': ['Noto Sans Italic'],
      'text-size': zoomRamp([3, 11], [6, 14], [9, 17]),
    },
    paint: {
      // Slightly darker than open water — lake labels sit against shoreline
      // detail, and get a white halo since they often overlap land.
      'text-color': '#3d7a93',
      'text-halo-color': 'rgba(255, 255, 255, 0.85)',
      'text-halo-width': 1.2,
    },
  },
  river: {
    layout: {
      'text-font': ['Noto Sans Italic'],
      // Bumped up a class: river labels run along the line over land and were
      // hard to read at the old 10–16px ramp. Now they read at a glance.
      'text-size': zoomRamp([4, 13], [7, 17], [10, 21]),
    },
    paint: {
      // Deep river-blue with a strong halo — these labels run along the line
      // itself, over land.
      'text-color': '#2b6fa8',
      'text-halo-color': 'rgba(255, 255, 255, 0.9)',
      'text-halo-width': 1.6,
    },
  },
};

// --- POLITICAL ---------------------------------------------------------------

// Country label size scales with the country's on-screen size: at each zoom
// stop the size is `coef * EXTENT` (the cos-lat-corrected span in degrees),
// clamped to a readable range — big countries label large as soon as they fill
// the screen, small countries only once zoomed into.
const sizeAt = (coef: number, min: number, max: number) =>
  ['max', min, ['min', max, ['*', coef, ['get', 'EXTENT']]]];

export const politicalName: Record<'country' | 'subdivision', LabelToken> = {
  country: {
    layout: {
      'text-font': ['Noto Sans Bold'],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.1,
      'text-size': zoomRamp(
        [2, sizeAt(0.142, 10, 40)],
        [4, sizeAt(0.569, 11, 44)],
        [6, sizeAt(2.28, 12, 50)],
        [8, sizeAt(9.11, 13, 58)],
        [9, sizeAt(18.2, 14, 64)],
        [11, sizeAt(72.9, 14, 72)],
      ),
    },
    paint: {
      'text-color': '#2c3e50',
      'text-halo-color': 'rgba(255,255,255,0.9)',
      'text-halo-width': 2,
    },
  },
  subdivision: {
    layout: {
      'text-font': ['Noto Sans Regular'],
      // Like the country ramp, size scales with the subdivision's own EXTENT
      // (coefficients 4× the country class): Xinjiang/Texas label large at the
      // zoom where their country fills the screen, while small units (Salvadoran
      // departments, Rhode Island) sit at the floor until zoomed close. Clamps
      // keep subdivisions subordinate to the country name at every zoom.
      // Ramp starts at z2 because the dblclick focus layer shows below z5.
      'text-size': zoomRamp(
        [2, sizeAt(0.569, 10, 20)],
        [4, sizeAt(2.28, 11, 26)],
        [6, sizeAt(9.11, 12, 30)],
        [8, sizeAt(36.4, 13, 34)],
        [10, sizeAt(145, 14, 38)],
      ),
    },
    paint: {
      'text-color': '#555555',
      'text-halo-color': 'rgba(255,255,255,0.85)',
      'text-halo-width': 1.5,
    },
  },
};

// --- PHYSICAL -----------------------------------------------------------------
// Terrain features. Ranges: spaced caps in a warm terrain gray-brown — the
// classic atlas treatment that separates orography from political names.
// Peaks: small ▲-prefixed marks.

export const physicalName: Record<'range' | 'peak', LabelToken> = {
  range: {
    layout: {
      'text-font': ['Noto Sans Regular'],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.35,
      // EXTENT-scaled like political names: the Andes label spans large, a
      // small sierra stays modest.
      'text-size': zoomRamp(
        [2, sizeAt(0.2, 9, 22)],
        [4, sizeAt(0.8, 10, 28)],
        [6, sizeAt(3.2, 11, 34)],
        [9, sizeAt(25, 12, 40)],
      ),
    },
    paint: {
      'text-color': '#7a6a52',
      'text-halo-color': 'rgba(255, 252, 245, 0.85)',
      'text-halo-width': 1.4,
    },
  },
  peak: {
    layout: {
      'text-font': ['Noto Sans Regular'],
      'text-size': zoomRamp([5, 10], [8, 13]),
    },
    paint: {
      'text-color': '#6b5b45',
      'text-halo-color': 'rgba(255, 252, 245, 0.9)',
      'text-halo-width': 1.3,
    },
  },
};

// --- CITY ---------------------------------------------------------------------

export const cityName: Record<'capital' | 'major', LabelToken> = {
  capital: {
    layout: {
      'text-font': ['Noto Sans Bold'],
      'text-size': zoomRamp([3, 12], [8, 17]),
    },
    paint: {
      'text-color': '#2c3e50',
      'text-halo-color': 'rgba(255,255,255,0.9)',
      'text-halo-width': 1.5,
    },
  },
  major: {
    layout: {
      'text-font': ['Noto Sans Regular'],
      'text-size': zoomRamp(
        [3, ['case', ['>=', ['get', 'POP_MAX'], 10000000], 13, 11]],
        [8, ['case', ['>=', ['get', 'POP_MAX'], 10000000], 17, 15]],
      ),
    },
    paint: {
      'text-color': '#2c3e50',
      'text-halo-color': 'rgba(255,255,255,0.9)',
      'text-halo-width': 1.5,
    },
  },
};
