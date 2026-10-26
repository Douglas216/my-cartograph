const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store','vary':'oai-authenticated-user-id'}});
export function validateSave(body,manifest){
 if(!body||typeof body.name!=='string'||!Number.isSafeInteger(body.revision)||body.revision<0||!body.edits||typeof body.edits!=='object'||Array.isArray(body.edits))throw Error('Invalid boundary save.');
 const definition=manifest.features.find(f=>f.name===body.name);
 if(!definition||definition.fingerprint!==body.fingerprint)throw Error('The atlas data changed. Reopen this water body before saving.');
 const edits={};
 if(Object.keys(body.edits).length>definition.boundaries.length)throw Error('Too many offshore lines.');
 for(const [id,points] of Object.entries(body.edits)){
  const boundary=definition.boundaries.find(b=>b.id===id);
  if(!boundary||!Array.isArray(points)||points.length<2||points.length>100)throw Error('Invalid offshore line.');
  const span=Math.max(2,...boundary.handles.map(p=>Math.hypot(p[0]-boundary.handles[0][0],p[1]-boundary.handles[0][1])));
  if(points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))||Math.abs(p[0])>180||Math.abs(p[1])>85||!boundary.handles.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<=span)))throw Error('Keep handles near the original offshore line.');
  edits[id]=points.map(p=>p.map(v=>Math.round(v*1e6)/1e6));
 }
 return {name:body.name,fingerprint:body.fingerprint,revision:body.revision,edits};
}
const row=r=>({name:r.name,fingerprint:r.fingerprint,edits:JSON.parse(r.edits_json),revision:r.revision,updatedAt:r.updated_at});
export async function boundaryAPI(request,env,manifest){
 const user=request.headers.get('oai-authenticated-user-id');
 if(!user)return json({error:'Sign in to save and load your atlas.'},401);
 if(!env.DB)return json({error:'Atlas storage is unavailable. Your draft has not been saved.'},503);
 if(request.method==='GET'){
  const result=await env.DB.prepare('SELECT name, fingerprint, edits_json, revision, updated_at FROM marine_boundaries WHERE user_id = ? ORDER BY name').bind(user).all();
  return json({features:result.results.map(row)});
 }
 if(request.method!=='PUT')return json({error:'Method not allowed.'},405);
 const origin=request.headers.get('origin');
 if(!origin||origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Save from the atlas page.'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Expected JSON.'},415);
 if(Number(request.headers.get('content-length')||0)>100000)return json({error:'Boundary save is too large.'},413);
 const text=await request.text();if(text.length>100000)return json({error:'Boundary save is too large.'},413);
 let item;
 try{item=validateSave(JSON.parse(text),manifest);}catch(error){return json({error:error.message},400);}
 const updatedAt=new Date().toISOString();
 const result=item.revision===0
  ?await env.DB.prepare('INSERT INTO marine_boundaries (user_id,name,fingerprint,edits_json,revision,updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(user_id,name) DO NOTHING').bind(user,item.name,item.fingerprint,JSON.stringify(item.edits),updatedAt).run()
  :await env.DB.prepare('UPDATE marine_boundaries SET fingerprint=?, edits_json=?, revision=revision+1, updated_at=? WHERE user_id=? AND name=? AND revision=?').bind(item.fingerprint,JSON.stringify(item.edits),updatedAt,user,item.name,item.revision).run();
 if(result.meta.changes!==1)return json({error:'This boundary was saved in another tab or device. Reload saved boundaries before trying again.'},409);
 return json({feature:{...item,revision:item.revision+1,updatedAt}});
}
