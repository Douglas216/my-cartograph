import type { LayerSpecification } from 'maplibre-gl';
import { politicalName } from '../typography';

export const admin1Border: LayerSpecification = {
  id: 'admin1-border',
  type: 'line',
  source: 'admin1',
  // Starts at zoom 5 to match the 10m country fill swap — keeps province
  // borders and the country coastline at the same resolution.
  minzoom: 5,
  paint: {
    'line-color': 'rgba(255,255,255,0.75)',
    'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 7, 1.5, 10, 2.4],
    'line-dasharray': [4, 2],
  },
};

// Subdivisions of the country that was just double-clicked, shown at ANY zoom
// (below 5, where the global layer above doesn't draw) so a fitted large
// country always reveals its internal borders. The filter is set in
// interactions.ts; '__none__' means nothing is focused. Capped at zoom 5 so it
// hands off to admin1Border with no double-drawing.
export const admin1BorderFocus: LayerSpecification = {
  id: 'admin1-border-focus',
  type: 'line',
  source: 'admin1',
  maxzoom: 5,
  filter: ['==', ['get', 'iso_a2'], '__none__'],
  paint: {
    'line-color': 'rgba(255,255,255,0.75)',
    'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.9, 5, 1.4],
    'line-dasharray': [4, 2],
  },
};

export const admin1Label: LayerSpecification = {
  id: 'admin1-label',
  type: 'symbol',
  source: 'admin1-labels',
  minzoom: 5,
  maxzoom: 12,
  layout: {
    'text-field': ['get', 'name'],
    ...politicalName.subdivision.layout,
    'text-max-width': 6,
    'text-allow-overlap': false,
    'text-ignore-placement': false,
    'text-padding': 8,
    'symbol-placement': 'point',
    // Bigger subdivisions win placement when labels collide — which name
    // appears first while zooming is principled (by size), not tile order.
    'symbol-sort-key': ['*', -1, ['get', 'EXTENT']],
  },
  paint: {
    ...politicalName.subdivision.paint,
    'text-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 7, 0.9],
  },
};

// Labels for the double-clicked country's subdivisions, shown at ANY zoom (below
// 5, where the global admin1-label doesn't draw) so the default fit view already
// shows e.g. US state names without zooming in further. Mirrors admin1-border-focus:
// the filter is set in interactions.ts, capped at zoom 5 to hand off cleanly.
export const admin1LabelFocus: LayerSpecification = {
  id: 'admin1-label-focus',
  type: 'symbol',
  source: 'admin1-labels',
  maxzoom: 5,
  filter: ['==', ['get', 'iso_a2'], '__none__'],
  layout: {
    'text-field': ['get', 'name'],
    // Token ramp is EXTENT-based and starts at z2, so big states label large
    // in the fitted view while small ones stay at the floor.
    ...politicalName.subdivision.layout,
    'text-max-width': 7,
    'text-allow-overlap': false,
    'text-padding': 2,
    'symbol-sort-key': ['*', -1, ['get', 'EXTENT']],
  },
  paint: { ...politicalName.subdivision.paint },
};

// Borders (drawn under the inland-water layers so lakes cover boundary lines
// that run through them — e.g. state lines inside the Great Lakes).
export const subdivisionBorderLayers = [admin1Border, admin1BorderFocus];
// Labels (drawn above the water).
export const subdivisionLabelLayers = [admin1Label, admin1LabelFocus];
