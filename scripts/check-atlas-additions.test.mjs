import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import clipping from 'polygon-clipping';
const read = file => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url)));
const features = name => read(`public/geo/${name}.geojson`).features;
const sea = name => features('seas').find(f => f.properties.name === name);
const area = polygons => polygons.reduce((total,p) => total+p.reduce((s,r,i)=>s+(i?-1:1)*Math.abs(r.slice(1).reduce((n,b,j)=>n+r[j][0]*b[1]-b[0]*r[j][1],0))/2,0),0);
const box = (x,y,d=.005) => [[[x-d,y-d],[x+d,y-d],[x+d,y+d],[x-d,y+d],[x-d,y-d]]];
const contains = (g,x,y) => area(clipping.intersection(g.coordinates,box(x,y)))>.00009;

test('all requested peaks have map points, catalog facts and cultural context',()=>{
 const peaks=features('peaks');
 const names=['Mount Tai','Mount Hua','Mount Heng (Hunan)','Mount Heng (Shanxi)','Mount Song','Mount McKinley (Denali)','Mount Whitney','Mount Rainier','Mount Elbert','Mount Elbrus','Mont Blanc'];
 const rows=read('public/geo/catalog.json').sections.find(s=>s.id==='peaks').rows;
 for(const name of names){const f=peaks.find(f=>f.properties.name===name); assert(f,name);assert(f.properties.story,name);const row=rows.find(r=>r.name===name);assert(row.countries.length && row.parent && row.sourceUrl,name);}
 for(const name of names.slice(0,5))assert.equal(peaks.find(f=>f.properties.name===name).properties.name_native_lang,'zh');
 assert.equal(peaks.find(f=>f.properties.name==='Mount Song').properties.elevation,1512);
 for(let i=1;i<peaks.length;i++)assert(peaks[i-1].properties.elevation>=peaks[i].properties.elevation);
});
test('added range footprints stay in their named countries and carry parent systems',()=>{
 const land=read('data/raw/countries-10m-raw.geojson').features;
 for(const [name,code,parent,x,y] of [['Dolomites','ITA','Alps',11.86,46.44],['Bismarck Range','PNG','New Guinea Highlands',145.03,-5.78]]){
 const f=features('ranges').find(f=>f.properties.name===name);assert(f,name);assert.equal(f.properties.parent,parent);
 assert(contains(f.geometry,x,y),`${name} misses its defining summit`);
 assert(area(clipping.difference(f.geometry.coordinates,land.find(f=>f.properties.ADM0_A3===code).geometry.coordinates))<1e-6,`${name} extends offshore or outside country`);
 }
});
test('new marine waters have correct hierarchy, water labels and coast fit',()=>{
 const land=read('data/raw/countries-10m-raw.geojson').features;
 for(const [name,parent,x,y,codes] of [['Palk Strait','Bay of Bengal',79.75,10.05,['IND','LKA']],['Türkmenbaşy Gulf','Caspian Sea',53.2,39.85,['TKM']]]){
 const f=sea(name);assert(f,name);assert.equal(f.properties.water_parent,parent);assert(contains(f.geometry,x,y),`${name} label is outside water`);
 for(const code of codes)assert(area(clipping.intersection(f.geometry.coordinates,land.find(f=>f.properties.ADM0_A3===code).geometry.coordinates))<1e-6,`${name} overlaps ${code}`);
 const selection=features('marine-selections').find(f=>f.properties.name===parent);assert(area(clipping.difference(f.geometry.coordinates,selection.geometry.coordinates))<1e-8);
 }
 assert.match(sea('Türkmenbaşy Gulf').properties.water_ocean,/no ocean outlet/);
});
test('Azov includes southeastern water and northeastern Taganrog Bay without overlapping Kerch',()=>{
 const f=sea('Sea of Azov');
 for(const [x,y] of [[37.8,45.8],[38.2,46.2],[38.8,47.1],[36.8,46]])assert(contains(f.geometry,x,y),`missing Azov water at ${x},${y}`);
 assert(area(clipping.intersection(f.geometry.coordinates,sea('Kerch Strait').geometry.coordinates))<1e-8);
});
test('Seine is in the catalog and flows toward its Channel mouth',async()=>{
 const {orientRiverParts}=await import('./process-countries.mjs');
 const rivers=features('rivers').filter(f=>f.properties.name==='Seine');assert(rivers.length);
 assert.equal(orientRiverParts({type:'FeatureCollection',features:rivers},()=>1000).length,0);
 const row=read('public/geo/catalog.json').sections.find(s=>s.id==='rivers').rows.find(r=>r.name==='Seine');assert.equal(row.length,777);assert.deepEqual(row.countries,['France']);assert.match(row.mouth,/English Channel/);
});

test('Palk follows its entrance and Adam’s Bridge limits rather than the old offshore box',()=>{
 const f=sea('Palk Strait');
 assert(!contains(f.geometry,80.15,10.45),'old rectangle still extends into open Bay of Bengal');
 for(const [x,y] of [[79.75,10.05],[79.5,9.7],[79.7,9.3]])assert(contains(f.geometry,x,y),`missing connected Palk water at ${x},${y}`);
 const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
 for(const p of f.geometry.coordinates.flat(2)) {
  assert(cross([79.875,10.291667],[80.25,9.825],p)<=1e-6,'Palk spills past Calimere–Pedro');
  assert(cross([79.435,9.171],[79.724,9.103],p)>=-1e-6,'Palk spills south of Adam’s Bridge');
 }
 assert.equal(f.geometry.coordinates.length,1,'detached ocean fragments remain');
});

test('Türkmenbaşy Gulf closes at the spit tips and excludes offshore Caspian water',async()=>{
 const f=sea('Türkmenbaşy Gulf');
 assert.equal(f.geometry.coordinates.length,1,'detached Caspian fragments remain');
 assert(!contains(f.geometry,52.9,39.8),'outer Caspian water west of the northern spit remains in the gulf');
 assert(contains(f.geometry,53.2,39.85));
 const a=[53.04005,39.742011],b=[53.27589,39.664862];
 const {coastlineIndex}=await import('./lib/marine-coast.mjs');
 const land=read('data/raw/countries-10m-raw.geojson');
 const index=coastlineIndex({features:land.features.filter(f=>f.properties.ADM0_A3==='TKM')});
 for(const poly of f.geometry.coordinates)for(const ring of poly)for(let i=0;i<ring.length-1;i++) {
  const p=[(ring[i][0]+ring[i+1][0])/2,(ring[i][1]+ring[i+1][1])/2];
  if(index.nearest(p,1e-5))continue;
  const cross=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  assert(Math.abs(cross)/Math.hypot(b[0]-a[0],b[1]-a[1])<1e-5,'non-coastal edge away from the actual bay mouth');
 }
});
