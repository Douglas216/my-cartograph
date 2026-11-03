import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import clipping from 'polygon-clipping';
const read = file => JSON.parse(fs.readFileSync(new URL(`../public/geo/${file}`, import.meta.url)));
const excluded = ['Amundsen Gulf', 'Amundsen Sea', 'Bellingshausen Sea', 'Viscount Melville Sound', 'Ungava Bay', 'Melville Bay', 'Golfo San Jorge'];
const hierarchy = read('marine-hierarchy.json');
const byName = new Map(hierarchy.map(r => [r.name, r]));
const selections = new Map(read('marine-selections.geojson').features.map(f => [f.properties.name, f]));
const catalog = read('catalog.json');
const seaRows = catalog.sections.find(s => s.id === 'seas').rows;

test('all seven unlearned waters are absent from labels, hit targets, selection records and catalog rows', () => {
  for (const name of excluded) {
    assert(!read('seas.geojson').features.some(f => f.properties.name === name), name);
    assert(!read('sea-labels.geojson').features.some(f => f.properties.name === name), name);
    assert(!byName.has(name), name);
    assert(!selections.has(name), name);
    assert(!seaRows.some(r => r.name === name), name);
    for (const r of hierarchy) assert(!r.descendants.includes(name), `${r.name}: ${name}`);
  }
  assert.equal(seaRows.length, 151);
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
  const names=['Garabogazköl Basin','Gulf of Taranto','Gulf of Saint-Malo','Gulf of Lion','Taman Bay','Dnieper-Bug Estuary','Burgas Bay','Gulf of Odessa','Karkinit Bay','Kalamita Bay','Taganrog Bay','Sea of Azov','Strait of Gibraltar','Gulf of Cádiz','Sea of Crete','Dardanelles','Sea of Marmara','Bosporus','Kerch Strait','Alboran Sea','Ligurian Sea','Cantabrian Sea','Kattegat','Skagerrak','Gulf of Ob','Khatanga Gulf','Strait of Tartary','Shelikhov Gulf','Penzhina Bay','Academy Bay'];
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


test('Gibraltar owns a substantial separate shape, directly under Atlantic', () => {
  const strait=selections.get('Strait of Gibraltar').geometry;
  assert.equal(byName.get('Strait of Gibraltar').parent,'Atlantic Ocean');
  assert.equal(seaRows.find(r=>r.name==='Strait of Gibraltar').parent,'Atlantic Ocean');
  assert.deepEqual(byName.get('Strait of Gibraltar').path,['Atlantic Ocean','Strait of Gibraltar']);
  assert(area(strait.coordinates)>.08,'the source slivers were not replaced by the actual strait');
  for(const name of ['Gulf of Cádiz','Alboran Sea','Mediterranean Sea']) {
    const neighbour=selections.get(name).geometry;
    assert(area(clipping.intersection(strait.coordinates,neighbour.coordinates))<1e-8,`${name} still selects Gibraltar water`);
    const hit=read('seas.geojson').features.find(f=>f.properties.name===name).geometry;
    assert(area(clipping.intersection(strait.coordinates,hit.coordinates))<1e-8,`${name} still owns Gibraltar's hit surface`);
  }
  assert(!byName.get('Mediterranean Sea').descendants.includes('Strait of Gibraltar'));
  assert.equal(read('seas.geojson').features.filter(f=>f.properties.name==='Strait of Gibraltar').length,1);
});


test('Gibraltar stays between its two entrance lines without offshore sketch corners', () => {
  const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  for (const point of selections.get('Strait of Gibraltar').geometry.coordinates.flat(2)) {
    assert(cross([-5.344444,36.110556],[-5.282222,35.898056],point)<=1e-6,'Gibraltar spills east of Europa–Almina into Alboran');
    assert(cross([-6.033333,36.183333],[-5.923333,35.793333],point)>=-1e-6,'Gibraltar spills west of Trafalgar–Spartel');
  }
});


test('Azov and Kerch are non-overlapping siblings directly under Black Sea', () => {
  const raw=read('seas.geojson').features;
  for(const name of ['Sea of Azov','Kerch Strait']) {
    assert.equal(byName.get(name).parent,'Black Sea');
    assert.equal(seaRows.find(r=>r.name===name).parent,'Black Sea');
    assert.deepEqual(byName.get(name).path,['Atlantic Ocean','Mediterranean Sea','Black Sea',name]);
    assert(area(clipping.difference(selections.get(name).geometry.coordinates,selections.get('Black Sea').geometry.coordinates))<1e-8);
  }
  const azov=selections.get('Sea of Azov').geometry.coordinates;
  assert.equal(azov.length,1,'Azov retains detached Black Sea mask fragments');
  const kerch=selections.get('Kerch Strait').geometry.coordinates;
  assert(area(clipping.intersection(azov,kerch))<1e-8,'selection highlights still overlap');
  const azovHit=raw.find(f=>f.properties.name==='Sea of Azov').geometry.coordinates;
  const kerchHit=raw.find(f=>f.properties.name==='Kerch Strait').geometry.coordinates;
  assert(area(clipping.intersection(azovHit,kerchHit))<1e-8,'click surfaces still overlap');
  const line=read('marine-hierarchy.json').filter(r=>['Sea of Azov','Kerch Strait'].includes(r.name));
  assert.equal(line.length,2);
});


test('Gujarat gulfs have individual shapes and Arabian Sea ancestry in map and table', () => {
  for (const name of ['Gulf of Khambhat', 'Gulf of Kutch']) {
    assert.deepEqual(byName.get(name).path, ['Indian Ocean', 'Arabian Sea', name]);
    assert.equal(seaRows.filter(r => r.name === name).length, 1);
    assert.equal(seaRows.find(r => r.name === name).parent, 'Arabian Sea');
    assert.equal(read('sea-labels.geojson').features.filter(f => f.properties.name === name).length, 1);
    assert(area(clipping.difference(selections.get(name).geometry.coordinates, selections.get('Arabian Sea').geometry.coordinates)) < 1e-8);
  }
  assert.equal(area(clipping.intersection(selections.get('Gulf of Khambhat').geometry.coordinates, selections.get('Gulf of Kutch').geometry.coordinates)), 0);
});

test('Arabian Sea fills Gujarat entrance gaps and shares both gulf mouths', () => {
  const arabian=read('seas.geojson').features.find(f=>f.properties.name==='Arabian Sea');
  const sample=(x,y)=>[[[[x-.00001,y-.00001],[x+.00001,y-.00001],[x+.00001,y+.00001],[x-.00001,y+.00001],[x-.00001,y-.00001]]]];
  for(const [x,y] of [[72,20.8],[72.2,20.6],[68.90,22.75]]) {
    assert(area(clipping.difference(sample(x,y),selections.get('Arabian Sea').geometry.coordinates))<1e-12,`bare ocean remains at ${x},${y}`);
  }
  for(const name of ['Gulf of Kutch','Gulf of Khambhat']) {
    assert(area(clipping.intersection(arabian.geometry.coordinates,selections.get(name).geometry.coordinates))<1e-10,`${name} should own its water up to the common entrance`);
  }
});

test('Black Sea additions have one label and catalog row, stories, and complete parent selection', () => {
  const labels=read('sea-labels.geojson').features;
  for(const [name,parent] of [
    ['Taman Bay','Kerch Strait'],['Taganrog Bay','Sea of Azov'],
    ...['Dnieper-Bug Estuary','Burgas Bay','Gulf of Odessa','Karkinit Bay','Kalamita Bay'].map(n=>[n,'Black Sea']),
  ]) {
    assert.equal(byName.get(name)?.parent,parent,name);
    assert.equal(labels.filter(f=>f.properties.name===name).length,1,name);
    const rows=seaRows.filter(r=>r.name===name);
    assert.equal(rows.length,1,name);
    assert.equal(rows[0].parent,parent);
    assert(rows[0].story && rows[0].sourceUrl,name);
    assert(area(clipping.difference(selections.get(name).geometry.coordinates,selections.get(parent).geometry.coordinates))<1e-8,name);
  }
});

test('Turkish straits and adjacent basins cover the entrance water without overlapping hit targets', () => {
  const features=read('seas.geojson').features;
  const geometry=n=>features.find(f=>f.properties.name===n).geometry.coordinates;
  const land=JSON.parse(fs.readFileSync(new URL('../data/raw/countries-10m-raw.geojson',import.meta.url))).features
    .filter(f=>['TUR','GRC'].includes(f.properties.ADM0_A3)).map(f=>f.geometry.coordinates);
  for(const [basin,strait,[w,s,e,n]] of [
    ['Black Sea','Bosporus',[29.08,41.19,29.19,41.27]],
    ['Aegean Sea','Dardanelles',[26.12,39.96,26.33,40.03]],
    ['Sea of Marmara','Bosporus',[28.97,40.99,29.04,41.02]],
  ]) {
    const union=clipping.union(geometry(basin),geometry(strait));
    const water=clipping.difference([[[w,s],[e,s],[e,n],[w,n],[w,s]]],...land);
    assert(area(clipping.intersection(geometry(basin),geometry(strait)))<1e-10);
    assert(area(clipping.difference(water,union))<1e-8,`${basin} entrance has uncovered coastal water`);
  }
});

test('Romanian Black Sea follows the detailed Razim coast without offshore shortcut lines',()=>{
 const sea=read('seas.geojson').features.find(f=>f.properties.name==='Black Sea').geometry.coordinates;
 const sample=(x,y)=>[[[[x-.00005,y-.00005],[x+.00005,y-.00005],[x+.00005,y+.00005],[x-.00005,y+.00005],[x-.00005,y-.00005]]]];
 for(const [x,y] of [[29.623844,44.8707545],[29.663179,45.186713]]) {
  assert(area(clipping.difference(sample(x,y),sea))<1e-12,`coastal gap at ${x},${y}`);
 }
 const land=JSON.parse(fs.readFileSync(new URL('../data/raw/countries-10m-raw.geojson',import.meta.url))).features.find(f=>f.properties.ADM0_A3==='ROU');
 assert(area(clipping.intersection(sea,land.geometry.coordinates))<1e-6,'repair overlaps Romanian land');
});


test('Gulf of Guinea children have shared seams and direct catalog parents', () => {
  const names=['Bight of Benin','Bight of Bonny','Corisco Bay'];
  const raw=new Map(read('seas.geojson').features.map(f=>[f.properties.name,f]));
  for(const name of names){
    assert.deepEqual(byName.get(name).path,['Atlantic Ocean','Gulf of Guinea',name]);
    assert(seaRows.some(r=>r.name===name));
    assert(area(clipping.difference(raw.get(name).geometry.coordinates,selections.get('Gulf of Guinea').geometry.coordinates))<1e-8,name);
    assert(area(clipping.intersection(raw.get(name).geometry.coordinates,raw.get('Gulf of Guinea').geometry.coordinates))<1e-8,name);
  }
  assert(area(clipping.intersection(raw.get('Bight of Bonny').geometry.coordinates,raw.get('Corisco Bay').geometry.coordinates))<1e-8);
});

test('Bosporus reaches the northern lighthouse entrance as one connected water',()=>{
 const strait=read('seas.geojson').features.find(f=>f.properties.name==='Bosporus').geometry.coordinates;
 assert.equal(strait.length,1,'detached southern artifact must not return');
 const probe=[[[[29.12,41.219],[29.125,41.219],[29.125,41.225],[29.12,41.225],[29.12,41.219]]]];
 assert(area(clipping.difference(probe,strait))<1e-10,'northern approach is missing');
 const vertices=strait.flat(2);
 for(const p of [[29.109223,41.235297],[29.150487,41.222829]])assert(vertices.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<2e-6),'missing lighthouse mouth endpoint');
});


test('Taranto and Saint-Malo have sourced catalog entries and complete basin selections',()=>{
 for(const [name,path] of [
  ['Gulf of Taranto',['Atlantic Ocean','Mediterranean Sea','Ionian Sea','Gulf of Taranto']],
  ['Gulf of Saint-Malo',['Atlantic Ocean','English Channel','Gulf of Saint-Malo']],
 ]) {
  assert.deepEqual(byName.get(name).path,path);
  const rows=seaRows.filter(r=>r.name===name);assert.equal(rows.length,1);
  const f=read('seas.geojson').features.find(f=>f.properties.name===name);
  assert(f.properties.story&&f.properties.sourceUrl,name+' needs sourced story');
  assert(area(clipping.difference(f.geometry.coordinates,selections.get(path.at(-2)).geometry.coordinates))<1e-8,name+' parent omits water');
 }
});

test('Lion, Taranto and Saint-Malo share gap-free non-overlapping basin entrances',()=>{
 const features=read('seas.geojson').features;
 const geometry=n=>features.find(f=>f.properties.name===n).geometry.coordinates;
 const land=JSON.parse(fs.readFileSync(new URL('../data/raw/countries-10m-raw.geojson',import.meta.url))).features
  .filter(f=>['FRA','ESP','ITA','JEY','GGY'].includes(f.properties.ADM0_A3)).map(f=>f.geometry.coordinates);
 for(const [basin,gulf,[w,s,e,n]] of [
  ['Mediterranean Sea','Gulf of Lion',[3,42.4,6,43.6]],
  ['Ionian Sea','Gulf of Taranto',[16.6,39.5,18.3,40.5]],
  ['English Channel','Gulf of Saint-Malo',[-3.05,48.5,-1.6,49.7]],
 ]){
  assert(area(clipping.intersection(geometry(basin),geometry(gulf)))<1e-8,basin+' overlaps '+gulf);
  const water=clipping.difference([[[w,s],[e,s],[e,n],[w,n],[w,s]]],...land);
  assert(area(clipping.difference(water,clipping.union(geometry(basin),geometry(gulf))))<1e-7,basin+' has coastal gaps');
 }
 assert(area(clipping.intersection(geometry('Balearic Sea'),geometry('Gulf of Lion')))<1e-8);
});


test('Garabogazköl is an inland Caspian child with original shoreline and sourced catalog entry',()=>{
 const name='Garabogazköl Basin';
 assert.deepEqual(byName.get(name).path,['Caspian Sea',name]);
 assert.equal(byName.get(name).ocean,'Inland basin · no ocean outlet');
 const rows=seaRows.filter(r=>r.name===name);assert.equal(rows.length,1);assert(rows[0].story&&rows[0].sourceUrl);
 const features=read('seas.geojson').features;
 const basin=features.find(f=>f.properties.name===name).geometry.coordinates;
 const caspian=features.find(f=>f.properties.name==='Caspian Sea').geometry.coordinates;
 assert.equal(basin.length,1);
 assert(area(basin)>1&&area(basin)<4,'lagoon footprint is implausible');
 assert(area(clipping.intersection(basin,caspian))<1e-8,'inlet hit targets overlap');
 assert(area(clipping.difference(basin,selections.get('Caspian Sea').geometry.coordinates))<1e-8);
 const land=JSON.parse(fs.readFileSync(new URL('../data/raw/countries-10m-raw.geojson',import.meta.url))).features.find(f=>f.properties.ADM0_A3==='TKM');
 assert(area(clipping.intersection(basin,land.geometry.coordinates))<1e-6,'lagoon overlaps land');
 const inlet=clipping.difference([[[52.8,40.98],[53.03,40.98],[53.03,41.18],[52.8,41.18],[52.8,40.98]]],land.geometry.coordinates);
 assert(area(clipping.difference(inlet,clipping.union(basin,caspian)))<1e-8,'Caspian inlet has an uncovered coastal gap');
});
