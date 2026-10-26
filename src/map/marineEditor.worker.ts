import { applyAtlasBoundaries } from '../../scripts/lib/marine-atlas.mjs';
/// <reference lib="webworker" />
import clipping, { type MultiPolygon } from 'polygon-clipping';
import { coastlineIndex, editGeometry } from '../../scripts/lib/marine-editor.mjs';
let data: Promise<any>;
const load=()=>data??=Promise.all(['marine-editor.json','marine-editor-land.geojson','seas.geojson','marine-selections.geojson','marine-hierarchy.json','sea-labels.geojson'].map(async file=>{
  const response=await fetch(`/geo/${file}`);if(!response.ok)throw Error('Could not load boundary editor data. Please retry.');return response.json();
})).then(([manifest,land,seas,selections,hierarchy,labels])=>({manifest,land,seas,selections,hierarchy,labels,index:coastlineIndex(land)}));
self.onmessage=async ({data:request})=>{
  try {
    const d=await load();
    if(request.type==='atlas') {self.postMessage({id:request.id,...applyAtlasBoundaries(d,request.features)});return;}
    if(request.type==='list') {self.postMessage({id:request.id,features:d.manifest.features.map(({name}:any)=>name).sort((a:string,b:string)=>a.localeCompare(b))});return;}
    const feature=d.seas.features.find((f:any)=>f.properties.name===request.name);
    const definition=d.manifest.features.find((f:any)=>f.name===request.name);
    if(!feature||!definition)throw Error('No editable offshore boundary for this water body.');
    if(request.type==='select') {
      const coords=feature.geometry.coordinates.flat(2);
      self.postMessage({id:request.id,definition,bbox:[Math.min(...coords.map((p:number[])=>p[0])),Math.min(...coords.map((p:number[])=>p[1])),Math.max(...coords.map((p:number[])=>p[0])),Math.max(...coords.map((p:number[])=>p[1]))],geometry:feature.geometry});return;
    }
    const result=editGeometry(feature.geometry,definition.boundaries,request.edits,d.land,d.index);
    const parent=d.hierarchy.find((r:any)=>r.name===request.name)?.parent;
    const parentFeature=d.selections.features.find((f:any)=>f.properties.name===parent);
    const parentGeometry=parentFeature?{type:'MultiPolygon',coordinates:clipping.union(parentFeature.geometry.coordinates,result.geometry.coordinates as MultiPolygon)}:null;
    self.postMessage({id:request.id,...result,parentGeometry,parent});
  }catch(error){self.postMessage({id:request.id,error:error instanceof Error?error.message:'Could not preview this boundary.'});}
};
