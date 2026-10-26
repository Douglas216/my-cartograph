import test from 'node:test';
import assert from 'node:assert/strict';
import {whenMapStyleReady} from '../src/map/whenMapStyleReady.ts';
function fake(available) {
 const listeners=new Set();
 return {available,getLayer(){return this.available?{}:undefined;},on(_,fn){listeners.add(fn);},off(_,fn){listeners.delete(fn);},emit(){for(const fn of [...listeners])fn();},listeners};
}
test('editor initializes after the map has loaded even while source tiles are loading',()=>{
 const map=fake(true);let calls=0;
 const cleanup=whenMapStyleReady(map,()=>calls++);
 assert.equal(calls,1);map.emit();assert.equal(calls,1);cleanup();
});
test('editor waits for style layers once, including synchronous styledata during setup',()=>{
 const map=fake(false);let calls=0;
 whenMapStyleReady(map,()=>{calls++;map.emit();});
 assert.equal(calls,0);map.available=true;map.emit();map.emit();assert.equal(calls,1);
});
test('closing before style readiness prevents stale controls from appearing',()=>{
 const map=fake(false);let calls=0;
 const cleanup=whenMapStyleReady(map,()=>calls++);cleanup();map.available=true;map.emit();assert.equal(calls,0);assert.equal(map.listeners.size,0);
});
