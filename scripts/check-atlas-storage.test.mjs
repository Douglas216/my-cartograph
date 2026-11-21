import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {boundaryAPI,validateSave} from '../worker/boundaries.mjs';
const manifest={features:[{name:'Test Bay',fingerprint:'abc',boundaries:[{id:'0:1',handles:[[1,1],[2,2]]}]}]};
const draft={name:'Test Bay',fingerprint:'abc',revision:0,edits:{'0:1':[[1,1],[2,2]]}};
function environment(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('drizzle/0000_marine_boundaries.sql','utf8'));return {DB:{prepare(sql){return {bind(...args){const statement=db.prepare(sql);return {async all(){return {results:statement.all(...args)};},async run(){return {meta:statement.run(...args)};}};}};}},close:()=>db.close()};}
function request(method='GET',user='a',body,origin='https://atlas.example'){
 const headers={'oai-authenticated-user-id':user,'content-type':'application/json',origin};if(!user)delete headers['oai-authenticated-user-id'];
 return new Request('https://atlas.example/api/marine-boundaries',{method,headers,body:body?JSON.stringify(body):undefined});
}
test('saves survive independent requests and remain isolated by account',async()=>{
 const env=environment();try{
 assert.equal((await boundaryAPI(request('PUT','a',draft),env,manifest)).status,200);
 const a=await (await boundaryAPI(request('GET','a'),env,manifest)).json();assert.equal(a.features[0].revision,1);assert.deepEqual(a.features[0].edits,draft.edits);
 const b=await (await boundaryAPI(request('GET','b'),env,manifest)).json();assert.equal(b.features.length,0);
 assert.equal((await boundaryAPI(request('PUT','b',draft),env,manifest)).status,200);
 }finally{env.close();}
});
test('stale concurrent saves cannot overwrite newer boundaries; reset is versioned',async()=>{
 const env=environment();try{
 await boundaryAPI(request('PUT','a',draft),env,manifest);
 assert.equal((await boundaryAPI(request('PUT','a',draft),env,manifest)).status,409);
 assert.equal((await boundaryAPI(request('PUT','a',{...draft,revision:1,edits:{}}),env,manifest)).status,200);
 assert.equal((await boundaryAPI(request('PUT','a',{...draft,revision:1}),env,manifest)).status,409);
 const result=await(await boundaryAPI(request(),env,manifest)).json();assert.equal(result.features[0].revision,2);assert.deepEqual(result.features[0].edits,{});
 }finally{env.close();}
});
test('anonymous, cross-site, stale baseline and invalid geometry saves are rejected',async()=>{
 const env=environment();try{
 assert.equal((await boundaryAPI(request('GET',''),env,manifest)).status,401);
 assert.equal((await boundaryAPI(request('PUT','a',draft,'https://evil.example'),env,manifest)).status,403);
 assert.equal((await boundaryAPI(request('PUT','a',{...draft,fingerprint:'old'}),env,manifest)).status,400);
 assert.throws(()=>validateSave({...draft,edits:{'0:1':[[999,1],[2,2]]}},manifest));
 assert.throws(()=>validateSave({...draft,edits:{unknown:[[1,1],[2,2]]}},manifest));
 const rows=await(await boundaryAPI(request(),env,manifest)).json();assert.equal(rows.features.length,0);
 }finally{env.close();}
});

test('saved handles reproduce the normal map after reload, update parent highlights, and reset cleanly',async()=>{
 const {applyAtlasBoundaries}=await import('./lib/marine-atlas.mjs');
 const {coastlineIndex,boundaries,fingerprint}=await import('./lib/marine-editor.mjs');
 const geometry={type:'MultiPolygon',coordinates:[[[[1,1],[3,1],[3,3],[1,3],[1,1]]]]};
 const land={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,4],[0,4],[0,0]]]}}]};
 const feature={type:'Feature',properties:{name:'Bay',selection_name:'Bay'},geometry};
 const def={name:'Bay',fingerprint:fingerprint(geometry),boundaries:boundaries(geometry,coastlineIndex(land))};
 const data={manifest:{features:[def]},land,index:coastlineIndex(land),seas:{features:[feature]},selections:{features:[feature,{...feature,properties:{name:'Sea'}}]},labels:{features:[{properties:{name:'Bay'},geometry:{type:'Point',coordinates:[2,2]}}]},hierarchy:[{name:'Bay',descendants:[]},{name:'Sea',descendants:['Bay']}]};
 const points=structuredClone(def.boundaries[0].handles);points[1][0]=3.5;points[2][0]=3.5;
 const saved=[{name:'Bay',fingerprint:def.fingerprint,edits:{[def.boundaries[0].id]:points}}];
 const first=applyAtlasBoundaries(data,saved),reload=applyAtlasBoundaries(data,JSON.parse(JSON.stringify(saved)));
 assert.deepEqual(first,reload);assert.equal(first.warnings.length,0);assert.notDeepEqual(first.sources.seas.features[0].geometry,geometry);
 assert.deepEqual(first.sources['marine-selections'].features[1].geometry,first.sources.seas.features[0].geometry);
 const reset=applyAtlasBoundaries(data,[{...saved[0],edits:{}}]);assert.deepEqual(reset.sources.seas.features[0].geometry,geometry);
 assert.deepEqual(data.seas.features[0].geometry,geometry,'published baseline was mutated');
 const stale=applyAtlasBoundaries(data,[{...saved[0],fingerprint:'old'}]);assert.equal(stale.warnings.length,1);assert.deepEqual(stale.sources.seas.features[0].geometry,geometry);
});

test('with an edit passcode, the atlas is public to read and only the passcode can save',async()=>{
 const env={...environment(),EDIT_PASSCODE:'secret'};try{
 const put=(passcode,headers={})=>new Request('https://atlas.example/api/marine-boundaries',{method:'PUT',headers:{'content-type':'application/json',origin:'https://atlas.example',...(passcode?{'x-edit-passcode':passcode}:{}),...headers},body:JSON.stringify(draft)});
 const denied=await boundaryAPI(put(''),env,manifest);assert.equal(denied.status,401);assert.equal((await denied.json()).passcode,true);
 assert.equal((await boundaryAPI(put('wrong'),env,manifest)).status,401);
 assert.equal((await boundaryAPI(put('',{'oai-authenticated-user-id':'a'}),env,manifest)).status,401,'OpenAI header must not bypass the passcode');
 assert.equal((await boundaryAPI(put('secret'),env,manifest)).status,200);
 const anonymous=await(await boundaryAPI(request('GET',''),env,manifest)).json();assert.equal(anonymous.features.length,1);
 }finally{env.close();}
});
