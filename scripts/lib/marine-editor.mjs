import clipping from 'polygon-clipping';
import { coastlineIndex, coastPath } from './marine-coast.mjs';
export { coastlineIndex };
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const round=p=>p.map(v=>Math.round(v*1e6)/1e6);
const area=ps=>ps.reduce((t,p)=>t+p.reduce((s,r,i)=>s+(i?-1:1)*Math.abs(r.slice(1).reduce((a,b,j)=>a+r[j][0]*b[1]-b[0]*r[j][1],0))/2,0),0);
export function fingerprint(geometry) {
  const text=JSON.stringify(geometry);let hash=2166136261;
  for(let i=0;i<text.length;i++) hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return (hash>>>0).toString(16);
}
export function boundaries(geometry,index) {
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates, result=[];
  polygons.forEach((poly,pi)=>{
    const ring=poly[0],n=ring.length-1;
    const open=ring.slice(0,-1).map((a,i)=>{
      const b=ring[i+1];
      if(Math.abs(a[0]-b[0])>180)return false;
      return !index.nearest([(a[0]+b[0])/2,(a[1]+b[1])/2],.000003);
    });
    const first=open.findIndex(v=>!v);
    if(first<0)return; // No coastline: ocean-only outlines are outside this editor.
    for(let k=1;k<=n;k++) {
      const i=(first+k)%n;if(!open[i])continue;
      const points=[ring[i]];
      while(k<=n&&open[(first+k)%n]) {points.push(ring[((first+k)%n)+1]);k++;}
      k--;
      const length=points.slice(1).reduce((s,p,j)=>s+dist(p,points[j]),0);
      if(length<.01)continue; // Skip rounding seams, not genuine offshore limits.
      // Keep the exact source line as the baseline; only remove collinear handles.
      const handles=[points[0]];
      for(let j=1;j<points.length-1;j++) {
        const a=handles.at(-1),b=points[j],c=points[j+1];
        if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))>1e-9)handles.push(b);
      }
      handles.push(points.at(-1));
      result.push({id:`${pi}:${i}`,points,handles,coastal:[!!index.nearest(points[0],.00001),!!index.nearest(points.at(-1),.00001)]});
    }
  });
  return result;
}
function simpleLine(points) {
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(dist(points[i],points[j])<1e-7)throw Error('Separate overlapping handles.');
  for(let i=1;i<points.length;i++) {
    if(dist(points[i-1],points[i])<1e-7)throw Error('Separate overlapping handles.');
    for(let j=i+2;j<points.length;j++) {
      const [a,b,c,d]=[points[i-1],points[i],points[j-1],points[j]];
      if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)throw Error('Offshore lines cannot cross themselves.');
    }
  }
}
export function editGeometry(base,definitions,edits,land,index=coastlineIndex(land)) {
  if(!Object.keys(edits).length)return {geometry:base.type==='Polygon'?{type:'MultiPolygon',coordinates:[base.coordinates]}:base,edits:{}};
  let shape=base.type==='Polygon'?[base.coordinates]:base.coordinates;
  const normalized={};
  for(const [id,input] of Object.entries(edits)) {
    const boundary=definitions.find(b=>b.id===id);
    if(!boundary)throw Error('This boundary no longer matches the map. Start a new draft.');
    if(!Array.isArray(input)||input.length<2||input.length>100||input.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))||Math.abs(p[0])>180||Math.abs(p[1])>85))throw Error('Invalid boundary coordinates.');
    let points=input.map(round);
    const old=boundary.points;
    const span=Math.max(2,...old.map(p=>dist(p,old[0])));
    if(points.some(p=>!old.some(q=>dist(p,q)<=span)))throw Error('Keep adjustments near this water body.');
    const connectors=[];
    for(const end of [0,1]) {
      const oldPoint=end?old.at(-1):old[0],i=end?points.length-1:0;
      if(boundary.coastal[end]) {
        const from=index.nearest(oldPoint,.00002),to=index.nearest(points[i],.5);
        if(!from||!to||from.id!==to.id)throw Error('Move the endpoint along the same coastline near its original entrance.');
        const path=coastPath(from,to,index);
        if(!path)throw Error('Move the endpoint a shorter distance along this coast.');
        points[i]=round(to.point);
        connectors[end]=[oldPoint,...path.map(round),points[i]];
      }else connectors[end]=[oldPoint,points[i]];
    }
    simpleLine(points);
    normalized[id]=points;
    // XOR the swept ribbon: expansion and contraction both preserve the
    // source coast, including when a new line crosses its old position.
    const ring=[...old,...connectors[1].slice(1),...points.slice(0,-1).reverse(),...connectors[0].slice(0,-1).reverse()];
    const clean=ring.filter((p,i)=>i===0||dist(p,ring[i-1])>1e-9);
    if(clean.length<3)continue;
    if(dist(clean[0],clean.at(-1))>1e-9)clean.push(clean[0]);
    if(JSON.stringify(points)===JSON.stringify(boundary.handles))continue;
    shape=clipping.xor(shape,[clean]);
  }
  const all=shape.flat(2),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
  const bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  const clippers=[];
  for(const feature of land.features)for(const poly of feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates) {
    const ps=poly[0];let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;
    for(const [x,y] of ps){w=Math.min(w,x);s=Math.min(s,y);e=Math.max(e,x);n=Math.max(n,y);}
    if(e>=bounds[0]&&w<=bounds[2]&&n>=bounds[1]&&s<=bounds[3])clippers.push([poly]);
  }
  shape=clipping.difference(shape,...clippers);
  if(!shape.length||area(shape)<1e-9)throw Error('The boundary would erase this water body.');
  return {geometry:{type:'MultiPolygon',coordinates:shape},edits:normalized};
}
