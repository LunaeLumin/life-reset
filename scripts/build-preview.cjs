const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');

const VERSION=require('../package.json').version;
const PREVIEW_KEY='lr-preview-'+VERSION;
const CACHE_PREFIX=PREVIEW_KEY+'-';
const PREVIEW_PATH='/life-reset/preview/'+VERSION+'/';
const FILES=['index.html','data.js','progression.js','avatar.css','avatar-component.js','avatar-demo.html','sw.js','manifest.webmanifest','icon.svg'];

function replaceOnce(text,from,to){
 if(text.split(from).length!==2)throw new Error('Preview source changed: '+from);
 return text.replace(from,to);
}
function buildPreview(source,destination,sourceCommit){
 if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw new Error('A full source commit is required');
 const files=Object.fromEntries(FILES.map(file=>[file,fs.readFileSync(path.join(source,file),'utf8')]));
 const hashes=Object.fromEntries(FILES.map(file=>[file,crypto.createHash('sha256').update(files[file]).digest('hex')]));
 files['data.js']=replaceOnce(files['data.js'],"const KEY='life-reset-v2';",`const KEY='${PREVIEW_KEY}';`);
 files['sw.js']=replaceOnce(files['sw.js'],`const CACHE='life-reset-v${VERSION}';`,`const CACHE='${CACHE_PREFIX}v1';`);
 files['sw.js']=replaceOnce(files['sw.js'],"k.startsWith('life-reset-')",`k.startsWith('${CACHE_PREFIX}')`);
 // Limit offline lookups to this preview's cache, including the navigation fallback.
 files['sw.js']=files['sw.js'].replaceAll('caches.match(', 'matchOwn(');
 files['sw.js']+='\nfunction matchOwn(request){return caches.open(CACHE).then(cache=>cache.match(request))}\n';
 files['index.html']=replaceOnce(files['index.html'],'<title>Life Reset</title>',`<title>Life Reset — Тест ${VERSION}</title>`);
 files['index.html']=replaceOnce(files['index.html'],`PERSONAL OS · ${VERSION}`,`ТЕСТ · ${VERSION}`);
 files['index.html']=replaceOnce(files['index.html'],'<main>', `<main>\n<div class="card hint" id="previewNotice" role="note">Тестовая версия ${VERSION}. Данные здесь хранятся отдельно от основного Life Reset. Для проверки можно импортировать резервную копию. Изменения в тесте не переносятся в основное приложение.</div>`);
 const manifest=JSON.parse(files['manifest.webmanifest']);
 Object.assign(manifest,{id:'./',name:`Life Reset — Тест ${VERSION}`,short_name:'LR Тест',description:`Отдельная тестовая версия Life Reset ${VERSION}`});
 files['manifest.webmanifest']=JSON.stringify(manifest,null,2)+'\n';
 files['preview.json']=JSON.stringify({version:VERSION,sourceCommit,sourceHashes:hashes,storageKey:PREVIEW_KEY,cachePrefix:CACHE_PREFIX},null,2)+'\n';
 fs.mkdirSync(destination,{recursive:true});
 for(const [file,content] of Object.entries(files))fs.writeFileSync(path.join(destination,file),content);
 return files;
}
module.exports={buildPreview,PREVIEW_KEY,CACHE_PREFIX,VERSION,PREVIEW_PATH,FILES};
if(require.main===module){
 const destination=process.argv[2];
 if(!destination)throw new Error('Usage: node scripts/build-preview.cjs <destination>');
 const source=path.resolve(__dirname,'..');
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
 buildPreview(source,path.resolve(destination),commit);
 console.log('Preview built in '+path.resolve(destination));
}
