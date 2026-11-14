const {test}=require('node:test');
const assert=require('node:assert/strict');
const {STAGES,appearance,avatarMarkup}=require('../progression.js');
test('avatar stages open at levels 1, 3, 5, 10 and 20',()=>{
 for(const [xp,level,index,next] of [[0,1,0,3],[499,1,0,3],[500,2,0,3],[999,2,0,3],[1000,3,1,5],[1999,4,1,5],[2000,5,2,10],[4499,9,2,10],[4500,10,3,20],[9499,19,3,20],[9500,20,4,null],[50000,101,4,null]]){
  const visual=appearance(xp);assert.equal(visual.level,level);assert.equal(visual.index,index);assert.equal(visual.next?.level??null,next);
 }
});
test('appearance is derived without changing XP or stored data and rejects invalid XP',()=>{
 const data={xp:1000,goals:['Сохранить']},before=JSON.stringify(data);
 assert.equal(appearance(data.xp).stage.name,'Ритм');assert.equal(JSON.stringify(data),before);
 for(const xp of [-1,NaN,Infinity,1.5,'1000',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>appearance(xp),RangeError);
});
test('each avatar has a distinct self-contained SVG for offline rendering',()=>{
 const svg=STAGES.map((stage,index)=>avatarMarkup(index));assert.equal(new Set(svg).size,5);
 for(const markup of svg){assert.ok(markup.startsWith('<svg'));assert.ok(markup.endsWith('</svg>'));assert.ok(!/<image|<script|<foreignObject|href=/i.test(markup))}
});
