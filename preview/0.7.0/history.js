(function(root){
 'use strict';
 const MODES=['week','month','year'],WEEKDAYS=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
 const fullDate=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
 const shortDate=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
 const monthTitle=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});
 const monthShort=new Intl.DateTimeFormat('ru-RU',{month:'short',timeZone:'UTC'});
 function makeDate(year,month,day){const d=new Date(0);d.setUTCHours(12,0,0,0);d.setUTCFullYear(year,month,day);return d}
 function key(date){const y=date.getUTCFullYear();if(y<0||y>9999)throw new RangeError('Calendar boundary');return String(y).padStart(4,'0')+'-'+String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(date.getUTCDate()).padStart(2,'0')}
 function parse(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new RangeError('Invalid calendar date');
  const [y,m,d]=value.split('-').map(Number),date=makeDate(y,m-1,d);
  if(key(date)!==value)throw new RangeError('Invalid calendar date');return date;
 }
 function addDays(date,count){const next=new Date(date);next.setUTCDate(next.getUTCDate()+count);return next}
 function period(mode,anchor){
  if(!MODES.includes(mode))throw new RangeError('Invalid calendar period');
  const date=parse(anchor),year=date.getUTCFullYear(),month=date.getUTCMonth();let start,end;
  if(mode==='week'){start=addDays(date,-((date.getUTCDay()+6)%7));end=addDays(start,6)}
  else if(mode==='month'){start=makeDate(year,month,1);end=makeDate(year,month+1,0)}
  else{start=makeDate(year,0,1);end=makeDate(year,11,31)}
  if(start<makeDate(0,0,1))start=makeDate(0,0,1);
  if(end>makeDate(9999,11,31))end=makeDate(9999,11,31);
  const days=[];for(let d=new Date(start);d<=end;d=addDays(d,1))days.push(key(d));
  const leading=(start.getUTCDay()+6)%7,cells=Array(leading).fill(null).concat(days);
  while(cells.length%7)cells.push(null);
  const months=mode==='year'?Array.from({length:12},(_,m)=>{const d=makeDate(year,m,1);return {label:monthShort.format(d).replace('.',''),column:Math.floor((leading+days.indexOf(key(d)))/7)+1}}):[];
  const title=mode==='year'?String(year):mode==='month'?monthTitle.format(start).replace(/\s?г\.$/,''):shortDate.format(start)+' — '+shortDate.format(end)+' '+end.getUTCFullYear();
  return {mode,start:key(start),end:key(end),days,cells,columns:cells.length/7,months,title};
 }
 function shift(mode,anchor,direction){
  const p=period(mode,anchor),start=parse(p.start);let next;
  if(mode==='week')next=addDays(start,7*direction);
  else if(mode==='month')next=makeDate(start.getUTCFullYear(),start.getUTCMonth()+direction,1);
  else next=makeDate(start.getUTCFullYear()+direction,0,1);
  try{return key(next)}catch(e){return null}
 }
 function summarize(checks,taskId,p,today){
  parse(today);let completed=0;
  const cells=p.cells.map(date=>{
   if(date===null)return null;
   const status=date>today?'future':checks?.[date]?.[taskId]===true?'done':'missed';
   if(status==='done')completed++;
   return {date,status,number:parse(date).getUTCDate()};
  });
  return {...p,cells,completed};
 }
 function times(n){const last=n%10,teen=n%100;return last>=2&&last<=4&&(teen<12||teen>14)?'раза':'раз'}
 const statusText={done:'Выполнено',missed:'Не отмечено',future:'Будущий день'};
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function mount(container,{getToday=()=>new Date().toLocaleDateString('sv-SE')}={}){
  let data=null,taskId=null,mode='month',anchor=getToday(),selectedDay=anchor,lastToday=anchor,lastGrid='',model=null;
  const id=container.id||'habitHistory';
  container.innerHTML=`<section class="habit-history" aria-labelledby="${esc(id)}Title">
   <h2 id="${esc(id)}Title">История привычки</h2>
   <div class="history-selector"><label class="hint" for="${esc(id)}Task">Привычка</label><select class="field" id="${esc(id)}Task" data-history-task></select></div>
   <p class="empty" data-history-empty hidden>Добавь привычку в списке, чтобы увидеть историю.</p>
   <div data-history-content>
    <div class="history-modes" role="group" aria-label="Период истории"><button type="button" data-history-mode="week" aria-pressed="false">Неделя</button><button type="button" data-history-mode="month" aria-pressed="true">Месяц</button><button type="button" data-history-mode="year" aria-pressed="false">Год</button></div>
    <div class="history-navigation"><button type="button" class="secondary" data-history-prev aria-label="Предыдущий период">‹</button><div data-history-title></div><button type="button" class="secondary" data-history-next aria-label="Следующий период">›</button></div>
    <div class="history-summary"><div aria-live="polite"><strong data-history-count>0</strong> <span data-history-times>раз</span><small>за выбранный период</small></div><button type="button" class="secondary" data-history-current>К текущему</button></div>
    <div class="history-weekdays" aria-hidden="true" data-history-weekdays>${WEEKDAYS.map(day=>'<span>'+day+'</span>').join('')}</div>
    <div class="history-board"><div class="history-year-weekdays" aria-hidden="true" hidden data-history-year-weekdays>${WEEKDAYS.map(day=>'<span>'+day+'</span>').join('')}</div><div class="history-scroll" data-history-scroll><div class="history-month-labels" data-history-months hidden></div><div class="history-grid" role="group" aria-label="Дни выбранного периода" data-history-grid></div></div></div>
    <p class="history-detail hint" data-history-detail aria-live="polite"></p>
    <div class="history-legend"><span><i class="is-done"></i>Выполнено</span><span><i></i>Не отмечено</span><span><i class="is-future"></i>Будущий день</span></div>
   </div>
  </section>`;
  const $=selector=>container.querySelector(selector),select=$('[data-history-task]'),scroll=$('[data-history-scroll]');let taskSignature='';
  function render(){
   if(!data||!container.getClientRects().length)return;
   const today=getToday();
   if(today!==lastToday){const old=period(mode,anchor);if(old.start<=lastToday&&lastToday<=old.end)anchor=today;if(selectedDay===lastToday)selectedDay=today;lastToday=today}
   const tasks=data.tasks,signature=JSON.stringify(tasks.map(t=>[t.id,t.name]));
   if(signature!==taskSignature){select.replaceChildren(...tasks.map(task=>{const option=document.createElement('option');option.value=task.id;option.textContent=task.name;return option}));taskSignature=signature}
   if(!tasks.some(task=>task.id===taskId))taskId=tasks[0]?.id??null;
   select.value=taskId??'';select.disabled=!tasks.length;
   $('[data-history-empty]').hidden=tasks.length>0;$('[data-history-content]').hidden=!tasks.length;
   if(!tasks.length)return;
   const p=period(mode,anchor);model=summarize(data.checks,taskId,p,today);
   const focused=container.ownerDocument.activeElement?.dataset.historyDay,oldScroll=scroll.scrollLeft,gridKey=mode+':'+p.start;
   if(!model.cells.some(day=>day?.date===selectedDay))selectedDay=p.start<=today&&today<=p.end?today:null;
   const fallback=model.cells.find(day=>day?.status==='done')?.date||p.start,focusDay=selectedDay||fallback;
   $('[data-history-title]').textContent=p.title;
   $('[data-history-count]').textContent=model.completed;$('[data-history-times]').textContent=times(model.completed);
   container.querySelectorAll('[data-history-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.historyMode===mode)));
   const prev=shift(mode,anchor,-1),next=shift(mode,anchor,1);
   $('[data-history-prev]').disabled=prev===null;$('[data-history-next]').disabled=next===null||period(mode,next).start>today;
   const current=period(mode,today);$('[data-history-current]').disabled=current.start===p.start;
   const yearly=mode==='year';$('[data-history-weekdays]').hidden=yearly;$('[data-history-year-weekdays]').hidden=!yearly;
   scroll.classList.toggle('is-year',yearly);
   const months=$('[data-history-months]');months.hidden=!yearly;months.style.gridTemplateColumns=`repeat(${p.columns},14px)`;
   months.innerHTML=p.months.map(month=>`<span style="grid-column:${month.column}">${month.label}</span>`).join('');
   const grid=$('[data-history-grid]');grid.classList.toggle('is-year',yearly);
   grid.innerHTML=model.cells.map(day=>day===null?'<span class="history-blank" aria-hidden="true"></span>':`<button type="button" class="history-day" data-history-day="${day.date}" data-status="${day.status}" ${day.date===today?'aria-current="date"':''} aria-pressed="${day.date===selectedDay}" tabindex="${day.date===focusDay?'0':'-1'}" aria-label="${esc(fullDate.format(parse(day.date))+' — '+statusText[day.status])}" title="${esc(fullDate.format(parse(day.date))+' — '+statusText[day.status])}">${yearly?'':day.number}</button>`).join('');
   const selected=model.cells.find(day=>day?.date===selectedDay);
   $('[data-history-detail]').textContent=selected?(selected.date===today?'Сегодня · ':'')+fullDate.format(parse(selected.date))+' — '+statusText[selected.status]:'Нажми на квадрат, чтобы увидеть дату и отметку.';
   if(yearly){
    if(lastGrid!==gridKey){const done=model.cells.filter(day=>day?.status==='done').pop(),target=done?.date||focusDay,index=p.cells.indexOf(target);scroll.scrollLeft=Math.max(0,Math.floor(index/7)*18-scroll.clientWidth/2)}
    else scroll.scrollLeft=oldScroll;
   }else scroll.scrollLeft=0;
   lastGrid=gridKey;
   if(focused)grid.querySelector(`[data-history-day="${focused}"]`)?.focus({preventScroll:true});
  }
  select.addEventListener('change',()=>{taskId=select.value;lastGrid='';render()});
  container.addEventListener('click',event=>{
   const button=event.target.closest('button');if(!button||!container.contains(button))return;
   if(button.dataset.historyMode){mode=button.dataset.historyMode;lastGrid=''}
   else if(button.hasAttribute('data-history-prev'))anchor=shift(mode,anchor,-1)||anchor;
   else if(button.hasAttribute('data-history-next'))anchor=shift(mode,anchor,1)||anchor;
   else if(button.hasAttribute('data-history-current')){anchor=getToday();selectedDay=anchor;lastGrid=''}
   else if(button.dataset.historyDay)selectedDay=button.dataset.historyDay;
   else return;
   render();
  });
  container.addEventListener('keydown',event=>{
   const date=event.target.dataset.historyDay;if(!date)return;
   const deltas={ArrowLeft:mode==='year'?-7:-1,ArrowRight:mode==='year'?7:1,ArrowUp:mode==='year'?-1:-7,ArrowDown:mode==='year'?1:7};
   if(deltas[event.key]===undefined)return;event.preventDefault();
   let target;try{target=key(addDays(parse(date),deltas[event.key]))}catch(e){return}
   if(target<model.start||target>model.end)return;
   selectedDay=target;render();const button=$(`[data-history-day="${target}"]`);button?.focus({preventScroll:true});if(mode==='year')button?.scrollIntoView({block:'nearest',inline:'nearest'});
  });
  return {update(next){data=next;render()},show:render};
 }
 const api={period,shift,summarize,parse,key,mount};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LifeResetHistory=api;
})(globalThis);
