(function(root){
 'use strict';
 const STAGES=Object.freeze([
  {level:1,name:'Новичок',color:'#d9f36a'},
  {level:3,name:'Любитель',color:'#8ce2c2'},
  {level:6,name:'Атлет',color:'#8bbdf8'},
  {level:10,name:'Титан',color:'#f2cf72'}
 ].map(Object.freeze));
 function appearance(xp){
  if(!Number.isSafeInteger(xp)||xp<0)throw new RangeError('Invalid XP');
  const level=Math.floor(xp/500)+1;
  const index=STAGES.filter(stage=>stage.level<=level).length-1;
  return {level,index,stage:STAGES[index],next:STAGES[index+1]||null};
 }
 function avatarMarkup(index,compact=false){
  if(!Number.isInteger(index)||index<0||index>=STAGES.length)throw new RangeError('Invalid avatar stage');
  const arm=`<path d="M105 124c-13-3-20 8-21 24l-5 35c-2 14 3 28 8 41l3 14c2 8 13 8 15 0l-1-13c-3-9-6-16-5-26l7-34c8-17 10-35-1-41z" fill="#e6ac88"/>
   <path class="avatar-muscle" d="M98 141c-10 3-13 15-5 25m-6 20c-1 13 5 20 7 31" fill="none" stroke="#b4765b"/>
   <path d="M93 233l1 7m4-8 1 7" stroke="#b4765b" stroke-width="1.8"/>`;
  return `<svg class="human-avatar" data-stage="${index}" viewBox="${compact?'55 20 190 235':'0 0 300 360'}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
   <g class="avatar-aura" fill="#f2cf72"><ellipse cx="150" cy="183" rx="111" ry="139" opacity=".1"/><ellipse cx="150" cy="183" rx="125" ry="153" fill="none" stroke="#f2cf72" stroke-opacity=".25" stroke-dasharray="5 12"/><path d="M47 94l4 11 11 4-11 4-4 11-4-11-11-4 11-4zm204 129 3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/></g>
   <ellipse cx="150" cy="339" rx="66" ry="9" fill="#080c13" opacity=".35"/>
   <g stroke="#263448" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <g class="avatar-legs">
     <path d="M115 217l35 4-7 55-8 46h-25l2-47z" fill="#283b53"/>
     <path d="M150 221l35-4 3 58 2 47h-25l-8-46z" fill="#324a64"/>
     <path class="avatar-trim" d="M120 239l-3 48m63-48 3 48" stroke="var(--avatar-trim)" stroke-width="5"/>
     <path d="M109 317h27l2 15c-14 8-26 8-37 5l1-9z" fill="#eef2f5"/>
     <path d="M164 317h27l8 11 1 9c-11 3-23 3-37-5z" fill="#eef2f5"/>
     <path d="M105 334h30m31 0h30" stroke="var(--avatar-trim)" stroke-width="4"/>
    </g>
    <g class="avatar-upper">
     <g class="avatar-arm avatar-arm-left">${arm}</g>
     <g class="avatar-arm avatar-arm-right"><g transform="translate(300 0) scale(-1 1)">${arm}</g></g>
     <path d="M137 99h26v30c-9 9-17 9-26 0z" fill="#e6ac88"/>
     <g class="avatar-torso">
      <path d="M132 119c9 9 27 9 36 0l32 13-9 43-9 53c-21 9-43 9-64 0l-9-53-9-43z" fill="var(--avatar-jersey)"/>
      <g class="avatar-sleeves" fill="var(--avatar-jersey)"><path d="M132 119l-32 9-12 28 24 9 9-29m47-17 32 9 12 28-24 9-9-29"/></g>
      <path d="M132 119c4 18 32 18 36 0" stroke="var(--avatar-trim)" stroke-width="5"/>
      <path class="avatar-panels" d="M111 144l11 37 5 43m62-80-11 37-5 43" stroke="var(--avatar-trim)" stroke-width="6" opacity=".6"/>
      <g class="avatar-muscle" stroke="#263448" stroke-opacity=".42" stroke-width="2.5"><path d="M124 150q14-6 26 2 12-8 26-2m-26 3v63m-20-38q10-4 17 0m6 0q7-4 17 0m-35 16q7-3 12 0m6 0q5-3 12 0m-28 15q5-2 10 0m6 0q5-2 10 0"/></g>
      <path class="avatar-emblem" d="M150 137l7 9-7 10-7-10z" fill="#f2cf72" stroke="#f2cf72"/>
     </g>
     <g class="avatar-head">
      <ellipse cx="124" cy="79" rx="5" ry="9" fill="#e6ac88"/><ellipse cx="176" cy="79" rx="5" ry="9" fill="#e6ac88"/>
      <path d="M124 65c0-32 52-32 52 0v20c0 17-13 28-26 28s-26-11-26-28z" fill="#f2bf9b"/>
      <path d="M129 91c4 11 11 16 21 16s17-5 21-16" stroke="#e6ac88" stroke-width="4"/>
      <g fill="#263448" stroke="none"><ellipse cx="139" cy="78" rx="3" ry="4"/><ellipse cx="161" cy="78" rx="3" ry="4"/></g>
      <path d="M134 68l9 1m14 0 9-1" stroke-width="3"/>
      <path d="M150 80l-2 9h5" stroke="#c88d6c" stroke-width="2"/>
      <path d="M143 96q7 6 14-1" stroke-width="2.5"/>
      <g fill="#354052">
       <path class="avatar-hair hair-0" d="M123 73l-6-15 8-2-6-13 13 2 3-13 13 6 10-9 6 10 15-2-4 12 7 7-8 18-5-17-12 7-11-8-10 10-8-5z"/>
       <path class="avatar-hair hair-1" d="M124 75c-5-16-2-31 12-36 22-8 41 3 41 22l-3 14-6-18c-15 7-27 7-39 1z"/>
       <path class="avatar-hair hair-2" d="M124 75l-4-16c-2-9 4-14 10-18l-3-10c17 7 23-5 39 3 12 6 14 21 10 35l-5 8-5-22c-13 10-27 6-37 3z"/>
       <path class="avatar-hair hair-3" d="M124 76l-6-21 9-6-5-16 17 4 8-13 8 8 16-8-2 15c14 7 14 25 6 37l-6-21c-11 6-25 11-39 4z"/>
      </g>
      <path class="avatar-emblem" d="M146 40l13-2 9 6-18 2z" fill="#f2cf72" stroke="none"/>
     </g>
    </g>
   </g>
  </svg>`;
 }
 const api={STAGES,appearance,avatarMarkup};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LifeResetProgression=api;
})(globalThis);
