let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, {resolve:(value:any)=>void;reject:(error:Error)=>void}>();
export function requestMarine(data:object):Promise<any> {
  if(!worker){
    worker=new Worker(new URL('./marineEditor.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      const task=pending.get(data.id);if(!task)return;pending.delete(data.id);
      data.error?task.reject(Error(data.error)):task.resolve(data);
    };
    worker.onerror=()=>{
      for(const task of pending.values())task.reject(Error('Boundary processing stopped. Refresh the page to retry.'));
      pending.clear();worker?.terminate();worker=null;
    };
  }
  return new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});worker!.postMessage({...data,id});});
}
