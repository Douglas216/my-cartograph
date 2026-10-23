import type { LayerSpecification } from 'maplibre-gl';

// ---------------------------------------------------------------------------
// Time-zone lines — an abstract overlay of the world's standard UTC offsets.
//
// Source polygons (one per contiguous zone piece) are drawn as OUTLINES: the
// line traces each zone's real, irregular boundary where it follows coastlines
// and country borders. A muted violet dash keeps it distinct from political
// borders (dark) and rivers (blue) — it reads as a grid laid over the map, not
// as another kind of border. Clicking a line lights the whole worldwide band
// in gold (every polygon sharing that UTC offset carries the same `name`).
// ---------------------------------------------------------------------------

const TZ_COLOR = '#6d5f8c';
const HIGHLIGHT_COLOR = '#ffcf3f';

// Match-nothing filter — the highlight layers start hidden and interactions.ts
// swaps in the clicked zone's name (see setFeatureHighlight in mapRegistry).
const noneFilter = ['==', ['get', 'name'], '__none__'] as never;

export const timezoneLine: LayerSpecification = {
  id: 'timezone-line',
  type: 'line',
  source: 'timezones',
  layout: { 'line-join': 'round' },
  paint: {
    'line-color': TZ_COLOR,
    'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 4, 1, 8, 1.6],
    'line-dasharray': [3, 2],
    'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 4, 0.6],
  },
};

// Invisible fill over every zone polygon. NOT a click target itself — a shared
// boundary belongs to the zones on both sides, so clicking the line is
// ambiguous. Instead the click handler samples this fill a few pixels EAST of
// the clicked line to decide which zone the line opens (see interactions.ts).
export const timezoneFill: LayerSpecification = {
  id: 'timezone-fill',
  type: 'fill',
  source: 'timezones',
  paint: { 'fill-color': '#000000', 'fill-opacity': 0 },
};

// Invisible fat line over each zone boundary — a generous click target for the
// thin dashed line above (same trick as river-hit).
export const timezoneHit: LayerSpecification = {
  id: 'timezone-hit',
  type: 'line',
  source: 'timezones',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': '#000000',
    'line-opacity': 0,
    'line-width': ['interpolate', ['linear'], ['zoom'], 1, 6, 8, 14],
  },
};

// Gold selection highlight — soft under-glow + crisp core, the same language as
// the country/water highlights. Both start hidden; a click filters them to the
// selected offset's name, lighting every band piece at that offset.
export const timezoneHighlightGlow: LayerSpecification = {
  id: 'timezone-highlight-glow',
  type: 'line',
  source: 'timezones',
  filter: noneFilter,
  paint: {
    'line-color': HIGHLIGHT_COLOR,
    'line-blur': 4,
    'line-opacity': 0.5,
    'line-width': ['interpolate', ['linear'], ['zoom'], 1, 8, 8, 16] as never,
  },
};

export const timezoneHighlight: LayerSpecification = {
  id: 'timezone-highlight',
  type: 'line',
  source: 'timezones',
  filter: noneFilter,
  paint: {
    'line-color': HIGHLIGHT_COLOR,
    'line-blur': 1,
    'line-opacity': 0.95,
    'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 8, 5] as never,
  },
};

// The invisible east-resolution fill, the visible line + its hit target
// (toggled together by the "Time Zones" theme). Fill first so the line draws
// over it (both are invisible / the line is the visible one).
export const timezoneLayers = [timezoneFill, timezoneLine, timezoneHit];

// Selection glow, drawn above the line but below the labels.
export const timezoneHighlightLayers = [timezoneHighlightGlow, timezoneHighlight];
