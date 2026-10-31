// ---------------------------------------------------------------------------
// Thematic layer groups — the atlas's toggleable overlays.
//
// The political base (country fills/borders/labels, highlight/glow, insets) is
// deliberately NOT a theme: it IS the map. Everything else is a theme the user
// can reveal or hide, so the atlas never becomes the crowded everything-at-once
// wall map. Future themes (orography, straits, landmarks…) are added here and
// nowhere else — LayerPanel and the visibility effect read this registry.
// ---------------------------------------------------------------------------

export interface Theme {
  id: string;
  label: string;
  /** MapLibre layer ids this theme controls. */
  layerIds: string[];
}

export const THEMES: Theme[] = [
  {
    id: 'subdivisions',
    label: 'Subdivisions',
    layerIds: ['admin1-border', 'admin1-border-focus', 'admin1-label', 'admin1-label-focus'],
  },
  {
    id: 'subdivisionCapitals',
    label: 'Subdivision capitals',
    layerIds: ['subdivision-capital-small', 'subdivision-capital-major', 'subdivision-capital-label-small', 'subdivision-capital-label-major'],
  },
  {
    id: 'cities',
    label: 'Cities',
    layerIds: ['city-circle', 'capital-star', 'city-label', 'capital-label'],
  },
  {
    id: 'hydrography',
    label: 'Rivers, Canals & Lakes',
    layerIds: ['canal-casing','canal-line','canal-label','canal-hit','canal-highlight','canal-highlight-glow', 'river-casing', 'river-line', 'river-flow', 'river-label', 'lake-fill', 'lake-border', 'lake-label'],
  },
  {
    id: 'marineLabels',
    label: 'Oceans & Seas',
    layerIds: ['ocean-label', 'sea-label', 'sea-boundary'],
  },
  {
    id: 'orography',
    label: 'Mountains',
    layerIds: ['range-fill', 'range-outline', 'range-label', 'peak-label'],
  },
  {
    id: 'timezones',
    label: 'Time Zones',
    layerIds: ['timezone-fill', 'timezone-line', 'timezone-hit', 'timezone-highlight', 'timezone-highlight-glow'],
  },
];
