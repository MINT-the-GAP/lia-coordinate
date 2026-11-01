import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const assets=process.env.PROFILE_ASSETS||join(tmpdir(),'lia-coordinate-profile-assets');
const bundle=join(root,'dist/index.js');
const fixture=join(root,'tests/fixtures/dynamic-3d-segment6.html');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
assert.ok(existsSync(join(assets,'jsxgraph-template.js')),'Prepare browser assets first');
const initialFixture=readFileSync(fixture,'utf8')
 .replace('mode=3d;','mode=3d;view=2d;')
 .replace('raum;E;A;B;C;','raum;E;O;A;B;')
 .replace(/<span[^>]+id="[^"]+-spec-([^"]+)"[\s\S]*?<\/span>/g,
   (tag,uid)=>new Set(['o','a','b','v1','v2','e','sum']).has(uid)?tag:'');
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;const file=path==='/bundle.js'?bundle:path.startsWith('/assets/')?join(assets,path.slice(8)):fixture;try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(file===fixture?initialFixture:readFileSync(file))}catch(e){res.statusCode=404;res.end(String(e))}});
let proc,ws,profile;const pending=new Map();
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 const chrome=[process.env.CHROME_PATH,process.env.EDGE_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(x=>x&&existsSync(x));assert.ok(chrome,'No browser found');
 profile=mkdtempSync(join(tmpdir(),'lia-coordinate-segment6-'));proc=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--disable-background-networking','--remote-debugging-port=0','--window-size=1100,1000','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';proc.stderr.on('data',d=>stderr+=d);
 for(let i=0;i<120&&!existsSync(join(profile,'DevToolsActivePort'));i++)await sleep(100);assert.ok(existsSync(join(profile,'DevToolsActivePort')),'Chrome failed '+stderr);
 const debug=readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];const pages=await(await fetch('http://127.0.0.1:'+debug+'/json')).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let seq=0;const events=new Map();ws.addEventListener('close',()=>{for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('CDP closed '+stderr))}pending.clear()});ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const q=pending.get(m.id);pending.delete(m.id);clearTimeout(q?.timer);m.error?q?.reject(Error(JSON.stringify(m.error))):q?.resolve(m.result)}else for(const f of events.get(m.method)||[])f(m.params)});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),120000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 await send('Page.enable');await send('Runtime.enable');const loaded=new Promise(r=>events.set('Page.loadEventFired',[r]));await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});await loaded;await evaluate(`(async()=>{for(let i=0;i<240;i++){if(__points?.raum?.A&&__points?.raum?.B&&__linear3DEntries?.v1&&__linear3DEntries?.v2&&__plane3DEntries?.e&&__analytic3DEntries?.sum&&__boards?.raum?.containerObj?.querySelector('.lia-dgs-object-list-export'))return true;await new Promise(r=>setTimeout(r,50))}throw Error('initial 2D import timeout '+JSON.stringify({mode:__boards?.raum?.__liaSceneMode,points:Object.keys(__points?.raum||{}),lines:Object.keys(__linear3DEntries||{}),planes:Object.keys(__plane3DEntries||{}),analytic:Object.keys(__analytic3DEntries||{}),errors:profileErrors}))})()`);
 const inspect=()=>evaluate(`(()=>{const entry=__coordinateViews3d.raum,objects=[...entry.points,...entry.linearObjects,...entry.planeObjects],nodes=new Set(),seen=new Set();const visit=o=>{if(!o||typeof o!=='object'||seen.has(o))return;seen.add(o);if(o.rendNode)nodes.add(o.rendNode);for(const key of ['element2D','label','faces','borders','vertices','points','curves','aux2D','inherits']){const value=o[key];if(Array.isArray(value))value.forEach(visit);else visit(value)}};objects.forEach(visit);return {mode:__boards.raum.__liaSceneMode,view:entry.viewMode,points:entry.points.size,lines:entry.linearObjects.size,planes:entry.planeObjects.size,analytics:Object.values(__analytic3DEntries).filter(e=>e.boardId==='raum').length,nodeCount:nodes.size,visibleNodes:[...nodes].filter(n=>{const s=getComputedStyle(n);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0}).map(n=>n.id),errors:profileErrors.slice()}})()`);
 const initial=await inspect();
 assert.equal(initial.mode,'2d');assert.equal(initial.view,'2d');assert.equal(initial.points,3);assert.equal(initial.lines,3);assert.equal(initial.planes,1);assert.equal(initial.analytics,1);assert.ok(initial.nodeCount>0);assert.deepEqual(initial.visibleNodes,[],JSON.stringify(initial));assert.deepEqual(initial.errors,[]);
 assert.equal(await evaluate(`renderPoint3DFromSpec('initial2d-late','raum;D;1;1;1;objectid=late-d')`),true);
 const direct=await inspect();assert.equal(direct.mode,'2d');assert.equal(direct.points,4);assert.deepEqual(direct.visibleNodes,[],JSON.stringify(direct));
 const exported=await evaluate(`(()=>{const c=__boards.raum.containerObj,p=c.querySelector('.lia-dgs-object-list-panel');if(!p.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();c.querySelector('.lia-dgs-object-list-export').click();c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();return c.querySelector('.lia-dgs-export-textarea').value})()`);
 assert.match(exported,/mode=3d/);assert.match(exported,/view=2d/);assert.equal((exported.match(/@Punkt3D\(/g)||[]).length,4,exported);assert.equal((exported.match(/@Vektor3D\(/g)||[]).length,2,exported);assert.match(exported,/@Ebene3D\(/);assert.doesNotMatch(exported,/@Vektorsumme3D\(/);
 const afterExport=await inspect();assert.equal(afterExport.mode,'2d');assert.deepEqual(afterExport.visibleNodes,[],JSON.stringify(afterExport));assert.deepEqual(afterExport.errors,[]);
 await evaluate(`__boards.raum.containerObj.querySelectorAll('.lia-dgs-export-dialog .lia-dgs-angle-dialog-button')[1]?.click();__coord.setCoordinateViewMode(__coordinateViews3d.raum,'3d')`);
 const spatial=await inspect();assert.equal(spatial.mode,'3d');assert.ok(spatial.visibleNodes.length>0);assert.equal(spatial.points,4);assert.equal(spatial.lines,3);assert.equal(spatial.planes,1);assert.deepEqual(spatial.errors,[]);
 console.log(JSON.stringify({initial2DImport:true,immediateExport:true,hiddenIn2D:true,visibleAfterSwitch:true,points:spatial.points,lines:spatial.lines,planes:spatial.planes}));
}finally{ws?.close();proc?.kill();server.close();}
