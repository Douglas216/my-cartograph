import type { LayerSpecification } from 'maplibre-gl';
import { cityName, withNativeLine } from '../typography';

// City visual language:
//  - National capitals: red star (always visible from zoom 3)
//  - Admin-1 (state/province) capitals: red dot
//  - Other cities: dark dot
const isNationalCapital = ['==', ['get', 'ADM0CAP'], 1];
const notNationalCapital = ['!=', ['get', 'ADM0CAP'], 1];
const isAdmin1Capital = [
  'in',
  ['get', 'FEATURECLA'],
  ['literal', ['Admin-1 capital', 'Admin-1 region capital']],
];

const circleColor = [
  'case',
  isAdmin1Capital, '#E74C3C',
  '#2c3e50',
];

export const capitalStar: LayerSpecification = {
  id: 'capital-star',
  type: 'symbol',
  source: 'cities',
  minzoom: 3,
  filter: isNationalCapital as any,
  layout: {
    'icon-image': 'capital-star',
    'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 6, 0.85, 10, 1.0],
    'icon-allow-overlap': true,
  },
};

export const capitalLabel: LayerSpecification = {
  id: 'capital-label',
  type: 'symbol',
  source: 'cities',
  minzoom: 3,
  filter: isNationalCapital as any,
  layout: {
    // Capitals label bilingually where the endonym differs: "Beijing" over 北京.
    'text-field': withNativeLine(['get', 'NAME']),
    ...cityName.capital.layout,
    'text-offset': [0, 1.6],
    'text-anchor': 'top',
    'text-allow-overlap': false,
    'text-padding': 4,
  },
  paint: { ...cityName.capital.paint },
};

export const cityCircle: LayerSpecification = {
  id: 'city-circle',
  type: 'circle',
  source: 'cities',
  minzoom: 3,
  filter: ['all', notNationalCapital, ['!=', ['get', 'SHOW_ADMIN1_CAPITAL'], true], ['>=', ['get', 'POP_MAX'], 1000000]] as any,
  paint: {
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      3, ['case', ['>=', ['coalesce', ['get', 'POP_MAX'], 0], 10000000], 5, ['>=', ['coalesce', ['get', 'POP_MAX'], 0], 5000000], 4, 3],
      8, ['case', ['>=', ['coalesce', ['get', 'POP_MAX'], 0], 10000000], 8, ['>=', ['coalesce', ['get', 'POP_MAX'], 0], 5000000], 6, 5],
    ],
    'circle-color': circleColor as any,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1.5,
    'circle-opacity': 0.9,
  },
};

export const cityLabel: LayerSpecification = {
  id: 'city-label',
  type: 'symbol',
  source: 'cities',
  minzoom: 3,
  filter: ['all', notNationalCapital, ['!=', ['get', 'SHOW_ADMIN1_CAPITAL'], true], ['>=', ['get', 'POP_MAX'], 1000000]] as any,
  layout: {
    'text-field': ['get', 'NAME'],
    ...cityName.major.layout,
    'text-offset': [0, 1.2],
    'text-anchor': 'top',
    'text-allow-overlap': false,
    'text-padding': 4,
  },
  paint: { ...cityName.major.paint },
};

// Separate overlay: large capitals retain overview visibility; smaller seats
// appear at z5 alongside subdivision borders, without a population cutoff.
const subdivisionFilter = ['all', notNationalCapital, ['==', ['get', 'SHOW_ADMIN1_CAPITAL'], true]];
export const subdivisionCityLayers: LayerSpecification[] = [
  ...[false, true].flatMap(small => {
    const suffix = small ? 'small' : 'major';
    const population = small ? ['<', ['coalesce', ['get', 'POP_MAX'], 0], 1000000] : ['>=', ['coalesce', ['get', 'POP_MAX'], 0], 1000000];
    const filter = [...subdivisionFilter, population] as never;
    return [
      { ...cityCircle, id: `subdivision-capital-${suffix}`, minzoom: small ? 5 : 3, filter },
      { ...cityLabel, id: `subdivision-capital-label-${suffix}`, minzoom: small ? 5 : 3, filter },
    ] as LayerSpecification[];
  }),
];
export const cityLayers = [cityCircle, ...subdivisionCityLayers, capitalStar, cityLabel, capitalLabel];
