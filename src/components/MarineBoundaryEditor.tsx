import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import { mapRegistry, setFeatureHighlight, setHighlightCodes } from '../map/mapRegistry';
import { whenMapStyleReady } from '../map/whenMapStyleReady';
import { marineEditorState } from '../map/marineEditorState';
import { requestMarine } from '../map/marineClient';
import { useAtlasStore } from '../store/atlasStore';
import { useMapStore } from '../store/mapStore';
import './MarineBoundaryEditor.css';
type Point=[number,number];
type Edits=Record<string,Point[]>;
type Definition={name:string;fingerprint:string;boundaries:{id:string;handles:Point[];coastal:boolean[]}[]};
type Draft={name:string;fingerprint:string;edits:Edits};
const KEY='knowledge-map-marine-drafts-v1';
function readDrafts():Draft[]{try{const data=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(data)?data:[];}catch{return [];}}
const empty={type:'FeatureCollection',features:[]} as const;
export default function MarineBoundaryEditor(){
  const [open,setOpen]=useState(false),[names,setNames]=useState<string[]>([]),[name,setName]=useState('');
  const [definition,setDefinition]=useState<Definition|null>(null),[edits,setEdits]=useState<Edits>({}),[history,setHistory]=useState<Edits[]>([]),[future,setFuture]=useState<Edits[]>([]);
  const [boundaryId,setBoundaryId]=useState(''),[selected,setSelected]=useState<number|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[ready,setReady]=useState(false);
  const [drafts,setDrafts]=useState(readDrafts);
  const atlas=useAtlasStore();
  const [saving,setSaving]=useState(false);
  const accountRevision=useRef(0);
  const preferCloud=useRef(false);
  const [reloadTick,setReloadTick]=useState(0);
  const revision=useRef(0),markers=useRef<maplibregl.Marker[]>([]),saved=useRef('');
  const selectedPoint=useMapStore(s=>s.selectedPoint);
  const request=requestMarine;
  const change=(next:Edits)=>{setHistory(h=>[...h,edits]);setFuture([]);setEdits(next);setNotice('');};
  const isDirty=JSON.stringify(edits)!==saved.current;
  useEffect(()=>{if(open)void atlas.load();},[open,atlas.load]);
  useEffect(()=>{
    if(!open)return;
    marineEditorState.active=true;
    useMapStore.getState().selectPoint(null);setFeatureHighlight(null);setHighlightCodes([]);
    let live=true;
    setBusy(true);setError('');
    request({type:'list'}).then(r=>{if(!live)return;setNames(r.features);setName(current=>r.features.includes(current)?current:r.features.includes(selectedPoint?.name)?selectedPoint!.name:r.features[0]||'');}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setBusy(false);});
    const map=mapRegistry.map;
    const vis=new Map<string,string>();
    const zoomRanges=new Map<string,[number,number]>();
    const setup=()=>{
      if(!map||map.getSource('marine-draft'))return;
      for(const id of ['sea-boundary','sea-highlight-fill','sea-highlight','sea-highlight-glow'])if(map.getLayer(id)){vis.set(id,map.getLayoutProperty(id,'visibility') as string||'visible');map.setLayoutProperty(id,'visibility','none');}
      // Always show the same detailed land used by clipping while editing.
      // Fills, borders and highlight tiers move together and are restored on exit.
      for(const layer of map.getStyle().layers||[])if(/^country-(fill|border|glow|highlight)-/.test(layer.id)) {
        vis.set(layer.id,map.getLayoutProperty(layer.id,'visibility') as string||'visible');
        if(layer.id.endsWith('-10')){zoomRanges.set(layer.id,[layer.minzoom??0,layer.maxzoom??24]);map.setLayerZoomRange(layer.id,0,24);}
        else map.setLayoutProperty(layer.id,'visibility','none');
      }
      map.addSource('marine-draft',{type:'geojson',data:empty as never,tolerance:0});
      map.addSource('marine-draft-parent',{type:'geojson',data:empty as never,tolerance:0});
      map.addSource('marine-draft-line',{type:'geojson',data:empty as never,tolerance:0});
      map.addLayer({id:'marine-draft-parent',type:'line',source:'marine-draft-parent',paint:{'line-color':'#64748b','line-width':1.5,'line-opacity':.6}});
      map.addLayer({id:'marine-draft-fill',type:'fill',source:'marine-draft',paint:{'fill-color':'#e7b641','fill-opacity':.3}});
      map.addLayer({id:'marine-draft-outline',type:'line',source:'marine-draft',paint:{'line-color':'#b9861c','line-width':1}});
      map.addLayer({id:'marine-draft-line',type:'line',source:'marine-draft-line',paint:{'line-color':'#ad6310','line-width':3,'line-dasharray':[2,2]}});
      setReady(true);
    };
    const stopWaiting = map ? whenMapStyleReady(map, setup) : () => {};
    if(!map)setError('The map is still starting. Close and reopen the editor in a moment.');
    const unload=(event:BeforeUnloadEvent)=>{if(JSON.stringify(editsRef.current)!==saved.current){event.preventDefault();}};
    window.addEventListener('beforeunload',unload);
    return ()=>{
      live=false;revision.current++;marineEditorState.active=false;setReady(false);
      stopWaiting();markers.current.forEach(m=>m.remove());
      for(const id of ['marine-draft-line','marine-draft-outline','marine-draft-fill','marine-draft-parent'])if(map?.getLayer(id))map.removeLayer(id);
      for(const id of ['marine-draft-line','marine-draft','marine-draft-parent'])if(map?.getSource(id))map.removeSource(id);
      for(const [id,[min,max]] of zoomRanges)if(map?.getLayer(id))map.setLayerZoomRange(id,min,max);
      for(const [id,value] of vis)if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',value);
      window.removeEventListener('beforeunload',unload);
    };
    // Editor lifecycle is independent of subsequent selection and draft changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open]);
  const editsRef=useRef(edits);editsRef.current=edits;
  useEffect(()=>{
    if(!open||!name)return;
    let canceled=false;revision.current++;setDefinition(null);setBusy(true);setError('');setNotice('');
    (async()=>{await useAtlasStore.getState().load();return request({type:'select',name});})().then(r=>{
      if(canceled)return;
      const def=r.definition as Definition,draft=readDrafts().find(d=>d.name===name);
      const cloud=useAtlasStore.getState().features.find(f=>f.name===name);
      accountRevision.current=cloud?.revision||0;
      const localValid=!preferCloud.current&&draft?.fingerprint===def.fingerprint;preferCloud.current=false;
      const cloudEdits=cloud?.fingerprint===def.fingerprint?cloud.edits:{};
      const next=localValid?draft!.edits:cloudEdits;
      saved.current=cloud&&cloud.fingerprint!==def.fingerprint?'__older_baseline__':JSON.stringify(cloud?cloudEdits:{});
      if(cloud&&cloud.fingerprint!==def.fingerprint)setNotice('The saved boundary uses older atlas data. Review this shape and save it again.');
      if(localValid&&!cloud)setNotice('Your browser draft is ready. Save it to your atlas to keep it across devices.');
      if(draft&&draft.fingerprint!==def.fingerprint)setNotice('A saved draft uses an older map. Export it for review; this view starts from the current boundary.');
      setDefinition(def);setEdits(next);setHistory([]);setFuture([]);setBoundaryId(def.boundaries[0]?.id||'');setSelected(null);
      mapRegistry.map?.fitBounds([[r.bbox[0],r.bbox[1]],[r.bbox[2],r.bbox[3]]],{padding:{top:100,bottom:80,left:Math.min(430,window.innerWidth*.4),right:80},maxZoom:9,duration:700});
    }).catch(e=>{if(!canceled)setError(e.message);}).finally(()=>{if(!canceled)setBusy(false);});
    return ()=>{canceled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[name,open,reloadTick]);
  useEffect(()=>{
    if(!open||!ready||!definition)return;
    const current=++revision.current;setBusy(true);setError('');
    const map=mapRegistry.map!;
    const lines=definition.boundaries.map(b=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:edits[b.id]||b.handles}}));
    (map.getSource('marine-draft-line') as GeoJSONSource)?.setData({type:'FeatureCollection',features:lines} as never);
    const timer=setTimeout(()=>request({type:'preview',name:definition.name,edits}).then(r=>{
      if(current!==revision.current)return;
      (map.getSource('marine-draft') as GeoJSONSource)?.setData({type:'Feature',properties:{},geometry:r.geometry} as never);
      (map.getSource('marine-draft-parent') as GeoJSONSource)?.setData(r.parentGeometry?{type:'Feature',properties:{},geometry:r.parentGeometry}:empty as never);
      const normalized={...edits,...r.edits};
      if(JSON.stringify(normalized)!==JSON.stringify(edits))setEdits(normalized);
    }).catch(e=>{if(current===revision.current){setError(e.message);(map.getSource('marine-draft') as GeoJSONSource)?.setData(empty as never);}}).finally(()=>{if(current===revision.current)setBusy(false);}),80);
    return ()=>{clearTimeout(timer);};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[edits,definition,ready,open]);
  useEffect(()=>{
    markers.current.forEach(m=>m.remove());markers.current=[];
    if(!open||!ready||!definition)return;
    const boundary=definition.boundaries.find(b=>b.id===boundaryId);if(!boundary)return;
    const points=edits[boundaryId]||boundary.handles;
    const map=mapRegistry.map!;
    points.forEach((point,i)=>{
      const button=document.createElement('button');button.className=`marine-handle ${selected===i?'selected':''}`;button.textContent=String(i+1);
      button.title=i===0||i===points.length-1?'Drag entrance endpoint (coast stays locked)':'Drag offshore handle';button.setAttribute('aria-label',button.title+` ${i+1}`);
      button.onclick=e=>{e.stopPropagation();setSelected(i);};
      const marker=new maplibregl.Marker({element:button,draggable:!saving}).setLngLat(point).addTo(map);
      let inFlight=false,lastPreview=0,dragRevision=0;
      marker.on('dragstart',()=>{setSelected(i);dragRevision=++revision.current;});
      marker.on('drag',()=>{const p=marker.getLngLat();const next=points.map((v,j)=>i===j?[p.lng,p.lat] as Point:v);(map.getSource('marine-draft-line') as GeoJSONSource)?.setData({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:next}});
        if(!inFlight&&Date.now()-lastPreview>160){inFlight=true;lastPreview=Date.now();
          request({type:'preview',name:definition.name,edits:{...edits,[boundaryId]:next}}).then(r=>{
            if(revision.current!==dragRevision||!marineEditorState.active)return;
            (map.getSource('marine-draft') as GeoJSONSource)?.setData({type:'Feature',properties:{},geometry:r.geometry});
            (map.getSource('marine-draft-parent') as GeoJSONSource)?.setData(r.parentGeometry?{type:'Feature',properties:{},geometry:r.parentGeometry}:empty as never);
          }).catch(()=>{}).finally(()=>{inFlight=false;});
        }
      });
      marker.on('dragend',()=>{revision.current++;const p=marker.getLngLat();change({...edits,[boundaryId]:points.map((v,j)=>i===j?[p.lng,p.lat]:v)});});
      markers.current.push(marker);
    });
    return ()=>{markers.current.forEach(m=>m.remove());markers.current=[];};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open,ready,definition,boundaryId,edits,saving]);
  useEffect(()=>{markers.current.forEach((marker,i)=>marker.getElement().classList.toggle('selected',i===selected));},[selected]);
  const guard=()=>!isDirty||window.confirm('Leave without saving these changes to your atlas?');
  const save=async()=>{
    if(!definition||saving)return;
    setSaving(true);setError('');
    const currentDefinition=definition,currentEdits=edits;
    try{
      if(!useAtlasStore.getState().loaded){await useAtlasStore.getState().load();if(!useAtlasStore.getState().loaded)throw Error(useAtlasStore.getState().error||'Could not load your atlas. Please retry.');}
      // Revalidate and snap in the same geometry engine used by the normal map.
      const preview=await request({type:'preview',name:currentDefinition.name,edits:currentEdits});
      const stored=await useAtlasStore.getState().save({name:currentDefinition.name,fingerprint:currentDefinition.fingerprint,edits:preview.edits,revision:accountRevision.current});
      accountRevision.current=stored.revision;saved.current=JSON.stringify(stored.edits);setEdits(stored.edits);
      try{const next=readDrafts().filter(d=>d.name!==currentDefinition.name);localStorage.setItem(KEY,JSON.stringify(next));setDrafts(next);}catch{/* Account save succeeded even if local storage is unavailable. */}
      setNotice('Saved to your atlas. Close the editor to see this boundary on the map.');
    }catch(e){setError(e instanceof Error?e.message:'Could not save. Your current handles are still here.');}
    finally{setSaving(false);}
  };
  const exportDrafts=()=>{
    const staleCurrent=drafts.find(d=>d.name===name&&d.fingerprint!==definition?.fingerprint);
    const features=definition&&!error&&!busy&&(!staleCurrent||Object.keys(edits).length>0)?[...drafts.filter(d=>d.name!==name),{name,fingerprint:definition.fingerprint,edits}]:drafts;
    const blob=new Blob([JSON.stringify({version:1,features},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='marine-boundary-edits.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Exported. Share this file to incorporate your edits into the published atlas.');
  };
  const boundary=definition?.boundaries.find(b=>b.id===boundaryId),points=boundary?(edits[boundaryId]||boundary.handles):[];
  return <>
    {!open&&<button className="marine-editor-open" onClick={()=>setOpen(true)}>✎ Edit water boundaries</button>}
    {open&&<section className="marine-editor" aria-label="Marine boundary editor">
      <header><div><span className="marine-eyebrow">MY ATLAS · BOUNDARY EDITOR</span><h2>Edit water boundaries</h2></div><button disabled={saving} aria-label="Close boundary editor" onClick={()=>{if(!saving&&guard())setOpen(false);}}>×</button></header>
      <p>Adjust entrances and offshore limits. Dataset coastlines stay locked.</p>
      <label>Water body<select value={name} disabled={saving||!names.length} onChange={e=>{if(guard())setName(e.target.value);}}>{names.map(n=><option key={n}>{n}</option>)}</select></label>
      {definition&&<>
        <label>Offshore line<select disabled={saving} value={boundaryId} onChange={e=>{setBoundaryId(e.target.value);setSelected(null);}}>{definition.boundaries.map((b,i)=><option key={b.id} value={b.id}>Line {i+1} · {b.handles.length} handles</option>)}</select></label>
        <p className="marine-help">Drag the gold numbered circles at the ends of the dashed line—not the line itself. Endpoints on land snap to the coast when released. Select a handle to insert a midpoint after it.</p>
        <div className="marine-actions"><button disabled={!history.length||busy||saving} onClick={()=>{setFuture(f=>[edits,...f]);setEdits(history.at(-1)!);setHistory(h=>h.slice(0,-1));}}>Undo</button><button disabled={!future.length||busy||saving} onClick={()=>{setHistory(h=>[...h,edits]);setEdits(future[0]);setFuture(f=>f.slice(1));}}>Redo</button><button disabled={saving||busy||!Object.keys(edits).length} onClick={()=>change({})}>Reset shape</button></div>
        <div className="marine-actions"><button disabled={selected===null||selected>=points.length-1||points.length>=100||busy||saving} onClick={()=>{const i=selected!,a=points[i],b=points[i+1];change({...edits,[boundaryId]:[...points.slice(0,i+1),[(a[0]+b[0])/2,(a[1]+b[1])/2],...points.slice(i+1)]});}}>Add midpoint</button><button disabled={selected===null||selected===0||selected===points.length-1||busy||saving} onClick={()=>{change({...edits,[boundaryId]:points.filter((_,i)=>i!==selected)});setSelected(null);}}>Remove handle</button></div>
      </>}
      <div role="status" className={error?'marine-error':'marine-status'}>{error||atlas.error|| (!ready?'Preparing map controls…':busy?'Preparing coastline-fitted preview…':notice||'Gold: edited water · Gray: containing water outline')}</div>
      <footer><button className="marine-primary" disabled={!definition||busy||saving||!ready||!isDirty} onClick={()=>void save()}>{saving?'Saving…':'Save to my atlas'}</button><button disabled={saving||!ready||busy||(!drafts.length&&!definition)} onClick={exportDrafts}>Export drafts{drafts.length?` (${drafts.length})`:''}</button></footer>
      <button className="marine-delete" disabled={saving||busy} onClick={()=>{if(guard()){preferCloud.current=true;setReloadTick(n=>n+1);}}}>Reload saved boundaries</button>
      {drafts.some(d=>d.name===name)&&<button disabled={saving} className="marine-delete" onClick={()=>{if(!window.confirm('Delete this browser draft and return to your saved atlas boundary?'))return;try{const next=drafts.filter(d=>d.name!==name);localStorage.setItem(KEY,JSON.stringify(next));const cloud=useAtlasStore.getState().features.find(f=>f.name===name);const accountEdits=cloud&&cloud.fingerprint===definition?.fingerprint?cloud.edits:{};setDrafts(next);setEdits(accountEdits);setHistory([]);setFuture([]);saved.current=JSON.stringify(accountEdits);setNotice('Browser draft removed. Your saved atlas boundary is unchanged.');}catch{setError('Could not update browser storage.');}}}>Delete this saved draft</button>}
      <p className="marine-help">Save to your atlas to keep this boundary across devices. To restore the dataset boundary, choose Reset shape, then Save to my atlas. Export is optional.</p>
    </section>}
  </>;
}
