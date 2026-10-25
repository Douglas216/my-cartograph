import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => JSON.parse(fs.readFileSync(new URL(`../public/geo/${file}`, import.meta.url)));
const catalog = read('catalog.json');
const section = id => catalog.sections.find(s => s.id === id);

test('catalog follows the actual map selection without duplicating river reaches or lake geometry', () => {
  assert.equal(catalog.sections.length, 8);
  assert.equal(section('countries').rows.length, new Set(read('countries-10m.geojson').features.map(f => f.properties.ADM0_A3)).size);
  assert.equal(section('cities').rows.length, read('cities.geojson').features.length);
  assert.equal(section('rivers').rows.length, new Set(read('rivers.geojson').features.map(f => f.properties.label_name)).size);
  assert.equal(section('lakes').rows.length, new Set(read('lakes.geojson').features.map(f => f.properties.name)).size);
  assert.equal(section('ranges').rows.length, read('ranges.geojson').features.length);
  assert.equal(section('peaks').rows.length, read('peaks.geojson').features.length);
  for (const s of catalog.sections) assert.equal(s.rows.length, new Set(s.rows.map(r => r.id)).size, s.id);
});

test('country capitals do not inherit unrelated sovereign or regional capitals', () => {
  const countries = section('countries').rows;
  assert.equal(countries.find(r => r.id === 'GBR').capital, 'London');
  assert.equal(countries.find(r => r.id === 'CLP').capital, null);
  assert.equal(countries.find(r => r.id === 'KAZ').capital, 'Astana');
  assert.equal(countries.find(r => r.id === 'BDI').capital, 'Gitega');
  assert.equal(countries.find(r => r.id === 'TZA').capital, 'Dodoma');
});

test('every selected river has a length, course countries, source and mouth', () => {
  for (const row of section('rivers').rows) {
    assert(row.length > 0, row.name);
    assert(row.countries.length > 0, row.name);
    assert(row.source && row.mouth, row.name);
  }
  assert(section('rivers').rows.find(r => r.name === 'Danube').countries.includes('Ukraine'));
  assert(!section('rivers').rows.find(r => r.name === 'Brahmaputra').countries.includes('Nepal'));
});

test('physical tables use correct units, positive values and complete country lists', () => {
  for (const id of ['lakes', 'ranges', 'peaks']) for (const r of section(id).rows) {
    assert(r.countries.length > 0, r.name);
    if (id === 'peaks') assert(r.elevation > 0);
    else assert(r.area > 0, r.name);
  }
  assert.equal(section('lakes').rows.find(r => r.name === 'Great Slave Lake').volume, 1580);
  assert.equal(section('lakes').rows.find(r => r.name === 'Lake Erie').volume, 484);
  assert.equal(section('lakes').rows.find(r => r.name === 'South Aral Sea').volume, null);
  assert.deepEqual(section('peaks').rows.find(r => r.name === 'K2').countries, ['Pakistan', 'China']);
});

test('ocean records are separate from marine areas and inland Caspian is not assigned an ocean', () => {
  assert.equal(section('oceans').rows.length, 5);
  for (const row of section('seas').rows) assert(row.ocean);
  assert(!section('seas').rows.some(r => r.name.endsWith('Ocean')));
  assert.match(section('seas').rows.find(r => r.name === 'Caspian Sea').ocean, /Inland basin/);
});
