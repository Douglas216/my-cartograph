import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>JSON.parse(fs.readFileSync(new URL(`../public/geo/${name}`,import.meta.url)));
const cities=read('cities.geojson').features.map(f=>f.properties);
const rows=read('catalog.json').sections.find(s=>s.id==='cities').rows;
const selected=['RU','CN','IN','US','BR','CA','MX'];
test('complete selected capital sets survive both population gates',()=>{
 const counts={RU:83,CN:31,IN:39,US:51,BR:27,CA:14,MX:32};
 for(const iso of selected){
  const capitals=cities.filter(p=>p.ISO_A2===iso&&(p.SHOW_ADMIN1_CAPITAL||p.ADM0CAP===1));
  assert.equal(capitals.length,counts[iso],iso);
 }
 for(const name of ['Montpelier','Iqaluit','Kavaratti','Magas','Gatchina','Krasnogorsk','Dharamshala','Gairsain','Kargil'])
  assert(cities.some(p=>p.NAME===name&&p.SHOW_ADMIN1_CAPITAL),name);
});
test('national role wins, city identities stay distinct, and all table rows match the map',()=>{
 for(const p of cities){
  const matches=rows.filter(r=>r.name===p.NAME&&r.role===p.CITY_ROLE&&r.population===(p.POP_MAX>0?p.POP_MAX:null));
  assert(matches.length>0,p.NAME);
  if(p.ADM0CAP===1){assert.equal(p.CITY_ROLE,'National capital');assert.equal(p.SHOW_ADMIN1_CAPITAL,false);}
  if(p.SHOW_ADMIN1_CAPITAL){assert(selected.includes(p.ISO_A2));assert.equal(p.CITY_ROLE,'First-level subdivision capital');assert(p.CAPITAL_OF.length);}
  assert(p.ADM0CAP===1||p.POP_MAX>=1000000||p.SHOW_ADMIN1_CAPITAL,`${p.NAME} outside curation`);
 }
 assert.equal(cities.filter(p=>p.NAME==='Montpelier'&&p.ISO_A2==='US'&&p.SHOW_ADMIN1_CAPITAL).length,1);
 assert.equal(cities.filter(p=>p.NAME==='Krasnogorsk'&&p.SHOW_ADMIN1_CAPITAL).length,1);
 assert.deepEqual(cities.find(p=>p.NAME==='Chandigarh').CAPITAL_OF,['Punjab','Haryana','Chandigarh']);
 assert.equal(cities.find(p=>p.NAME==='Xining').CAPITAL_OF[0],'Qinghai');
 for(const name of ['Timon','Guaira','Niterói','Nazran','Palana','Fushun','Zhaotang'])
  assert(!cities.some(p=>p.NAME===name&&p.SHOW_ADMIN1_CAPITAL),name);
});

test('new capital overlays form a valid MapLibre style and stars are conspicuous',async()=>{
 const ts=(await import('typescript')).default;
 const {validateStyleMin}=await import('@maplibre/maplibre-gl-style-spec');
 const source=fs.readFileSync(new URL('../src/map/layers/cityLayers.ts',import.meta.url),'utf8').replace("import { cityName, withNativeLine } from '../typography';",'const cityName={capital:{layout:{},paint:{}},major:{layout:{},paint:{}}}; const withNativeLine=x=>x;');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {cityLayers,capitalStar}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
 assert.deepEqual(validateStyleMin({version:8,glyphs:'https://example.com/{fontstack}/{range}.pbf',sprite:'https://example.com/sprite',sources:{cities:{type:'geojson',data:{type:'FeatureCollection',features:[]}}},layers:cityLayers}),[]);
 assert(capitalStar.layout['icon-size'][4]>=.7);
 for(const size of ['small','major'])assert(cityLayers.some(l=>l.id===`subdivision-capital-${size}`));
});
