const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {period,shift,summarize,parse,key}=require('../history.js');
test('week runs Monday to Sunday, including across a year boundary',()=>{
 const november=period('week','2026-11-14');assert.equal(november.start,'2026-11-09');assert.equal(november.end,'2026-11-15');assert.equal(november.days.length,7);assert.equal(november.cells.length,7);
 const january=period('week','2027-01-01');assert.equal(january.start,'2026-12-28');assert.equal(january.end,'2027-01-03');
});
test('month respects real day counts and weekday padding',()=>{
 for(const [anchor,count] of [['2024-02-14',29],['2023-02-14',28],['2000-02-01',29],['2100-02-01',28],['2026-04-30',30],['2026-01-31',31]]){
  const p=period('month',anchor);assert.equal(p.days.length,count);assert.equal(p.cells.length%7,0);assert.deepEqual(p.cells.filter(Boolean),p.days);
 }
 const march=period('month','2025-03-15');assert.deepEqual(march.cells.slice(0,5),[null,null,null,null,null]);assert.equal(march.cells[5],'2025-03-01');
});
test('year includes every day once and supports 54-column leap years',()=>{
 for(const [year,count] of [[2026,365],[2024,366],[2012,366]]){
  const p=period('year',year+'-11-14');assert.equal(p.days.length,count);assert.equal(new Set(p.days).size,count);assert.equal(p.months.length,12);assert.deepEqual(p.cells.filter(Boolean),p.days);assert.equal(p.cells.length,p.columns*7);
 }
 assert.equal(period('year','2012-01-01').columns,54);
});
test('navigation avoids month-end overflow and handles January and December',()=>{
 assert.equal(shift('month','2026-03-31',-1),'2026-02-01');assert.equal(shift('month','2026-01-31',-1),'2025-12-01');assert.equal(shift('month','2026-12-31',1),'2027-01-01');assert.equal(shift('week','2026-11-14',-1),'2026-11-02');assert.equal(shift('year','2024-02-29',-1),'2023-01-01');
});
test('counts use only true checks for the selected habit and period, excluding future days',()=>{
 const checks={'2026-11-01':{walk:true},'2026-11-09':{walk:true},'2026-11-10':{walk:false,read:true},'2026-11-11':{walk:'true'},'2026-11-14':{walk:true},'2026-11-15':{walk:true}},before=JSON.stringify(checks);
 const p=period('week','2026-11-14'),walk=summarize(checks,'walk',p,'2026-11-14');assert.equal(walk.completed,2);assert.equal(walk.cells.find(c=>c.date==='2026-11-15').status,'future');assert.equal(walk.cells.find(c=>c.date==='2026-11-10').status,'missed');assert.equal(summarize(checks,'read',p,'2026-11-14').completed,1);assert.equal(JSON.stringify(checks),before);
});
test('old checks appear without migrations; missing days remain unmarked',()=>{
 const checks={'2025-01-01':{oldHabit:true},'2025-12-31':{oldHabit:true}},p=period('year','2025-07-01');
 assert.equal(summarize(checks,'oldHabit',p,'2026-11-14').completed,2);assert.equal(summarize(checks,'newHabit',p,'2026-11-14').completed,0);assert.equal(summarize({},'walk',period('month','2026-11-14'),'2026-11-14').cells.filter(c=>c?.status==='future').length,16);
});
test('calendar arithmetic is independent of time zone and daylight saving',()=>{
 const modulePath=require.resolve('../history.js');
 const code=`const {period}=require(${JSON.stringify(modulePath)}); console.log(JSON.stringify(period('week','2026-03-08').days));`;
 for(const timezone of ['Asia/Qyzylorda','Pacific/Kiritimati','America/Los_Angeles']){
  const days=JSON.parse(execFileSync(process.execPath,['-e',code],{encoding:'utf8',env:{...process.env,TZ:timezone}}));assert.equal(days[0],'2026-03-02');assert.equal(days[6],'2026-03-08');
 }
});
test('invalid dates and periods are rejected; supported year boundaries do not overflow',()=>{
 for(const value of ['2026-02-30','2025-02-29','2026-13-01','2026-1-01','bad',null])assert.throws(()=>parse(value),RangeError);
 assert.throws(()=>period('quarter','2026-11-14'),RangeError);assert.equal(key(parse('0000-01-01')),'0000-01-01');assert.equal(shift('year','0000-01-01',-1),null);assert.equal(shift('year','9999-12-31',1),null);
});
