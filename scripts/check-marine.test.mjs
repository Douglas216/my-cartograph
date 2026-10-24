import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import clipping from 'polygon-clipping';
const read = file => JSON.parse(fs.readFileSync(new URL(`../public/geo/${file}`, import.meta.url)));
const excluded = ['Amundsen Gulf', 'Amundsen Sea', 'Bellingshausen Sea', 'Shelikhova Gulf', 'Viscount Melville Sound', 'Ungava Bay', 'Melville Bay', 'Golfo San Jorge', 'Golfe du Lion'];
const hierarchy = read('marine-hierarchy.json');
const byName = new Map(hierarchy.map(r => [r.name, r]));
const selections = new Map(read('marine-selections.geojson').features.map(f => [f.properties.name, f]));
const catalog = read('catalog.json');
const seaRows = catalog.sections.find(s => s.id === 'seas').rows;

test('all nine unlearned waters are absent from labels, hit targets, selection records and catalog rows', () => {
  for (const name of excluded) {
    assert(!read('seas.geojson').features.some(f => f.properties.name === name), name);
    assert(!read('sea-labels.geojson').features.some(f => f.properties.name === name), name);
    assert(!byName.has(name), name);
    assert(!selections.has(name), name);
    assert(!seaRows.some(r => r.name === name), name);
    for (const r of hierarchy) assert(!r.descendants.includes(name), `${r.name}: ${name}`);
  }
  assert.equal(seaRows.length, 110);
});

test('ocean and sea selections follow containment, including nested descendants', () => {
  for (const name of ['Yellow Sea', 'Bo Hai', 'East China Sea']) assert(byName.get('Pacific Ocean').descendants.includes(name));
  assert.deepEqual(byName.get('Bo Hai').path, ['Pacific Ocean', 'Yellow Sea', 'Bo Hai']);
  assert.deepEqual(byName.get('Gulf of Martaban').path, ['Indian Ocean', 'Andaman Sea', 'Gulf of Martaban']);
  assert(byName.get('Andaman Sea').descendants.includes('Gulf of Martaban'));
  assert(!byName.get('Mediterranean Sea').descendants.includes('Black Sea'));
  assert(!byName.get('Pacific Ocean').descendants.includes('Caspian Sea'));
  assert(!byName.get('Pacific Ocean').descendants.includes('Drake Passage'));
});

function area(polygons) {
  return polygons.reduce((total, polygon) => total + polygon.reduce((sum, ring, index) => {
    let twice = 0;
    for (let i = 0; i < ring.length - 1; i++) twice += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return sum + (index ? -1 : 1) * Math.abs(twice / 2);
  }, 0), 0);
}

test('highlight geometry contains the complete child geometry, rather than just its name', () => {
  for (const [parent, child] of [['Pacific Ocean', 'Yellow Sea'], ['Pacific Ocean', 'Bo Hai'], ['Pacific Ocean', 'East China Sea'], ['Yellow Sea', 'Bo Hai'], ['Andaman Sea', 'Gulf of Martaban']]) {
    const remainder = clipping.difference(selections.get(child).geometry.coordinates, selections.get(parent).geometry.coordinates);
    assert(area(remainder) < 1e-8, `${parent} leaves a gap in ${child}`);
  }
});

test('cards and tables use the same immediate parent and active descendant count', () => {
  for (const row of seaRows) {
    const record = byName.get(row.name);
    assert.equal(row.parent, record.parent);
    assert.equal(row.ocean, record.ocean);
  }
  for (const record of hierarchy) {
    const props = selections.get(record.name).properties;
    assert.equal(props.water_children, record.descendants.length);
    assert.deepEqual(props.water_path.split('|'), record.path);
  }
});
