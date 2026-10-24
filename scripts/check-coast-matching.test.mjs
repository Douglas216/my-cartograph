import test from 'node:test';
import assert from 'node:assert/strict';
import clipping from 'polygon-clipping';
import { coastlineIndex, refitMarineCoast } from './lib/marine-coast.mjs';

const land={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,.3],[1.02,.4],[.98,.5],[1,.6],[1,1],[0,1],[0,0]]]}}]};
const source={type:'Polygon',coordinates:[[[1.04,.2],[2,.2],[2,.8],[1.04,.8],[1.04,.65],[1.04,.5],[1.04,.35],[1.04,.2]]]};
const area=ps=>ps.reduce((total,p)=>total+p.reduce((sum,r,i)=>sum+(i?-1:1)*Math.abs(r.slice(1).reduce((s,b,j)=>s+r[j][0]*b[1]-b[0]*r[j][1],0))/2,0),0);

test('coast matching fills a generalized shore gap and follows a small inlet',()=>{
  const {geometry,matched}=refitMarineCoast(source,coastlineIndex(land),land);
  assert(matched>0);
  assert.equal(area(clipping.intersection(geometry.coordinates,land.features[0].geometry.coordinates)),0);
  const target=[[[1.001,.61],[1.02,.61],[1.02,.64],[1.001,.64],[1.001,.61]]];
  assert(area(clipping.difference(target,geometry.coordinates))<1e-10,'coastal water remains unfilled');
  assert(geometry.coordinates.flat(2).some(([x,y])=>x===.98&&y===.5),'detailed inlet was skipped');
});

test('long offshore limits stay straight and shoreline repair does not create mouth ears',()=>{
  const {geometry}=refitMarineCoast(source,coastlineIndex(land),land);
  for(const [x,y] of geometry.coordinates.flat(2)) {
    assert(y>=.2-1e-6&&y<=.8+1e-6);
    assert(x<=2+1e-6);
  }
});
