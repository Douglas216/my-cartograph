import {create} from 'zustand';
export type AtlasBoundary={name:string;fingerprint:string;edits:Record<string,[number,number][]>;revision:number;updatedAt:string};
interface AtlasState {features:AtlasBoundary[];loaded:boolean;loading:boolean;error:string;load:()=>Promise<void>;save:(draft:Omit<AtlasBoundary,'updatedAt'>)=>Promise<AtlasBoundary>}
async function responseJSON(response:Response){
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Atlas storage is not available yet. Your browser draft is safe.');
  const data=await response.json();if(!response.ok)throw Error(data.error||'Could not save atlas boundaries.');return data;
}
let loadFlight:Promise<void>|null=null;
export const useAtlasStore=create<AtlasState>((set)=>({
 features:[],loaded:false,loading:false,error:'',
 load:()=>{
  if(loadFlight)return loadFlight;
  set({loading:true,error:''});
  loadFlight=(async()=>{
   try{const data=await responseJSON(await fetch('/api/marine-boundaries',{cache:'no-store',credentials:'same-origin'}));set({features:data.features,loaded:true});}
   catch(error){set({error:error instanceof Error?error.message:'Could not load saved boundaries.'});}
   finally{set({loading:false});loadFlight=null;}
  })();
  return loadFlight;
 },
 save:async draft=>{
  const data=await responseJSON(await fetch('/api/marine-boundaries',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(draft)}));
  const feature=data.feature as AtlasBoundary;
  set(s=>({features:[...s.features.filter(f=>f.name!==feature.name),feature],error:''}));return feature;
 },
}));
