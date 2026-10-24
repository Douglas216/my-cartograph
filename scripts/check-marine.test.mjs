import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import clipping from 'polygon-clipping';
const read = file => JSON.parse(fs.readFileSync(new URL(`../public/geo/${file}`, import.meta.url)));
const excluded = ['Amundsen Gulf', 'Amundsen Sea', 'Bellingshausen Sea', 'Viscount Melville Sound', 'Ungava Bay', 'Melville Bay', 'Golfo San Jorge', 'Golfe du Lion'];
const hierarchy = read('marine-hierarchy.json');
const byName = new Map(hierarchy.map(r => [r.name, r]));
const selections = new Map(read('marine-selections.geojson').features.map(f => [f.properties.name, f]));
const catalog = read('catalog.json');
const seaRows = catalog.sections.find(s => s.id === 'seas').rows;

test('all eight unlearned waters are absent from labels, hit targets, selection records and catalog rows', () => {
  for (const name of excluded) {
    assert(!read('seas.geojson').features.some(f => f.properties.name === name), name);
    assert(!read('sea-labels.geojson').features.some(f => f.properties.name === name), name);
    assert(!byName.has(name), name);
    assert(!selections.has(name), name);
    assert(!seaRows.some(r => r.name === name), name);
    for (const r of hierarchy) assert(!r.descendants.includes(name), `${r.name}: ${name}`);
  }
  assert.equal(seaRows.length, 132);
});

