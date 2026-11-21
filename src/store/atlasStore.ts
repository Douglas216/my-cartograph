import {create} from 'zustand';
export type AtlasBoundary={name:string;fingerprint:string;edits:Record<string,[number,number][]>;revision:number;updatedAt:string};
interface AtlasState {features:AtlasBoundary[];loaded:boolean;loading:boolean;error:string;load:()=>Promise<void>;save:(draft:Omit<AtlasBoundary,'updatedAt'>)=>Promise<AtlasBoundary>}
async function responseJSON(response:Response){
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Atlas storage is not available yet. Your browser draft is safe.');
  const data=await response.json();if(!response.ok)throw Error(data.error||'Could not save atlas boundaries.');return data;
}
const PASSCODE_KEY='atlas-edit-passcode';
function readPasscode(){try{return localStorage.getItem(PASSCODE_KEY)??'';}catch{return '';}}
function writePasscode(value:string){try{if(value)localStorage.setItem(PASSCODE_KEY,value);else localStorage.removeItem(PASSCODE_KEY);}catch{/* private mode: ask again next time */}}
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
  const put=(passcode:string)=>fetch('/api/marine-boundaries',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json',...(passcode?{'x-edit-passcode':passcode}:{})},body:JSON.stringify(draft)});
  let response=await put(readPasscode());
  if(response.status===401&&(await response.clone().json().catch(()=>({}))).passcode){
   // Public host: only the owner may save. Ask once and remember it in this browser.
   const entered=window.prompt('Enter your editing passcode to save this boundary.')?.trim()??'';
   if(!entered)throw Error('Saving needs your editing passcode. Your browser draft is safe.');
   response=await put(entered);
   if(response.ok)writePasscode(entered);else if(response.status===401){writePasscode('');throw Error('That passcode is not right. Your browser draft is safe.');}
  }
  const data=await responseJSON(response);
  const feature=data.feature as AtlasBoundary;
  set(s=>({features:[...s.features.filter(f=>f.name!==feature.name),feature],error:''}));return feature;
 },
}));
