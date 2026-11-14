/* Shared validation and storage. The existing localStorage key is intentional. */
(function(root){
 'use strict';
 const KEY='lr-preview-0.5.0';
 const UPGRADE_COPY=KEY+'-before-0.4.1';
 const IMPORT_COPY=KEY+'-before-import';
 const CATS={health:'Здоровье',discipline:'Дисциплина',growth:'Развитие',finance:'Финансы'};
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
 const defaults=()=>({version:3,xp:0,checks:{},tasks:[{id:'walk',name:'Пройти 7 000 шагов',cat:'health'},{id:'move',name:'15 минут движения',cat:'health'},{id:'learn',name:'30 минут обучения',cat:'growth'},{id:'read',name:'10 минут чтения',cat:'growth'},{id:'spend',name:'Записать расходы',cat:'finance'}],goals:[],tx:[],focusIndex:0,backupAt:null});
 function progress(data){
  const counts={health:0,discipline:0,growth:0,finance:0,...data.legacyCounts};
  let completed=0;
  for(const day of Object.values(data.checks)){
   for(const task of data.tasks){if(day[task.id]===true){completed++;counts[task.cat]++}}
  }
  return {xp:(data.legacyXp||0)+20*completed,counts};
 }
 function normalize(raw){
  requireValue(record(raw)&&[2,3].includes(raw.version));
  requireValue(Array.isArray(raw.tasks)&&Array.isArray(raw.tx));
  const next={...defaults(),...clone(raw)};
  requireValue(Array.isArray(next.goals)&&next.goals.every(g=>typeof g==='string'));
  const ids=new Set();
  for(const task of next.tasks){
   requireValue(record(task)&&safeKey(task.id)&&!ids.has(task.id));ids.add(task.id);
   requireValue(typeof task.name==='string'&&task.name.trim().length>0&&own(CATS,task.cat));
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
   const claimedCounts={health:0,discipline:0,growth:0,finance:0};
   const tasks=new Map(next.tasks.map(t=>[t.id,t]));
   for(const day of Object.values(next.claimed||{}))for(const id of new Set(day)){const t=tasks.get(id);if(t)claimedCounts[t.cat]++}
   next.legacyCounts=Object.fromEntries(Object.keys(CATS).map(cat=>[cat,Math.max(0,claimedCounts[cat]-checked.counts[cat])]));
  }
  next.version=3;next.xp=progress(next).xp;
  requireValue(Number.isSafeInteger(next.xp));
  return next;
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
    if(change(next)===false)return {data:next,raw,changed:false};
    const data=normalize(next);
    // The token is part of the same localStorage write as the user data.
    if(token!==undefined)data._writeToken=crypto.randomUUID();
    const serialized=JSON.stringify(data);
    if(replacement!==undefined&&!discardCopies)this.saveCopy(storage,IMPORT_COPY,raw);
    if(raw!==null&&!discardCopies){
     let old;try{old=JSON.parse(raw)}catch(e){}
     if(old?.version===2)this.saveCopy(storage,UPGRADE_COPY,raw,true);
    }
    const result={data,raw:serialized,changed:true,cleanupFailed:false,writeToken:token===undefined?undefined:data._writeToken};
    result.commit=()=>{
     storage.setItem(KEY,serialized);
     if(storage.getItem(KEY)!==serialized)throw new DataError('conflict');
     if(discardCopies){for(const key of [UPGRADE_COPY,IMPORT_COPY])try{storage.removeItem(key)}catch(e){result.cleanupFailed=true}}
    };
    return result;
   });
  }
 }
 const api={KEY,UPGRADE_COPY,IMPORT_COPY,CATS,defaults,progress,normalize,parse,Store,DataError};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LifeResetData=api;
})(globalThis);
