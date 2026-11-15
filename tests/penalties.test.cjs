const {test}=require('node:test'),assert=require('node:assert/strict');
const {KEY,PENALTY_COPY,defaults,normalize,progress,newPenalty,settlePenalties,Store}=require('../data.js');
function fixture(date='2026-11-09',xp=100){const d=defaults();d.tasks=[{id:'a',name:'A',cat:'sport',days:[1,3,5]},{id:'b',name:'B',cat:'intellect',days:[2]}];d.legacyXp=xp;d.xp=xp;d.penalties=newPenalty(d,date);return d}
test('only finished scheduled days count; true checks prevent a penalty and repeats do not double charge',()=>{
 const d=fixture();d.checks={'2026-11-09':{a:true},'2026-11-10':{b:false}};settlePenalties(d,'2026-11-12');assert.equal(d.penalties.missed,2);assert.equal(d.penalties.deducted,20);assert.equal(progress(d).xp,100);const once=JSON.stringify(d);settlePenalties(d,'2026-11-12');assert.equal(JSON.stringify(d),once);settlePenalties(d,'2026-11-11');assert.equal(d.penalties.missed,2);
});
test('several offline weeks, leap dates and time zones use calendar weekdays',()=>{
 const d=fixture('2024-02-26');settlePenalties(d,'2024-03-11');assert.equal(d.penalties.missed,8);assert.equal(d.penalties.deducted,80);
});
test('XP stops at zero; uncharged misses do not consume later earnings',()=>{
 const d=fixture('2026-11-09',5);settlePenalties(d,'2026-11-12');assert.equal(d.penalties.deducted,5);assert.equal(progress(d).xp,0);d.checks={'2026-11-12':{a:true}};assert.equal(progress(d).xp,20);
});
test('previous schedule is settled before edits or removal; new plans affect only future days',()=>{
 const d=fixture();d.tasks[0].days=[4];settlePenalties(d,'2026-11-12');assert.equal(d.penalties.missed,3);settlePenalties(d,'2026-11-13');assert.equal(d.penalties.missed,4);d.tasks=[];settlePenalties(d,'2026-11-14');assert.equal(d.penalties.missed,4);
});
test('older formats start today without retrospective penalties; invalid journals are rejected',()=>{
 const d=fixture();d.version=4;delete d.penalties;d.checks={'2020-01-01':{a:true}};d.xp=120;const n=normalize(d);assert.equal(n.penalties.since,new Date().toLocaleDateString('sv-SE'));assert.equal(n.penalties.missed,0);assert.equal(n.xp,120);
 for(const mutation of [p=>p.deducted=-1,p=>p.missed='3',p=>p.through='bad',p=>p.plan[0].days=[7]]){const bad=fixture();mutation(bad.penalties);assert.throws(()=>normalize(bad))}
});
test('an activation copy is exact; failure leaves original intact and retry charges only once',async()=>{
 const d=fixture();d.version=4;delete d.penalties;const raw=JSON.stringify(d),values=new Map([[KEY,raw]]);let fail=true;const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(fail&&k===PENALTY_COPY)throw Error('quota');values.set(k,v)}};const lock=fn=>{const r=fn();r.commit?.();return Promise.resolve(r)};const store=new Store({storage,lock});await assert.rejects(async()=>store.update(()=>false));assert.equal(values.get(KEY),raw);fail=false;await store.update(()=>false);assert.equal(values.get(PENALTY_COPY),raw);const once=values.get(KEY);await store.update(()=>false);assert.equal(values.get(KEY),once);
});
test('deleting an earned habit at zero XP cannot leave debt for future completions',async()=>{
 const d=fixture(new Date().toLocaleDateString('sv-SE'),0);d.tasks=d.tasks.slice(0,1);d.checks={'2020-01-01':{a:true}};d.penalties=newPenalty(d,new Date().toLocaleDateString('sv-SE'));d.penalties.missed=2;d.penalties.deducted=20;d.xp=0;let raw=JSON.stringify(d);const storage={getItem:k=>k===KEY?raw:null,setItem(k,v){if(k===KEY)raw=v}};const lock=fn=>{const r=fn();r.commit?.();return Promise.resolve(r)},store=new Store({storage,lock});
 await store.update(n=>{n.tasks=[];n.checks={}});assert.equal(store.read().data.xp,0);await store.update(n=>{n.tasks=[{id:'new',name:'New',cat:'sport',days:[0,1,2,3,4,5,6]}];n.checks={'2020-01-02':{new:true}}});assert.equal(store.read().data.xp,20);
});
