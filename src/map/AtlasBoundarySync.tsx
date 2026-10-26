import {useEffect,useState,useRef} from 'react';
import type {GeoJSONSource} from 'maplibre-gl';
import {useAtlasStore} from '../store/atlasStore';
import {requestMarine} from './marineClient';
import {mapRegistry} from './mapRegistry';
import {whenMapStyleReady} from './whenMapStyleReady';
export default function AtlasBoundarySync(){
 const {features,loaded,loading,error,load}=useAtlasStore();
 const hasApplied=useRef(false);
 const [renderError,setRenderError]=useState(''),[applying,setApplying]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  void load();
  const refresh=()=>{if(document.visibilityState==='visible')void load();};
  window.addEventListener('focus',refresh);
  return ()=>window.removeEventListener('focus',refresh);
 },[load]);
 useEffect(()=>{
  if(!loaded||!mapRegistry.map)return;
  let canceled=false;
  const stop=whenMapStyleReady(mapRegistry.map,()=>{
   if(!features.length&&!hasApplied.current)return;
   setApplying(true);setRenderError('');
   requestMarine({type:'atlas',features}).then(result=>{
    if(canceled)return;
    const map=mapRegistry.map;if(!map)return;
    hasApplied.current=true;
    for(const [id,data] of Object.entries(result.sources)) (map.getSource(id) as GeoJSONSource)?.setData(data as never);
    if(result.warnings.length)setRenderError(result.warnings.join(' '));
   }).catch(e=>{if(!canceled)setRenderError(e.message);}).finally(()=>{if(!canceled)setApplying(false);});
  });
  return ()=>{canceled=true;stop();};
 },[features,loaded,attempt]);
 const message=error||renderError;
 if(!message&&!loading&&!applying)return null;
 return <div className="atlas-sync" role="status">{message|| (applying?'Applying your saved boundaries…':'Loading your atlas…')}{message&&<button onClick={()=>{setAttempt(n=>n+1);void load();}}>Retry</button>}</div>;
}
