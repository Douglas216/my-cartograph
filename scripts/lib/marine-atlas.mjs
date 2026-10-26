import clipping from 'polygon-clipping';
import {editGeometry} from './marine-editor.mjs';
function contains([x,y],geometry){
 const inRing=ring=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
 return geometry.coordinates.some(poly=>inRing(poly[0])&&!poly.slice(1).some(inRing));
}
function labelPoint(geometry){
 let best=null,width=-1;
 for(const poly of geometry.coordinates){
  const ys=poly[0].map(p=>p[1]).sort((a,b)=>a-b);
  // Scan between vertices; even/odd crossings preserve island holes.
  for(const fraction of [.5,.25,.75,.1,.9]){
   const i=Math.min(ys.length-2,Math.floor((ys.length-1)*fraction)),y=(ys[i]+ys[i+1])/2;
   const crossings=[];
   for(const ring of poly)for(let j=1;j<ring.length;j++){
    const a=ring[j-1],b=ring[j];if((a[1]>y)!==(b[1]>y))crossings.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
   }
   crossings.sort((a,b)=>a-b);
   for(let j=1;j<crossings.length;j+=2)if(crossings[j]-crossings[j-1]>width){width=crossings[j]-crossings[j-1];best=[(crossings[j]+crossings[j-1])/2,y];}
  }
 }
 return best;
}
export function applyAtlasBoundaries(data,features){
 const seas=structuredClone(data.seas),selections=structuredClone(data.selections),labels=structuredClone(data.labels);
 const changed=new Set(),warnings=[];
 for(const item of features){
  const definition=data.manifest.features.find(f=>f.name===item.name),feature=seas.features.find(f=>f.properties.name===item.name);
  if(!definition||!feature||item.fingerprint!==definition.fingerprint){warnings.push(`Saved ${item.name} needs review after a map-data update.`);continue;}
  try{
   feature.geometry=editGeometry(feature.geometry,definition.boundaries,item.edits,data.land,data.index).geometry;changed.add(item.name);
   const label=labels.features.find(f=>f.properties.name===item.name);
   if(label&&!contains(label.geometry.coordinates,feature.geometry)){const point=labelPoint(feature.geometry);if(point)label.geometry.coordinates=point;}
  }catch{warnings.push(`Could not apply the saved boundary for ${item.name}.`);}
 }
 for(const record of data.hierarchy){
  const members=[record.name,...record.descendants];if(!members.some(n=>changed.has(n)))continue;
  const shapes=seas.features.filter(f=>members.includes(f.properties.selection_name||f.properties.name)).map(f=>f.geometry.coordinates);
  const selection=selections.features.find(f=>f.properties.name===record.name);
  if(selection&&shapes.length)selection.geometry={type:'MultiPolygon',coordinates:clipping.union(...shapes)};
 }
 return {sources:{seas,'marine-selections':selections,'sea-labels':labels},warnings};
}
