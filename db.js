export const DB_NAME='mab_personal_db';
export const DB_VERSION=1;
export const STORES=['settings','exercises','cycles','workoutGroups','planItems','workoutSessions','executedSets','bodyAssessments','activityDiary','restTimers'];
let dbPromise;
export function uuid(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
export function openDatabase(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      const make=(name,key='id')=>db.objectStoreNames.contains(name)?req.transaction.objectStore(name):db.createObjectStore(name,{keyPath:key});
      let s=make('settings','key');
      s=make('exercises'); if(!s.indexNames.contains('nameNormalized'))s.createIndex('nameNormalized','nameNormalized'); if(!s.indexNames.contains('active'))s.createIndex('active','active');
      s=make('cycles'); if(!s.indexNames.contains('status'))s.createIndex('status','status');
      make('workoutGroups');
      s=make('planItems'); if(!s.indexNames.contains('cycleId'))s.createIndex('cycleId','cycleId'); if(!s.indexNames.contains('groupCode'))s.createIndex('groupCode','groupCode');
      s=make('workoutSessions'); if(!s.indexNames.contains('status'))s.createIndex('status','status'); if(!s.indexNames.contains('startedAt'))s.createIndex('startedAt','startedAt');
      s=make('executedSets'); if(!s.indexNames.contains('sessionId'))s.createIndex('sessionId','sessionId'); if(!s.indexNames.contains('exerciseId'))s.createIndex('exerciseId','exerciseId');
      s=make('bodyAssessments'); if(!s.indexNames.contains('date'))s.createIndex('date','date');
      s=make('activityDiary'); if(!s.indexNames.contains('date'))s.createIndex('date','date');
      s=make('restTimers'); if(!s.indexNames.contains('sessionId'))s.createIndex('sessionId','sessionId'); if(!s.indexNames.contains('status'))s.createIndex('status','status');
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); req.onblocked=()=>reject(new Error('Feche outras abas do aplicativo e tente novamente.'));
  });
  return dbPromise;
}
export async function tx(storeNames,mode,work){const db=await openDatabase();return new Promise((resolve,reject)=>{const t=db.transaction(storeNames,mode);let result;try{result=work(t)}catch(e){t.abort();reject(e);return}t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Transação cancelada'));});}
export async function put(store,value){const db=await openDatabase();return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).put(value);r.onsuccess=()=>res(value);r.onerror=()=>rej(r.error)});}
export async function get(store,key){const db=await openDatabase();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});}
export async function all(store){const db=await openDatabase();return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});}
export async function remove(store,key){const db=await openDatabase();return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)});}
export async function clear(store){const db=await openDatabase();return new Promise((res,rej)=>{const r=db.transaction(store,'readwrite').objectStore(store).clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)});}
