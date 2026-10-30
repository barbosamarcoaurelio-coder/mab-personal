import {all,clear,put,STORES} from './db.js';
import {validateBackup} from './validators.js';
export async function exportBackup(){const data={};for(const s of STORES)data[s]=await all(s);const recordCounts={};for(const [k,v] of Object.entries(data))recordCounts[k]=v.length;return {metadata:{app:'Controle de Treinos MAB Personal',formatVersion:1,databaseVersion:1,exportedAt:new Date().toISOString(),recordCounts},data}}
export function downloadBackup(obj,prefix='mab-personal-backup'){const stamp=new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${prefix}-${stamp}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
export async function importBackup(obj,mode='replace'){
  validateBackup(obj); const snapshot=await exportBackup();
  try{
    if(mode==='replace')for(const s of STORES)await clear(s);
    let created=0,updated=0;
    for(const s of STORES){for(const item of (obj.data[s]||[])){const existing=(await all(s)).some(x=>(x.id??x.key)===(item.id??item.key));await put(s,item);existing?updated++:created++;}}
    return {created,updated};
  }catch(e){for(const s of STORES){await clear(s);for(const item of snapshot.data[s])await put(s,item)}throw e}
}
