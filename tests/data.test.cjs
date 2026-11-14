const {test}=require('node:test');
const assert=require('node:assert/strict');
const {KEY,UPGRADE_COPY,IMPORT_COPY,defaults,normalize,Store}=require('../data.js');
const copy=x=>JSON.parse(JSON.stringify(x));
function memory(raw){
 const values=new Map(raw===undefined?[]:[[KEY,raw]]);
 return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
function setup(raw){
 const storage=memory(raw);let queue=Promise.resolve();
 const lock=fn=>{const next=queue.then(()=>{const result=fn();result.commit?.();return result});queue=next.catch(()=>{});return next};
 return {storage,store:new Store({storage,lock})};
}
function legacy(){
 return {...defaults(),version:2,xp:120,focus:'Мой личный фокус',checks:{'2026-11-14':{walk:true}},claimed:{'2026-11-13':['walk'],'2026-11-14':['walk']},goals:['Старая цель'],tx:[{id:'tx1',kind:'income',amount:123.45,date:'2026-11-14',note:'Зарплата'}]};
}
test('v2 retains earned XP, categories, focus, goals, money and unknown metadata',()=>{
 const raw={...legacy(),custom:{keep:true}};const next=normalize(raw);
 assert.equal(next.version,3);assert.equal(next.xp,120);assert.equal(next.legacyXp,100);
 assert.equal(next.legacyCounts.health,1);assert.equal(next.focus,raw.focus);
 for(const key of ['checks','claimed','goals','tx','custom'])assert.deepEqual(next[key],raw[key]);
 assert.deepEqual(normalize(next),next);assert.equal(raw.version,2);
 next.checks['2026-11-15']={walk:true};assert.equal(normalize(next).xp,140);
});
test('current v3 XP is derived from checked tasks without changing history',()=>{
 const raw=defaults();raw.checks={'2026-11-13':{walk:true,move:false},'2026-11-14':{walk:true}};
 assert.equal(normalize(raw).xp,40);assert.equal(normalize({...raw,xp:900}).xp,40);
});
test('invalid backup contents are rejected completely',()=>{
 const mutations=[
  x=>x.version=4,x=>x.tasks=[null],x=>x.tasks.push(copy(x.tasks[0])),
  x=>x.tasks[0].id='__proto__',x=>x.tasks[0].cat='toString',x=>x.tasks[0].name='',
  x=>x.goals=[null],x=>x.checks=[],x=>x.checks={'2026-02-30':{walk:true}},
  x=>x.checks={'2026-11-14':{walk:'yes'}},x=>x.tx=[null],
  x=>x.tx=[{id:'tx1',kind:'income',amount:'100',date:'2026-11-14'}],
  x=>x.tx=[{id:'tx1',kind:'other',amount:100,date:'2026-11-14'}],
  x=>x.tx=[{id:'tx1',kind:'expense',amount:-10,date:'2026-11-14'}],
  x=>x.tx=[{id:'tx1',kind:'income',amount:100,date:'yesterday'}],
  x=>x.focusIndex=-1,x=>x.backupAt='invalid',x=>x.focus={bad:true},
  x=>x.legacyXp=-1,x=>x.legacyCounts={health:-1},x=>x.claimed={'2026-11-14':null},
 ];
 for(const mutation of mutations){const x=defaults();mutation(x);assert.throws(()=>normalize(x),undefined,mutation.toString())}
});
test('unsafe financial totals are rejected; decimal values are preserved',()=>{
 const x=defaults();x.tx=[{id:'a',kind:'income',amount:100.25,date:'2026-11-14'},{id:'b',kind:'income',amount:50.5,date:'2026-11-14'}];
 assert.deepEqual(normalize(x).tx,x.tx);for(const tx of x.tx)tx.amount=Number.MAX_SAFE_INTEGER;
 assert.throws(()=>normalize(x));
});
test('unknown task history and long names in valid older backups are preserved',()=>{
 const x=defaults();x.tasks[0].name='а'.repeat(1000);x.checks={'2026-11-14':{unknown:true}};
 assert.deepEqual(normalize(x).checks,x.checks);assert.equal(normalize(x).tasks[0].name.length,1000);
});
test('missing storage uses defaults without writing',()=>{
 const {store,storage}=setup();assert.equal(store.read().error,null);assert.equal(storage.values.size,0);
});
test('damaged and future-version storage remain unchanged after read and edit attempt',async()=>{
 for(const raw of ['{broken',JSON.stringify({...defaults(),version:99})]){
  const {store,storage}=setup(raw);assert.ok(store.read().error);
  await assert.rejects(store.update(s=>{s.focusIndex++}));assert.equal(storage.getItem(KEY),raw);
 }
});
test('migration creates an exact source copy before the first write',async()=>{
 const raw=JSON.stringify(legacy()),{store,storage}=setup(raw);
 assert.equal(store.read().data.xp,120);assert.equal(storage.values.size,1);
 const result=await store.update(s=>{s.goals.push('Новая цель')});
 assert.equal(storage.getItem(UPGRADE_COPY),raw);assert.equal(result.data.xp,120);
 await store.update(s=>{s.focusIndex++});assert.equal(storage.getItem(UPGRADE_COPY),raw);
});
test('migration copy failure aborts the main write',async()=>{
 const raw=JSON.stringify(legacy()),{store,storage}=setup(raw),setItem=storage.setItem;
 storage.setItem=(key,value)=>{if(key===UPGRADE_COPY)throw new Error('quota');return setItem(key,value)};
 await assert.rejects(store.update(s=>{s.goals.push('Новая цель')}));assert.equal(storage.getItem(KEY),raw);
});
test('failed primary write leaves stored and displayed snapshots intact',async()=>{
 const raw=JSON.stringify(defaults()),{store,storage}=setup(raw),before=store.read();
 storage.setItem=()=>{throw new Error('quota')};
 await assert.rejects(store.update(s=>{s.goals.push('Новая цель')}));
 assert.equal(storage.getItem(KEY),raw);assert.deepEqual(before.data.goals,[]);assert.deepEqual(store.read().data.goals,[]);
});
test('import stores an exact pre-import copy, including damaged original bytes',async()=>{
 for(const raw of [JSON.stringify(legacy()),'{broken']){
  const {store,storage}=setup(raw);const replacement=defaults();replacement.goals=['Восстановленная цель'];
  await store.update(()=>{}, {replacement,expectedRaw:raw});
  assert.equal(storage.getItem(IMPORT_COPY),raw);assert.deepEqual(store.read().data.goals,replacement.goals);
 }
});
test('invalid replacement and backup failure leave main data intact',async()=>{
 const raw=JSON.stringify(defaults()),{store,storage}=setup(raw),replacement=defaults();replacement.tx=[null];
 await assert.rejects(store.update(()=>{}, {replacement,expectedRaw:raw}));assert.equal(storage.getItem(KEY),raw);
 const setItem=storage.setItem;storage.setItem=(key,value)=>{if(key===IMPORT_COPY)throw new Error('quota');return setItem(key,value)};
 await assert.rejects(store.update(()=>{}, {replacement:defaults(),expectedRaw:raw}));assert.equal(storage.getItem(KEY),raw);
});
test('concurrent actions reread the latest data while holding a shared lock',async()=>{
 const {store,storage}=setup();const second=new Store({storage,lock:store.lock});
 await Promise.all([store.update(s=>{s.goals.push('Цель')}),second.update(s=>{s.tx.push({id:'tx',kind:'income',amount:100,date:'2026-11-14'})})]);
 assert.deepEqual(store.read().data.goals,['Цель']);assert.equal(store.read().data.tx.length,1);
});
test('stale import and destructive actions fail without overwriting newer data',async()=>{
 const {store,storage}=setup();await store.update(s=>{s.goals.push('Новая цель')});const saved=storage.getItem(KEY);
 await assert.rejects(store.update(()=>{}, {replacement:defaults(),expectedRaw:null}),e=>e.code==='conflict');
 await assert.rejects(store.update(s=>{s.goals=[]},{expectedRaw:null}),e=>e.code==='conflict');
 assert.equal(storage.getItem(KEY),saved);
});
test('explicit reset works when there is no room for another backup and clears copies',async()=>{
 const raw=JSON.stringify(legacy()),{store,storage}=setup(raw),setItem=storage.setItem;
 storage.values.set(IMPORT_COPY,'old');storage.values.set(UPGRADE_COPY,'old');
 storage.setItem=(key,value)=>{if(key!==KEY)throw new Error('quota');return setItem(key,value)};
 await store.update(()=>{}, {replacement:defaults(),expectedRaw:raw,discardCopies:true});
 assert.equal(storage.getItem(IMPORT_COPY),null);assert.equal(storage.getItem(UPGRADE_COPY),null);assert.deepEqual(store.read().data,defaults());
});
test('a revision fence blocks a stale browser storage cache before running the mutation',async()=>{
 const original=JSON.stringify(defaults()),storage=memory(original);let token=null,queue=Promise.resolve();
 const lock=fn=>{const next=queue.then(()=>{const result=fn(token);result.commit?.();if(result.writeToken)token=result.writeToken;return result});queue=next.catch(()=>{});return next};
 const first=new Store({storage,lock});await first.update(s=>{s.goals.push('Сохранённая цель')});
 const written=storage.getItem(KEY);let mutations=0;
 const staleStorage={...storage,getItem:key=>key===KEY?original:storage.getItem(key)};
 const second=new Store({storage:staleStorage,lock});
 await assert.rejects(second.update(s=>{mutations++;s.goals=[]}),e=>e.code==='stale');
 await assert.rejects(second.capture(),e=>e.code==='stale');
 assert.equal(mutations,0);assert.equal(storage.getItem(KEY),written);
});
test('recovery from corruption uses the captured fence; later writes cancel that recovery',async()=>{
 const storage=memory();let token=null,queue=Promise.resolve();
 const lock=fn=>{const next=queue.then(()=>{const result=fn(token);result.commit?.();if(result.writeToken)token=result.writeToken;return result});queue=next.catch(()=>{});return next};
 const store=new Store({storage,lock});await store.update(s=>{s.goals.push('Цель')});
 storage.setItem(KEY,'{broken');const captured=await store.capture();
 await store.update(()=>{}, {replacement:defaults(),expectedRaw:captured.raw,expectedToken:captured.token});
 assert.equal(storage.getItem(IMPORT_COPY),'{broken');
 const stale=await store.capture();await store.update(s=>{s.goals.push('Не терять')});
 await assert.rejects(store.update(()=>{}, {replacement:defaults(),expectedRaw:stale.raw,expectedToken:stale.token}),e=>e.code==='conflict');
 assert.deepEqual(store.read().data.goals,['Не терять']);
});
