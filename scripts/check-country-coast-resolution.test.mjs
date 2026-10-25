import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/map/layers/countryLayers.ts',import.meta.url),'utf8')
  .replace("import { buildColorMatchExpression } from '../colors';", 'const buildColorMatchExpression = () => "#fff";')
  .replace("import { politicalName } from '../typography';", 'const politicalName = {country:{layout:{},paint:{}}};');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {countryLayers,countryLayerFilter,countryFillLayerIds,countrySelectionLayerIds}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const evaluate=(e,code)=>!Array.isArray(e)?e:e[0]==='get'?(e[1]==='COAST_DETAIL'?code==='IND':code):e[0]==='literal'?e[1]:e[0]==='all'?e.slice(1).every(x=>evaluate(x,code)):e[0]==='in'?evaluate(e[2],code).includes(evaluate(e[1],code)):e[0]==='=='?evaluate(e[1],code)===e[2]:e[0]==='!='?evaluate(e[1],code)!==e[2]:false;
const active=(layer,z,code)=>z>=(layer.minzoom??0)&&z<(layer.maxzoom??Infinity)&&(!layer.filter||evaluate(layer.filter,code));
test('India fill, border and selection switch together to the gulf coastline at z3',()=>{
 for(const z of [2.99,3,3.99,4,4.99,5,7]) for(const code of ['IND','FRA']) {
  const expected=z>=5||(code==='IND'&&z>=3)?'countries-10m':z>=4?'countries-50m':'countries-110m';
  for(const kind of ['fill','border','highlight','glow']) {
   const layers=countryLayers.filter(l=>l.id.startsWith(`country-${kind}-`)).map(l=>kind==='highlight'||kind==='glow'?{...l,filter:countryLayerFilter(l.id,['in',['get','ADM0_A3'],['literal',[code]]])}:l).filter(l=>active(l,z,code));
   assert.equal(layers.length,1,`${kind} ${code} z${z}`);assert.equal(layers[0].source,expected);
  }
 }
});
test('all coastal country variants remain clickable and highlightable',()=>{
 for(const l of countryLayers) {
  if(l.id.startsWith('country-fill-'))assert(countryFillLayerIds.includes(l.id));
  if(/^country-(glow|highlight)-/.test(l.id))assert(countrySelectionLayerIds.includes(l.id));
 }
});
