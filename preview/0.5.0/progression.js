(function(root){
 'use strict';
 const STAGES=Object.freeze([
  {level:1,name:'Искра',color:'#d9f36a'},
  {level:3,name:'Ритм',color:'#9ce8bf'},
  {level:5,name:'Рост',color:'#8ddbed'},
  {level:10,name:'Орбита',color:'#c6b4ff'},
  {level:20,name:'Сияние',color:'#f0d887'}
 ].map(Object.freeze));
 function appearance(xp){
  if(!Number.isSafeInteger(xp)||xp<0)throw new RangeError('Invalid XP');
  const level=Math.floor(xp/500)+1;
  const index=STAGES.filter(stage=>stage.level<=level).length-1;
  return {level,index,stage:STAGES[index],next:STAGES[index+1]||null};
 }
 function avatarMarkup(index){
  if(!Number.isInteger(index)||index<0||index>=STAGES.length)throw new RangeError('Invalid avatar stage');
  return `<svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
   <circle cx="48" cy="48" r="43" fill="currentColor" opacity=".07"/>
   ${index>=3?'<ellipse cx="48" cy="48" rx="44" ry="24" transform="rotate(-35 48 48)" stroke="currentColor" opacity=".5"/>':''}
   <g stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M25 78c2-15 10-21 23-21s21 6 23 21" fill="currentColor" fill-opacity=".12"/>
    <path d="M38 59l10 8 10-8"/>
    <rect x="27" y="24" width="42" height="35" rx="17" fill="var(--panel,#191b20)"/>
    <path d="M36 38h24" opacity=".3"/>
    <circle cx="39" cy="44" r="2.5" fill="currentColor" stroke="none"/>
    <circle cx="57" cy="44" r="2.5" fill="currentColor" stroke="none"/>
    <path d="M43 51q5 4 10 0"/>
    ${index===1||index===2?'<path d="M48 24v-8m0 5c-8 0-10-4-10-9 6 0 10 3 10 9zm0-3c0-6 4-9 10-9 0 6-4 10-10 9z"/>':''}
    ${index>=2?'<path d="M48 69l5 5-5 5-5-5z" fill="currentColor"/>':''}
    ${index>=3?'<path d="M76 22v8m-4-4h8M15 57v6m-3-3h6"/>':''}
    ${index===4?'<path d="M35 22l-3-12 10 5 6-10 6 10 10-5-3 12z" fill="currentColor" fill-opacity=".2"/><path d="M78 65l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="currentColor"/>':''}
   </g>
  </svg>`;
 }
 const api={STAGES,appearance,avatarMarkup};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LifeResetProgression=api;
})(globalThis);
