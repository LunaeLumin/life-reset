(function(root){
 'use strict';
 const {STAGES,appearance,avatarMarkup}=root.LifeResetProgression;
 function mount(container,{xp=0,demo=false}={}){
  let currentXP=xp,timer,destroyed=false;appearance(xp);
  container.innerHTML=`<section class="game-avatar" aria-label="Игровой аватар">
   <div class="game-avatar__scene"><span class="game-avatar__range"></span><div class="game-avatar__figure" role="img">${avatarMarkup(appearance(xp).index)}</div><div class="game-avatar__up" role="status" aria-live="polite"><strong>Level Up!</strong><span></span></div></div>
   <div class="game-avatar__summary"><span class="game-avatar__level"></span><div><div class="game-avatar__rank"></div><div class="game-avatar__total"></div></div><div class="game-avatar__xp"><b></b><span>до следующего уровня</span></div></div>
   <div class="game-avatar__bar" role="progressbar" aria-label="Опыт до следующего уровня" aria-valuemin="0" aria-valuemax="500"><i></i></div>
   ${demo?'<div class="game-avatar__controls" role="group" aria-label="Демонстрационный опыт"><button type="button" data-add="25">+25 XP</button><button type="button" data-add="100">+100 XP</button><button type="button" data-reset>Сброс</button></div><p class="game-avatar__demo-label">Быстрый просмотр этапов</p><div class="game-avatar__stages" role="group" aria-label="Этапы персонажа">'+STAGES.map((stage,index)=>'<button type="button" data-rank="'+index+'" aria-pressed="false">'+stage.name+'<small>LVL '+stage.level+(STAGES[index+1]?'–'+(STAGES[index+1].level-1):'+')+'</small></button>').join('')+'</div>':''}
  </section>`;
  const section=container.firstElementChild,$=selector=>section.querySelector(selector),svg=$('.human-avatar');
  function setXP(nextXP,{celebrate=false}={}){
   if(destroyed)return;
   const visual=appearance(nextXP),previous=appearance(currentXP);currentXP=nextXP;
   svg.dataset.stage=visual.index;
   section.style.setProperty('--game-accent',visual.stage.color);
   $('.game-avatar__figure').setAttribute('aria-label','Персонаж: '+visual.stage.name+', уровень '+visual.level);
   $('.game-avatar__range').textContent='LVL '+visual.stage.level+(visual.next?'–'+(visual.next.level-1):'+');
   $('.game-avatar__level').textContent='LVL '+visual.level;
   $('.game-avatar__rank').textContent=visual.stage.name;
   $('.game-avatar__total').textContent=nextXP.toLocaleString('ru-RU')+' XP всего';
   $('.game-avatar__xp b').textContent=nextXP%500+' / 500 XP';
   $('.game-avatar__xp span').textContent=(500-nextXP%500)+' XP до уровня '+(visual.level+1);
   $('.game-avatar__bar').setAttribute('aria-valuenow',nextXP%500);
   $('.game-avatar__bar').setAttribute('aria-valuetext',(nextXP%500)+' из 500 XP');
   $('.game-avatar__bar i').style.width=(nextXP%500)/5+'%';
   section.querySelectorAll('[data-rank]').forEach(button=>button.setAttribute('aria-pressed',String(+button.dataset.rank===visual.index)));
   if(celebrate&&visual.level>previous.level){
    clearTimeout(timer);section.classList.remove('is-level-up');void section.offsetWidth;
    $('.game-avatar__up span').textContent='Уровень '+visual.level+' · '+visual.stage.name;
    section.classList.add('is-level-up');timer=setTimeout(()=>section.classList.remove('is-level-up'),1500);
   }
   if(visual.level<previous.level){clearTimeout(timer);section.classList.remove('is-level-up')}
  }
  function click(event){
   const button=event.target.closest('button');if(!demo||!button||!section.contains(button))return;
   if(button.hasAttribute('data-add'))setXP(Math.min(Number.MAX_SAFE_INTEGER,currentXP+Number(button.dataset.add)),{celebrate:true});
   else if(button.hasAttribute('data-reset')){clearTimeout(timer);section.classList.remove('is-level-up');setXP(0)}
   else if(button.hasAttribute('data-rank'))setXP((STAGES[Number(button.dataset.rank)].level-1)*500,{celebrate:true});
  }
  section.addEventListener('click',click);setXP(xp);
  return {setXP,setGender(gender){svg.dataset.gender=gender==='female'?'female':'male'},getXP:()=>currentXP,destroy(){destroyed=true;clearTimeout(timer);section.removeEventListener('click',click);container.replaceChildren()}};
 }
 root.LifeResetAvatar={mount};
})(globalThis);
