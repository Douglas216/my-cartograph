import manifest from '../public/geo/marine-editor.json';
import {boundaryAPI} from './boundaries.mjs';
export default {
 async fetch(request,env){
  try{
   const url=new URL(request.url);
   if(url.pathname==='/api/marine-boundaries')return await boundaryAPI(request,env,manifest);
   if(url.pathname.startsWith('/api/'))return Response.json({error:'Not found.'},{status:404});
   return env.ASSETS.fetch(request);
  }catch(error){
   console.error('Atlas request failed',error instanceof Error?error.message:'unknown error');
   return Response.json({error:'Could not access atlas storage. Your draft is still available; please retry.'},{status:503,headers:{'cache-control':'no-store'}});
  }
 }
};
