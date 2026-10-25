import type { FilterSpecification, LayerSpecification } from 'maplibre-gl';
import { buildColorMatchExpression } from '../colors';
import { politicalName } from '../typography';

const colorExpr = buildColorMatchExpression();

export const countryFill110: LayerSpecification = {
  id: 'country-fill-110',
  type: 'fill',
  source: 'countries-110m',
  maxzoom: 4,
  paint: {
    'fill-color': colorExpr as any,
    'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 4, 0.9],
  },
};

export const countryFill50: LayerSpecification = {
  id: 'country-fill-50',
  type: 'fill',
  source: 'countries-50m',
  minzoom: 4,
  maxzoom: 5,
  paint: {
    'fill-color': colorExpr as any,
    'fill-opacity': 0.9,
  },
};

// 10m fill activates at the same zoom province borders appear (5), so the
// country fill/coastline always matches the resolution of the admin-1 borders.
export const countryFill10: LayerSpecification = {
  id: 'country-fill-10',
  type: 'fill',
  source: 'countries-10m',
  minzoom: 5,
  paint: {
    'fill-color': colorExpr as any,
    'fill-opacity': 0.9,
  },
};

export const countryBorder110: LayerSpecification = {
  id: 'country-border-110',
  type: 'line',
  source: 'countries-110m',
  maxzoom: 4,
  paint: {
    'line-color': '#ffffff',
    'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 4, 1.5],
    'line-opacity': 0.8,
  },
};

export const countryBorder50: LayerSpecification = {
  id: 'country-border-50',
  type: 'line',
  source: 'countries-50m',
  minzoom: 4,
  maxzoom: 5,
  paint: {
    'line-color': '#ffffff',
    'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 5, 2],
    'line-opacity': 0.9,
  },
};

export const countryBorder10: LayerSpecification = {
  id: 'country-border-10',
  type: 'line',
  source: 'countries-10m',
  minzoom: 5,
  paint: {
    'line-color': '#ffffff',
    'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2, 11, 2.5],
    'line-opacity': 0.9,
  },
};

export const countryLabel: LayerSpecification = {
  id: 'country-label',
  type: 'symbol',
  source: 'countries-labels',
  minzoom: 2,
  maxzoom: 11.5,
  layout: {
    'text-field': ['get', 'NAME'],
    ...politicalName.country.layout,
    'text-max-width': 8,
    'text-allow-overlap': false,
    'text-padding': 5,
  },
  paint: {
    ...politicalName.country.paint,
    // Stay clearly visible while zooming into a country, then fade to a faint
    // backdrop only at high zoom so a big "FRANCE" doesn't fight with the
    // city/region labels underneath it.
    'text-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.7, 4, 1, 8, 0.95, 10, 0.7, 11.5, 0.3],
  },
};

// The click-highlight is split into one layer per resolution tier, with the
// same zoom breakpoints as the fills — so the outline always traces exactly
// the polygon being filled (no coarse-fill vs. fine-outline mismatch).
// Filters match on ADM0_A3 codes (set in interactions.ts); an empty list hides.
const highlightPaint = {
  'line-color': '#2c3e50',
  'line-width': 3,
  'line-opacity': 0,
} as const;

// Soft gold underglow drawn beneath the highlight line — makes selected
// borders "illuminated", so tiny territories (Guam, Pitcairn…) are visible
// as bright dots even at world zoom in the full-extent view.
const glowPaint = {
  'line-color': '#ffcf3f',
  'line-width': 9,
  'line-blur': 4,
  'line-opacity': 0,
} as const;

const emptyFilter = ['in', ['get', 'ADM0_A3'], ['literal', []]] as FilterSpecification;

const tiers = [
  { suffix: '110', source: 'countries-110m', zoom: { maxzoom: 4 } },
  { suffix: '50', source: 'countries-50m', zoom: { minzoom: 4, maxzoom: 5 } },
  { suffix: '10', source: 'countries-10m', zoom: { minzoom: 5 } },
] as const;

export const countryGlowLayers: LayerSpecification[] = tiers.map((t) => ({
  id: `country-glow-${t.suffix}`,
  type: 'line',
  source: t.source,
  ...t.zoom,
  paint: { ...glowPaint },
  filter: emptyFilter,
}));

export const countryHighlightLayers: LayerSpecification[] = tiers.map((t) => ({
  id: `country-highlight-${t.suffix}`,
  type: 'line',
  source: t.source,
  ...t.zoom,
  paint: { ...highlightPaint },
  filter: emptyFilter,
}));

// Fills, borders and click-highlight. The country label is exported separately
// (countryLabel) so the layer stack can place it above the inland-water layers.
const baseCountryLayers: LayerSpecification[] = [
  countryFill110,
  countryFill50,
  countryFill10,
  countryBorder110,
  countryBorder50,
  countryBorder10,
  ...countryGlowLayers,
  ...countryHighlightLayers,
];


// Gujarat's coast-fitted gulfs are visible from z3. Keep India's land at
// that same resolution, including borders and selection, rather than drawing
// detailed water against the generalized 110m/50m land outline.
const countryConstraints = new Map<string, FilterSpecification>();
export function countryLayerFilter(id: string, selection: FilterSpecification): FilterSpecification {
  const constraint = countryConstraints.get(id);
  return constraint ? ['all', constraint, selection] as FilterSpecification : selection;
}
export const countryLayers: LayerSpecification[] = baseCountryLayers.flatMap(layer => {
  const tier = layer.id.split('-').at(-1);
  if (tier !== '110' && tier !== '50') return [layer];
  const outside = ['!=', ['get', 'COAST_DETAIL'], true] as FilterSpecification;
  const inside = ['==', ['get', 'COAST_DETAIL'], true] as FilterSpecification;
  const constrain = (item: LayerSpecification, constraint: FilterSpecification): LayerSpecification => {
    countryConstraints.set(item.id, constraint);
    return { ...item, filter: 'filter' in item && item.filter ? ['all', constraint, item.filter] : constraint } as LayerSpecification;
  };
  const ordinary = constrain(layer, outside);
  const detail = constrain({ ...layer, id: `${layer.id}-india-detail`, source: 'countries-10m',
    minzoom: tier === '110' ? 3 : 4, maxzoom: tier === '110' ? 4 : 5 } as LayerSpecification, inside);
  return tier === '110'
    ? [ordinary, constrain({ ...layer, id: `${layer.id}-india-coarse`, maxzoom: 3 } as LayerSpecification, inside), detail]
    : [ordinary, detail];
});
export const countryFillLayerIds = countryLayers.filter(l => l.id.startsWith('country-fill-')).map(l => l.id);
export const countrySelectionLayerIds = countryLayers.filter(l => /^country-(glow|highlight)-/.test(l.id)).map(l => l.id);
