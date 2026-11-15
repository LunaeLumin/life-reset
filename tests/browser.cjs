const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,devices}=require('playwright');
const https=require('node:https');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {KEY,UPGRADE_COPY,IMPORT_COPY,defaults,progress,newPenalty}=require('../data.js');
const {buildPreview,PREVIEW_KEY,CACHE_PREFIX,VERSION,PREVIEW_PATH,FILES}=require('../scripts/build-preview.cjs');
const root=path.resolve(__dirname,'..');
const oldRef='883c9e4834e22d5fb70995526835de5c68f05c2d';
let networkUnavailable=false;
let browser,server,base,temp,serveOld=false,stallNetwork=false;
before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'life-reset-tests-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(temp,'key.pem'),'-out',path.join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 const oldFiles=Object.fromEntries(['index.html','data.js','progression.js','avatar.css','avatar-component.js','avatar-demo.html','sw.js','manifest.webmanifest','icon.svg'].map(name=>[name,execFileSync('git',['show',oldRef+':'+name],{cwd:root})]));
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
async function open(t,{raw,fallback=false,serviceWorkers='block',reducedMotion,fixedTime,timezoneId='Asia/Qyzylorda'}={}){
 const context=await browser.newContext({...devices['iPhone 13'],timezoneId,ignoreHTTPSErrors:true,serviceWorkers,...(reducedMotion?{reducedMotion}:{})});
 t.after(()=>context.close());
 if(fallback)await context.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(fixedTime)await page.clock.install({time:new Date(fixedTime)});
 if(raw!==undefined)await context.addInitScript(({key,raw})=>{if(!sessionStorage.getItem('fixture-seeded')){localStorage.setItem(key,raw);sessionStorage.setItem('fixture-seeded','yes')}},{key:KEY,raw});
 await page.goto(base);if(!serveOld)await page.waitForFunction(()=>typeof syncingPenalties!=='undefined'&&!syncingPenalties);
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
 await page.locator('#taskName').fill('Сон <8 часов>');await page.locator('#taskCategory').selectOption('intellect');
 await page.locator('#taskForm [type="submit"]').click();await toast(page,'Привычка добавлена');
 await page.locator('[data-tab="goals"]').click();await page.locator('#addGoal').click();await page.locator('#goalName').fill('Моя цель');await page.locator('#goalForm [type=submit]').click();await toast(page,'Цель добавлена');
 await page.locator('[data-tab="analytics"]').click();await page.locator('[data-tab="financeView"]').click();await page.locator('#amount').fill('100.25');await page.locator('#note').fill('Доход');await page.locator('#saveTx').click();await toast(page,'Операция сохранена');
 await page.reload();let data=JSON.parse(await saved(page));assert.equal(data.xp,20);assert.equal(data.tasks.at(-1).cat,'intellect');assert.deepEqual(data.goals.map(g=>g.name),['Моя цель']);assert.equal(data.tx[0].amount,100.25);
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
 await page.locator('[data-tab="analytics"]').click();await page.locator('[data-tab="financeView"]').click();await page.locator('#amount').fill('500');await page.locator('#note').fill('Важный ввод');await page.locator('#saveTx').click();await toast(page,'Не удалось сохранить');
 assert.equal(await page.locator('#amount').inputValue(),'500');assert.equal(await page.locator('#note').inputValue(),'Важный ввод');assert.equal(await saved(page),raw);
 assert.equal(await page.locator('#txCount').textContent(),'0');assert.equal(await page.locator('#saveTx').isEnabled(),true);
 await page.locator('[data-tab="analytics"]').click();const pending=page.waitForEvent('download');await page.locator('#export').click();await pending;
});
test('failed task save keeps the dialog, name and category',async t=>{
 const {page}=await open(t);await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}});
 await page.locator('[data-tab="habits"]').click();await page.locator('#addTask').click();await page.locator('#taskName').fill('Моя привычка');await page.locator('#taskCategory').selectOption('sport');
 await page.locator('#taskForm [type="submit"]').click();await toast(page,'Не удалось сохранить');
 assert.equal(await page.locator('#taskDialog').isVisible(),true);assert.equal(await page.locator('#taskName').inputValue(),'Моя привычка');assert.equal(await page.locator('#taskCategory').inputValue(),'sport');
});
test('unavailable write coordination leaves user input and original data intact',async t=>{
 const raw=JSON.stringify(defaults()),{page}=await open(t,{raw});
 await page.evaluate(()=>Object.defineProperty(window,'indexedDB',{value:undefined}));
 await page.locator('[data-tab="analytics"]').click();await page.locator('[data-tab="financeView"]').click();await page.locator('#amount').fill('500');await page.locator('#saveTx').click();await toast(page,'Не удалось сохранить');
 assert.equal(await page.locator('#amount').inputValue(),'500');assert.equal(await saved(page),raw);
});
test('fence storage failure happens before the primary write and a later retry succeeds',async t=>{
 const raw=JSON.stringify(defaults()),{page}=await open(t,{raw});
 await page.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('quota','QuotaExceededError')}});
 await page.locator('[data-tab="analytics"]').click();await page.locator('[data-tab="financeView"]').click();await page.locator('#amount').fill('500');await page.locator('#saveTx').click();await toast(page,'Не удалось сохранить');
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
 page.once('dialog',d=>d.accept());await page.evaluate(()=>window.finishRead());await importing;await toast(page,'Данные изменились');assert.deepEqual(JSON.parse(await saved(page)).goals.map(g=>g.name),['Сохранить эту цель']);
});
test('legacy upgrade keeps XP and focus and exposes its exact source copy',async t=>{
 const legacy={...defaults(),version:2,xp:120,focus:'Мой фокус',checks:{'2026-11-14':{walk:true}},claimed:{'2026-11-13':['walk']}};
 const raw=JSON.stringify(legacy),{page}=await open(t,{raw});assert.equal(await page.locator('#xp').textContent(),'120 XP');assert.equal(await page.locator('#focusText').textContent(),'Мой фокус');
 await page.locator('[data-tab="analytics"]').click();await page.locator('[data-tab="financeView"]').click();await page.locator('#amount').fill('100');await page.locator('#saveTx').click();await toast(page,'Операция сохранена');
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),UPGRADE_COPY),raw);assert.equal(JSON.parse(await saved(page)).xp,120);
 await page.locator('[data-tab="analytics"]').click();assert.equal(await page.locator('#exportBeforeUpgrade').isVisible(),true);
});
test('v0.6.0 service worker updates to current version and all assets load offline with old data',async t=>{
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
  const c=await caches.open(cache),files=['./features.js','./','./index.html','./data.js','./progression.js','./avatar.css','./avatar-component.js','./avatar-demo.html','./history.css','./history.js','./manifest.webmanifest','./icon.svg'];
  return (await Promise.all(files.map(file=>c.match(file)))).every(Boolean);
 },'life-reset-v'+VERSION);
 await page.reload();await page.waitForFunction(version=>document.querySelector('header .eyebrow').textContent.includes(version),VERSION);
 assert.deepEqual(JSON.parse(await saved(page)).checks,before.checks);assert.equal(JSON.parse(await saved(page)).xp,before.xp);assert.equal(await page.evaluate(()=>localStorage.getItem('life-reset-v2-before-0.9.0')),JSON.stringify(before));
 // Use a real server connection failure during the worker handover; other scenarios cover browser airplane mode.
 networkUnavailable=true;t.after(()=>{networkUnavailable=false});await page.reload();assert.equal(await page.locator('#xp').textContent(),'20 XP');
 await page.locator('#tasks [data-task="move"]').check();await page.waitForFunction(()=>document.getElementById('xp').textContent==='40 XP');await page.reload();assert.equal(await page.locator('#xp').textContent(),'40 XP');assert.deepEqual(errors,[]);
});
test('preview and installed v0.6.0 share an origin without sharing data or offline caches',async t=>{
 serveOld=true;t.after(()=>{serveOld=false});
 const original={...JSON.parse(execFileSync('node',['-e',execFileSync('git',['show',oldRef+':data.js'],{cwd:root,encoding:'utf8'})+';console.log(JSON.stringify(module.exports.defaults()))'],{encoding:'utf8'})),checks:{'2026-11-14':{walk:true}},xp:20,goals:['Основная цель'],tx:[{id:'original',kind:'income',amount:2500,date:'2026-11-14'}]};
 const raw=JSON.stringify(original),{page:production,context}=await open(t,{raw,serviceWorkers:'allow'});
 await production.evaluate(()=>navigator.serviceWorker.ready);await production.reload();
 await production.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const preview=await context.newPage();await preview.goto(new URL(PREVIEW_PATH,base).href);
 await preview.waitForFunction(path=>navigator.serviceWorker.controller?.scriptURL.endsWith(path+'sw.js'),PREVIEW_PATH);
 assert.equal(await preview.evaluate(()=>KEY),PREVIEW_KEY);
 assert.equal(await preview.locator('#xp').textContent(),'0 XP');assert.equal(await preview.locator('#previewNotice').isVisible(),true);
 const manifest=await preview.evaluate(async()=>await (await fetch('manifest.webmanifest')).json());assert.equal(manifest.short_name,'LR Тест');
 preview.once('dialog',d=>d.accept());await importFile(preview,original);await toast(preview,'Данные восстановлены');
 await preview.locator('[data-tab="analytics"]').click();await preview.locator('[data-tab="financeView"]').click();await preview.locator('#amount').fill('50');await preview.locator('#saveTx').click();await toast(preview,'Операция сохранена');
 assert.equal(await saved(production),raw);
 assert.equal(await preview.evaluate(key=>JSON.parse(localStorage.getItem(key)).tx.length,PREVIEW_KEY),2);
 const keys=await preview.evaluate(()=>caches.keys());assert.ok(keys.includes('life-reset-v0.6.0'));assert.ok(keys.includes(CACHE_PREFIX+'v1'));
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
 const raw=JSON.stringify(data),{page}=await open(t,{raw});await page.locator('[data-tab="analytics"]').click();await page.locator('[data-tab="financeView"]').click();
 const balance=async()=> (await page.locator('#balance').textContent()).replace(/\s/g,'');
 assert.equal(await balance(),'3500₸');page.once('dialog',d=>d.dismiss());await page.locator('[data-delete-tx="1"]').tap();assert.equal(await saved(page),raw);
 page.once('dialog',d=>d.accept());await page.locator('[data-delete-tx="1"]').click();await toast(page,'Операция удалена');assert.equal(await balance(),'4500₸');
 await page.reload();const remaining=JSON.parse(await saved(page));assert.deepEqual(remaining.tx,[data.tx[0],data.tx[2]]);assert.deepEqual(remaining.goals.map(g=>g.name),data.goals);assert.deepEqual(remaining.checks,data.checks);assert.equal(remaining.xp,20);
 await page.locator('[data-tab="analytics"]').click();await page.locator('[data-tab="financeView"]').click();page.once('dialog',d=>d.accept());await page.locator('[data-delete-tx="0"]').click();await toast(page,'Операция удалена');assert.equal(await balance(),'-500₸');
 page.once('dialog',d=>d.accept());await page.locator('[data-delete-tx="0"]').click();await page.waitForFunction(()=>document.getElementById('txCount').textContent==='0');assert.equal(await balance(),'0₸');
 assert.equal(await page.locator('#transactions .empty').isVisible(),true);
});
test('financial deletion retains the row and balance if saving fails',async t=>{
 const data=defaults();data.tx=[{id:'old',kind:'income',amount:500,date:'2026-11-13'}];const raw=JSON.stringify(data),{page}=await open(t,{raw});
 await page.locator('[data-tab="analytics"]').click();await page.locator('[data-tab="financeView"]').click();await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}});
 page.once('dialog',d=>d.accept());await page.locator('[data-delete-tx="0"]').click();await toast(page,'Не удалось сохранить');assert.equal(await saved(page),raw);assert.equal(await page.locator('[data-delete-tx]').count(),1);assert.equal(await page.locator('#balance').textContent(),'500 ₸');
});
test('financial deletion rejects a changed snapshot while confirmation is open',async t=>{
 const data=defaults();data.tx=[{id:'old',kind:'income',amount:500,date:'2026-11-13'}];const {page,context}=await open(t,{raw:JSON.stringify(data)}),second=await context.newPage();await second.goto(base);
 await page.locator('[data-tab="analytics"]').click();await page.locator('[data-tab="financeView"]').click();
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
 for(const height of [568,664,844]){
  await page.setViewportSize({width:390,height});const scene=await page.locator('.game-avatar__scene').boundingBox(),figure=await page.locator('.game-avatar__figure').boundingBox();
  assert.ok(figure.y>=scene.y&&figure.y+figure.height<=scene.y+scene.height,'Full character fits short phone screens');
 }
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
const historyTime='2026-11-14T07:00:00Z';
function historyData(){
 const data=defaults();data.checks={'2025-12-31':{walk:true},'2026-01-01':{walk:true},'2026-10-31':{walk:true},'2026-11-01':{walk:true},'2026-11-09':{walk:true},'2026-11-11':{walk:false,read:true},'2026-11-13':{walk:true},'2026-11-14':{walk:true,read:true}};data.xp=progress(data).xp;return data;
}
async function showHistory(page){await page.locator('[data-tab="habits"]').click();await page.locator('[data-habit-view="history"]').click()}
test('habit history shows old marks and exact week, month and year totals without writing data',async t=>{
 const raw=JSON.stringify(historyData()),{page,errors}=await open(t,{raw,fixedTime:historyTime});await showHistory(page);
 assert.equal(await page.locator('[data-history-count]').textContent(),'4');assert.equal(await page.locator('.history-day').count(),30);assert.equal(await page.locator('.history-day[data-status="done"]').count(),4);assert.equal(await page.locator('.history-day[data-status="future"]').count(),16);
 const black=page.locator('[data-history-day="2026-11-10"]');assert.equal(await black.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');assert.notEqual(await page.locator('[data-history-day="2026-11-14"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
 await black.click();assert.ok((await page.locator('[data-history-detail]').textContent()).includes('10 ноября'));assert.equal(await black.getAttribute('data-status'),'missed');
 await page.locator('[data-history-mode="week"]').click();assert.equal(await page.locator('[data-history-count]').textContent(),'3');assert.equal(await page.locator('.history-day').count(),7);assert.equal(await page.locator('[data-history-next]').isDisabled(),true);
 await page.locator('[data-history-task]').selectOption('read');assert.equal(await page.locator('[data-history-count]').textContent(),'2');await page.locator('[data-history-task]').selectOption('walk');
 await page.locator('[data-history-mode="year"]').click();assert.equal(await page.locator('[data-history-count]').textContent(),'6');assert.equal(await page.locator('.history-day').count(),365);assert.equal(await saved(page),raw);assert.deepEqual(errors,[]);
});
test('history refreshes after marking and unmarking today in other app views',async t=>{
 const data=historyData();delete data.checks['2026-11-14'].walk;data.xp=progress(data).xp;const {page}=await open(t,{raw:JSON.stringify(data),fixedTime:historyTime});await showHistory(page);assert.equal(await page.locator('[data-history-count]').textContent(),'3');
 await page.locator('[data-tab="dashboard"]').click();await page.locator('#tasks [data-task="walk"]').check();await toast(page,'+20 XP');await page.locator('[data-tab="habits"]').click();assert.equal(await page.locator('[data-history-count]').textContent(),'4');assert.equal(await page.locator('[data-history-day="2026-11-14"]').getAttribute('data-status'),'done');
 await page.locator('[data-habit-view="list"]').click();await page.locator('#habitList [data-task="walk"]').uncheck();await toast(page,'−20 XP');await page.locator('[data-habit-view="history"]').click();assert.equal(await page.locator('[data-history-count]').textContent(),'3');assert.equal(await page.locator('[data-history-day="2026-11-14"]').getAttribute('data-status'),'missed');
 assert.equal(JSON.parse(await saved(page)).checks['2025-12-31'].walk,true);
});
test('year grid scrolls inside the card, supports keyboard inspection and previous years',async t=>{
 const raw=JSON.stringify(historyData()),{page}=await open(t,{raw,fixedTime:historyTime});await showHistory(page);await page.locator('[data-history-mode="year"]').click();
 const scroll=page.locator('[data-history-scroll]');assert.equal(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth&&el.scrollLeft>0),true);
 for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
 await page.locator('[data-history-day="2026-11-14"]').focus();await page.keyboard.press('ArrowDown');assert.ok((await page.locator('[data-history-detail]').textContent()).includes('15 ноября'));assert.ok((await page.locator('[data-history-detail]').textContent()).includes('Будущий день'));
 await page.locator('[data-history-prev]').click();assert.equal(await page.locator('[data-history-title]').textContent(),'2025');assert.equal(await page.locator('[data-history-count]').textContent(),'1');
 await page.locator('[data-history-current]').click();assert.equal(await page.locator('[data-history-title]').textContent(),'2026');assert.equal(await saved(page),raw);
});
test('history handles empty habits and adding or deleting the last habit',async t=>{
 const data={...defaults(),tasks:[]},{page,errors}=await open(t,{raw:JSON.stringify(data),fixedTime:historyTime});await showHistory(page);assert.equal(await page.locator('[data-history-empty]').isVisible(),true);assert.equal(await page.locator('[data-history-task]').isDisabled(),true);assert.equal(await page.locator('[data-history-mode="week"]').isHidden(),true);
 await page.locator('[data-habit-view="list"]').click();await page.locator('#addTask').click();await page.locator('#taskName').fill('Прогулка <20 минут>');await page.locator('#taskForm [type="submit"]').click();await toast(page,'Привычка добавлена');await page.locator('[data-habit-view="history"]').click();assert.equal(await page.locator('[data-history-task] option').textContent(),'Прогулка <20 минут>');assert.equal(await page.locator('[data-history-count]').textContent(),'0');
 await page.locator('[data-habit-view="list"]').click();page.once('dialog',d=>d.accept());await page.locator('[data-delete-task]').click();await toast(page,'Привычка удалена');await page.locator('[data-habit-view="history"]').click();assert.equal(await page.locator('[data-history-empty]').isVisible(),true);assert.deepEqual(errors,[]);
});
test('imported backups immediately supply habit history',async t=>{
 const {page}=await open(t,{raw:JSON.stringify({...defaults(),tasks:[]}),fixedTime:historyTime});await showHistory(page);page.once('dialog',d=>d.accept());await importFile(page,historyData());await toast(page,'Данные восстановлены');await showHistory(page);assert.equal(await page.locator('[data-history-count]').textContent(),'4');await page.locator('[data-history-mode="year"]').click();await page.locator('[data-history-prev]').click();assert.equal(await page.locator('[data-history-count]').textContent(),'1');
});
test('history follows the local month change at midnight without modifying saved marks',async t=>{
 const data=defaults();data.checks={'2026-11-30':{walk:true}};data.xp=20;data.penalties=newPenalty(data,'2026-11-30');const raw=JSON.stringify(data),{page}=await open(t,{raw,fixedTime:'2026-11-30T18:59:58Z'});await showHistory(page);assert.equal(await page.locator('[data-history-count]').textContent(),'1');
 await page.clock.fastForward(3000);await page.waitForFunction(()=>document.querySelector('[data-history-day="2026-12-01"][aria-current="date"]'));
 assert.equal(await page.locator('[data-history-count]').textContent(),'0');assert.equal(await page.locator('[data-history-day="2026-12-01"]').getAttribute('data-status'),'missed');await page.locator('[data-history-prev]').click();assert.equal(await page.locator('[data-history-count]').textContent(),'1');assert.deepEqual(JSON.parse(await saved(page)).checks,data.checks);
});
test('history uses the phone local date rather than the UTC date',async t=>{
 const data=defaults();data.checks={'2026-11-13':{walk:true}};data.xp=20;const {page}=await open(t,{raw:JSON.stringify(data),fixedTime:'2026-11-14T00:30:00Z',timezoneId:'America/Los_Angeles'});await showHistory(page);assert.equal(await page.locator('[data-history-day="2026-11-13"]').getAttribute('aria-current'),'date');assert.equal(await page.locator('[data-history-day="2026-11-14"]').getAttribute('data-status'),'future');assert.equal(await page.locator('[data-history-count]').textContent(),'1');
});
test('history works offline and keeps the source data intact',async t=>{
 const raw=JSON.stringify(historyData()),{page,context}=await open(t,{raw,fixedTime:historyTime,serviceWorkers:'allow'});await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');await context.setOffline(true);await page.reload();await showHistory(page);assert.equal(await page.locator('[data-history-count]').textContent(),'4');await page.locator('[data-history-mode="year"]').click();await page.locator('[data-history-prev]').click();assert.equal(await page.locator('[data-history-count]').textContent(),'1');assert.equal(await saved(page),raw);
});
test('habit schedules save selected weekdays and editing preserves its completion history',async t=>{
 const data=defaults();data.checks={'2026-11-14':{walk:true}};data.xp=20;const {page,errors}=await open(t,{raw:JSON.stringify(data),fixedTime:historyTime});await page.locator('[data-tab="habits"]').click();await page.locator('#addTask').click();
 await page.locator('#taskName').fill('Только суббота');await page.locator('#taskCategory').selectOption('sport');for(const day of await page.locator('#taskForm [data-weekday]').all())await day.uncheck();await page.locator('#taskForm [data-weekday][value="6"]').check();await page.locator('#taskForm [type="submit"]').click();await toast(page,'Привычка добавлена');
 const habit=page.locator('#habitList [data-task="'+await page.evaluate(()=>JSON.parse(localStorage.getItem('life-reset-v2')).tasks.at(-1).id)+'"]');assert.equal(await habit.count(),1);assert.ok(await page.locator('#tasks').textContent().then(t=>t.includes('Только суббота')));
 await page.locator('#habitList [data-edit-task]').last().click();await page.locator('#taskName').fill('Субботняя прогулка');await page.locator('#taskForm [type="submit"]').click();await toast(page,'Привычка изменена');const stored=JSON.parse(await saved(page));assert.deepEqual(stored.tasks.at(-1).days,[6]);assert.equal(stored.checks['2026-11-14'].walk,true);assert.deepEqual(errors,[]);
});
test('legacy categories migrate to sport, intellect and nutrition without changing checks or XP',async t=>{
 const data=defaults();data.tasks[0].cat='health';data.tasks[2].cat='growth';data.tasks[4].cat='finance';data.checks={'2026-11-13':{walk:true,learn:true,spend:true}};data.xp=60;const raw=JSON.stringify(data),{page}=await open(t,{raw,fixedTime:historyTime});
 assert.ok((await page.locator('#tasks').textContent()).includes('Спорт'));assert.ok((await page.locator('#tasks').textContent()).includes('Интеллект'));assert.equal((await saved(page)),raw);
 await page.locator('[data-tab="habits"]').click();await page.locator('#addTask').click();await page.locator('#taskName').fill('Новое');await page.locator('#taskForm [type="submit"]').click();await toast(page,'Привычка добавлена');const next=JSON.parse(await saved(page));assert.deepEqual(next.tasks.slice(0,5).map(t=>t.cat),['sport','sport','intellect','intellect','intellect']);assert.equal(next.checks['2026-11-13'].walk,true);assert.equal(next.xp,60);
});
test('goal date progress, editing and character selection survive reload without extra XP',async t=>{
 const {page,errors}=await open(t,{fixedTime:historyTime});await page.locator('[data-tab="goals"]').click();await page.locator('#addGoal').click();await page.locator('#goalName').fill('Прочитать книгу');await page.locator('#goalDue').fill('2026-11-24');await page.locator('#goalStart').fill('2026-11-04');await page.locator('#goalForm [type=submit]').click();await toast(page,'Цель добавлена');assert.ok((await page.locator('#goalList').textContent()).includes('10 дн.'));
 assert.equal(await page.locator('[data-goal-step]').count(),0);assert.equal(await page.locator('#goalList [role=progressbar]').getAttribute('aria-valuenow'),'50');await page.locator('[data-goal-edit]').click();await page.locator('#goalName').fill('Читать по главе');await page.locator('#goalForm [type=submit]').click();await toast(page,'Цель изменена');await page.waitForFunction(()=>!document.getElementById('goalDialog').open);
 await page.locator('[data-tab="dashboard"]').click();assert.equal(await page.locator('#dashboard #stats').count(),0);await page.locator('#avatarButton').click();await page.locator('#gender').selectOption('female');await toast(page,'Персонаж обновлён');assert.equal(await page.locator('#avatarDetail svg').getAttribute('data-gender'),'female');await page.locator('#closeStageDialog').click();await page.reload();assert.equal(await page.locator('#avatarButton svg').getAttribute('data-gender'),'female');
 await page.locator('[data-tab="progressView"]').click();assert.ok(!(await page.locator('#effortSummary').textContent()).includes('Шагов к целям'));assert.equal(JSON.parse(await saved(page)).xp,0);await page.locator('[data-tab="dashboard"]').click();await page.locator('#tasks [data-task="walk"]').check();await toast(page,'+20 XP');await page.locator('[data-tab="progressView"]').click();assert.ok((await page.locator('#effortSummary').textContent()).includes('1 маленькие действия'));assert.deepEqual(errors,[]);
 for(const width of [320,375,390,430]){await page.setViewportSize({width,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
});

test('habit actions align on small screens and goal dates handle missing and expired ranges',async t=>{
 const data=defaults();data.goals=[{id:'g',name:'Читаемое название',created:'2026-11-04',due:'2026-11-24',target:10,done:4}];const {page,errors}=await open(t,{raw:JSON.stringify(data),fixedTime:historyTime});
 await page.locator('[data-tab="habits"]').click();for(const width of [320,375,390,430]){await page.setViewportSize({width,height:740});const row=page.locator('.habit-row').first(),edit=await row.locator('.edit-habit').boundingBox(),del=await row.locator('.delete-action').boundingBox();assert.equal(edit.y,del.y);assert.equal(edit.height,del.height);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
 await page.locator('[data-tab="goals"]').click();const title=page.locator('.goal-name');assert.equal(await title.evaluate(e=>getComputedStyle(e).color),'rgb(244, 245, 247)');assert.equal(await title.evaluate(e=>getComputedStyle(e).fontSize),'16px');await title.click();assert.equal(await page.locator('#goalTarget,#goalDone').count(),0);await page.locator('#goalName').fill('Новое название');await page.locator('#goalForm [type=submit]').click();await toast(page,'Цель изменена');await page.waitForFunction(()=>!document.getElementById('goalDialog').open);let goal=JSON.parse(await saved(page)).goals[0];assert.equal(goal.done,4);assert.equal(goal.target,10);
 for(const [start,due,percent] of [['2026-11-14','2026-11-14','100'],['2026-11-01','2026-11-13','100'],['2026-11-20','2026-11-24','0'],['2026-11-14','',null]]){await page.locator('.goal-name').click();await page.locator('#goalStart').fill(start);await page.locator('#goalDue').fill(due);await page.locator('#goalForm [type=submit]').click();await toast(page,'Цель изменена');await page.waitForFunction(()=>!document.getElementById('goalDialog').open);if(percent===null)assert.equal(await page.locator('#goalList [role=progressbar]').count(),0);else assert.equal(await page.locator('#goalList [role=progressbar]').getAttribute('aria-valuenow'),percent)}assert.deepEqual(errors,[]);
});
test('missed habits deduct ten XP once after local midnight, respecting weekdays and completions',async t=>{
 const data=defaults();data.tasks=[{id:'walk',name:'Ходьба',cat:'sport',days:[0,1,2,3,4,5,6]},{id:'read',name:'Чтение по пятницам',cat:'intellect',days:[5]}];data.legacyXp=100;data.xp=120;data.checks={'2026-11-12':{walk:true}};data.penalties=newPenalty(data,'2026-11-12');
 const {page,errors}=await open(t,{raw:JSON.stringify(data),fixedTime:'2026-11-13T18:59:50Z'});assert.equal(await page.locator('#xp').textContent(),'120 XP');await page.locator('#tasks [data-task="walk"]').check();await toast(page,'+20 XP');assert.equal(await page.locator('#xp').textContent(),'140 XP');
 await page.clock.fastForward(11000);await page.waitForFunction(()=>document.getElementById('xp').textContent==='130 XP');let savedData=JSON.parse(await saved(page));assert.equal(savedData.penalties.missed,1);assert.equal(savedData.penalties.deducted,10);await page.reload();assert.equal(await page.locator('#xp').textContent(),'130 XP');await page.locator('[data-tab="progressView"]').click();assert.ok((await page.locator('#penaltySummary').textContent()).includes('−10 XP'));await page.locator('[data-tab="dashboard"]').click();await page.locator('#tasks [data-task="walk"]').check();await toast(page,'+20 XP');assert.equal(await page.locator('#xp').textContent(),'150 XP');assert.deepEqual(errors,[]);
});
test('activation preserves a v4 copy and does not charge its old omissions; offline catch-up is idempotent',async t=>{
 const data=defaults();data.version=4;delete data.penalties;data.tasks=data.tasks.slice(0,1);data.legacyXp=100;data.xp=100;const raw=JSON.stringify(data),{page,context}=await open(t,{raw,fixedTime:historyTime,serviceWorkers:'allow'});
 assert.equal(await page.locator('#xp').textContent(),'100 XP');assert.equal(await page.evaluate(()=>localStorage.getItem('life-reset-v2-before-0.9.0')),raw);assert.equal(JSON.parse(await saved(page)).penalties.since,'2026-11-14');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');await context.setOffline(true);await page.clock.fastForward(2*86400000);await page.waitForFunction(()=>document.getElementById('xp').textContent==='80 XP');await page.reload();assert.equal(await page.locator('#xp').textContent(),'80 XP');assert.equal(JSON.parse(await saved(page)).penalties.missed,2);
});
