import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {coastlineIndex,editGeometry} from './lib/marine-editor.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv[2])throw Error('Usage: node scripts/import-marine-edits.mjs /path/to/marine-boundary-edits.json');
const draft=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8'));
if(draft.version!==1||!Array.isArray(draft.features)||draft.features.length>200)throw Error('Invalid marine draft format');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'public/geo',name)));
const manifest=read('marine-editor.json'),seas=read('seas.geojson'),land=read('marine-editor-land.geojson'),index=coastlineIndex(land),seen=new Set();
const accepted=[];
for(const item of draft.features) {
 if(!item||typeof item.name!=='string'||seen.has(item.name)||!item.edits||typeof item.edits!=='object'||Array.isArray(item.edits))throw Error('Invalid or repeated water body');
 seen.add(item.name);
 const definition=manifest.features.find(d=>d.name===item.name),feature=seas.features.find(f=>f.properties.name===item.name);
 if(!definition||item.fingerprint!==definition.fingerprint)throw Error(`Stale draft for ${item.name}; reopen it against the current map`);
 const result=editGeometry(feature.geometry,definition.boundaries,item.edits,land,index);
 if(Object.keys(result.edits).length)accepted.push({name:item.name,fingerprint:item.fingerprint,edits:result.edits});
}
if(!accepted.length){console.log('No changed offshore boundaries to import.');process.exit(0);}
const file=path.join(root,'data/marine-boundary-edits.json');
const saved=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
if(saved&&saved.version!==1)throw Error('Unsupported existing boundary edit history');
const batches=saved?(saved.batches??[{features:saved.features}]):[];
batches.push({features:accepted});
fs.writeFileSync(file,JSON.stringify({version:1,batches},null,2)+'\n');
console.log(`Imported ${accepted.length} water bodies. Run node scripts/process-countries.mjs, then verify and publish.`);
