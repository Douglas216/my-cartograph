import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import clipping from 'polygon-clipping';
import {coastlineIndex,boundaries,editGeometry,fingerprint} from './lib/marine-editor.mjs';
const geom=coordinates=>({type:'Polygon',coordinates:[coordinates]});
const land={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:geom([[0,0],[1,0],[1,4],[0,4],[0,0]])}]};
const base=geom([[1,1],[3,1],[3,3],[1,3],[1,1]]),index=coastlineIndex(land),defs=boundaries(base,index);
const area=ps=>ps.reduce((t,p)=>t+p.reduce((s,r,i)=>s+(i?-1:1)*Math.abs(r.slice(1).reduce((a,b,j)=>a+r[j][0]*b[1]-b[0]*r[j][1],0))/2,0),0);
test('only offshore edges expose handles; shore remains fixed',()=>{
 assert.equal(defs.length,1);assert.deepEqual(defs[0].coastal,[true,true]);
 assert(!defs[0].points.some(([x,y])=>x===1&&y>1&&y<3));
 const points=defs[0].handles.map(([x,y])=>[x===3?3.5:x,y]);
 const result=editGeometry(base,defs,{[defs[0].id]:points},land,index);
 assert.equal(area(clipping.intersection(result.geometry.coordinates,land.features[0].geometry.coordinates)),0);
 assert.equal(area(result.geometry.coordinates),5);
});
test('a coastal endpoint slides along the original coast without cutting across land',()=>{
 const points=structuredClone(defs[0].handles);points[0]=[.97,1.2];
 const r=editGeometry(base,defs,{[defs[0].id]:points},land,index);
 assert.deepEqual(r.edits[defs[0].id][0],[1,1.2]);
 assert.equal(area(clipping.intersection(r.geometry.coordinates,land.features[0].geometry.coordinates)),0);
 assert(area(r.geometry.coordinates)<4);
});
test('invalid, detached and self-crossing edits are rejected',()=>{
 assert.throws(()=>editGeometry(base,defs,{unknown:[[1,1],[2,2]]},land,index));
 assert.throws(()=>editGeometry(base,defs,{[defs[0].id]:[[NaN,1],[1,3]]},land,index));
 assert.throws(()=>editGeometry(base,defs,{[defs[0].id]:[[2,1],[3,2],[1,3]]},land,index));
 assert.throws(()=>editGeometry(base,defs,{[defs[0].id]:[[1,1],[3,3],[3,1],[1,3]]},land,index));
});
test('generated editor includes every new Black Sea bay and uses stable baseline fingerprints',()=>{
 const manifest=JSON.parse(fs.readFileSync('public/geo/marine-editor.json'));
 const seas=JSON.parse(fs.readFileSync('public/geo/seas.geojson')).features;
 for(const name of ['Taman Bay','Dnieper-Bug Estuary','Burgas Bay','Gulf of Odessa','Karkinit Bay','Kalamita Bay','Taganrog Bay']) {
  const d=manifest.features.find(f=>f.name===name),f=seas.find(f=>f.properties.name===name);
  assert(d?.boundaries.length,name);assert.equal(d.fingerprint,fingerprint(f.geometry));
 }
});
test('adding a collinear midpoint does not change the water, and coastal endpoints can expand it',()=>{
 const b=defs[0],points=structuredClone(b.handles);points.splice(1,0,[2,1]);
 const unchanged=editGeometry(base,defs,{[b.id]:points},land,index);
 assert(Math.abs(area(unchanged.geometry.coordinates)-4)<1e-10);
 const expanded=structuredClone(b.handles);expanded[0]=[1,.8];
 assert(area(editGeometry(base,defs,{[b.id]:expanded},land,index).geometry.coordinates)>4);
});
test('exports preserve original coastline geometry byte for byte',()=>{
 const before=JSON.stringify(land);const points=structuredClone(defs[0].handles);points[1][0]+=.1;
 editGeometry(base,defs,{[defs[0].id]:points},land,index);
 assert.equal(JSON.stringify(land),before);
});

test('import validates before writing, and successive publications retain edit history',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,symlinkSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'marine-editor-import-'));
 try {
  mkdirSync(join(dir,'scripts'),{recursive:true});mkdirSync(join(dir,'public/geo'),{recursive:true});mkdirSync(join(dir,'data'));
  cpSync('scripts/import-marine-edits.mjs',join(dir,'scripts/import-marine-edits.mjs'));
  cpSync('scripts/lib',join(dir,'scripts/lib'),{recursive:true});symlinkSync(resolve('node_modules'),join(dir,'node_modules'),'dir');
  const put=(name,value)=>writeFileSync(join(dir,name),JSON.stringify(value));
  let shape=base,definition={name:'Test Bay',fingerprint:fingerprint(shape),boundaries:boundaries(shape,index)};
  put('public/geo/marine-editor-land.geojson',land);
  const baseline=()=>{put('public/geo/marine-editor.json',{features:[definition]});put('public/geo/seas.geojson',{features:[{properties:{name:'Test Bay'},geometry:shape}]});};baseline();
  const input=join(dir,'draft.json'),run=()=>execFileSync(process.execPath,[join(dir,'scripts/import-marine-edits.mjs'),input],{stdio:'pipe'});
  let points=structuredClone(definition.boundaries[0].handles);points[1][0]+=.1;
  let draft={name:'Test Bay',fingerprint:definition.fingerprint,edits:{[definition.boundaries[0].id]:points}};
  put('draft.json',{version:1,features:[{...draft,fingerprint:'stale'}]});assert.throws(run);
  assert(!fs.existsSync(join(dir,'data/marine-boundary-edits.json')));
  put('draft.json',{version:1,features:[draft]});run();
  shape=editGeometry(shape,definition.boundaries,draft.edits,land,index).geometry;
  definition={name:'Test Bay',fingerprint:fingerprint(shape),boundaries:boundaries(shape,index)};baseline();
  points=structuredClone(definition.boundaries[0].handles);points[1][0]+=.1;
  draft={name:'Test Bay',fingerprint:definition.fingerprint,edits:{[definition.boundaries[0].id]:points}};
  put('draft.json',{version:1,features:[draft]});run();
  const saved=JSON.parse(readFileSync(join(dir,'data/marine-boundary-edits.json')));
  assert.equal(saved.batches.length,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
