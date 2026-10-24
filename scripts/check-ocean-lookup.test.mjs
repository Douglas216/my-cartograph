import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { oceanAtPoint } from '../src/map/oceanLookup.ts';
const roots = JSON.parse(fs.readFileSync(new URL('../public/geo/marine-selections.geojson', import.meta.url))).features.filter(f => f.properties.water_depth === 0 && f.properties.name.endsWith('Ocean'));
test('unnamed coastal water uses basin geometry and handles both sides of the dateline', () => {
  for (const [lng,lat,expected] of [[121.1,30.4,'Pacific Ocean'],[122.2,30.4,'Pacific Ocean'],[145,30,'Pacific Ocean'],[-130,10,'Pacific Ocean'],[170,10,'Pacific Ocean'],[-179,0,'Pacific Ocean'],[179,0,'Pacific Ocean'],[541,0,'Pacific Ocean'],[-40,20,'Atlantic Ocean'],[70,-20,'Indian Ocean'],[0,85,'Arctic Ocean'],[0,-70,'Southern Ocean']]) {
    assert.equal(oceanAtPoint(roots,lng,lat),expected,`${lng},${lat}`);
  }
});
test('a coastal gap resolves to the closest boundary; polygon holes are respected', () => {
  const rectangle = (name,w,e,hole) => ({type:'Feature',properties:{name},geometry:{type:'Polygon',coordinates:[[[w,0],[e,0],[e,10],[w,10],[w,0]],...(hole?[hole]:[])]}});
  const hole=[[2,2],[4,2],[4,4],[2,4],[2,2]];
  const features=[rectangle('First',0,10,hole),rectangle('Second',2.5,3.5)];
  assert.equal(oceanAtPoint(features,3,3),'Second');
  assert.equal(oceanAtPoint([rectangle('West',0,10),rectangle('East',20,30)],19,5),'East');
});
