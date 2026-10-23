import type { DataDrivenPropertyValueSpecification, LayerSpecification } from 'maplibre-gl';
import { physicalName, withNativeLine } from '../typography';

// Hypsometric tint: each range carries `max_elev` (highest summit, from the
// build-time peak join + curated table), and higher ranges render darker —
// the Himalayas should out-shade the Urals at a glance.
const ELEV = ['coalesce', ['get', 'max_elev'], 2500];

const rangeColor: DataDrivenPropertyValueSpecification<string> = [
  'interpolate', ['linear'], ELEV,
  800, '#a89070',
  2500, '#8f7554',
  4500, '#755c3f',
  8850, '#57422b',
] as never;

// Opacity ramps with elevation inside a zoom envelope, so height differences
// stay legible over every country color underneath the translucent fill.
const elevOpacity = (lo: number, hi: number) =>
  ['interpolate', ['linear'], ELEV, 800, lo, 8850, hi] as never;

// Soft terrain tint over each range's (generalized) extent — deliberately a
// highlight, not a hard border: NE range polygons are approximate label
// shapes, and a crisp outline would overclaim their precision.
export const rangeFill: LayerSpecification = {
  id: 'range-fill',
  type: 'fill',
  source: 'ranges',
  minzoom: 2.5,
  paint: {
    'fill-color': rangeColor,
    'fill-opacity': [
      'interpolate', ['linear'], ['zoom'],
      2.5, elevOpacity(0.14, 0.30),
      5, elevOpacity(0.20, 0.42),
      8, elevOpacity(0.16, 0.34),
    ],
  },
};

export const rangeOutline: LayerSpecification = {
  id: 'range-outline',
  type: 'line',
  source: 'ranges',
  minzoom: 2.5,
  paint: {
    'line-color': rangeColor,
    'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 7, 2.2],
    'line-blur': 3,
    'line-opacity': 0.55,
  },
};

export const orographyAreaLayers = [rangeFill, rangeOutline];

// Selection highlight for a clicked range: deepen its tint and trace it in the
// map's gold "selected" glow. Both start hidden (match-nothing filter) and
// interactions.ts swaps in the chosen range's name.
const rangeNoneFilter = ['==', ['get', 'name'], '__none__'] as never;

export const rangeHighlightFill: LayerSpecification = {
  id: 'range-highlight-fill',
  type: 'fill',
  source: 'ranges',
  filter: rangeNoneFilter,
  paint: {
    'fill-color': '#5c4326',
    'fill-opacity': 0.4,
  },
};

export const rangeHighlightLine: LayerSpecification = {
  id: 'range-highlight-line',
  type: 'line',
  source: 'ranges',
  filter: rangeNoneFilter,
  paint: {
    'line-color': '#ffcf3f',
    'line-width': ['interpolate', ['linear'], ['zoom'], 3, 4, 8, 7],
    'line-blur': 2,
    'line-opacity': 0.95,
  },
};

// Range selection glows — grouped with the water highlights in the stack.
export const orographyHighlightLayers = [rangeHighlightFill, rangeHighlightLine];

// Mountain-range names: spaced terrain-toned caps, one point per range,
// EXTENT-scaled so the Himalayas read bigger than a local sierra.
export const rangeLabel: LayerSpecification = {
  id: 'range-label',
  type: 'symbol',
  source: 'range-labels',
  minzoom: 2.5,
  layout: {
    // Bilingual where curated: "QINLING MOUNTAINS" over 秦岭. The caps come from
    // upcasing the primary expression, NOT text-transform — a layout transform
    // would also uppercase the endonym line (УРАЛЬСКИЕ ГОРЫ), which we don't want.
    'text-field': withNativeLine(['upcase', ['get', 'name']]),
    ...physicalName.range.layout,
    'text-transform': 'none',
    'text-max-width': 8,
    'text-allow-overlap': false,
    'text-padding': 6,
    'symbol-sort-key': ['get', 'scalerank'],
  },
  paint: {
    ...physicalName.range.paint,
    'text-opacity': ['interpolate', ['linear'], ['zoom'], 2.5, 0.75, 4, 0.95],
  },
};

// Named peaks: ▲ + name, with the elevation appearing as you zoom closer.
export const peakLabel: LayerSpecification = {
  id: 'peak-label',
  type: 'symbol',
  source: 'peaks',
  minzoom: 5,
  layout: {
    'text-field': (() => {
      // "▲ Name", endonym line where curated, elevation line past z7.
      const name = ['concat', '▲ ', ['get', 'name']];
      const native = [
        'case',
        ['==', ['get', 'NATIVE_ON_MAP'], true],
        ['concat', '\n', ['get', 'name_native']],
        '',
      ];
      const elev = ['concat', '\n', ['to-string', ['get', 'elevation']], ' m'];
      return [
        'step', ['zoom'],
        ['concat', name, native],
        7, ['concat', name, native, elev],
      ] as never;
    })(),
    ...physicalName.peak.layout,
    'text-max-width': 9,
    'text-allow-overlap': false,
    'text-padding': 4,
    'symbol-sort-key': ['get', 'scalerank'],
  },
  paint: { ...physicalName.peak.paint },
};

// peakLabel FIRST, rangeLabel LAST: MapLibre gives later-placed symbols priority
// in collisions, and a range name should win over its own summit labels (e.g. the
// Appalachian label was being suppressed by "Spruce Knob"/"Mount Rogers" sitting
// on its centroid). The whole bundle is placed last in the style, so both beat the
// province/city/water labels below them.
export const orographyLayers = [peakLabel, rangeLabel];
