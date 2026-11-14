const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,devices}=require('playwright');
const https=require('node:https');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {KEY,UPGRADE_COPY,IMPORT_COPY,defaults}=require('../data.js');
const {buildPreview,PREVIEW_KEY,CACHE_PREFIX,VERSION,PREVIEW_PATH,FILES}=require('../scripts/build-preview.cjs');
const root=path.resolve(__dirname,'..');
const oldRef='013f57cfd050a5bbf5d936ab44fda74fb5180d93';
let networkUnavailable=false;
let browser,server,base,temp,serveOld=false,stallNetwork=false;
before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'life-reset-tests-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(temp,'key.pem'),'-out',path.join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 const oldFiles=Object.fromEntries(['index.html','data.js','progression.js','sw.js','manifest.webmanifest','icon.svg'].map(name=>[name,execFileSync('git',['show',oldRef+':'+name],{cwd:root})]));
 buildPreview(root,path.join(temp,'preview'),execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim());
 server=https.createServer({key:fs.readFileSync(path.join(temp,'key.pem')),cert:fs.readFileSync(path.join(temp,'cert.pem'))},(req,res)=>{
  if(networkUnavailable){req.socket.destroy();return}
  if(stallNetwork)return;
  const urlPath=new URL(req.url,'https://localhost').pathname,isPreview=urlPath.startsWith(PREVIEW_PATH);
  const filename=urlPath.slice(isPreview?PREVIEW_PATH.length:'/life-reset/'.length)||'index.html';
  if(!FILES.includes(filename)){res.writeHead(404);return res.end()}
  const body=isPreview?fs.readFileSync(path.join(temp,'preview',filename)):serveOld&&oldFiles[filename]?oldFiles[filename]:fs.readFileSync(path.join(root,filename));
  const type=filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.svg')?'image/svg+xml':filename.endsWith('.webmanifest')?'application/manifest+json':'text/html';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`https://127.0.0.1:${server.address().port}/life-reset/`;
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--ignore-certificate-errors']});
});
after(async()=>{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}if(temp)fs.rmSync(temp,{recursive:true,force:true})});
async function open(t,{raw,fallback=false,serviceWorkers='block',reducedMotion}={}){
 const context=await browser.newContext({...devices['iPhone 13'],timezoneId:'Asia/Qyzylorda',ignoreHTTPSErrors:true,serviceWorkers,...(reducedMotion?{reducedMotion}:{})});
 t.after(()=>context.close());
 if(fallback)await context.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 if(raw!==undefined){await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:KEY,raw});await page.reload()}
 return {context,page,errors};
}
async function saved(page){return page.evaluate(key=>localStorage.getItem(key),KEY)}
async function importFile(page,data){await page.locator('[data-tab="analytics"]').click();await page.locator('#importFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))})}
async function toast(page,text){await page.waitForFunction(text=>document.getElementById('toast').textContent.includes(text),text)}
test('habit XP, custom category, goals, money, reload and backup roundtrip',async t=>{
 const {page,errors}=await open(t);const walk=page.locator('#tasks [data-task="walk"]');
 await walk.check();await page.waitForFunction(()=>document.getElementById('xp').textContent==='20 XP');
 await walk.uncheck();await page.waitForFunction(()=>document.getElementById('xp').textContent==='0 XP');
 await walk.check();await page.waitForFunction(()=>document.getElementById('xp').textContent==='20 XP');
 await page.locator('[data-tab="habits"]').click();await page.locator('#addTask').click();
 await page.locator('#taskName').fill('Сон <8 часов>');await page.locator('#taskCategory').selectOption('discipline');
 await page.locator('#taskForm [type="submit"]').click();await toast(page,'Привычка добавлена');
 await page.locator('[data-tab="goals"]').click();page.once('dialog',d=>d.accept('Моя цель'));await page.locator('#addGoal').click();await toast(page,'Цель добавлена');
 await page.locator('[data-tab="financeView"]').click();await page.locator('#amount').fill('100.25');await page.locator('#note').fill('Доход');await page.locator('#saveTx').click();await toast(page,'Операция сохранена');
 await page.reload();let data=JSON.parse(await saved(page));assert.equal(data.xp,20);assert.equal(data.tasks.at(-1).cat,'discipline');assert.deepEqual(data.goals,['Моя цель']);assert.equal(data.tx[0].amount,100.25);
 await page.locator('[data-tab="analytics"]').click();const pending=page.waitForEvent('download');await page.locator('#export').click();
 const download=await pending;const dest=path.join(temp,'roundtrip.json');await download.saveAs(dest);data=JSON.parse(fs.readFileSync(dest));
 await page.waitForFunction(()=>!document.getElementById('export').disabled&&JSON.parse(localStorage.getItem('life-reset-v2')).backupAt!==null);
 page.once('dialog',d=>d.accept());await importFile(page,data);await toast(page,'Данные восстановлены');
 assert.deepEqual(JSON.parse(await saved(page)).tx,data.tx);assert.deepEqual(errors,[]);
});
test('malformed imports never replace current data or ask for confirmation',async t=>{
 const raw=JSON.stringify(defaults()),{page,errors}=await open(t,{raw});let confirmations=0;
 page.on('dialog',async d=>{confirmations++;await d.accept()});
 for(const bad of [{...defaults(),tx:[null]},{...defaults(),tx:[{id:'a',kind:'income',amount:'100',date:'2026-11-14'}]},{...defaults(),tasks:[null]}]){
  await importFile(page,bad);await toast(page,'Данные не изменены');assert.equal(await saved(page),raw);
 }
 assert.equal(confirmations,0);assert.deepEqual(errors,[]);
});
test('damaged storage remains intact and can be downloaded or safely replaced',async t=>{
 const {page}=await open(t,{raw:'{broken'});assert.equal(await page.locator('#dataWarning').isVisible(),true);
 await page.locator('#nextFocus').click();await toast(page,'Сохранённая запись не изменена');assert.equal(await saved(page),'{broken');
 const pending=page.waitForEvent('download');await page.locator('#exportOriginal').click();const download=await pending;const dest=path.join(temp,'damaged.json');await download.saveAs(dest);assert.equal(fs.readFileSync(dest,'utf8'),'{broken');
 page.once('dialog',d=>d.accept());await importFile(page,defaults());await toast(page,'Данные восстановлены');assert.equal(await page.locator('#dataWarning').isHidden(),true);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),IMPORT_COPY),'{broken');
});
test('quota failure retains form input, leaves state intact, and does not claim success',async t=>{
 const raw=JSON.stringify(defaults()),{page}=await open(t,{raw});
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}});
 await page.locator('[data-tab="financeView"]').click();await page.locator('#amount').fill('500');await page.locator('#note').fill('Важный ввод');await page.locator('#saveTx').click();await toast(page,'Не удалось сохранить');
 assert.equal(await page.locator('#amount').inputValue(),'500');assert.equal(await page.locator('#note').inputValue(),'Важный ввод');assert.equal(await saved(page),raw);
 assert.equal(await page.locator('#txCount').textContent(),'0');assert.equal(await page.locator('#saveTx').isEnabled(),true);
 await page.locator('[data-tab="analytics"]').click();const pending=page.waitForEvent('download');await page.locator('#export').click();await pending;
});
test('failed task save keeps the dialog, name and category',async t=>{
 const {page}=await open(t);await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}});
 await page.locator('[data-tab="habits"]').click();await page.locator('#addTask').click();await page.locator('#taskName').fill('Моя привычка');await page.locator('#taskCategory').selectOption('health');
 await page.locator('#taskForm [type="submit"]').click();await toast(page,'Не удалось сохранить');
 assert.equal(await page.locator('#taskDialog').isVisible(),true);assert.equal(await page.locator('#taskName').inputValue(),'Моя привычка');assert.equal(await page.locator('#taskCategory').inputValue(),'health');
});
test('unavailable write coordination leaves user input and original data intact',async t=>{
 const raw=JSON.stringify(defaults()),{page}=await open(t,{raw});
 await page.evaluate(()=>Object.defineProperty(window,'indexedDB',{value:undefined}));
 await page.locator('[data-tab="financeView"]').click();await page.locator('#amount').fill('500');await page.locator('#saveTx').click();await toast(page,'Не удалось сохранить');
 assert.equal(await page.locator('#amount').inputValue(),'500');assert.equal(await saved(page),raw);
});
test('fence storage failure happens before the primary write and a later retry succeeds',async t=>{
 const raw=JSON.stringify(defaults()),{page}=await open(t,{raw});
 await page.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('quota','QuotaExceededError')}});
 await page.locator('[data-tab="financeView"]').click();await page.locator('#amount').fill('500');await page.locator('#saveTx').click();await toast(page,'Не удалось сохранить');
 assert.equal(await saved(page),raw);assert.equal(await page.locator('#amount').inputValue(),'500');
 await page.evaluate(()=>IDBObjectStore.prototype.put=window.originalPut);await page.locator('#saveTx').click();await toast(page,'Операция сохранена');
 assert.equal(JSON.parse(await saved(page)).tx.length,1);
});
for(const fallback of [false,true])test(`two tabs keep concurrent edits (${fallback?'IndexedDB queue':'Web Locks'})`,async t=>{
 const {page,context}=await open(t,{fallback}),second=await context.newPage();await second.goto(base);
 for(let i=0;i<20;i++){
  const actions=[page.evaluate(i=>persist(next=>{next.goals.push('Цель '+i)}),i),second.evaluate(i=>persist(next=>{next.tx.push({id:'tx'+i,kind:'income',amount:100,date:'2026-11-14'})}),i)];
  assert.deepEqual(await Promise.all(actions),[true,true]);
  await page.waitForFunction(n=>s.tx.length===n&&s.goals.length===n,i+1,{timeout:3000});
  await second.waitForFunction(n=>s.tx.length===n&&s.goals.length===n,i+1,{timeout:3000});
 }
 const data=JSON.parse(await saved(page));assert.equal(data.goals.length,20);assert.equal(data.tx.length,20);
});
test('import detects changes made while its file is being read',async t=>{
 const {page,context}=await open(t),second=await context.newPage();await second.goto(base);
 await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=async function(){await new Promise(resolve=>{window.finishRead=resolve});return original.call(this)}});
 const importing=importFile(page,defaults());await page.waitForFunction(()=>typeof window.finishRead==='function');
 await second.evaluate(()=>persist(next=>{next.goals.push('Сохранить эту цель')}));
 page.once('dialog',d=>d.accept());await page.evaluate(()=>window.finishRead());await importing;await toast(page,'Данные изменились');assert.deepEqual(JSON.parse(await saved(page)).goals,['Сохранить эту цель']);
});
test('legacy upgrade keeps XP and focus and exposes its exact source copy',async t=>{
 const legacy={...defaults(),version:2,xp:120,focus:'Мой фокус',checks:{'2026-11-14':{walk:true}},claimed:{'2026-11-13':['walk']}};
 const raw=JSON.stringify(legacy),{page}=await open(t,{raw});assert.equal(await page.locator('#xp').textContent(),'120 XP');assert.equal(await page.locator('#focusText').textContent(),'Мой фокус');
 await page.locator('[data-tab="financeView"]').click();await page.locator('#amount').fill('100');await page.locator('#saveTx').click();await toast(page,'Операция сохранена');
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),UPGRADE_COPY),raw);assert.equal(JSON.parse(await saved(page)).xp,120);
 await page.locator('[data-tab="analytics"]').click();assert.equal(await page.locator('#exportBeforeUpgrade').isVisible(),true);
});
test('v0.5.0 service worker updates to current version and all assets load offline with old data',async t=>{
 serveOld=true;t.after(()=>{serveOld=false});
 const {page,context,errors}=await open(t,{serviceWorkers:'allow'});
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.locator('#tasks [data-task="walk"]').check();await page.waitForFunction(()=>document.getElementById('xp').textContent==='20 XP');
 const before=JSON.parse(await saved(page));
 await page.evaluate(()=>{window.previousController=navigator.serviceWorker.controller});
 serveOld=false;
 await page.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;await reg.update()});
 await page.waitForFunction(async()=>{
  const reg=await navigator.serviceWorker.getRegistration();
  return reg.active?.state==='activated'&&navigator.serviceWorker.controller!==window.previousController&&navigator.serviceWorker.controller===reg.active;
 });
 await page.waitForFunction(async cache=>{
  const c=await caches.open(cache),files=['./','./index.html','./data.js','./progression.js','./avatar.css','./avatar-component.js','./avatar-demo.html','./manifest.webmanifest','./icon.svg'];
  return (await Promise.all(files.map(file=>c.match(file)))).every(Boolean);
 },'life-reset-v'+VERSION);
 await page.reload();await page.waitForFunction(version=>document.querySelector('header .eyebrow').textContent.includes(version),VERSION);
 assert.deepEqual(JSON.parse(await saved(page)),before);
 // Use a real server connection failure during the worker handover; other scenarios cover browser airplane mode.
 networkUnavailable=true;t.after(()=>{networkUnavailable=false});await page.reload();assert.equal(await page.locator('#xp').textContent(),'20 XP');
 await page.locator('#tasks [data-task="move"]').check();await page.waitForFunction(()=>document.getElementById('xp').textContent==='40 XP');await page.reload();assert.equal(await page.locator('#xp').textContent(),'40 XP');assert.deepEqual(errors,[]);
});
test('preview and installed v0.5.0 share an origin without sharing data or offline caches',async t=>{
 serveOld=true;t.after(()=>{serveOld=false});
 const original={...defaults(),checks:{'2026-11-14':{walk:true}},xp:20,goals:['Основная цель'],tx:[{id:'original',kind:'income',amount:2500,date:'2026-11-14'}]};
 const raw=JSON.stringify(original),{page:production,context}=await open(t,{raw,serviceWorkers:'allow'});
 await production.evaluate(()=>navigator.serviceWorker.ready);await production.reload();
 await production.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const preview=await context.newPage();await preview.goto(new URL(PREVIEW_PATH,base).href);
 await preview.waitForFunction(path=>navigator.serviceWorker.controller?.scriptURL.endsWith(path+'sw.js'),PREVIEW_PATH);
 assert.equal(await preview.evaluate(()=>KEY),PREVIEW_KEY);
 assert.equal(await preview.locator('#xp').textContent(),'0 XP');assert.equal(await preview.locator('#previewNotice').isVisible(),true);
 const manifest=await preview.evaluate(async()=>await (await fetch('manifest.webmanifest')).json());assert.equal(manifest.short_name,'LR Тест');
 preview.once('dialog',d=>d.accept());await importFile(preview,original);await toast(preview,'Данные восстановлены');
 await preview.locator('[data-tab="financeView"]').click();await preview.locator('#amount').fill('50');await preview.locator('#saveTx').click();await toast(preview,'Операция сохранена');
 assert.equal(await saved(production),raw);
 assert.equal(await preview.evaluate(key=>JSON.parse(localStorage.getItem(key)).tx.length,PREVIEW_KEY),2);
 const keys=await preview.evaluate(()=>caches.keys());assert.ok(keys.includes('life-reset-v0.5.0'));assert.ok(keys.includes(CACHE_PREFIX+'v1'));
 const registrations=await preview.evaluate(async()=>Promise.all((await navigator.serviceWorker.getRegistrations()).map(r=>r.scope)));
 assert.ok(registrations.includes(base));assert.ok(registrations.includes(new URL(PREVIEW_PATH,base).href));
 await context.setOffline(true);await preview.reload();assert.equal(await preview.locator('#previewNotice').isVisible(),true);assert.equal(await preview.locator('#xp').textContent(),'20 XP');
 await production.reload();assert.equal(await production.locator('#previewNotice').count(),0);assert.equal(await saved(production),raw);
 await context.setOffline(false);await preview.locator('[data-tab="analytics"]').click();preview.once('dialog',d=>d.accept());await preview.locator('#resetAll').click();await toast(preview,'Данные удалены');
 assert.equal(await saved(production),raw);assert.equal(await preview.evaluate(key=>JSON.parse(localStorage.getItem(key)).tx.length,PREVIEW_KEY),0);
});
test('cancelling habit deletion on a touch screen restores the initial button color',async t=>{
 const raw=JSON.stringify(defaults()),{page}=await open(t,{raw});await page.locator('[data-tab="habits"]').tap();
 const button=page.locator('[data-delete-task="walk"]');
 const color=await button.evaluate(el=>({background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el).color}));
 page.once('dialog',d=>d.dismiss());await button.tap();
 assert.deepEqual(await button.evaluate(el=>({background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el).color})),color);
 assert.equal(await saved(page),raw);assert.equal(await button.count(),1);
});
test('existing income, expense and debt entries can be removed individually even with duplicate IDs',async t=>{
 const data=defaults();data.goals=['Старая цель'];data.checks={'2026-11-13':{walk:true}};data.xp=20;
 data.tx=[{id:'old',kind:'income',amount:5000,date:'2026-11-13',note:'Старый доход'},{id:'old',kind:'expense',amount:1000,date:'2026-11-13',note:'Старый расход'},{id:'debt',kind:'debt',amount:500,date:'2026-11-13'}];
 const raw=JSON.stringify(data),{page}=await open(t,{raw});await page.locator('[data-tab="financeView"]').click();
 const balance=async()=> (await page.locator('#balance').textContent()).replace(/\s/g,'');
 assert.equal(await balance(),'3500₸');page.once('dialog',d=>d.dismiss());await page.locator('[data-delete-tx="1"]').tap();assert.equal(await saved(page),raw);
 page.once('dialog',d=>d.accept());await page.locator('[data-delete-tx="1"]').click();await toast(page,'Операция удалена');assert.equal(await balance(),'4500₸');
 await page.reload();const remaining=JSON.parse(await saved(page));assert.deepEqual(remaining.tx,[data.tx[0],data.tx[2]]);assert.deepEqual(remaining.goals,data.goals);assert.deepEqual(remaining.checks,data.checks);assert.equal(remaining.xp,20);
 await page.locator('[data-tab="financeView"]').click();page.once('dialog',d=>d.accept());await page.locator('[data-delete-tx="0"]').click();await toast(page,'Операция удалена');assert.equal(await balance(),'-500₸');
 page.once('dialog',d=>d.accept());await page.locator('[data-delete-tx="0"]').click();await page.waitForFunction(()=>document.getElementById('txCount').textContent==='0');assert.equal(await balance(),'0₸');
 assert.equal(await page.locator('#transactions .empty').isVisible(),true);
});
test('financial deletion retains the row and balance if saving fails',async t=>{
 const data=defaults();data.tx=[{id:'old',kind:'income',amount:500,date:'2026-11-13'}];const raw=JSON.stringify(data),{page}=await open(t,{raw});
 await page.locator('[data-tab="financeView"]').click();await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}});
 page.once('dialog',d=>d.accept());await page.locator('[data-delete-tx="0"]').click();await toast(page,'Не удалось сохранить');assert.equal(await saved(page),raw);assert.equal(await page.locator('[data-delete-tx]').count(),1);assert.equal(await page.locator('#balance').textContent(),'500 ₸');
});
test('financial deletion rejects a changed snapshot while confirmation is open',async t=>{
 const data=defaults();data.tx=[{id:'old',kind:'income',amount:500,date:'2026-11-13'}];const {page,context}=await open(t,{raw:JSON.stringify(data)}),second=await context.newPage();await second.goto(base);
 await page.locator('[data-tab="financeView"]').click();
 page.once('dialog',async d=>{await second.evaluate(()=>persist(next=>{next.tx.push({id:'new',kind:'expense',amount:100,date:'2026-11-14'})}));await d.accept()});
 await page.locator('[data-delete-tx="0"]').click();await toast(page,'Данные изменились');const stored=JSON.parse(await saved(page));assert.equal(stored.tx.length,2);assert.deepEqual(stored.tx[0],data.tx[0]);
});
test('avatar path is read-only and the layout fits small iPhone screens at every stage',async t=>{
 const {page,errors}=await open(t);
 for(const [xp,index] of [[0,0],[1000,1],[2500,2],[4500,3]]){
  const data={...defaults(),xp,legacyXp:xp},raw=JSON.stringify(data);await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:KEY,raw});await page.reload();
  assert.equal(await page.locator('#avatarButton').getAttribute('data-stage'),String(index));
  for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
  await page.locator('#avatarButton').click();assert.equal(await page.locator('#stageDialog').isVisible(),true);assert.equal(await page.locator('#stageList li').count(),4);assert.equal(await page.locator('#stageList [aria-current="step"]').count(),1);assert.equal(await page.locator('#avatarDetail [data-add]').count(),0);await page.locator('#closeStageDialog').click();assert.equal(await saved(page),raw);
 }
 assert.deepEqual(errors,[]);
});
for(const reducedMotion of ['no-preference','reduce'])test(`earning a level changes the avatar and theme; unchecking restores them (${reducedMotion})`,async t=>{
 const data={...defaults(),xp:980,legacyXp:980},{page}=await open(t,{raw:JSON.stringify(data),reducedMotion});
 const initialColor=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent'));
 await page.locator('#tasks [data-task="walk"]').check();await toast(page,'Новый уровень — 3');assert.equal(await page.locator('#stageName').textContent(),'Любитель');assert.equal(await page.locator('#avatarButton').getAttribute('data-stage'),'1');
 assert.notEqual(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent')),initialColor);
 if(reducedMotion==='reduce')assert.equal(await page.locator('#avatarButton').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.reload();assert.equal(await page.locator('#stageName').textContent(),'Любитель');assert.equal(await page.locator('#toast').textContent(),'');
 await page.locator('#tasks [data-task="walk"]').uncheck();await page.waitForFunction(()=>document.getElementById('xp').textContent==='980 XP');assert.equal(await page.locator('#stageName').textContent(),'Новичок');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent')),initialColor);
});
test('failed save at a level boundary does not unlock an avatar or show a celebration',async t=>{
 const data={...defaults(),xp:980,legacyXp:980},raw=JSON.stringify(data),{page}=await open(t,{raw});await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}});
 await page.locator('#tasks [data-task="walk"]').check();await toast(page,'Не удалось сохранить');assert.equal(await saved(page),raw);assert.equal(await page.locator('#stageName').textContent(),'Новичок');assert.equal(await page.locator('#profileCard').getAttribute('class'),'card');
});
test('demo XP controls, rank shortcuts and reset never change app data',async t=>{
 const data={...defaults(),xp:980,legacyXp:980,goals:['Не менять']},raw=JSON.stringify(data),{page,errors}=await open(t,{raw});
 await page.goto(base+'avatar-demo.html');assert.equal(await page.locator('.game-avatar__rank').textContent(),'Новичок');
 await page.locator('[data-add="25"]').click();assert.equal(await page.locator('.game-avatar__bar').getAttribute('aria-valuenow'),'25');
 await page.locator('[data-add="100"]').click();assert.equal(await page.evaluate(()=>demoAvatar.getXP()),125);
 for(const [index,name] of [[1,'Любитель'],[2,'Атлет'],[3,'Титан']]){await page.locator('[data-rank="'+index+'"]').click();assert.equal(await page.locator('.game-avatar__rank').textContent(),name);assert.equal(await page.locator('.human-avatar').getAttribute('data-stage'),String(index));}
 assert.equal(await page.locator('.game-avatar').evaluate(el=>el.classList.contains('is-level-up')),true);
 await page.locator('[data-reset]').click();assert.equal(await page.evaluate(()=>demoAvatar.getXP()),0);assert.equal(await page.locator('.game-avatar__level').textContent(),'LVL 1');assert.equal(await page.locator('.game-avatar__bar').getAttribute('aria-valuenow'),'0');
 assert.equal(await saved(page),raw);assert.deepEqual(errors,[]);
});
test('human SVG keeps its nodes while proportions transition between ranks',async t=>{
 const {page}=await open(t);await page.goto(base+'avatar-demo.html');
 await page.evaluate(()=>{window.originalHuman=document.querySelector('.human-avatar');window.originalTorso=document.querySelector('.avatar-torso')});
 const torso=page.locator('.avatar-torso'),before=await torso.boundingBox();await page.locator('[data-rank="3"]').click();
 await page.waitForFunction(()=>{const torso=document.querySelector('.avatar-torso');return getComputedStyle(torso).transform.startsWith('matrix(1.2,')});
 const after=await torso.boundingBox();assert.ok(after.width>before.width*1.4);
 assert.equal(await page.evaluate(()=>originalHuman===document.querySelector('.human-avatar')&&originalTorso===document.querySelector('.avatar-torso')),true);
 assert.ok((await torso.evaluate(el=>getComputedStyle(el).transitionProperty)).includes('transform'));
 for(const width of [320,375,390,430]){await page.setViewportSize({width,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
});
test('demo honors reduced motion while still announcing level ups',async t=>{
 const {page}=await open(t,{reducedMotion:'reduce'});await page.goto(base+'avatar-demo.html');await page.locator('[data-rank="2"]').click();
 assert.equal(await page.locator('.game-avatar__rank').textContent(),'Атлет');assert.equal(await page.locator('.avatar-torso').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 assert.ok((await page.locator('.game-avatar__up').textContent()).includes('Уровень 6'));
});
test('cached app and demo load when network requests stall instead of rejecting',async t=>{
 const {page,context}=await open(t,{serviceWorkers:'allow'});await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');
 stallNetwork=true;t.after(()=>{stallNetwork=false});
 await page.reload({timeout:15000});assert.equal(await page.locator('#stageName').textContent(),'Новичок');
 await context.setOffline(true);await page.goto(base+'avatar-demo.html');await page.locator('[data-add="100"]').click();assert.equal(await page.evaluate(()=>demoAvatar.getXP()),100);
});
