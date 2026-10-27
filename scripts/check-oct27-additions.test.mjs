import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import clipping from 'polygon-clipping';
const read=f=>JSON.parse(fs.readFileSync(new URL('../public/geo/'+f,import.meta.url)));
const rows=id=>read('catalog.json').sections.find(s=>s.id===id).rows;
test('three marine additions have labels, stories, catalog entries and correct parents',()=>{
 const hierarchy=read('marine-hierarchy.json'),labels=read('sea-labels.geojson').features;
 const selections=read('marine-selections.geojson').features;
 for(const [name,parent] of [['Gulf of Suez','Red Sea'],['Gulf of Aqaba','Red Sea'],['Gulf of Lion','Mediterranean Sea']]){
  assert.equal(hierarchy.find(f=>f.name===name)?.parent,parent);
  assert.equal(labels.filter(f=>f.properties.name===name).length,1);
  const row=rows('seas').find(r=>r.name===name);assert(row.story&&row.sourceUrl);assert.equal(row.parent,parent);
  assert.deepEqual(clipping.difference(selections.find(f=>f.properties.name===name).geometry.coordinates,selections.find(f=>f.properties.name===parent).geometry.coordinates),[]);
 }
 assert(!hierarchy.some(f=>f.name==='Golfe du Lion'));
});
test('both reservoirs have detailed geometry, one label, country membership and sourced stories',()=>{
 const lakes=read('lakes.geojson').features,labels=read('lake-labels.geojson').features;
 for(const [name,countries] of [['Gatun Lake',['Panama']],['Lake Nasser',['Egypt','Sudan']]]){
  const feature=lakes.find(f=>f.properties.name===name);assert(feature);assert(feature.geometry.coordinates.flat(Infinity).length>1000);
  assert.equal(labels.filter(f=>f.properties.name===name).length,1);
  const point=labels.find(f=>f.properties.name===name).geometry.coordinates;
  const [x,y]=point;const probe=[[[x-.00001,y-.00001],[x+.00001,y-.00001],[x+.00001,y+.00001],[x-.00001,y+.00001],[x-.00001,y-.00001]]];assert(clipping.intersection(feature.geometry.coordinates,probe).length,'lake label must sit on water');
  const row=rows('lakes').find(r=>r.name===name);assert.deepEqual(row.countries,countries);assert(row.story&&row.sourceUrl&&row.area>0);
 }
});
test('Suez is a separate continuous canal with two sea terminals, not an animated river',()=>{
 const canals=read('canals.geojson').features;assert.equal(canals.length,1);
 const f=canals[0];assert.equal(f.properties.name,'Suez Canal');assert.equal(f.properties.featurecla,'Canal');
 assert.equal(f.geometry.type,'LineString');assert(f.geometry.coordinates[0][1]>31.26);assert(f.geometry.coordinates.at(-1)[1]<29.95);
 assert(!read('rivers.geojson').features.some(f=>f.properties.name==='Suez Canal'));
 const row=rows('rivers').find(r=>r.name==='Suez Canal');assert.equal(row.kind,'canal');assert.equal(row.length,193.3);assert.match(row.source,/Mediterranean/);assert.match(row.mouth,/Suez/);
});
