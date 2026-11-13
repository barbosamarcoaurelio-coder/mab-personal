import {all,get,put,remove,uuid,STORES} from './db.js';
export const repo={all,get,put,remove,uuid,stores:STORES};
if(typeof window!=='undefined')window.repo=repo;
export async function seed(){
  if((await all('exercises')).length)return;
  const now=new Date().toISOString();
  const names=[['Supino Reto','Peitoral','Barra'],['Desenvolvimento Arnold','Ombros','Halteres'],['Peck Deck','Peitoral','Máquina'],['Elevação Lateral','Ombros','Halteres'],['Tríceps Corda','Tríceps','Polia'],['Agachamento Smith','Pernas','Smith'],['Cadeira Extensora','Quadríceps','Máquina'],['Stiff com Barra','Posterior','Barra']];
  const exercises=names.map(x=>({id:uuid(),name:x[0],nameNormalized:x[0].toLowerCase(),muscleGroup:x[1],equipment:x[2],active:true,createdAt:now,updatedAt:now}));
  for(const e of exercises)await put('exercises',e);
  const cycle={id:uuid(),name:'Ciclo inicial',startDate:new Date().toISOString().slice(0,10),endDate:'',goal:'Hipertrofia',status:'active',createdAt:now,updatedAt:now}; await put('cycles',cycle);
  for(const code of ['A','B','C','D'])await put('workoutGroups',{id:uuid(),cycleId:cycle.id,code,description:code==='A'||code==='C'?'Superiores':'Inferiores'});
  const groups={A:exercises.slice(0,5),B:exercises.slice(5,7),C:exercises.slice(0,3),D:exercises.slice(6,8)};
  for(const [code,list] of Object.entries(groups))for(const [i,e] of list.entries())await put('planItems',{id:uuid(),cycleId:cycle.id,groupCode:code,exerciseId:e.id,order:i+1,sets:3,minReps:8,maxReps:12,rirTarget:2,restSeconds:i===0?120:90,active:true});
}
