/* Goal date progress and habit effort totals. No additional XP is awarded. */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id),escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dayNumber=value=>Date.parse(value+'T12:00:00Z')/86400000;
 let editing=null,expected,created;
 function openGoal(goal){
  editing=goal?.id??null;expected=snapshot.raw;created=goal?.created??today();
  $('goalTitle').textContent=goal?'Изменить цель':'Новая цель';$('goalName').value=goal?.name||'';$('goalDue').value=goal?.due||'';$('goalStart').value=created;
  $('goalDialog').showModal();$('goalName').focus();
 }
 $('addGoal').onclick=()=>openGoal();$('cancelGoal').onclick=()=>$('goalDialog').close();
 $('goalForm').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;if(button.disabled)return;
  const name=$('goalName').value.trim(),due=$('goalDue').value||null,start=$('goalStart').value;
  if(!name||!start)return toast('Укажи название и дату начала');
  if(due&&due<start)return toast('Срок должен быть не раньше даты начала');
  const goal={id:editing||crypto.randomUUID(),name,created:start,due};button.disabled=true;
  try{if(await persist(next=>{if(editing){const i=next.goals.findIndex(g=>g.id===editing);if(i<0)throw new LifeResetData.DataError('conflict');next.goals[i]={...next.goals[i],...goal}}else next.goals.push({...goal,target:10,done:0})},{expectedRaw:editing?expected:undefined})){$('goalDialog').close();toast(editing?'Цель изменена':'Цель добавлена')}}finally{button.disabled=false}
 };
 $('gender').onchange=async()=>{const gender=$('gender').value;if(await persist(next=>{next.gender=gender}))toast('Персонаж обновлён')};
 function render(data){
  $('gender').value=data.gender;
  $('goalList').innerHTML=data.goals.map(g=>{
   const days=g.due?Math.round(dayNumber(g.due)-dayNumber(today())):null;
   const deadline=days===null?'Без срока':days<0?'Срок прошёл '+Math.abs(days)+' дн. назад':days===0?'Срок сегодня':'До срока: '+days+' дн.';
   const span=g.due&&g.created?dayNumber(g.due)-dayNumber(g.created):null;
   const percent=span===null?null:span===0?(today()>=g.due?100:0):Math.round(Math.max(0,Math.min(1,(dayNumber(today())-dayNumber(g.created))/span))*100);
   return `<div class="goal"><button type="button" class="goal-name" data-goal-edit="${escape(g.id)}">${escape(g.name)}</button>${percent===null?'':`<div class="hint">Прошло времени: ${percent}%</div><div class="bar" role="progressbar" aria-label="Время от начала до срока цели" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div>`}<p class="hint">${deadline}${g.due?' · '+escape(g.due):''}${g.due&&!g.created?' · Укажи дату начала для шкалы времени':''}</p><div class="goal-controls"><button type="button" class="delete-action" data-goal-delete="${escape(g.id)}">Удалить</button></div></div>`;
  }).join('')||'<p class="empty">Добавь цель и выбери срок окончания.</p>';
  $('goalList').onclick=async event=>{
   const button=event.target.closest('button');if(!button||button.disabled)return;
   const id=button.dataset.goalEdit||button.dataset.goalDelete,goal=data.goals.find(g=>g.id===id);if(!goal)return;
   if(button.dataset.goalEdit)return openGoal(goal);
   const raw=snapshot.raw;
   if(button.dataset.goalDelete&&!confirm('Удалить цель «'+goal.name+'»?'))return;
   button.disabled=true;
   try{if(await persist(next=>{const i=next.goals.findIndex(g=>g.id===id);if(i<0)throw new LifeResetData.DataError('conflict');next.goals.splice(i,1)},{expectedRaw:raw}))toast('Цель удалена')}finally{button.disabled=false}
  };
  const counts=data.tasks.map(task=>({task,count:Object.entries(data.checks).filter(([date,day])=>date<=today()&&day[task.id]===true).length}));
  const total=counts.reduce((n,item)=>n+item.count,0),active=Object.entries(data.checks).filter(([date,day])=>date<=today()&&data.tasks.some(t=>day[t.id]===true)).length;
  const next=(Math.floor(total/5)+1)*5;
  $('effortSummary').innerHTML=`<div class="level">${total} <small>маленькие действия</small></div><p class="hint">Дней с выполнениями: ${active}</p>`;
  $('effortBar').style.width=(total%5)*20+'%';$('effortNext').textContent=total?'Этапов по 5 действий: '+Math.floor(total/5)+'. До следующего: '+(next-total)+'.':'Начни с одного небольшого действия — оно сразу появится здесь.';
  $('effortHabits').innerHTML=counts.map(({task,count})=>`<div class="effort-row">${escape(task.name)}<div class="hint">${count} выполнений · ${count*20} XP</div><div class="bar"><i style="width:${count%5*20}%"></i></div><small class="hint">До следующих 5 выполнений: ${5-count%5}</small></div>`).join('')||'<p class="empty">Добавь первую привычку.</p>';
 }
 root.LifeResetFeatures={render};
})(globalThis);