test('ocean and sea selections follow containment, including nested descendants', () => {
  for (const name of ['Yellow Sea', 'Bo Hai', 'East China Sea']) assert(byName.get('Pacific Ocean').descendants.includes(name));
  assert.deepEqual(byName.get('Bo Hai').path, ['Pacific Ocean', 'Yellow Sea', 'Bo Hai']);
  assert.deepEqual(byName.get('Gulf of Martaban').path, ['Indian Ocean', 'Andaman Sea', 'Gulf of Martaban']);
  assert(byName.get('Andaman Sea').descendants.includes('Gulf of Martaban'));
  assert(byName.get('Mediterranean Sea').descendants.includes('Black Sea'));
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


test('new coastal waters have matching map labels, catalog entries and containing waters', () => {
  for (const [name, parent] of [['Gulf of Bangkok','Gulf of Thailand'], ['Laizhou Bay','Bo Hai'], ['Bohai Bay','Bo Hai'], ['Liaodong Bay','Bo Hai'], ['Hangzhou Bay','East China Sea']]) {
    assert.equal(byName.get(name)?.parent, parent);
    assert.equal(seaRows.find(r => r.name === name)?.parent, parent);
    assert(read('sea-labels.geojson').features.some(f => f.properties.name === name));
    assert(area(clipping.difference(selections.get(name).geometry.coordinates, selections.get(parent).geometry.coordinates)) < 1e-8);
  }
});

test('Martaban reaches the northern estuary and the Andaman boundary clears its interior', () => {
  const box = (w,s,e,n) => [[[w,s],[e,s],[e,n],[w,n],[w,s]]];
  const gulf = selections.get('Gulf of Martaban').geometry.coordinates;
  const sea = selections.get('Andaman Sea').geometry.coordinates;
  assert(area(clipping.intersection(gulf, box(96.82,17.35,96.9,17.46))) > 0.0001, 'northern estuary is clipped off');
  assert(area(clipping.difference(box(96.2,15.5,97.2,16.0), sea)) < 1e-8, 'old diagonal boundary still cuts the gulf');
  const land = JSON.parse(fs.readFileSync(new URL('../data/raw/countries-10m-raw.geojson', import.meta.url)));
  const myanmar = land.features.find(f => f.properties.ADM0_A3 === 'MMR');
  // Four-decimal clipping rounds the shoreline: tolerate only tiny edge slivers.
  assert(area(clipping.intersection(gulf, myanmar.geometry.coordinates)) < 0.001);
});

test('Hudson and James Bay fit the detailed coast, exclude islands and retain their mouth limits', () => {
  const land = JSON.parse(fs.readFileSync(new URL('../data/raw/countries-10m-raw.geojson', import.meta.url)));
  const canada = land.features.find(f => f.properties.ADM0_A3 === 'CAN').geometry.coordinates;
  const raw = JSON.parse(fs.readFileSync(new URL('../data/raw/seas-raw.geojson', import.meta.url)));
  const bays = read('seas.geojson');
  for (const name of ['Hudson Bay','James Bay']) {
    const before=raw.features.find(f=>f.properties.name===name).geometry;
    const after=bays.features.find(f=>f.properties.name===name).geometry;
    // The shared six-decimal grid permits sub-metre shoreline rounding slivers.
    assert(area(clipping.intersection(after.coordinates,canada)) < 1e-6, `${name} overlaps mainland or islands`);
    assert(area(clipping.difference(after.coordinates,before.coordinates)) > 0.01, `${name} still leaves coastal water unfilled`);
  }
  const james=bays.features.find(f=>f.properties.name==='James Bay').geometry;
  const a=[-82.18844,54.839185], b=[-79.652135,54.700537];
  for (const [x,y] of james.coordinates.flat(2)) {
    assert((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]) < 2e-6, 'James Bay extends past its original mouth');
  }
  assert(area(clipping.difference(selections.get('James Bay').geometry.coordinates,selections.get('Hudson Bay').geometry.coordinates)) < 1e-8);
});

test('the eleven requested marine additions appear once in map labels and tables with their parents', () => {
  const labels=read('sea-labels.geojson').features;
  for (const [name,parent] of [
    ['Alboran Sea','Mediterranean Sea'],['Ligurian Sea','Mediterranean Sea'],
    ['Cantabrian Sea','Bay of Biscay'],['Kattegat','Baltic Sea'],['Skagerrak','North Sea'],
    ['Gulf of Ob','Kara Sea'],['Khatanga Gulf','Laptev Sea'],['Strait of Tartary','Sea of Japan'],
    ['Shelikhov Gulf','Sea of Okhotsk'],['Penzhina Bay','Shelikhov Gulf'],['Academy Bay','Sea of Okhotsk'],
  ]) {
    assert.equal(byName.get(name)?.parent,parent,name);
    assert.equal(labels.filter(f=>f.properties.name===name).length,1,name);
    assert.equal(seaRows.filter(r=>r.name===name).length,1,name);
    assert.equal(seaRows.find(r=>r.name===name).parent,parent,name);
    assert(area(clipping.difference(selections.get(name).geometry.coordinates,selections.get(parent).geometry.coordinates))<1e-8, `${parent} leaves a gap in ${name}`);
  }
  assert(!byName.has('Shelikhova Gulf'),'restored gulf must not acquire a duplicate spelling');
  assert.deepEqual(byName.get('Penzhina Bay').path,['Pacific Ocean','Sea of Okhotsk','Shelikhov Gulf','Penzhina Bay']);
});

test('new marine label anchors sit within their water polygons', () => {
  const insideRing = ([x,y],ring) => {
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[i],b=ring[j];
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside;
  };
  const contains=(geometry,point)=>(geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates).some(poly=>insideRing(point,poly[0])&&!poly.slice(1).some(r=>insideRing(point,r)));
  const names=['Gulf of Cádiz','Sea of Crete','Dardanelles','Sea of Marmara','Bosporus','Kerch Strait','Alboran Sea','Ligurian Sea','Cantabrian Sea','Kattegat','Skagerrak','Gulf of Ob','Khatanga Gulf','Strait of Tartary','Shelikhov Gulf','Penzhina Bay','Academy Bay'];
  const features=read('seas.geojson').features, labels=read('sea-labels.geojson').features;
  for(const name of names) {
    const label=labels.find(f=>f.properties.name===name).geometry.coordinates;
    assert(features.filter(f=>f.properties.name===name).some(f=>contains(f.geometry,label)),`${name} label falls on land or outside its water`);
  }
  const kattegat=features.find(f=>f.properties.name==='Kattegat');
  assert(!contains(kattegat.geometry,[11.0,55.5]),'Kattegat must not swallow the southern Great Belt');
});


test('Atlantic–Mediterranean selection structure exactly follows the requested parent links', () => {
  for (const [name,parent] of [
    ['Gulf of Cádiz','Atlantic Ocean'],['Strait of Gibraltar','Atlantic Ocean'],['Mediterranean Sea','Atlantic Ocean'],
    ['Alboran Sea','Mediterranean Sea'],['Aegean Sea','Mediterranean Sea'],['Sea of Crete','Aegean Sea'],
    ['Dardanelles','Mediterranean Sea'],['Sea of Marmara','Mediterranean Sea'],['Bosporus','Mediterranean Sea'],
    ['Black Sea','Mediterranean Sea'],['Kerch Strait','Black Sea'],['Sea of Azov','Black Sea'],
  ]) {
    assert.equal(byName.get(name)?.parent,parent,name);
    assert.equal(seaRows.find(r=>r.name===name)?.parent,parent,name);
    assert.equal(read('sea-labels.geojson').features.filter(f=>f.properties.name===name).length,1,name);
    assert(area(clipping.difference(selections.get(name).geometry.coordinates,selections.get(parent).geometry.coordinates))<1e-8, `${parent} excludes ${name}`);
  }
  assert.deepEqual(byName.get('Kerch Strait').path,['Atlantic Ocean','Mediterranean Sea','Black Sea','Kerch Strait']);
  assert(!byName.get('Aegean Sea').descendants.includes('Dardanelles'));
  assert(!byName.get('Sea of Marmara').descendants.includes('Bosporus'));
});
