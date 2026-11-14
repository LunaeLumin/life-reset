const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,devices}=require('playwright');
const https=require('node:https');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {KEY,UPGRADE_COPY,IMPORT_COPY,defaults}=require('../data.js');
const root=path.resolve(__dirname,'..');
const oldRef='d17a393806524b1791664bf043ce516c02c93e2f';
let browser,server,base,temp,serveOld=false;
before(async()=>{
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'life-reset-tests-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(temp,'key.pem'),'-out',path.join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 const oldHtml=execFileSync('git',['show',oldRef+':index.html'],{cwd:root});
 const oldSw=execFileSync('git',['show',oldRef+':sw.js'],{cwd:root});
 server=https.createServer({key:fs.readFileSync(path.join(temp,'key.pem')),cert:fs.readFileSync(path.join(temp,'cert.pem'))},(req,res)=>{
  const filename=new URL(req.url,'https://localhost').pathname.replace(/^\/life-reset\//,'')||'index.html';
  if(!['index.html','data.js','sw.js','manifest.webmanifest','icon.svg'].includes(filename)){res.writeHead(404);return res.end()}
  const body=serveOld&&filename==='index.html'?oldHtml:serveOld&&filename==='sw.js'?oldSw:fs.readFileSync(path.join(root,filename));
  const type=filename.endsWith('.js')?'text/javascript':filename.endsWith('.svg')?'image/svg+xml':filename.endsWith('.webmanifest')?'application/manifest+json':'text/html';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`https://127.0.0.1:${server.address().port}/life-reset/`;
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--ignore-certificate-errors']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(temp)fs.rmSync(temp,{recursive:true,force:true})});
async function open(t,{raw,fallback=false,serviceWorkers='block'}={}){
 const context=await browser.newContext({...devices['iPhone 13'],timezoneId:'Asia/Qyzylorda',ignoreHTTPSErrors:true,serviceWorkers});
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
test('v0.4 service worker updates to 0.4.1 and the new script loads offline with old data',async t=>{
 serveOld=true;t.after(()=>{serveOld=false});
 const {page,context,errors}=await open(t,{serviceWorkers:'allow'});
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.locator('#tasks [data-task="walk"]').check();await page.waitForFunction(()=>document.getElementById('xp').textContent==='20 XP');
 const before=JSON.parse(await saved(page));serveOld=false;
 await page.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;await reg.update()});
 await page.waitForFunction(async()=>(await caches.keys()).includes('life-reset-v4.1'));
 await page.waitForFunction(async()=>{const c=await caches.open('life-reset-v4.1');return !!(await c.match('./data.js'))});
 await page.reload();await page.waitForFunction(()=>document.querySelector('header .eyebrow').textContent.includes('0.4.1'));
 assert.deepEqual(JSON.parse(await saved(page)),before);
 await context.setOffline(true);await page.reload();assert.equal(await page.locator('#xp').textContent(),'20 XP');
 await page.locator('#tasks [data-task="move"]').check();await page.waitForFunction(()=>document.getElementById('xp').textContent==='40 XP');await page.reload();assert.equal(await page.locator('#xp').textContent(),'40 XP');assert.deepEqual(errors,[]);
});
