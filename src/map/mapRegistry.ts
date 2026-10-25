import { countryLayerFilter, countrySelectionLayerIds } from './layers/countryLayers';
import type { Map } from 'maplibre-gl';

// Singleton holder for the live map instance. Kept in its own module so that
// HMR updates to MapContainer don't orphan the reference held by consumers.
export const mapRegistry: { map: Map | null } = { map: null };

const HIGHLIGHT_IDS = countrySelectionLayerIds.filter(id => id.startsWith('country-highlight-'));
const GLOW_IDS = countrySelectionLayerIds.filter(id => id.startsWith('country-glow-'));

// Outline (navy) + underglow (gold) for a set of countries by ADM0_A3 code.
// One code = the ordinary click-highlight; many codes = the "full extent"
// view lighting up a country and all its territories; [] clears.
export function setHighlightCodes(codes: string[]) {
  const map = mapRegistry.map;
  if (!map) return;
  const filter = ['in', ['get', 'ADM0_A3'], ['literal', codes]] as never;
  for (const id of [...HIGHLIGHT_IDS, ...GLOW_IDS]) {
    if (map.getLayer(id)) map.setFilter(id, countryLayerFilter(id, filter));
  }
  for (const id of HIGHLIGHT_IDS) {
    if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', codes.length ? 1 : 0);
  }
  for (const id of GLOW_IDS) {
    if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', codes.length ? 0.65 : 0);
  }
}

// Highlight layers for the non-country features, keyed by kind. Each is a
// name-filtered glow (physical/water layers) that lights up the selected
// feature; ranges also darken via a companion fill layer.
const FEATURE_HIGHLIGHT_IDS: Record<string, string[]> = {
  range: ['range-highlight-fill', 'range-highlight-line'],
  lake: ['lake-highlight-glow', 'lake-highlight'],
  river: ['river-highlight-glow', 'river-highlight', 'river-highlight-flow'],
  sea: ['sea-highlight-fill', 'sea-highlight-glow', 'sea-highlight'],
  timezone: ['timezone-highlight-glow', 'timezone-highlight'],
};

// Light up one water body / mountain range by name (matching the feature's
// `name` property), clearing any previous feature highlight. `name` may be a list
// — a multi-name river system (Lancang→Mekong) lights up every reach at once. Pass
// a null kind to clear all of them — e.g. when a country or empty ocean is selected.
export function setFeatureHighlight(kind: keyof typeof FEATURE_HIGHLIGHT_IDS | null, name?: string | string[]) {
  const map = mapRegistry.map;
  if (!map) return;
  const none = ['==', ['get', 'name'], '__none__'] as never;
  const names = Array.isArray(name) ? name : name ? [name] : [];
  const match = (names.length > 1
    ? ['in', ['get', 'name'], ['literal', names]]
    : ['==', ['get', 'name'], names[0]]) as never;
  for (const [k, ids] of Object.entries(FEATURE_HIGHLIGHT_IDS)) {
    const filter = kind === k && names.length ? match : none;
    for (const id of ids) {
      if (map.getLayer(id)) map.setFilter(id, filter);
    }
  }
}
