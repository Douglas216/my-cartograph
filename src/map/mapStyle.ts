import type { StyleSpecification } from 'maplibre-gl';

export const mapStyle: StyleSpecification = {
  version: 8,
  name: 'Knowledge Map',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'countries-110m': {
      type: 'geojson',
      data: '/geo/countries-110m.geojson',
      generateId: true,
    },
    'countries-50m': {
      type: 'geojson',
      data: '/geo/countries-50m.geojson',
      generateId: true,
    },
    'countries-10m': {
      type: 'geojson',
      data: '/geo/countries-10m.geojson',
      generateId: true,
    },
    admin1: {
      type: 'geojson',
      data: '/geo/admin1.geojson',
    },
    'admin1-labels': {
      type: 'geojson',
      data: '/geo/admin1-labels.geojson',
    },
    'countries-labels': {
      type: 'geojson',
      data: '/geo/countries-labels.geojson',
    },
    cities: {
      type: 'geojson',
      data: '/geo/cities.geojson',
    },
    rivers: {
      type: 'geojson',
      data: '/geo/rivers.geojson',
      // Required for queryRenderedFeatures on the line-placed river-label layer —
      // without ids the symbol feature-index decode throws "Out of bounds".
      generateId: true,
    },
    lakes: {
      type: 'geojson',
      data: '/geo/lakes.geojson',
    },
    'lake-labels': {
      type: 'geojson',
      data: '/geo/lake-labels.geojson',
    },
    oceans: {
      type: 'geojson',
      data: '/geo/oceans.geojson',
    },
    'ocean-labels': {
      type: 'geojson',
      data: '/geo/ocean-labels.geojson',
    },
    seas: {
      type: 'geojson',
      data: '/geo/seas.geojson',
    },
    'sea-labels': {
      type: 'geojson',
      data: '/geo/sea-labels.geojson',
    },
    'range-labels': {
      type: 'geojson',
      data: '/geo/range-labels.geojson',
    },
    ranges: {
      type: 'geojson',
      data: '/geo/ranges.geojson',
    },
    peaks: {
      type: 'geojson',
      data: '/geo/peaks.geojson',
    },
    timezones: {
      type: 'geojson',
      data: '/geo/timezones.geojson',
    },
  },
  layers: [],
};
