import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { orientRiverParts, riverOceanDistFn } from './process-countries.mjs';

const feature = (name, coordinates) => ({ type: 'Feature', properties: { name }, geometry: { type: 'LineString', coordinates } });
const collection = features => ({ type: 'FeatureCollection', features });
const inland = () => 1000;
function reverseParts(data, parts) {
  for (const { fi, pi } of parts) {
    const g = data.features[fi].geometry;
    (g.type === 'LineString' ? g.coordinates : g.coordinates[pi]).reverse();
  }
}

test('Danube and Donau form one downstream network across a name change', () => {
  const data = collection([feature('Donau', [[15, 48], [8, 48]]), feature('Danube', [[15, 48], [29, 45]])]);
  const backwards = orientRiverParts(data, inland);
  assert.deepEqual(backwards.map(p => p.fi), [0]);
  reverseParts(data, backwards);
  assert.deepEqual(orientRiverParts(data, inland), []);
});

test('duplicate digitizations do not conceal source and mouth endpoints', () => {
  const data = collection([feature('Donau', [[15, 48], [8, 48]]), feature('Donau', [[15, 48], [8, 48]])]);
  assert.deepEqual(orientRiverParts(data, inland).map(p => p.fi), [0, 1]);
});

test('disconnected parts of one selected river are oriented toward its downstream destination', () => {
  const data = collection([feature('Danube', [[15, 48], [8, 48]]), feature('Danube', [[29, 45], [20, 46]])]);
  assert.deepEqual(orientRiverParts(data, inland).map(p => p.fi), [0, 1]);
});

test('both delta outlets flow out to sea, rather than toward their sibling outlet', () => {
  const data = collection([
    feature('Ayeyarwady', [[95, 19], [95, 16.2]]),
    feature('Irrawaddy Delta', [[94.7, 15.7], [95, 16.2]]),
    feature('Irrawaddy Delta', [[95.5, 15.7], [95, 16.2]]),
  ]);
  const coastDistance = p => p[1] < 16 ? 0 : 1000;
  const backwards = orientRiverParts(data, coastDistance);
  assert.deepEqual(backwards.map(p => p.fi), [1, 2]);
  reverseParts(data, backwards);
  assert.deepEqual(orientRiverParts(data, coastDistance), []);
});

test('all generated river cards have facts and consistent shared identities', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../public/geo/rivers.geojson', import.meta.url)));
  const systems = new Map();
  for (const { properties: p } of data.features) {
    for (const key of ['label_name', 'system_name', 'source_type', 'source_name', 'mouth_type', 'mouth_name']) assert(p[key], `${p.name}: ${key}`);
    const facts = JSON.stringify([p.source_type, p.source_name, p.mouth_type, p.mouth_name]);
    if (systems.has(p.label_name)) assert.equal(facts, systems.get(p.label_name));
    systems.set(p.label_name, facts);
  }
  assert.equal(systems.size, 61);
  assert(data.features.some(f => f.properties.name === 'Colorado' && f.properties.featurecla === 'River'));
  const tarim = data.features.find(f => f.properties.name === 'Tarim').properties;
  assert.match(tarim.mouth_name, /Taitema.*flow-dependent.*Lop Nur/);
});

test('generated river geometry passes the full downstream audit', { skip: !fs.existsSync(new URL('../data/raw/ocean-50m-raw.geojson', import.meta.url)) }, () => {
  const data = JSON.parse(fs.readFileSync(new URL('../public/geo/rivers.geojson', import.meta.url)));
  const ocean = JSON.parse(fs.readFileSync(new URL('../data/raw/ocean-50m-raw.geojson', import.meta.url)));
  assert.deepEqual(orientRiverParts(data, riverOceanDistFn(ocean)), []);
});
