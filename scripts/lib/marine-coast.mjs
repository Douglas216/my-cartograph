// Match generalized marine shorelines to the exact cached land geometry. This
// follows real coastline vertices instead of buffering arbitrary open-sea edges.
import clipping from 'polygon-clipping';

const distance = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
export function coastlineIndex(land) {
  const cells=new Map(), rings=[];
  for (const feature of land.features) {
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    for (const polygon of polygons) for (const coordinates of polygon) {
      const id=rings.length, lengths=[0];
      for(let i=1;i<coordinates.length;i++) lengths.push(lengths[i-1]+distance(coordinates[i-1],coordinates[i]));
      rings.push({coordinates,lengths,total:lengths.at(-1)});
      for(let i=0;i<coordinates.length-1;i++) {
        const a=coordinates[i], b=coordinates[i+1];
        if(Math.abs(a[0]-b[0])>180) continue;
        const edge={id,i,a,b};
        for(let x=Math.floor(Math.min(a[0],b[0]));x<=Math.floor(Math.max(a[0],b[0]));x++)
          for(let y=Math.floor(Math.min(a[1],b[1]));y<=Math.floor(Math.max(a[1],b[1]));y++) {
            const key=`${x},${y}`;if(!cells.has(key)) cells.set(key,[]);cells.get(key).push(edge);
          }
      }
    }
  }
  function nearest(point, radius=.16) {
    let best=null, d=radius;
    const seen=new Set();
    for(let x=Math.floor(point[0]-radius);x<=Math.floor(point[0]+radius);x++)
      for(let y=Math.floor(point[1]-radius);y<=Math.floor(point[1]+radius);y++)
        for(const edge of cells.get(`${x},${y}`)||[]) {
          if(seen.has(edge)) continue;seen.add(edge);
          const {a,b}=edge,dx=b[0]-a[0],dy=b[1]-a[1];
          const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
          const p=[a[0]+t*dx,a[1]+t*dy], delta=distance(point,p);
          if(delta<d) { d=delta;best={...edge,t,point:p,d}; }
        }
    return best;
  }
  return {rings,nearest};
}

function coastPath(a,b,index) {
  if(!a||!b||a.id!==b.id) return null;
  const ring=index.rings[a.id], {coordinates,lengths,total}=ring;
  const pos=p=>lengths[p.i]+p.t*(lengths[p.i+1]-lengths[p.i]);
  const start=pos(a),end=pos(b),forward=(end-start+total)%total;
  const goForward=forward<=total-forward;
  const length=Math.min(forward,total-forward);
  // Never take a detour around an island/peninsula to replace an offshore line.
  if(length>Math.max(.25,distance(a.point,b.point)*3)) return null;
  const vertices=[], count=coordinates.length-1;
  let vertex=goForward?(a.i+1)%count:a.i;
  for(let steps=0;steps<count;steps++) {
    const d=goForward?(lengths[vertex]-start+total)%total:(start-lengths[vertex]+total)%total;
    if(d>=length-1e-10) break;
    if(d>1e-10) vertices.push({d,point:coordinates[vertex]});
    vertex=(vertex+(goForward?1:-1)+count)%count;
  }
  return [a.point,...vertices.map(v=>v.point),b.point];
}

export function refitMarineCoast(geometry,index,land) {
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  let matched=0, maxShift=0;
  const updated=polygons.map(polygon=>polygon.map(ring=>{
    const matches=ring.map(p=>index.nearest(p));
    const coastEdges=ring.slice(0,-1).map((a,i)=>distance(a,ring[i+1])<.5&&!!index.nearest([(a[0]+ring[i+1][0])/2,(a[1]+ring[i+1][1])/2],.08));
    const count=ring.length-1;
    const signedArea=ring.slice(1).reduce((sum,b,i)=>sum+ring[i][0]*b[1]-b[0]*ring[i][1],0);
    const result=[];
    for(let i=0;i<ring.length-1;i++) {
      const a=ring[i],b=ring[i+1],ma=matches[i],mb=matches[i+1];
      // Long straight marine limits remain straight; only coast-adjacent short
      // edges are replaced with the intervening detailed coast.
      const path=coastEdges[i]?coastPath(ma,mb,index):null;
      if(path) {
        const previous=(i+count-1)%count,next=(i+1)%count;
        const limits=[];
        if(!coastEdges[previous]) {path[0]=a;limits.push([ring[previous],a]);}
        if(!coastEdges[next]) {path[path.length-1]=b;limits.push([b,ring[next+1]]);}
        for(const [from,to] of limits) for(let j=0;j<path.length;j++) {
          const dx=to[0]-from[0],dy=to[1]-from[1],p=path[j];
          const cross=dx*(p[1]-from[1])-dy*(p[0]-from[0]);
          if(Math.sign(signedArea)*cross < -1e-12) {
            path[j]=[p[0]+dy*cross/(dx*dx+dy*dy),p[1]-dx*cross/(dx*dx+dy*dy)];
          }
        }
      }
      if(path) {result.push(...path.slice(0,-1));matched++;maxShift=Math.max(maxShift,ma.d,mb.d);}
      else result.push(a);
    }
    result.push(result[0]);return result;
  }));
  const points=updated.flat(2), xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  const clippers=[];
  for(const feature of land.features) {
    const ps=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    for(const polygon of ps) {
      let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;
      for(const p of polygon[0]) {w=Math.min(w,p[0]);s=Math.min(s,p[1]);e=Math.max(e,p[0]);n=Math.max(n,p[1]);}
      if(e>=bounds[0]&&w<=bounds[2]&&n>=bounds[1]&&s<=bounds[3]) clippers.push(polygon);
    }
  }
  // One shared precision prevents almost-coincident projection/coast edges
  // from creating unstable microscopic slivers in the polygon sweep.
  const quantize = polygons => polygons.map(poly=>poly.map(ring=>ring.map(p=>p.map(v=>Math.round(v*1e6)/1e6))));
  const coordinates=clipping.difference(quantize(updated),...clippers.map(p=>quantize([p])));
  if(!coordinates.length) throw new Error('Coast refit erased a marine feature');
  return {geometry:{type:'MultiPolygon',coordinates},matched,maxShift};
}
