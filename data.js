/* Shared validation and storage. The existing localStorage key is intentional. */
(function(root){
 'use strict';
 const KEY='life-reset-v2';
 const UPGRADE_COPY=KEY+'-before-0.4.1';
 const IMPORT_COPY=KEY+'-before-import';
 const FEATURE_COPY=KEY+'-before-0.8.0';
 const PENALTY_COPY=KEY+'-before-0.9.0';
 const CATS={sport:'Спорт',intellect:'Интеллект',nutrition:'Питание'};
 const CAT_MIGRATION={health:'sport',discipline:'intellect',growth:'intellect',finance:'intellect',sport:'sport',intellect:'intellect',nutrition:'nutrition'};
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const safeKey=k=>typeof k==='string'&&k.length>0&&!['__proto__','constructor','prototype'].includes(k);
 const clone=x=>JSON.parse(JSON.stringify(x));
 class DataError extends Error{constructor(code){super(code);this.code=code}}
 function requireValue(test){if(!test)throw new DataError('invalid')}
 function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T12:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
 }
 const defaults=()=>{const data={version:5,gender:'male',xp:0,checks:{},tasks:[{id:'walk',name:'Пройти 7 000 шагов',cat:'sport',days:[0,1,2,3,4,5,6]},{id:'move',name:'15 минут движения',cat:'sport',days:[0,1,2,3,4,5,6]},{id:'learn',name:'30 минут обучения',cat:'intellect',days:[0,1,2,3,4,5,6]},{id:'read',name:'10 минут чтения',cat:'intellect',days:[0,1,2,3,4,5,6]},{id:'spend',name:'Добавить овощи к приёму пищи',cat:'nutrition',days:[0,1,2,3,4,5,6]}],goals:[],tx:[],focusIndex:0,backupAt:null};data.penalties=newPenalty(data,localDay());return data};
 function progress(data){
  const counts={sport:0,intellect:0,nutrition:0,...data.legacyCounts};
  let completed=0;
  for(const day of Object.values(data.checks)){
   for(const task of data.tasks){if(day[task.id]===true){completed++;counts[task.cat]++}}
  }
  return {xp:Math.max(0,(data.legacyXp||0)+20*completed-(data.penalties?.deducted||0)),counts};
 }
 function normalize(raw){
  requireValue(record(raw)&&[2,3,4,5].includes(raw.version));
  requireValue(Array.isArray(raw.tasks)&&Array.isArray(raw.tx));
  const next={...defaults(),...clone(raw)};if(raw.version===5)requireValue(own(raw,'penalties'));else delete next.penalties;
  for(const task of next.tasks){requireValue(record(task));if(own(CAT_MIGRATION,task.cat)){if(!own(CATS,task.cat))task.previousCategory=task.cat;task.cat=CAT_MIGRATION[task.cat]}if(task.days===undefined)task.days=[0,1,2,3,4,5,6]}
  if(own(next,'legacyCounts')){requireValue(record(next.legacyCounts));for(const [cat,n] of Object.entries(next.legacyCounts))requireValue(own(CAT_MIGRATION,cat)&&Number.isSafeInteger(n)&&n>=0);const old=next.legacyCounts;next.legacyCounts={sport:(old.sport||0)+(old.health||0),intellect:(old.intellect||0)+(old.discipline||0)+(old.growth||0)+(old.finance||0),nutrition:old.nutrition||0}}
  requireValue(Array.isArray(next.goals));
  next.goals=next.goals.map((g,i)=>typeof g==='string'?{id:'legacy-goal-'+i,name:g,created:null,due:null,target:10,done:0}:g);
  const goalIds=new Set();
  for(const g of next.goals){requireValue(record(g)&&safeKey(g.id)&&!goalIds.has(g.id)&&typeof g.name==='string'&&g.name.trim().length>0);goalIds.add(g.id);requireValue((g.created===null||validDate(g.created))&&(g.due===null||validDate(g.due))&&(!g.due||!g.created||g.due>=g.created)&&Number.isSafeInteger(g.target)&&g.target>0&&Number.isSafeInteger(g.done)&&g.done>=0&&g.done<=g.target)}
  requireValue(['male','female'].includes(next.gender));
  const ids=new Set();
  for(const task of next.tasks){
   requireValue(record(task)&&safeKey(task.id)&&!ids.has(task.id));ids.add(task.id);
   requireValue(typeof task.name==='string'&&task.name.trim().length>0&&own(CATS,task.cat)&&Array.isArray(task.days)&&task.days.length>0&&task.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6)&&new Set(task.days).size===task.days.length);
  }
  requireValue(record(next.checks));
  for(const [date,day] of Object.entries(next.checks)){
   requireValue(validDate(date)&&record(day));
   for(const [id,done] of Object.entries(day))requireValue(safeKey(id)&&typeof done==='boolean');
  }
  let income=0,outgo=0;
  for(const tx of next.tx){
   requireValue(record(tx)&&safeKey(tx.id)&&['income','expense','debt'].includes(tx.kind));
   requireValue(typeof tx.amount==='number'&&Number.isFinite(tx.amount)&&tx.amount>0&&tx.amount<=Number.MAX_SAFE_INTEGER);
   requireValue(validDate(tx.date)&&(tx.note===undefined||typeof tx.note==='string'));
   if(tx.kind==='income')income+=tx.amount;else outgo+=tx.amount;
   requireValue(Number.isFinite(income)&&Number.isFinite(outgo)&&income<=Number.MAX_SAFE_INTEGER&&outgo<=Number.MAX_SAFE_INTEGER);
  }
  requireValue(Number.isSafeInteger(next.xp)&&next.xp>=0);
  requireValue(Number.isSafeInteger(next.focusIndex)&&next.focusIndex>=0);
  requireValue(next.backupAt===null||(typeof next.backupAt==='string'&&Number.isFinite(Date.parse(next.backupAt))));
  if(own(next,'focus'))requireValue(typeof next.focus==='string');
  if(own(next,'_writeToken'))requireValue(typeof next._writeToken==='string');
  if(own(next,'claimed')){
   requireValue(record(next.claimed));
   for(const [date,day] of Object.entries(next.claimed))requireValue(validDate(date)&&Array.isArray(day)&&day.every(safeKey));
  }
  if(own(next,'legacyXp'))requireValue(Number.isSafeInteger(next.legacyXp)&&next.legacyXp>=0);
  if(own(next,'legacyCounts')){
   requireValue(record(next.legacyCounts));
   for(const [cat,n] of Object.entries(next.legacyCounts))requireValue(own(CATS,cat)&&Number.isSafeInteger(n)&&n>=0);
  }
  // v0.2 awarded permanent XP even after unchecking. Keep that earned balance.
  if(next.version===2){
   delete next.legacyXp;delete next.legacyCounts;
   const checked=progress(next);
   next.legacyXp=Math.max(0,next.xp-checked.xp);
   const claimedCounts={sport:0,intellect:0,nutrition:0};
   const tasks=new Map(next.tasks.map(t=>[t.id,t]));
   for(const day of Object.values(next.claimed||{}))for(const id of new Set(day)){const t=tasks.get(id);if(t)claimedCounts[t.cat]++}
   next.legacyCounts=Object.fromEntries(Object.keys(CATS).map(cat=>[cat,Math.max(0,claimedCounts[cat]-checked.counts[cat])]));
  }
  if(next.penalties===undefined)next.penalties=newPenalty(next,localDay());
  const pen=next.penalties;
  requireValue(record(pen)&&validDate(pen.since)&&validDate(pen.through)&&pen.through>=pen.since&&Number.isSafeInteger(pen.missed)&&pen.missed>=0&&Number.isSafeInteger(pen.deducted)&&pen.deducted>=0&&pen.deducted<=pen.missed*10&&Array.isArray(pen.plan));
  const planIds=new Set();for(const t of pen.plan){requireValue(record(t)&&safeKey(t.id)&&!planIds.has(t.id)&&Array.isArray(t.days)&&t.days.length>0&&t.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6)&&new Set(t.days).size===t.days.length);planIds.add(t.id)}
  next.version=5;next.xp=progress(next).xp;
  requireValue(Number.isSafeInteger(next.xp));
  return next;
 }
 function localDay(){return new Date().toLocaleDateString('sv-SE')}
 function planOf(data){return data.tasks.map(t=>({id:t.id,days:[...(t.days||[0,1,2,3,4,5,6])]}))}
 function newPenalty(data,date){return {since:date,through:date,missed:0,deducted:0,plan:planOf(data)}}
 function settlePenalties(data,date=localDay()){
  requireValue(validDate(date));const p=data.penalties;let changed=false;
  if(date>p.through){
   const start=new Date(p.through+'T12:00:00Z'),end=new Date(date+'T12:00:00Z'),days=Math.round((end-start)/86400000);let missed=0;
   for(const task of p.plan){let expected=Math.floor(days/7)*task.days.length;for(let i=0;i<days%7;i++)if(task.days.includes((start.getUTCDay()+i)%7))expected++;
    const done=Object.entries(data.checks).filter(([d,checks])=>d>=p.through&&d<date&&checks[task.id]===true&&task.days.includes(new Date(d+'T12:00:00Z').getUTCDay())).length;missed+=Math.max(0,expected-done);
   }
   p.deducted+=Math.min(progress(data).xp,missed*10);p.missed+=missed;p.through=date;changed=true;
  }
  const plan=planOf(data);if(JSON.stringify(plan)!==JSON.stringify(p.plan)){p.plan=plan;changed=true}
  return changed;
 }
 function parse(raw){return raw===null?defaults():normalize(JSON.parse(raw))}
 // The IndexedDB fence detects a stale localStorage cache even after acquiring a lock.
 // Some browsers deliver storage changes after the next writer has acquired its lock.
 let lockDb;
 function fencedWrite(action){
  if(!globalThis.indexedDB)return Promise.reject(new DataError('unavailable'));
  if(!lockDb)lockDb=new Promise((resolve,reject)=>{
   const request=indexedDB.open(KEY+'-locks',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('writes');
   request.onerror=()=>{lockDb=null;reject(request.error)};
   request.onblocked=()=>{lockDb=null;reject(new DataError('unavailable'))};
   request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();lockDb=null};resolve(db)};
  });
  return lockDb.then(db=>new Promise((resolve,reject)=>{
   const tx=db.transaction('writes','readwrite');let result,error;
   tx.oncomplete=()=>resolve(result);
   tx.onabort=()=>reject(error||tx.error||new DataError('unavailable'));
   tx.onerror=()=>{};
   const queue=tx.objectStore('writes'),request=queue.get('queue');
   request.onsuccess=()=>{
    try{
     result=action(request.result??null);
     if(result.writeToken){
      // Reserve space for the fence before touching the primary data.
      const reserved=queue.put(result.writeToken,'queue');
      reserved.onsuccess=()=>{try{result.commit()}catch(e){error=e;tx.abort()}};
     }else if(result.commit)result.commit();
    }
    catch(e){error=e;tx.abort()}
   };
  }));
 }
 function withWriteLock(action){
  return globalThis.navigator?.locks?navigator.locks.request(KEY+'-write',()=>fencedWrite(action)):fencedWrite(action);
 }
 function tokenOf(raw){try{return JSON.parse(raw)?._writeToken??null}catch(e){return null}}
 class Store{
  constructor({storage=()=>localStorage,lock=withWriteLock}={}){this.storage=typeof storage==='function'?storage:()=>storage;this.lock=lock}
  read(){
   let raw=null;
   try{raw=this.storage().getItem(KEY);return {data:parse(raw),raw,error:null}}
   catch(error){return {data:defaults(),raw,error}}
  }
  saveCopy(storage,key,raw,once=false){
   if(raw===null||(once&&storage.getItem(key)!==null))return;
   storage.setItem(key,raw);
   if(storage.getItem(key)!==raw)throw new DataError('conflict');
  }
  capture({discard=false}={}){
   return this.lock(token=>{
    const raw=this.storage().getItem(KEY);
    if(!discard&&token!==undefined&&token!==null&&tokenOf(raw)!==token){
     let valid=true;try{parse(raw)}catch(e){valid=false}
     if(valid)throw new DataError('stale');
    }
    return {raw,token};
   });
  }
  update(change,{replacement,expectedRaw,expectedToken,discardCopies=false}={}){
   return this.lock(token=>{
    const storage=this.storage(),raw=storage.getItem(KEY);
    // Replacements and destructive actions must still refer to the displayed snapshot.
    if(expectedRaw!==undefined&&raw!==expectedRaw)throw new DataError('conflict');
    if(expectedToken!==undefined&&token!==expectedToken)throw new DataError('conflict');
    if(token!==undefined&&token!==null&&tokenOf(raw)!==token&&!(replacement!==undefined&&expectedToken===token))throw new DataError('stale');
    const next=replacement===undefined?parse(raw):normalize(replacement);
    const settled=settlePenalties(next),migrating=raw===null||(()=>{try{return JSON.parse(raw).version<5}catch(e){return false}})();
    if(change(next)===false&&!settled&&!migrating)return {data:next,raw,changed:false};
    next.penalties.plan=planOf(next);
    const data=normalize(next);
    // Removing earned XP must not leave an invisible debt after the zero floor.
    data.penalties.deducted=Math.min(data.penalties.deducted,progress({...data,penalties:undefined}).xp);
    data.xp=progress(data).xp;
    // The token is part of the same localStorage write as the user data.
    if(token!==undefined)data._writeToken=crypto.randomUUID();
    const serialized=JSON.stringify(data);
    if(replacement!==undefined&&!discardCopies)this.saveCopy(storage,IMPORT_COPY,raw);
    if(raw!==null&&!discardCopies){
     let old;try{old=JSON.parse(raw)}catch(e){}
     if(old?.version===2)this.saveCopy(storage,UPGRADE_COPY,raw,true);
     if([2,3,4].includes(old?.version))this.saveCopy(storage,PENALTY_COPY,raw,true);
     if([2,3].includes(old?.version))this.saveCopy(storage,FEATURE_COPY,raw,true);
    }
    const result={data,raw:serialized,changed:true,cleanupFailed:false,writeToken:token===undefined?undefined:data._writeToken};
    result.commit=()=>{
     storage.setItem(KEY,serialized);
     if(storage.getItem(KEY)!==serialized)throw new DataError('conflict');
     if(discardCopies){for(const key of [UPGRADE_COPY,IMPORT_COPY,FEATURE_COPY,PENALTY_COPY])try{storage.removeItem(key)}catch(e){result.cleanupFailed=true}}
    };
    return result;
   });
  }
 }
 const api={KEY,UPGRADE_COPY,IMPORT_COPY,FEATURE_COPY,PENALTY_COPY,settlePenalties,newPenalty,CATS,CAT_MIGRATION,defaults,progress,normalize,parse,Store,DataError};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LifeResetData=api;
})(globalThis);
