import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.PROFILE_ASSETS || join(tmpdir(), 'lia-coordinate-profile-assets');
const bundle = join(root, 'dist/index.js');
const fixture = join(root, 'tests/fixtures/dynamic-3d.html');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.ok(existsSync(join(assets, 'jsxgraph-template.js')), 'Prepare the browser assets first');

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path === '/bundle.js' ? bundle : path.startsWith('/assets/')
    ? join(assets, path.slice(8)) : fixture;
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.end(readFileSync(file));
  } catch (error) {
    res.statusCode = 404;
    res.end(String(error));
  }
});

let proc, ws, profile;
const pending = new Map();
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const chrome = [process.env.CHROME_PATH, process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
  assert.ok(chrome, 'No browser found; set CHROME_PATH or EDGE_PATH');
  profile = mkdtempSync(join(tmpdir(), 'lia-coordinate-3d-chrome-'));
  proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update',
    '--remote-debugging-port=0', '--window-size=1180,980', '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', data => { stderr += data; });
  for (let index = 0; index < 100; index += 1) {
    if (existsSync(join(profile, 'DevToolsActivePort'))) break;
    await sleep(100);
  }
  assert.ok(existsSync(join(profile, 'DevToolsActivePort')), 'Chrome failed to expose CDP: ' + stderr);
  const debug = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const pages = await (await fetch('http://127.0.0.1:' + debug + '/json')).json();
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let sequence = 0;
  const events = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request?.timer);
      if (message.error) request?.reject(Error(JSON.stringify(message.error)));
      else request?.resolve(message.result);
    } else {
      for (const listener of events.get(message.method) || []) listener(message.params);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(Error('CDP request timed out: ' + method + ' ' + String(params?.expression || '').slice(0, 180))), 60_000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const clickAt = async (position, button = 'left') => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: position[0], y: position[1] });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button, buttons: button === 'left' ? 1 : 2,
      x: position[0], y: position[1], clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button, buttons: 0,
      x: position[0], y: position[1], clickCount: 1 });
    await sleep(140);
  };
  const dragAt = async (from, to, modifiers = 0, inspectDuringDrag = null) => {
    if (modifiers & 8) await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16, modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0], y: from[1], modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1,
      x: from[0], y: from[1], clickCount: 1, modifiers });
    for (let step = 1; step <= 6; step += 1) {
      const ratio = step / 6;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, modifiers,
        x: from[0] + (to[0] - from[0]) * ratio, y: from[1] + (to[1] - from[1]) * ratio });
      if (step === 3 && inspectDuringDrag) await inspectDuringDrag();
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0,
      x: to[0], y: to[1], clickCount: 1, modifiers });
    if (modifiers & 8) await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 });
    await sleep(180);
  };
  const rightDragAt = async (from, to) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0], y: from[1] });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'right', buttons: 2,
      x: from[0], y: from[1], clickCount: 1 });
    for (let step = 1; step <= 6; step += 1) {
      const ratio = step / 6;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'right', buttons: 2,
        x: from[0] + (to[0] - from[0]) * ratio, y: from[1] + (to[1] - from[1]) * ratio });
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'right', buttons: 0,
      x: to[0], y: to[1], clickCount: 1 });
    await sleep(180);
  };


  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = new Promise(resolve => events.set('Page.loadEventFired', [resolve]));
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' });
  await loaded;
  await evaluate('profileReady()');
  await sleep(300);

  const initial = await evaluate(`(() => {
    const board=__boards.raum,entry=__coordinateViews3d.raum;
    window.initialView3D=entry.view;
    return {version:JXG.version,mode:board.__liaSceneMode,viewMode:entry.viewMode,
      projection:entry.projection,bounds:[entry.config.zmin,entry.config.zmax],
      points:Object.fromEntries(['A','B','C'].map(name=>{const p=__points.raum[name];return [name,[p.X(),p.Y(),p.Z(),!!p.__liaPoint3D]];})),
      controls:board.containerObj.querySelectorAll('.lia-coordinate-3d-controls').length,
      pointRegistry:entry.points.size,viewType:entry.view.elType||entry.view.constructor?.name,
      linearEntries:Object.fromEntries(Object.entries(__linear3DEntries||{}).filter(([key])=>key.startsWith('macro-')).map(([key,value])=>[key,{object:!!value.object,kind:value.object?.__liaLinear3DKind,free:!!value.object?.__liaLinear3DFreeVector}])),
      errors:profileErrors.slice()};
  })()`);
  assert.equal(initial.mode, '3d');
  assert.equal(initial.viewMode, '3d');
  assert.equal(initial.projection, 'parallel');
  assert.deepEqual(initial.bounds, [-6, 6]);
  assert.deepEqual(initial.points.A, [1, 2, 3, true]);
  assert.deepEqual(initial.points.B, [-2, 1, -2.5, true]);
  assert.deepEqual(initial.points.C, [0.5, -1, 0.25, true]);
  assert.equal(initial.controls, 1);
  assert.equal(initial.pointRegistry, 3);
  assert.equal(Object.keys(initial.linearEntries).length, 5, JSON.stringify(initial));
  assert.deepEqual(initial.errors, []);

  await evaluate(`(()=>{const c=__boards.raum.containerObj,top=c.querySelector('.lia-dgs-top-menu');if(top.dataset.open!=='1')c.querySelector('.lia-dgs-menu-button').click()})()`);
  await sleep(350);
  const modeTriggerTarget=await evaluate(`(()=>{const t=__boards.raum.containerObj.querySelector('.lia-coordinate-scene-mode-button'),r=t.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  await clickAt(modeTriggerTarget);
  assert.equal(await evaluate(`__boards.raum.containerObj.querySelector('.lia-coordinate-scene-mode-menu').dataset.open`),'1','mode trigger must receive a real pointer click');
  const threeDPointerTarget=await evaluate(`(()=>{const r=__boards.raum.containerObj.querySelector('.lia-coordinate-scene-mode-option[data-mode="3d"]').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  await clickAt(threeDPointerTarget);
  assert.equal(await evaluate(`__boards.raum.__liaSceneMode`),'3d','3D option must receive a real pointer click');
  await clickAt(modeTriggerTarget);
  const twoDPointerTarget=await evaluate(`(()=>{const c=__boards.raum.containerObj,m=c.querySelector('.lia-coordinate-scene-mode-menu'),r=m.querySelector('.lia-coordinate-scene-mode-option[data-mode="2d"]').getBoundingClientRect();return {open:m.dataset.open,point:[r.left+r.width/2,r.top+r.height/2]}})()`);
  assert.equal(twoDPointerTarget.open,'1');
  await clickAt(twoDPointerTarget.point);
  assert.equal(await evaluate(`__boards.raum.__liaSceneMode`),'2d','2D option must receive a real pointer click');
  await evaluate(`__boards.raum.containerObj.querySelector('.lia-coordinate-scene-mode-option[data-mode="3d"]').click()`);
  const ui = await evaluate(`(() => {
    const board=__boards.raum,c=board.containerObj,entry=__coordinateViews3d.raum;
    const modeControl=c.querySelector('.lia-coordinate-3d-controls');
    const trigger=modeControl.querySelector('.lia-coordinate-scene-mode-button');trigger.click();
    const modeMenu=c.querySelector('.lia-coordinate-scene-mode-menu'),modeMenuRect=modeMenu.getBoundingClientRect();
    const options=[...modeMenu.querySelectorAll('.lia-coordinate-scene-mode-option')];
    const modeControlInfo={buttons:modeControl.querySelectorAll('.lia-coordinate-scene-mode-button').length,
      triggerIcon:!!trigger.querySelector('svg'),triggerText:trigger.textContent,triggerLabel:trigger.getAttribute('aria-label'),menuOpen:modeMenu.dataset.open,
      menuSize:[modeMenuRect.width,modeMenuRect.height],options:options.length,optionIcons:options.some(button=>!!button.querySelector('svg')),
      optionTexts:options.map(button=>button.textContent),optionPositions:options.map(button=>{const r=button.getBoundingClientRect();return {top:r.top,bottom:r.bottom}}),
      active:options.filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset.mode)};
    trigger.click();
    const shapeGroups=[
      ['.lia-dgs-polygon-button','Ebenen und Flächen',5],
      ['.lia-dgs-round2d-button','Kreise im Raum',2],
      ['.lia-dgs-plane3d-button','3D-Prismen',4],
      ['.lia-dgs-solid3d-button','3D-Spitzkörper',3],
      ['.lia-dgs-round3d-button','3D-Kugeln',3]
    ].map(([selector,title,count])=>{const parent=c.querySelector(selector);parent.click();const menu=c.querySelector('.lia-dgs-shape-submenu');
      const rect=menu.getBoundingClientRect(),sections=[...menu.querySelectorAll('.lia-dgs-tool-section')].filter(section=>!section.hidden)
        .map(section=>({title:section.querySelector('h3')?.textContent,items:section.querySelectorAll('button:not([hidden])').length}));
      const visibleTools=[...menu.querySelectorAll('.lia-dgs-geometry-tool')].filter(tool=>!tool.hidden&&!tool.closest('.lia-dgs-tool-section').hidden);
      const uniqueIcons=new Set(visibleTools.map(tool=>tool.querySelector('svg')?.innerHTML)).size;
      parent.click();return {selector,title,count,defaultTool:parent.dataset.dgsPreferredToolId,size:[rect.width,rect.height],sections,uniqueIcons};});
    const shapeSelections=['.lia-dgs-polygon-button','.lia-dgs-round2d-button','.lia-dgs-plane3d-button',
      '.lia-dgs-solid3d-button','.lia-dgs-round3d-button'].map(selector=>{
      const parent=c.querySelector(selector);parent.click();const tools=[...c.querySelectorAll('.lia-dgs-shape-submenu .lia-dgs-geometry-tool')]
        .filter(tool=>!tool.hidden&&!tool.closest('.lia-dgs-tool-section').hidden),tool=tools[1]||tools[0];tool.click();
      return {selector,selected:tool.dataset.dgsToolId,current:parent.dataset.dgsCurrentToolId,icon:!!parent.querySelector('svg')};
    });
    const solidParent=c.querySelector('.lia-dgs-solid3d-button');solidParent.click();
    const solidIcons=[...c.querySelectorAll('.lia-dgs-tool-section[data-dgs-shape-group="solids"] .lia-dgs-geometry-tool svg')]
      .map(icon=>icon.innerHTML);
    const groupedSolidIcons=[...c.querySelectorAll('.lia-dgs-tool-section[data-dgs-shape-group=prisms] .lia-dgs-geometry-tool svg,.lia-dgs-tool-section[data-dgs-shape-group=pointed] .lia-dgs-geometry-tool svg')]
      .map(icon=>icon.innerHTML);
    [...c.querySelectorAll('.lia-dgs-shape-submenu .lia-dgs-geometry-tool')].find(tool=>!tool.hidden&&!tool.closest('.lia-dgs-tool-section').hidden&&tool.dataset.dgsToolId===solidParent.dataset.dgsCurrentToolId)?.click();
    const relationButton=c.querySelector('.lia-dgs-orthogonal-button');relationButton.click();
    const relationMenu=c.querySelector('.lia-dgs-relation-submenu'),relationRect=relationMenu.getBoundingClientRect();
    const relation={size:[relationRect.width,relationRect.height],current:relationButton.dataset.dgsCurrentToolId,sections:[...relationMenu.querySelectorAll('.lia-dgs-tool-section')]
      .filter(section=>!section.hidden).map(section=>section.querySelector('h3')?.textContent)};relationButton.click();
    const advancedButton=c.querySelector('.lia-dgs-segment6-button');advancedButton.click();
    const advancedMenu=c.querySelector('.lia-dgs-segment6-submenu');
    const advancedItems=[...advancedMenu.querySelectorAll('.lia-dgs-segment6-action')];
    const advanced={open:advancedMenu.dataset.open,items:advancedItems.length,
      consistent:advancedItems.every(button=>button.classList.contains('lia-dgs-geometry-tool')),
      uniqueIcons:new Set(advancedItems.map(button=>button.querySelector('svg')?.innerHTML)).size,
      has2DTransfer:advancedItems.some(button=>/2D-Graph|2D graph/.test(button.textContent||''))};
    relationButton.click();
    const exclusiveAfterRelation=advancedMenu.dataset.open==='0'&&relationMenu.dataset.open==='1';
    trigger.click();
    const exclusiveAfterMode=relationMenu.dataset.open==='0'&&modeMenu.dataset.open==='1';
    trigger.click();
    const rects=[...c.querySelectorAll('.lia-dgs-top-menu > button:not([hidden]),.lia-dgs-top-menu > .lia-coordinate-3d-controls:not([hidden])')]
      .map(button=>button.getBoundingClientRect()).sort((a,b)=>a.left-b.left);
    const noOverlap=rects.every((rect,index)=>index===rects.length-1||rect.right<=rects[index+1].left+.5);
    const defaultBoxHidden=Object.entries(entry.view.defaultAxes||{}).filter(([key])=>key!=='O')
      .every(([,object])=>{const p=object?.visProp||{},q=object?.element2D?.visProp||{};return p.visible===false||((p.strokeopacity??0)===0&&(p.fillopacity??0)===0&&
          (!object.element2D||q.visible===false||((q.strokeopacity??0)===0&&(q.fillopacity??0)===0)));});
    const toolbarOrder=['.lia-dgs-select-button','.lia-dgs-construction-color-button','.lia-dgs-point-button',
      '.lia-dgs-segment-button','.lia-dgs-orthogonal-button','.lia-dgs-polygon-button','.lia-dgs-round2d-button',
      '.lia-dgs-plane3d-button','.lia-dgs-solid3d-button',
      '.lia-dgs-round3d-button','.lia-dgs-angle-button','.lia-dgs-root-button','.lia-coordinate-3d-controls']
      .map(selector=>({selector,left:c.querySelector(selector)?.getBoundingClientRect().left||0}));
    return {topParent:!!modeControl.closest('.lia-dgs-top-menu-end'),singleControl:c.querySelectorAll('.lia-coordinate-3d-controls').length,
      bottomControls:c.querySelectorAll(':scope > .lia-coordinate-3d-controls:not([hidden])').length,
      modeControlInfo,shapeGroups,shapeSelections,relation,toolbarOrder,advanced,exclusiveAfterRelation,exclusiveAfterMode,
      subtitlesHidden:[...c.querySelectorAll('.lia-dgs-sectioned-submenu .lia-dgs-tool-section-title')]
        .every(title=>getComputedStyle(title).display==='none'),
      separator:(()=>{const style=getComputedStyle(modeControl,'::before'),reference=getComputedStyle(c.querySelector('.lia-dgs-tools-divider'));
        const modeRect=modeControl.getBoundingClientRect(),previous=Array.from(c.querySelectorAll('.lia-dgs-top-menu > button:not([hidden])')).filter(node=>node!==modeControl)
          .map(node=>node.getBoundingClientRect()).filter(rect=>rect.width>0&&rect.right<=modeRect.left).sort((a,b)=>b.right-a.right)[0];
        return {width:style.width,height:style.height,top:style.top,gap:previous?modeRect.left-previous.right:null,
          radius:style.borderRadius,border:style.borderLeftWidth,background:style.backgroundColor,reference:reference.backgroundColor};})(),
      solidIconCount:groupedSolidIcons.length,uniqueSolidIcons:new Set(groupedSolidIcons).size,
      noOverlap,defaultBoxHidden,
      decorationCanvas:(()=>{
        const canvas=c.querySelector('.lia-coordinate-3d-decoration-canvas'),context=canvas?.getContext('2d');
        if(!canvas||!context)return {present:false,width:0,height:0,ink:0};
        const data=context.getImageData(0,0,canvas.width,canvas.height).data;let ink=0;
        for(let index=3;index<data.length;index+=64)if(data[index]>0)ink+=1;
        return {present:true,width:canvas.width,height:canvas.height,ink};
      })(),
      decorations:[...entry.decorations].map(object=>({color:object.visProp?.strokecolor,width:object.visProp?.strokewidth,
        opacity:object.visProp?.strokeopacity,type:object.elType})),
      visibleMetricValues:entry.__liaCoordinate3DVisibleMetricValues.map(values=>values.slice()),
      visibleGridValues:entry.__liaCoordinate3DVisibleGridValues.map(values=>values.slice()),
      spatialGrid:{...entry.__liaCoordinate3DSpatialGrid,
        countsByAxis:entry.__liaCoordinate3DSpatialGrid.countsByAxis.slice()},
      planarHidden:board.defaultAxes?.x?.visProp?.visible===false&&board.defaultAxes?.x?.defaultTicks?.visProp?.visible===false,
      helperPointsHidden:[...entry.decorations].filter(object=>object.elType==='line3d').every(object=>
        [object.point,object.point1,object.point2].every(point=>!point||point.visProp?.visible===false)),
      metricLabelOffsets:[...entry.decorations].filter(object=>object.elType==='text3d')
        .map(object=>object.element2D?.visProp?.offset),
      numericMetricLabels:[...entry.decorations].filter(object=>object.elType==='text3d')
        .map(object=>String(object.element2D?.plaintext??'').trim()),
      longNumericLabels:[...entry.decorations].filter(object=>object.elType==='text3d')
        .map(object=>String(object.element2D?.plaintext??'').trim()).filter(value=>/-?\d+\.\d{6,}/.test(value)),
      errors:profileErrors.slice()};
  })()`);
  assert.equal(ui.topParent,true,JSON.stringify(ui));
  assert.equal(ui.singleControl,1,JSON.stringify(ui));
  assert.equal(ui.bottomControls,0,JSON.stringify(ui));
  assert.equal(ui.modeControlInfo.buttons,1,JSON.stringify(ui));
  assert.equal(ui.modeControlInfo.triggerIcon,false,JSON.stringify(ui));
  assert.equal(ui.modeControlInfo.triggerText,'3D',JSON.stringify(ui));
  assert.match(ui.modeControlInfo.triggerLabel,/3D/,JSON.stringify(ui));
  assert.equal(ui.modeControlInfo.menuOpen,'1',JSON.stringify(ui));
  assert.equal(ui.modeControlInfo.options,2,JSON.stringify(ui));
  assert.equal(ui.modeControlInfo.optionIcons,false,JSON.stringify(ui));
  assert.deepEqual(ui.modeControlInfo.optionTexts,['2D','3D'],JSON.stringify(ui));
  assert.ok(ui.modeControlInfo.optionPositions[1].top>=ui.modeControlInfo.optionPositions[0].bottom,JSON.stringify(ui));
  assert.deepEqual(ui.modeControlInfo.active,['3d'],JSON.stringify(ui));
  assert.ok(ui.modeControlInfo.menuSize[0]<=70&&ui.modeControlInfo.menuSize[1]<=120,JSON.stringify(ui));
  assert.deepEqual(ui.shapeGroups.map(group=>group.sections.map(section=>section.title)),
    [['Ebenen und Flächen'],['Kreise im Raum'],['3D-Prismen'],['3D-Spitzkörper'],['3D-Kugeln']],JSON.stringify(ui));
  assert.deepEqual(ui.shapeGroups.map(group=>group.sections[0]?.items),[5,2,4,3,3],JSON.stringify(ui));
  assert.deepEqual(ui.shapeGroups.map(group=>group.uniqueIcons),[5,2,4,3,3],JSON.stringify(ui));
  assert.deepEqual(ui.shapeGroups.map(group=>group.defaultTool),['550','580','655','652','600'],JSON.stringify(ui));
  assert.ok(ui.shapeGroups.every(group=>group.size[0]<=370&&group.size[1]<650),JSON.stringify(ui));
  assert.ok(ui.shapeSelections.every(selection=>selection.selected===selection.current&&selection.icon),JSON.stringify(ui));
  assert.ok(ui.relation.size[0]<=370&&ui.relation.size[1]<650,JSON.stringify(ui));
  assert.equal(ui.relation.sections.length,1,JSON.stringify(ui));
  assert.equal(ui.relation.current,'484',JSON.stringify(ui));
  assert.ok(ui.toolbarOrder.every((entry,index,array)=>index===0||entry.left>array[index-1].left),JSON.stringify(ui));
  assert.deepEqual(ui.advanced,{open:'1',items:6,consistent:true,uniqueIcons:6,has2DTransfer:false},JSON.stringify(ui));
  assert.equal(ui.exclusiveAfterRelation,true,JSON.stringify(ui));
  assert.equal(ui.exclusiveAfterMode,true,JSON.stringify(ui));
  assert.equal(ui.subtitlesHidden,true,JSON.stringify(ui));
  assert.equal(ui.separator.width,'2px',JSON.stringify(ui));
  assert.equal(ui.separator.height,'44px',JSON.stringify(ui));
  assert.equal(ui.separator.top,'-4.5px',JSON.stringify(ui));
  assert.ok(ui.separator.gap>=7,JSON.stringify(ui));
  assert.equal(ui.separator.radius,'999px',JSON.stringify(ui));
  assert.equal(ui.separator.border,'0px',JSON.stringify(ui));
  assert.equal(ui.separator.background,ui.separator.reference,JSON.stringify(ui));
  assert.deepEqual([ui.solidIconCount,ui.uniqueSolidIcons],[7,7],JSON.stringify(ui));
  assert.equal(ui.noOverlap,true,JSON.stringify(ui));
  assert.equal(ui.defaultBoxHidden,true,JSON.stringify(ui));
  assert.ok(ui.decorationCanvas.present&&ui.decorationCanvas.width>100&&ui.decorationCanvas.height>100&&ui.decorationCanvas.ink>20,JSON.stringify(ui));
  assert.equal(ui.planarHidden,true,JSON.stringify(ui));
  assert.equal(ui.helperPointsHidden,true,JSON.stringify(ui));
  assert.deepEqual(ui.longNumericLabels,[],JSON.stringify(ui));
  assert.ok(ui.metricLabelOffsets.length>=6&&ui.metricLabelOffsets.every(offset=>Array.isArray(offset)&&Math.hypot(...offset)>=18),JSON.stringify(ui));
  assert.ok(ui.numericMetricLabels.some(value=>value.charCodeAt(0)===8722),JSON.stringify(ui));
  assert.ok(ui.numericMetricLabels.length>=6&&ui.numericMetricLabels.every(value=>/^-?\d+(?:\.\d{1,2})?$/.test(value.replace(String.fromCharCode(8722),'-'))),JSON.stringify(ui));
  assert.deepEqual(ui.decorations.slice(0,6).map(item=>item.color),['#ff00ff','#ff00ff','#00ffff','#00ffff','#ffff00','#ffff00']);
  assert.ok(ui.decorations.slice(0,6).every(item=>item.width>=2&&item.opacity>=.95),JSON.stringify(ui));
  const gridDecorations=ui.decorations.filter(item=>item.type==='line3d');
  assert.ok(gridDecorations.length>18,JSON.stringify(ui));
  assert.ok(gridDecorations.every(item=>item.width>=.5&&item.width<=.6&&item.opacity>=.3&&item.opacity<=.35),JSON.stringify(ui));
  assert.deepEqual([...new Set(gridDecorations.map(item=>item.color))].sort(),['#00ffff','#ff00ff','#ffff00']);
  assert.deepEqual(ui.visibleGridValues,ui.visibleMetricValues.map(values=>values.filter(value=>value!==0)),JSON.stringify(ui));
  const zero=values=>values.some(value=>value===0)?1:0;
  const expectedGridCounts=[
    ui.visibleMetricValues[1].length*ui.visibleMetricValues[2].length-zero(ui.visibleMetricValues[1])*zero(ui.visibleMetricValues[2]),
    ui.visibleMetricValues[0].length*ui.visibleMetricValues[2].length-zero(ui.visibleMetricValues[0])*zero(ui.visibleMetricValues[2]),
    ui.visibleMetricValues[0].length*ui.visibleMetricValues[1].length-zero(ui.visibleMetricValues[0])*zero(ui.visibleMetricValues[1])
  ];
  const expectedOffMain=
    ui.visibleMetricValues[1].filter(value=>value!==0).length*ui.visibleMetricValues[2].filter(value=>value!==0).length+
    ui.visibleMetricValues[0].filter(value=>value!==0).length*ui.visibleMetricValues[2].filter(value=>value!==0).length+
    ui.visibleMetricValues[0].filter(value=>value!==0).length*ui.visibleMetricValues[1].filter(value=>value!==0).length;
  assert.deepEqual(ui.spatialGrid.countsByAxis,expectedGridCounts,JSON.stringify(ui));
  assert.equal(ui.spatialGrid.worldLineCount,expectedGridCounts.reduce((sum,value)=>sum+value,0),JSON.stringify(ui));
  assert.equal(ui.spatialGrid.offMainPlaneLineCount,expectedOffMain,JSON.stringify(ui));
  assert.ok(ui.spatialGrid.offMainPlaneLineCount>0&&ui.spatialGrid.renderedLineCount>18,JSON.stringify(ui));
  assert.deepEqual(ui.errors,[]);

  const visibleAxisMetrics = await evaluate(`(async() => {
    const board=__boards.raum,c=board.containerObj,entry=__coordinateViews3d.raum;
    const objectListButton=c.querySelector('.lia-dgs-object-list-button');
    const objectListPanel=c.querySelector('.lia-dgs-object-list-panel');
    if(objectListPanel.dataset.open!=='1')objectListButton.click();
    await new Promise(resolve=>setTimeout(resolve,360));
    const canvas=entry.decorationCanvas,containerRect=c.getBoundingClientRect();
    const topMenu=c.querySelector('.lia-dgs-top-menu'),topRect=topMenu.getBoundingClientRect();
    const panelRect=objectListPanel.getBoundingClientRect();
    const open={
      bounds:{...entry.__liaCoordinate3DVisibleBounds},
      ranges:entry.__liaCoordinate3DVisibleAxisRanges.map(range=>range.slice()),
      values:entry.__liaCoordinate3DVisibleMetricValues.map(values=>values.slice()),
      topBottom:topRect.bottom-containerRect.top,
      panelLeft:panelRect.left-containerRect.left,
      canvasWidth:canvas.clientWidth
    };
    objectListButton.click();
    await new Promise(resolve=>setTimeout(resolve,360));
    return {open,closedBounds:{...entry.__liaCoordinate3DVisibleBounds}};
  })()`);
  assert.ok(visibleAxisMetrics.open.bounds.top>=visibleAxisMetrics.open.topBottom+5,JSON.stringify(visibleAxisMetrics));
  assert.ok(visibleAxisMetrics.open.bounds.right<=visibleAxisMetrics.open.panelLeft-5,JSON.stringify(visibleAxisMetrics));
  assert.ok(visibleAxisMetrics.closedBounds.right>visibleAxisMetrics.open.bounds.right+100,JSON.stringify(visibleAxisMetrics));
  visibleAxisMetrics.open.ranges.forEach((range,index)=>{
    const values=visibleAxisMetrics.open.values[index];
    assert.ok(values.length>=4,JSON.stringify({index,range,values,visibleAxisMetrics}));
    const gaps=values.slice(1).map((value,offset)=>value-values[offset]);
    const step=Math.max(...gaps);
    assert.ok(values[0]<=range[0]+step+1e-8&&values.at(-1)>=range[1]-step-1e-8,
      JSON.stringify({index,range,values,step,visibleAxisMetrics}));
  });


  const realModeSwitch = await evaluate(`(() => {
    const board=__boards.raum,c=board.containerObj,entry=__coordinateViews3d.raum;
    const sampleLabel=[...entry.points].map(point=>point.label).find(Boolean);
    c.querySelector('[aria-label="2D-Ansicht"]').click();
    const twoD={scene:board.__liaSceneMode,view:entry.viewMode,axis:board.defaultAxes.x.visProp.visible,
      spatialLabelHidden:!sampleLabel||sampleLabel.visProp.visible===false,
      ticks:board.defaultAxes.x.defaultTicks.visProp.visible,grid:board.__liaMajorGrid.visProp.visible,
      decorations:[...entry.decorations].every(object=>(object.element2D||object).visProp.visible===false),
      relationSections:[...c.querySelectorAll('.lia-dgs-relation-submenu .lia-dgs-tool-section')].map(section=>section.hidden),
      planarHeadingsHidden:[c.querySelector('.lia-dgs-relation-submenu .lia-dgs-tool-section:first-child'),c.querySelector('.lia-dgs-shape-submenu .lia-dgs-tool-section[data-dgs-shape-group=angular2d]')].every(section=>getComputedStyle(section.querySelector('.lia-dgs-tool-section-title')).display==='none'&&getComputedStyle(section).borderTopWidth==='0px'),
      shapeParents:['.lia-dgs-polygon-button','.lia-dgs-round2d-button','.lia-dgs-plane3d-button','.lia-dgs-round3d-button','.lia-dgs-solid3d-button'].map(selector=>c.querySelector(selector).hidden),
      advanced:c.querySelector('.lia-dgs-segment6-button').hidden,
      pressed:[...c.querySelectorAll('.lia-coordinate-scene-mode-option')].map(button=>button.getAttribute('aria-pressed'))};
    c.querySelector('[aria-label="3D-Ansicht"]').click();
    const threeD={scene:board.__liaSceneMode,view:entry.viewMode,axis:board.defaultAxes.x.visProp.visible,
      spatialLabelVisible:!sampleLabel||sampleLabel.visProp.visible!==false,
      ticks:board.defaultAxes.x.defaultTicks.visProp.visible,grid:board.__liaMajorGrid.visProp.visible,
      decorations:[...entry.decorations].every(object=>(object.element2D||object).visProp.visible===true),
      relationSections:[...c.querySelectorAll('.lia-dgs-relation-submenu .lia-dgs-tool-section')].map(section=>section.hidden),
      shapeParents:['.lia-dgs-polygon-button','.lia-dgs-round2d-button','.lia-dgs-plane3d-button','.lia-dgs-round3d-button','.lia-dgs-solid3d-button'].map(selector=>c.querySelector(selector).hidden),
      advanced:c.querySelector('.lia-dgs-segment6-button').hidden,
      pressed:[...c.querySelectorAll('.lia-coordinate-scene-mode-option')].map(button=>button.getAttribute('aria-pressed'))};
    return {twoD,threeD,errors:profileErrors.slice()};
  })()`);
  assert.deepEqual(realModeSwitch.twoD,{scene:'2d',view:'2d',axis:true,spatialLabelHidden:true,ticks:true,grid:true,decorations:true,
    relationSections:[false,true],planarHeadingsHidden:true,shapeParents:[false,false,true,true,true],advanced:true,pressed:['true','false']});
  assert.deepEqual(realModeSwitch.threeD,{scene:'3d',view:'3d',axis:false,spatialLabelVisible:true,ticks:false,grid:false,decorations:true,
    relationSections:[true,false],shapeParents:[false,false,false,false,false],advanced:false,pressed:['false','true']});
  assert.deepEqual(realModeSwitch.errors,[]);


  const toggles = await evaluate(`(() => {
    const board=__boards.raum,c=board.containerObj;
    for(let i=0;i<20;i++){c.querySelector('[aria-label="2D-Ansicht"]').click();c.querySelector('[aria-label="3D-Ansicht"]').click();}
    const e=__coordinateViews3d.raum;
    return {sameView:e.view===initialView3D,mode:e.viewMode,controls:c.querySelectorAll('.lia-coordinate-3d-controls').length,
      pointRegistry:e.points.size,coords:['A','B','C'].map(n=>[__points.raum[n].X(),__points.raum[n].Y(),__points.raum[n].Z()]),
      errors:profileErrors.slice()};
  })()`);
  assert.equal(toggles.sameView, true);
  assert.equal(toggles.mode, '3d');
  assert.equal(toggles.controls, 1);
  assert.equal(toggles.pointRegistry, 3);
  assert.deepEqual(toggles.coords, [[1,2,3],[-2,1,-2.5],[0.5,-1,0.25]]);
  assert.deepEqual(toggles.errors, []);

  const views = await evaluate(`(() => {
    const c=__boards.raum.containerObj,entry=__coordinateViews3d.raum;
    __coord.setCoordinateCamera(entry,{azimuth:Math.PI/2,elevation:0,bank:0});
    const xz={mode:entry.viewMode,camera:{...entry.camera},coords:[__points.raum.A.X(),__points.raum.A.Y(),__points.raum.A.Z()]};
    __coord.setCoordinateCamera(entry,{azimuth:0,elevation:Math.PI/2,bank:0});
    const xy={mode:entry.viewMode,saved:{...entry.camera},active:[entry.view.az_slide.Value(),entry.view.el_slide.Value()]};
    c.querySelector('[aria-label="3D-Ansicht"]').click();
    const restored={mode:entry.viewMode,active:[entry.view.az_slide.Value(),entry.view.el_slide.Value()]};
    __coord.setCoordinateCamera(entry,{azimuth:0,elevation:0,bank:0});
    const yz={mode:entry.viewMode,camera:{...entry.camera}};
    __coord.setCoordinateCamera(entry,entry.config.camera);
    __coord.setCoordinateProjection(entry,'central');
    return {xz,xy,restored,yz,projection:entry.projection,coords:[__points.raum.A.X(),__points.raum.A.Y(),__points.raum.A.Z()]};
  })()`);
  assert.equal(views.xz.mode, '3d');
  assert.ok(Math.abs(views.xz.camera.azimuth - Math.PI / 2) < 1e-8 && Math.abs(views.xz.camera.elevation) < 1e-8);
  assert.equal(views.xy.mode, '3d');
  assert.ok(Math.abs(views.xy.saved.azimuth) < 1e-8 && Math.abs(views.xy.saved.elevation - Math.PI / 2) < 1e-8);
  assert.ok(Math.abs(views.xy.active[0]) < 1e-8 && Math.abs(views.xy.active[1] - Math.PI / 2) < 1e-8);
  assert.equal(views.restored.mode, '3d');
  assert.ok(Math.abs(views.restored.active[0]) < 1e-8 && Math.abs(views.restored.active[1] - Math.PI / 2) < 1e-8);
  assert.equal(views.yz.mode, '3d');
  assert.ok(Math.abs(views.yz.camera.azimuth) < 1e-8 && Math.abs(views.yz.camera.elevation) < 1e-8);
  assert.equal(views.projection, 'central');
  assert.deepEqual(views.coords, [1,2,3]);

  await evaluate(`__coord.setCoordinateCamera(__coordinateViews3d.raum,__coordinateViews3d.raum.config.camera)`);
  await sleep(180);
  const beforeXY = await evaluate(`[__points.raum.A.X(),__points.raum.A.Y(),__points.raum.A.Z()]`);
  const fromXY = await evaluate('pointScreen("A")');
  await dragAt(fromXY, [fromXY[0] + 55, fromXY[1] + 30]);
  const afterXY = await evaluate(`[__points.raum.A.X(),__points.raum.A.Y(),__points.raum.A.Z()]`);
  const afterXYScreen = await evaluate('pointScreen("A")');
  assert.ok(Math.hypot(afterXY[0]-beforeXY[0], afterXY[1]-beforeXY[1]) > 0.1, JSON.stringify({beforeXY,afterXY}));
  assert.ok(Math.abs(afterXY[2]-beforeXY[2]) < 1e-8, JSON.stringify({beforeXY,afterXY}));
  assert.ok(Math.hypot(
    afterXYScreen[0] - fromXY[0] - 55,
    afterXYScreen[1] - fromXY[1] - 30
  ) < .75, JSON.stringify({fromXY,afterXYScreen}));

  const fromZ = await evaluate('pointScreen("A")');
  let guideVisible = false;
  await dragAt(fromZ, [fromZ[0], fromZ[1] - 75], 8, async () => {
    guideVisible = await evaluate(`!!__boards.raum.containerObj.querySelector('.lia-coordinate-z-drag-guide')`);
  });
  const afterZ = await evaluate(`[__points.raum.A.X(),__points.raum.A.Y(),__points.raum.A.Z()]`);
  assert.equal(guideVisible, true, 'Shift drag must show the Z-axis guide');
  assert.ok(Math.abs(afterZ[2]-afterXY[2]) > 0.1, JSON.stringify({afterXY,afterZ}));
  assert.ok(Math.hypot(afterZ[0]-afterXY[0],afterZ[1]-afterXY[1]) < 1e-6, JSON.stringify({afterXY,afterZ}));
  assert.equal(await evaluate(`!!__boards.raum.containerObj.querySelector('.lia-coordinate-z-drag-guide')`), false);

  await clickAt(await evaluate('pointScreen("A")'), 'right');
  const exact = await evaluate(`(() => {
    const c=__boards.raum.containerObj;
    const input=axis=>c.querySelector('.lia-dgs-coordinate-input[aria-label="'+axis+'-Koordinate"]');
    const zInitiallyVisible=!!input('z')&&!input('z').parentElement.hidden;
    const coordinateRects=['x','y','z'].map(axis=>input(axis).parentElement.getBoundingClientRect());
    const coordinateStacked=coordinateRects[1].top>=coordinateRects[0].bottom-.5&&coordinateRects[2].top>=coordinateRects[1].bottom-.5;
    const coordinateColumns=getComputedStyle(input('x').closest('.lia-dgs-coordinate-row')).gridTemplateColumns;
    input('x').value='1.25';input('y').value='-2.5';input('z').value='4.75';
    input('z').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    const name=c.querySelector('.lia-dgs-name-input');name.value='Q';name.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    const fixed=[...c.querySelectorAll('.lia-dgs-context-option')].find(x=>!x.hidden&&x.textContent.includes('Fixieren'))?.querySelector('input');
    if(fixed){fixed.checked=true;fixed.dispatchEvent(new Event('change',{bubbles:true}));}
    const line=c.querySelector('.lia-dgs-color-button[data-color-kind="line"]');line?.click();
    const hex=c.querySelector('.lia-dgs-color-hex');if(hex){hex.value='#7b1fa2';hex.dispatchEvent(new Event('change',{bubbles:true}));}
    const coordinates=[...c.querySelectorAll('.lia-dgs-context-option')].find(x=>!x.hidden&&x.textContent.includes('Koordinaten anzeigen'))?.querySelector('input');
    if(coordinates){coordinates.checked=true;coordinates.dispatchEvent(new Event('change',{bubbles:true}));}
    const p=__points.raum.Q||__points.raum.A;
    return {exists:!!p,renamed:!!__points.raum.Q,alias:__points.raum.A===p,context:c.querySelector('.lia-dgs-side-menu')?.className||'',
      inputValues:[input('x')?.value,input('y')?.value,input('z')?.value],coords:p?[p.X(),p.Y(),p.Z()]:null,
      fixed:p?!!p.getAttribute('fixed'):false,color:p?.element2D?.visProp?.strokecolor||p?.visProp?.strokecolor||p?.__liaPointVisual?.color,
      zInitiallyVisible,zVisible:!!input('z')&&!input('z').parentElement.hidden,coordinateStacked,coordinateColumns,point3d:!!p?.__liaPoint3D,
      coordinatesShown:p?.__liaDgsShowValue===true,
      inputCount:c.querySelectorAll('.lia-dgs-coordinate-input[aria-label="z-Koordinate"]').length,errors:profileErrors.slice()};
  })()`);
  assert.equal(exact.exists, true);
  assert.equal(exact.alias, true);
  assert.deepEqual(exact.coords, [1.25,-2.5,4.75], JSON.stringify(exact));
  assert.equal(exact.fixed, true);
  assert.equal(exact.zVisible, true, JSON.stringify(exact));
  assert.equal(exact.coordinateStacked, true, JSON.stringify(exact));
  assert.ok(!String(exact.coordinateColumns).includes(' '), JSON.stringify(exact));
  assert.equal(exact.coordinatesShown, true, JSON.stringify(exact));
  assert.equal(String(exact.color).toLowerCase(), '#7b1fa2', JSON.stringify(exact));
  assert.deepEqual(exact.errors, []);

  const clickSelector = async selector => {
    const clicked = await evaluate(`(() => {const state=Object.values(__liaRegressionStates||{}).find(s=>s.boardId==='raum');
      const e=${JSON.stringify(selector)}==='.lia-plot-undo-btn'?state?.undoButton:
        (${JSON.stringify(selector)}==='.lia-plot-redo-btn'?state?.redoButton:__boards.raum.containerObj.querySelector(${JSON.stringify(selector)}));
      if(!e)return false;e.click();return true;})()`);
    assert.equal(clicked, true, 'Missing control: ' + selector);
    await sleep(220);
  };
  const close3 = (actual, expected, tolerance = 1e-7) => actual.length === expected.length &&
    actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

  await evaluate(`__boards.raum.containerObj.querySelector('.lia-dgs-side-menu-close').click()`);
  const createPosition = await evaluate(`(() => {const r=__boards.raum.containerObj.getBoundingClientRect();return [r.left+r.width*.32,r.top+r.height*.72];})()`);
  await evaluate(`(()=>{const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-point-button').click();c.querySelector('.lia-dgs-point-submenu .lia-dgs-geometry-tool').click()})()`);
  await clickAt(createPosition);
  const created = await evaluate(`(() => {const p=Object.values(__points.raum).find(p=>p?.__liaPoint3D&&!p.__liaDgsMacroManaged&&p.__liaDgsPointName==='D');
    const history=Object.values(__liaRegressionStates).find(s=>s.boardId==='raum');
    return {exists:!!p,coords:p?[p.X(),p.Y(),p.Z()]:null,history:history?.undoActions.length||0,
      keys:Object.keys(__points.raum),active:__boards.raum.containerObj.querySelector('.lia-dgs-point-button').getAttribute('aria-pressed'),
      dgsPoints:__boards.raum.objectsList.filter(o=>o.__liaDgsPointName).map(o=>[o.__liaDgsPointName,!!o.__liaPoint3D,!!o.__liaDgsMacroManaged])};})()`);
  assert.equal(created.exists, true, JSON.stringify(created));
  assert.ok(Math.abs(created.coords[2]) < 1e-9, JSON.stringify(created));
  assert.ok(created.history > 0, JSON.stringify(created));

  await clickSelector('.lia-plot-undo-btn');
  assert.equal(await evaluate(`!!__points.raum.D`), false, 'Undo must remove the newly created Point3D');
  await clickSelector('.lia-plot-redo-btn');
  assert.equal(await evaluate(`!!__points.raum.D?.__liaPoint3D`), true, 'Redo must restore the newly created Point3D');

  await evaluate(`(() => {const c=__boards.raum.containerObj;const b=c.querySelector('.lia-dgs-point-button');if(b.getAttribute('aria-pressed')==='true')c.querySelector('.lia-dgs-select-button').click();})()`);
  const dBeforeXY = await evaluate(`[__points.raum.D.X(),__points.raum.D.Y(),__points.raum.D.Z()]`);
  const dXYStart = await evaluate('pointScreen("D")');
  await dragAt(dXYStart, [dXYStart[0]-48,dXYStart[1]+24]);
  const dAfterXY = await evaluate(`[__points.raum.D.X(),__points.raum.D.Y(),__points.raum.D.Z()]`);
  assert.ok(!close3(dAfterXY,dBeforeXY) && Math.abs(dAfterXY[2]-dBeforeXY[2]) < 1e-8, JSON.stringify({dBeforeXY,dAfterXY}));
  await clickSelector('.lia-plot-undo-btn');
  assert.ok(close3(await evaluate(`[__points.raum.D.X(),__points.raum.D.Y(),__points.raum.D.Z()]`),dBeforeXY), 'Undo must restore XY position');
  await clickSelector('.lia-plot-redo-btn');
  assert.ok(close3(await evaluate(`[__points.raum.D.X(),__points.raum.D.Y(),__points.raum.D.Z()]`),dAfterXY), 'Redo must restore XY move');

  const dZStart = await evaluate('pointScreen("D")');
  await dragAt(dZStart, [dZStart[0],dZStart[1]-62], 8);
  const dAfterZ = await evaluate(`[__points.raum.D.X(),__points.raum.D.Y(),__points.raum.D.Z()]`);
  assert.ok(Math.abs(dAfterZ[2]-dAfterXY[2]) > .1 && Math.hypot(dAfterZ[0]-dAfterXY[0],dAfterZ[1]-dAfterXY[1]) < 1e-7,
    JSON.stringify({dAfterXY,dAfterZ}));
  await clickSelector('.lia-plot-undo-btn');
  assert.ok(close3(await evaluate(`[__points.raum.D.X(),__points.raum.D.Y(),__points.raum.D.Z()]`),dAfterXY), 'Undo must restore Z position');
  await clickSelector('.lia-plot-redo-btn');
  assert.ok(close3(await evaluate(`[__points.raum.D.X(),__points.raum.D.Y(),__points.raum.D.Z()]`),dAfterZ), 'Redo must restore Z move');

  await clickAt(await evaluate('pointScreen("D")'), 'right');
  await evaluate(`(() => {const c=__boards.raum.containerObj,q=a=>c.querySelector('.lia-dgs-coordinate-input[aria-label="'+a+'-Koordinate"]');
    q('x').value='.75';q('y').value='-1.25';q('z').value='2.5';q('z').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);
  await sleep(220);
  const dExact = [0.75,-1.25,2.5];
  assert.ok(close3(await evaluate(`[__points.raum.D.X(),__points.raum.D.Y(),__points.raum.D.Z()]`),dExact), 'Exact xyz input failed');
  await clickSelector('.lia-plot-undo-btn');
  assert.ok(close3(await evaluate(`[__points.raum.D.X(),__points.raum.D.Y(),__points.raum.D.Z()]`),dAfterZ), 'Undo must restore exact xyz edit');
  await clickSelector('.lia-plot-redo-btn');
  assert.ok(close3(await evaluate(`[__points.raum.D.X(),__points.raum.D.Y(),__points.raum.D.Z()]`),dExact), 'Redo must restore exact xyz edit');

  const objectDragSetup = await evaluate(`(() => {
    const board=__boards.raum,state=board.__liaDgs3DHookState,d=__points.raum.D,c=__points.raum.C;
    (state.multiSelectedObjects||[]).forEach(object=>object?.rendNode?.classList?.remove('lia-dgs-multi-selected'));
    state.multiSelectedObjects=[];
    const sphere=__coord.createCoordinateSphere3D(board,'center-point',[d,c],undefined,{
      name:'',withLabel:false,strokeColor:'#ff00ff',fillColor:'#ff00ff',fillOpacity:.18
    });
    sphere.__liaDgsSphere3D=true;sphere.__liaDgsSphere3DName='DragProbe';
    sphere.__liaDgsShowObject=true;sphere.__liaDgsFixed=true;
    const sourceBefore=[[d.X(),d.Y(),d.Z()],[c.X(),c.Y(),c.Z()]];
    const centerScreen=()=>{
      const center=[0,1,2].map(index=>(Number(d[['X','Y','Z'][index]]())+Number(c[['X','Y','Z'][index]]()))/2);
      const projected=__coordinateViews3d.raum.view.project3DTo2D(center);
      const rect=board.containerObj.getBoundingClientRect();
      return [rect.left+board.origin.scrCoords[1]+projected[1]*board.unitX,
        rect.top+board.origin.scrCoords[2]-projected[2]*board.unitY];
    };
    window.__objectDragProbe={sphere,d,c,sourceBefore,centerScreen};
    board.update();
    const rect=board.containerObj.getBoundingClientRect(),box=sphere.element2D.rendNode.getBoundingClientRect();
    const pointScreens=[d,c].map(point=>[point.element2D.coords.scrCoords[1],point.element2D.coords.scrCoords[2]]);
    let hit=null;
    for(let clientY=Math.max(box.top,rect.top+90);clientY<=box.bottom&&!hit;clientY+=3){
      for(let clientX=box.left;clientX<=box.right&&!hit;clientX+=3){
        const local=[clientX-rect.left,clientY-rect.top];
        const away=pointScreens.every(point=>Math.hypot(local[0]-point[0],local[1]-point[1])>18);
        if(away&&sphere.element2D.hasPoint(local[0],local[1]))hit=[clientX,clientY];
      }
    }
    return {hit,before:centerScreen(),sourceBefore,box:[box.left,box.top,box.width,box.height]};
  })()`);
  assert.ok(objectDragSetup.hit, JSON.stringify(objectDragSetup));
  const objectDragDelta = [46,-29];
  await dragAt(objectDragSetup.hit, [
    objectDragSetup.hit[0] + objectDragDelta[0],
    objectDragSetup.hit[1] + objectDragDelta[1]
  ]);
  const objectDragResult = await evaluate(`(() => {
    const probe=__objectDragProbe,after=[[probe.d.X(),probe.d.Y(),probe.d.Z()],[probe.c.X(),probe.c.Y(),probe.c.Z()]];
    const shifts=after.map((point,index)=>point.map((value,axis)=>value-probe.sourceBefore[index][axis]));
    const screen=probe.centerScreen();
    return {after,shifts,screen};
  })()`);
  assert.ok(objectDragResult.shifts[0].every((value,index)=>
    Math.abs(value-objectDragResult.shifts[1][index])<1e-7), JSON.stringify(objectDragResult));
  assert.ok(Math.hypot(
    objectDragResult.screen[0] - objectDragSetup.before[0] - objectDragDelta[0],
    objectDragResult.screen[1] - objectDragSetup.before[1] - objectDragDelta[1]
  ) < .8, JSON.stringify({objectDragSetup,objectDragResult,objectDragDelta}));
  await evaluate(`(() => {
    const probe=__objectDragProbe,board=__boards.raum,state=board.__liaDgs3DHookState;
    __coord.setCoordinatePoint3D(probe.d,probe.sourceBefore[0],false);
    __coord.setCoordinatePoint3D(probe.c,probe.sourceBefore[1],false);
    probe.sphere.__liaSphere3DCleanup?.();
    try{board.removeObject(probe.sphere);}catch(e){}
    (state.multiSelectedObjects||[]).forEach(object=>object?.rendNode?.classList?.remove('lia-dgs-multi-selected'));
    state.multiSelectedObjects=[];board.fullUpdate();delete window.__objectDragProbe;
  })()`);

  await clickAt(await evaluate('pointScreen("D")'), 'right');
  await evaluate(`(() => {const n=__boards.raum.containerObj.querySelector('.lia-dgs-name-input');n.value='R';n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);
  await sleep(180);
  assert.equal(await evaluate(`!!__points.raum.R`), true, 'Point3D rename failed');
  await clickSelector('.lia-plot-undo-btn');
  assert.equal(await evaluate(`!!__points.raum.D&&!__points.raum.R`), true, 'Undo must restore Point3D name');
  await clickSelector('.lia-plot-redo-btn');
  assert.equal(await evaluate(`!!__points.raum.R`), true, 'Redo must restore Point3D name');

  await clickAt(await evaluate('pointScreen("R")'), 'right');
  await evaluate(`(() => {const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-color-button[data-color-kind="line"]').click();
    const h=c.querySelector('.lia-dgs-color-hex');h.value='#3949ab';h.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(180);
  assert.equal(await evaluate(`__points.raum.R.element2D.visProp.strokecolor`), '#3949ab');
  await clickSelector('.lia-plot-undo-btn');
  assert.notEqual(await evaluate(`__points.raum.R.element2D.visProp.strokecolor`), '#3949ab');
  await clickSelector('.lia-plot-redo-btn');
  assert.equal(await evaluate(`__points.raum.R.element2D.visProp.strokecolor`), '#3949ab');

  await clickAt(await evaluate('pointScreen("R")'), 'right');
  await evaluate(`(() => {const c=__boards.raum.containerObj,o=[...c.querySelectorAll('.lia-dgs-context-option')].find(x=>!x.hidden&&x.textContent.includes('Fixieren'))?.querySelector('input');o.checked=true;o.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(180);
  assert.equal(await evaluate(`!!__points.raum.R.getAttribute('fixed')`), true);
  await clickSelector('.lia-plot-undo-btn');
  assert.equal(await evaluate(`!!__points.raum.R.getAttribute('fixed')`), false);
  await clickSelector('.lia-plot-redo-btn');
  assert.equal(await evaluate(`!!__points.raum.R.getAttribute('fixed')`), true);

  await clickAt(await evaluate('pointScreen("R")'), 'right');
  const hidden = await evaluate(`(() => {const c=__boards.raum.containerObj,o=[...c.querySelectorAll('.lia-dgs-context-option')].find(x=>!x.hidden&&x.textContent.includes('Punkt anzeigen'))?.querySelector('input');
    if(!o)return false;o.checked=false;o.dispatchEvent(new Event('change',{bubbles:true}));return __points.raum.R.__liaDgsShowObject===false;})()`);
  assert.equal(hidden, true, 'Point3D visibility option missing');
  await clickSelector('.lia-plot-undo-btn');
  assert.equal(await evaluate(`__points.raum.R.__liaDgsShowObject!==false`), true);
  await clickSelector('.lia-plot-redo-btn');
  assert.equal(await evaluate(`__points.raum.R.__liaDgsShowObject===false`), true);
  await clickSelector('.lia-plot-undo-btn');

  await clickAt(await evaluate('pointScreen("R")'), 'right');
  const deleted = await evaluate(`(() => {const b=__boards.raum.containerObj.querySelector('.lia-dgs-delete-button');b.click();b.click();return !__points.raum.R;})()`);
  assert.equal(deleted, true, 'Point3D delete failed');
  await clickSelector('.lia-plot-undo-btn');
  assert.equal(await evaluate(`!!__points.raum.R?.__liaPoint3D`), true, 'Undo must restore deleted Point3D');
  await clickSelector('.lia-plot-redo-btn');
  assert.equal(await evaluate(`!!__points.raum.R`), false, 'Redo must delete Point3D again');
  await clickSelector('.lia-plot-undo-btn');
  assert.equal(await evaluate(`!!__points.raum.R?.__liaPoint3D`), true);

  const objectList = await evaluate(`(() => {const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-object-list-button').click();return c.querySelector('.lia-dgs-object-list-panel').textContent;})()`);
  assert.match(objectList, /R/);

  const hiddenForRoundtrip = await evaluate(`(() => {const c=__boards.raum.containerObj;
    const entry=[...c.querySelectorAll('.lia-dgs-object-list-entry')].find(e=>e.querySelector('.lia-dgs-object-list-name')?.textContent==='C');
    if(!entry)return {ok:false,reason:'missing C entry'};entry.click();
    const option=[...c.querySelectorAll('.lia-dgs-context-option')].find(x=>!x.hidden&&x.textContent.includes('Punkt anzeigen'))?.querySelector('input');
    if(!option)return {ok:false,reason:'missing visibility option'};option.checked=false;option.dispatchEvent(new Event('change',{bubbles:true}));
    c.querySelector('.lia-dgs-side-menu-close')?.click();const p=__points.raum.C;
    return {ok:p.__liaDgsShowObject===false,visible:p.element2D.visProp.visible,opacity:p.element2D.visProp.strokeopacity};})()`);
  assert.equal(hiddenForRoundtrip.ok, true, JSON.stringify(hiddenForRoundtrip));
  assert.equal(hiddenForRoundtrip.visible, false, JSON.stringify(hiddenForRoundtrip));

  const geometryBeforeLayout = await evaluate(`Object.fromEntries(['Q','B','C','R'].map(n=>[n,[__points.raum[n].X(),__points.raum[n].Y(),__points.raum[n].Z()]]))`);
  const responsive = await evaluate(`(async()=>{const section=document.querySelector('.flex-child'),board=__boards.raum;
    section.style.width='430px';window.dispatchEvent(new Event('resize'));await new Promise(r=>setTimeout(r,450));const narrow=board.containerObj.getBoundingClientRect().width;
    section.style.width='820px';window.dispatchEvent(new Event('resize'));await new Promise(r=>setTimeout(r,450));const wide=board.containerObj.getBoundingClientRect().width;
    return {narrow,wide,errors:profileErrors.slice()};})()`);
  assert.ok(responsive.narrow <= 435 && responsive.wide > responsive.narrow + 100, JSON.stringify(responsive));
  assert.deepEqual(responsive.errors, []);
  assert.deepEqual(await evaluate(`Object.fromEntries(['Q','B','C','R'].map(n=>[n,[__points.raum[n].X(),__points.raum[n].Y(),__points.raum[n].Z()]]))`), geometryBeforeLayout);

  await evaluate(`(() => {const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-object-list-close')?.click();const m=c.querySelector('.lia-dgs-menu-button');if(m.getAttribute('aria-expanded')!=='true')m.click();})()`);
  await sleep(250);
  const fullscreenPosition = await evaluate(`(() => {const r=__boards.raum.containerObj.querySelector('.lia-dgs-fullscreen-button').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()`);
  await clickAt(fullscreenPosition);
  await sleep(450);
  const fullscreenActive = await evaluate(`document.fullscreenElement===__boards.raum.containerObj||__boards.raum.containerObj.classList.contains('lia-dgs-fullscreen-active')`);
  assert.equal(fullscreenActive, true, '3D board did not enter fullscreen');
  const exitFullscreenPosition = await evaluate(`(() => {const r=__boards.raum.containerObj.querySelector('.lia-dgs-fullscreen-button').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()`);
  await clickAt(exitFullscreenPosition);
  await sleep(350);
  assert.equal(await evaluate(`!!document.fullscreenElement||__boards.raum.containerObj.classList.contains('lia-dgs-fullscreen-active')`), false);
  assert.deepEqual(await evaluate(`profileErrors.slice()`), []);

  const exported = await evaluate(`(() => {const c=__boards.raum.containerObj;c.querySelector('.lia-dgs-object-list-button').click();c.querySelector('.lia-dgs-object-list-export').click();
    c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();return c.querySelector('.lia-dgs-export-textarea').value;})()`);
  assert.match(exported, /@Koordinatensystem\(`[^`]*mode=3d[^`]*zmin=-6[^`]*zmax=6[^`]*projection=central[^`]*camera=/);
  assert.match(exported, /@Punkt3D\(`[^`]*;Q;1\.25;-2\.5;4\.75;#7b1fa2;1;fix;wert=1/);
  assert.match(exported, /@Punkt3D\(`[^`]*;B;-2;1;-2\.5;#1565c0;0\.8;fix/);
  assert.match(exported, /@Punkt3D\(`[^`]*;R;0\.75;-1\.25;2\.5;#3949ab;1;fix/);
  assert.match(exported, /@Punkt3D\(`[^`]*;C;0\.5;-1;0\.25;#00897b;1;visible=0/);

  const importedSetup = await evaluate(`(() => {const block=${JSON.stringify(exported)},lines=block.split(/\\r?\\n/);
    const value=line=>line.slice(line.indexOf('\x60')+1,line.lastIndexOf('\x60'));
    const coordinate=value(lines.find(line=>/^@(?:Koordinatensystem|CoordinateSystem)\\(/.test(line)));
    const id=(coordinate.match(/(?:^|;)id=([^;]+)/i)||[])[1];
    const pointSpecs=lines.filter(line=>/^@(?:Punkt3D|Point3D)\\(/.test(line)).map(value);
    const section=document.createElement('section');section.className='roundtrip-3d';section.style.width='760px';
    const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey='roundtrip-3d';host.dataset.spec=coordinate;section.append(host);
    pointSpecs.forEach((spec,index)=>{const marker=document.createElement('span');marker.id='point3d-spec-roundtrip-'+index;marker.dataset.spec=spec;marker.style.display='none';section.append(marker);});
    const dgs=document.createElement('div');dgs.id='dgs-ui-roundtrip-3d';dgs.dataset.spec=id;dgs.dataset.language='de';section.append(dgs);
    document.querySelector('#fixture').append(section);window.roundtrip3D={block,id,coordinate,pointSpecs,section,host};return {id,count:pointSpecs.length};})()`);
  assert.ok(importedSetup.id && importedSetup.count >= 4, JSON.stringify(importedSetup));
  await evaluate(`(async()=>{for(let i=0;i<160;i++){const id=roundtrip3D.id;if(__boards?.[id]&&__coordinateViews3d?.[id]&&__points?.[id]?.Q&&__points?.[id]?.R&&__boards[id].containerObj.querySelector('.lia-dgs-object-list-export'))return true;await new Promise(r=>setTimeout(r,50));}throw Error('3D roundtrip board timeout');})()`);
  const imported = await evaluate(`(() => {const id=roundtrip3D.id,e=__coordinateViews3d[id],p=__points[id];return {
    scene:{mode:__boards[id].__liaSceneMode,view:e.viewMode,projection:e.projection,z:[e.config.zmin,e.config.zmax],camera:{...e.camera}},
    Q:[p.Q.X(),p.Q.Y(),p.Q.Z(),!!p.Q.getAttribute('fixed'),p.Q.element2D.visProp.strokecolor,p.Q.__liaDgsShowObject,p.Q.__liaDgsShowValue],
    B:[p.B.X(),p.B.Y(),p.B.Z(),!!p.B.getAttribute('fixed'),p.B.element2D.visProp.strokecolor,p.B.__liaDgsOpacity],
    C:[p.C.X(),p.C.Y(),p.C.Z(),p.C.__liaDgsShowObject,p.C.element2D.visProp.visible,p.C.element2D.visProp.strokeopacity],
    R:[p.R.X(),p.R.Y(),p.R.Z(),!!p.R.getAttribute('fixed'),p.R.element2D.visProp.strokecolor,p.R.__liaDgsShowObject],
    controls:__boards[id].containerObj.querySelectorAll('.lia-coordinate-3d-controls').length,errors:profileErrors.slice()};})()`);
  assert.equal(imported.scene.mode, '3d');
  assert.equal(imported.scene.projection, 'central');
  assert.deepEqual(imported.scene.z, [-6,6]);
  assert.deepEqual(imported.Q, [1.25,-2.5,4.75,true,'#7b1fa2',true,true]);
  assert.deepEqual(imported.B, [-2,1,-2.5,true,'#1565c0',0.8]);
  assert.deepEqual(imported.C, [0.5,-1,0.25,false,false,0]);
  assert.deepEqual(imported.R, [0.75,-1.25,2.5,true,'#3949ab',true]);
  assert.equal(imported.controls, 1);
  assert.deepEqual(imported.errors, []);

  const reexported = await evaluate(`(() => {const id=roundtrip3D.id,c=__boards[id].containerObj;c.querySelector('.lia-dgs-object-list-button').click();c.querySelector('.lia-dgs-object-list-export').click();
    c.querySelector('.lia-dgs-export-dialog button[data-primary="1"]').click();return c.querySelector('.lia-dgs-export-textarea').value;})()`);
  const semanticPointSpecs = block => block.split(/\r?\n/).filter(line=>/^@(?:Punkt3D|Point3D)\(/.test(line)).map(line=>{
    const spec=line.slice(line.indexOf('`')+1,line.lastIndexOf('`')).split(';');return spec.slice(1).join(';');
  }).sort();
  assert.deepEqual(semanticPointSpecs(reexported), semanticPointSpecs(exported));
  assert.match(reexported, /mode=3d/);
  assert.match(reexported, /projection=central/);
  const reshowImported = await evaluate(`(() => {const id=roundtrip3D.id,c=__boards[id].containerObj;
    const close=[...c.querySelectorAll('.lia-dgs-export-dialog button')].find(b=>!b.hidden&&!b.dataset.primary);close?.click();
    const panel=c.querySelector('.lia-dgs-object-list-panel');if(!panel.classList.contains('is-open'))c.querySelector('.lia-dgs-object-list-button').click();
    const entry=[...c.querySelectorAll('.lia-dgs-object-list-entry')].find(e=>e.querySelector('.lia-dgs-object-list-name')?.textContent==='C');entry?.click();
    const option=[...c.querySelectorAll('.lia-dgs-context-option')].find(x=>!x.hidden&&x.textContent.includes('Punkt anzeigen'))?.querySelector('input');
    if(!option)return {ok:false};option.checked=true;option.dispatchEvent(new Event('change',{bubbles:true}));const p=__points[id].C;
    return {ok:p.__liaDgsShowObject===true,visible:p.element2D.visProp.visible,opacity:p.element2D.visProp.strokeopacity,labelVisible:p.label?.visProp?.visible};})()`);
  assert.equal(reshowImported.ok, true, JSON.stringify(reshowImported));
  assert.notEqual(reshowImported.visible, false, JSON.stringify(reshowImported));
  assert.ok(reshowImported.opacity > .99, JSON.stringify(reshowImported));
  assert.notEqual(reshowImported.labelVisible, false, JSON.stringify(reshowImported));
  console.log('PASS 3D resize, fullscreen, export, fresh import, visibility, and semantic re-export');

  const remount = await evaluate(`(async()=>{const id=roundtrip3D.id,views=[__coordinateViews3d[id].view];let cleanupCalls=0;
    for(let cycle=0;cycle<3;cycle++){const oldBoard=__boards[id],oldEntry=__coordinateViews3d[id],oldContainer=oldBoard.containerObj;
      oldEntry.points.forEach(point=>{const original=point.__liaPoint3DCleanup;point.__liaPoint3DCleanup=()=>{cleanupCalls++;original?.();};});
      roundtrip3D.host.remove();await new Promise(r=>setTimeout(r,180));
      if(__boards?.[id]||__coordinateViews3d?.[id]||oldEntry.cameraDragCleanup||oldContainer.querySelectorAll('.lia-coordinate-3d-controls').length)return {ok:false,cycle,phase:'dispose',cleanupCalls};
      const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey='roundtrip-remount-'+cycle;host.dataset.spec=roundtrip3D.coordinate;
      roundtrip3D.section.prepend(host);roundtrip3D.host=host;__scheduleBootstrapPoint3D?.();
      for(let i=0;i<160;i++){if(__boards?.[id]&&__coordinateViews3d?.[id]&&__points?.[id]?.Q&&__points?.[id]?.R&&__boards[id].containerObj.querySelector('.lia-dgs-object-list-button'))break;await new Promise(r=>setTimeout(r,25));}
      const entry=__coordinateViews3d?.[id],board=__boards?.[id];
      if(!entry||!board||!__points?.[id]?.Q||!__points?.[id]?.R)return {ok:false,cycle,phase:'mount',cleanupCalls};
      if(views.includes(entry.view))return {ok:false,cycle,phase:'stale-view',cleanupCalls};views.push(entry.view);
      if(entry.points.size!==roundtrip3D.pointSpecs.length||board.containerObj.querySelectorAll('.lia-coordinate-3d-controls').length!==1)
        return {ok:false,cycle,phase:'duplicates',cleanupCalls,points:entry.points.size,controls:board.containerObj.querySelectorAll('.lia-coordinate-3d-controls').length};
    }
    return {ok:true,cleanupCalls,uniqueViews:new Set(views).size,controls:__boards[id].containerObj.querySelectorAll('.lia-coordinate-3d-controls').length,
      points:__coordinateViews3d[id].points.size,errors:profileErrors.slice()};})()`);
  assert.equal(remount.ok, true, JSON.stringify(remount));
  assert.ok(remount.cleanupCalls >= importedSetup.count * 3, JSON.stringify(remount));
  assert.equal(remount.uniqueViews, 4, JSON.stringify(remount));
  assert.equal(remount.controls, 1, JSON.stringify(remount));
  assert.equal(remount.points, importedSetup.count, JSON.stringify(remount));
  assert.deepEqual(remount.errors, []);
  console.log('PASS repeated View3D dispose and remount without stale registries, controls, or point handlers');

  const isolationSetup = await evaluate(`(() => {const section=document.createElement('section');section.className='isolation-2d';section.style.width='600px';
    const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey='isolation-2d';host.dataset.spec='id=flat_isolated;xmin=-4;xmax=4;ymin=-3;ymax=3;width=560';section.append(host);
    const marker=document.createElement('span');marker.id='point-spec-flat-isolated';marker.dataset.spec='flat_isolated;P;1.5;-2;#00897b;1';marker.style.display='none';section.append(marker);
    const dgs=document.createElement('div');dgs.id='dgs-ui-flat-isolated';dgs.dataset.spec='flat_isolated';dgs.dataset.language='de';section.append(dgs);document.querySelector('#fixture').append(section);return true;})()`);
  assert.equal(isolationSetup, true);
  await evaluate(`(async()=>{for(let i=0;i<150;i++){if(__boards?.flat_isolated&&__points?.flat_isolated?.P&&__boards.flat_isolated.containerObj.querySelector('[aria-label="3D-Ansicht"]'))return true;await new Promise(r=>setTimeout(r,50));}throw Error('2D isolation board timeout');})()`);
  const isolated = await evaluate(`(() => {const board=__boards.flat_isolated,p=__points.flat_isolated.P,id=p.__liaDgsPersistentId;
    const result=__coord.requestCoordinateSceneMode(board,'3d'),entry=__coordinateViews3d.flat_isolated;
    const in3d={same:__points.flat_isolated.P===p,is3d:!!p.__liaPoint3D,coords:[p.X(),p.Y()],visible:p.visProp.visible,points:entry.points.size};
    board.containerObj.querySelector('[aria-label="2D-Ansicht"]').click();
    return {result,in3d,in2d:{coords:[p.X(),p.Y()],visible:p.visProp.visible,mode:entry.viewMode},identity:[id,p.__liaDgsPersistentId],
      controls:board.containerObj.querySelectorAll('.lia-coordinate-3d-controls').length};})()`);
  assert.equal(isolated.result.ok,true,JSON.stringify(isolated));
  assert.deepEqual(isolated.in3d,{same:true,is3d:false,coords:[1.5,-2],visible:false,points:0});
  assert.deepEqual(isolated.in2d,{coords:[1.5,-2],visible:true,mode:'2d'});
  assert.equal(isolated.identity[0],isolated.identity[1]);
  assert.equal(isolated.controls,1);
  await evaluate(`(() => {const section=document.createElement('section');section.className='empty-2d';section.style.width='600px';
    const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey='empty-2d';host.dataset.spec='id=empty_toggle;xmin=-4;xmax=4;ymin=-3;ymax=3;width=560';section.append(host);
    const dgs=document.createElement('div');dgs.id='dgs-ui-empty-toggle';dgs.dataset.spec='empty_toggle';dgs.dataset.language='de';section.append(dgs);document.querySelector('#fixture').append(section);})()`);
  await evaluate(`(async()=>{for(let i=0;i<150;i++){const b=__boards?.empty_toggle;if(b&&b.containerObj.querySelector('[aria-label="3D-Ansicht"]'))return true;await new Promise(r=>setTimeout(r,25));}throw Error('empty toggle board timeout');})()`);
  await evaluate(`document.querySelector('.empty-2d').scrollIntoView({block:'center'})`);
  await sleep(180);
  const emptyToggles = await evaluate(`(() => {const b=__boards.empty_toggle,c=b.containerObj;c.querySelector('[aria-label="3D-Ansicht"]').click();const first=__coordinateViews3d.empty_toggle.view;
    for(let i=0;i<20;i++){c.querySelector('[aria-label="2D-Ansicht"]').click();c.querySelector('[aria-label="3D-Ansicht"]').click();}
    const e=__coordinateViews3d.empty_toggle,r=c.getBoundingClientRect();return {same:first===e.view,controls:c.querySelectorAll('.lia-coordinate-3d-controls').length,
      points:e.points.size,camera:[e.view.az_slide.Value(),e.view.el_slide.Value()],bbox:b.getBoundingBox(),size:[r.width,r.height],
      viewBox:e.view.bbox3D.map(range=>range.slice()),originScreen:(()=>{const p=e.view.project3DTo2D([0,0,0]);return [b.origin.scrCoords[1]+p[1]*b.unitX,b.origin.scrCoords[2]-p[2]*b.unitY]})(),decorations:e.decorations.size,axisEdges:(()=>{const canvas=e.decorationCanvas,context=canvas?.getContext('2d');if(!canvas||!context)return [];const data=context.getImageData(0,0,canvas.width,canvas.height).data,colors=[['x',(red,green,blue)=>red>200&&green<90&&blue>200],['y',(red,green,blue)=>red<90&&green>200&&blue>200],['z',(red,green,blue)=>red>200&&green>200&&blue<90]];return colors.map(([axis,matches])=>{let left=canvas.width,top=canvas.height,right=-1,bottom=-1;for(let y=0;y<canvas.height;y+=1)for(let x=0;x<canvas.width;x+=1){const offset=(y*canvas.width+x)*4;if(data[offset+3]<170||!matches(data[offset],data[offset+1],data[offset+2]))continue;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}return {axis,left:left*r.width/canvas.width,right:right*r.width/canvas.width,top:top*r.height/canvas.height,bottom:bottom*r.height/canvas.height,width:r.width,height:r.height};});})(),gesture:[[r.left+r.width*.68,r.top+r.height*.7],[r.left+r.width*.78,r.top+r.height*.62]]};})()`);
  assert.equal(emptyToggles.same, true, JSON.stringify(emptyToggles));
  assert.equal(emptyToggles.controls, 1, JSON.stringify(emptyToggles));
  assert.equal(emptyToggles.points, 0, JSON.stringify(emptyToggles));
  assert.equal(emptyToggles.axisEdges.length,3,JSON.stringify(emptyToggles));
  emptyToggles.axisEdges.forEach(axis=>{const touches=[axis.left<=12,axis.right>=axis.width-12,axis.top<=12,axis.bottom>=axis.height-12].filter(Boolean).length;assert.ok(touches>=2,JSON.stringify({axis,touches}));});
  await evaluate(`__boards.empty_toggle.containerObj.scrollIntoView({block:'center'})`);
  await sleep(160);
  const panGesture = await evaluate(`(()=>{const r=__boards.empty_toggle.containerObj.getBoundingClientRect();return [[r.left+r.width*.68,r.top+r.height*.7],[r.left+r.width*.78,r.top+r.height*.62]]})()`);
  const panGestureDurations=[];
  let duringPan=null;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const started=performance.now();
    await dragAt(panGesture[0], panGesture[1], 0, iteration === 0 ? async () => {
      await sleep(35);
      duringPan=await evaluate(`(()=>{const e=__coordinateViews3d.empty_toggle;return {
        viewBox:e.view.bbox3D.map(range=>range.slice()),
        axes:[...e.decorations].filter(object=>object.kind==='axis').map(object=>({
          axis:object.axis,start:object.start?.[object.axis],end:object.end?.[object.axis]
        })).sort((a,b)=>a.axis-b.axis),
        panOffset:(e.decorationPanOffset||[]).slice(),
        transform:e.decorationCanvas?.style?.transform||''
      }})()`);
    } : null);
    panGestureDurations.push(performance.now()-started);
  }
  const releaseProbeStarted=performance.now();
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: panGesture[0][0], y: panGesture[0][1] });
  const releaseProbeLatency=performance.now()-releaseProbeStarted;
  assert.ok(Math.max(...panGestureDurations)<550&&releaseProbeLatency<350,
    JSON.stringify({panGestureDurations,releaseProbeLatency}));
  const afterPan = await evaluate(`(()=>{const b=__boards.empty_toggle,e=__coordinateViews3d.empty_toggle;return {
    camera:[e.view.az_slide.Value(),e.view.el_slide.Value()],bbox:b.getBoundingBox(),
    viewBox:e.view.bbox3D.map(range=>range.slice()),originScreen:(()=>{const p=e.view.project3DTo2D([0,0,0]);return [b.origin.scrCoords[1]+p[1]*b.unitX,b.origin.scrCoords[2]-p[2]*b.unitY]})(),
    axes:[...e.decorations].filter(object=>object.kind==='axis').map(object=>({
      axis:object.axis,start:object.start?.[object.axis],end:object.end?.[object.axis]
    })).sort((a,b)=>a.axis-b.axis),
    panOffset:(e.decorationPanOffset||[]).slice(),
    transform:e.decorationCanvas?.style?.transform||''
  }})()`);
  const assertDecorationTracksViewport=(state,label)=>{
    assert.equal(state.axes.length,3,JSON.stringify({label,state}));
    state.axes.forEach((axis,index)=>{
      assert.equal(axis.axis,index,JSON.stringify({label,state}));
      assert.ok(Math.abs(axis.start-state.viewBox[index][0])<1e-8&&
        Math.abs(axis.end-state.viewBox[index][1])<1e-8,JSON.stringify({label,state}));
    });
    assert.ok(state.panOffset.length===2&&state.panOffset.every(value=>Math.abs(value)<1e-8)&&state.transform==='',
      JSON.stringify({label,state}));
  };
  assertDecorationTracksViewport(duringPan,'during pan');
  assertDecorationTracksViewport(afterPan,'after pan');
  assert.deepEqual(afterPan.bbox,emptyToggles.bbox,
    JSON.stringify({before:emptyToggles.bbox,after:afterPan.bbox}));
  assert.ok(Math.hypot(
    (afterPan.viewBox[0][0]+afterPan.viewBox[0][1])-(emptyToggles.viewBox[0][0]+emptyToggles.viewBox[0][1]),
    (afterPan.viewBox[1][0]+afterPan.viewBox[1][1])-(emptyToggles.viewBox[1][0]+emptyToggles.viewBox[1][1])
  )>.1,JSON.stringify({before:emptyToggles.viewBox,after:afterPan.viewBox}));
  assert.ok(afterPan.viewBox.every((range,index)=>Math.abs(
    (range[1]-range[0])-(emptyToggles.viewBox[index][1]-emptyToggles.viewBox[index][0])
  )<1e-9),JSON.stringify({before:emptyToggles.viewBox,after:afterPan.viewBox}));
  assert.ok(Math.hypot(afterPan.camera[0]-emptyToggles.camera[0],afterPan.camera[1]-emptyToggles.camera[1])<1e-8,
    JSON.stringify({before:emptyToggles.camera,after:afterPan.camera}));
  assert.ok(afterPan.originScreen[0]>emptyToggles.originScreen[0]+20&&afterPan.originScreen[1]<emptyToggles.originScreen[1]-20,
    JSON.stringify({before:emptyToggles.originScreen,after:afterPan.originScreen,gesture:panGesture}));
  const panMouseDelta=[(panGesture[1][0]-panGesture[0][0])*4,(panGesture[1][1]-panGesture[0][1])*4];
  const panSceneDelta=[afterPan.originScreen[0]-emptyToggles.originScreen[0],afterPan.originScreen[1]-emptyToggles.originScreen[1]];
  const panAlignment=(panMouseDelta[0]*panSceneDelta[0]+panMouseDelta[1]*panSceneDelta[1])/(Math.hypot(...panMouseDelta)*Math.hypot(...panSceneDelta));
  const panGain=Math.hypot(...panSceneDelta)/Math.hypot(...panMouseDelta);
  assert.ok(panAlignment>.97&&panGain>.15&&panGain<=1.05,JSON.stringify({panMouseDelta,panSceneDelta,panAlignment,panGain}));
  const beforeCenter=emptyToggles.viewBox.map(range=>(range[0]+range[1])/2),afterCenter=afterPan.viewBox.map(range=>(range[0]+range[1])/2);
  const maxSpan=Math.max(...emptyToggles.viewBox.map(range=>range[1]-range[0]));
  const expectedWorldPan=Math.hypot(panMouseDelta[0]*maxSpan/emptyToggles.size[0],panMouseDelta[1]*maxSpan/emptyToggles.size[1]);
  const actualWorldPan=Math.hypot(...afterCenter.map((value,index)=>value-beforeCenter[index]));
  const worldPanGain=actualWorldPan/expectedWorldPan;
  assert.ok(worldPanGain>.15&&worldPanGain<.35,JSON.stringify({beforeCenter,afterCenter,expectedWorldPan,actualWorldPan,worldPanGain}));
  await evaluate(`__boards.empty_toggle.containerObj.scrollIntoView({block:'center'})`);
  await sleep(120);
  const freeRotateGesture = orientation => evaluate("(()=>{const b=__boards.empty_toggle,e=__coordinateViews3d.empty_toggle,"
    +"r=b.containerObj.getBoundingClientRect(),o=e.view.project3DTo2D([0,0,0]),"
    +"origin=[b.origin.scrCoords[1]+o[1]*b.unitX,b.origin.scrCoords[2]-o[2]*b.unitY],"
    +"directions=[0,1,2].map(axis=>{const p=[0,0,0];p[axis]=1;const q=e.view.project3DTo2D(p);"
    +"return [(q[1]-o[1])*b.unitX,-(q[2]-o[2])*b.unitY]}),candidates=[];"
    +"for(const x of [.15,.25,.35,.65,.75,.85])for(const y of [.25,.35,.5,.65,.78])candidates.push([r.width*x,r.height*y]);"
    +"const distance=(point,direction)=>Math.abs((point[0]-origin[0])*direction[1]-(point[1]-origin[1])*direction[0])/(Math.hypot(...direction)||1);"
    +"candidates.sort((a,bp)=>Math.min(...directions.map(d=>distance(bp,d)))-Math.min(...directions.map(d=>distance(a,d))));"
    +"const start=candidates[0],horizontal="+JSON.stringify(orientation==='horizontal')+";"
    +"const end=horizontal?[start[0]+(start[0]<r.width/2?r.width*.52:-r.width*.52),start[1]]:"
    +"[start[0],start[1]+(start[1]<r.height/2?r.height*.52:-r.height*.52)];"
    +"return [[r.left+start[0],r.top+start[1]],[r.left+end[0],r.top+end[1]]];})()");
  let rotateGesture = await freeRotateGesture('horizontal');
  await rightDragAt(rotateGesture[0], rotateGesture[1]);
  const cameraProbe = async () => evaluate("(()=>{const b=__boards.empty_toggle,e=__coordinateViews3d.empty_toggle,o=e.view.project3DTo2D([0,0,0]),direction=axis=>{const p=[0,0,0];p[axis]=1;const q=e.view.project3DTo2D(p),x=(q[1]-o[1])*b.unitX,y=-(q[2]-o[2])*b.unitY,length=Math.hypot(x,y)||1;return [x/length,y/length];};return {camera:[e.view.az_slide.Value(),e.view.el_slide.Value(),e.view.bank_slide.Value()],directions:[0,1,2].map(direction),bbox:b.getBoundingBox(),trackball:e.view.trackballEnabled};})()");
  const angularDistance=(first,second)=>Math.abs(((first-second+Math.PI*3)%(Math.PI*2))-Math.PI);
  const cameraDistance=(first,second)=>Math.hypot(...first.map((value,index)=>angularDistance(value,second[index])));
  const directionDistance=(first,second)=>Math.max(...first.map((axis,index)=>Math.hypot(axis[0]-second[index][0],axis[1]-second[index][1])));
  const beforeRotate=await cameraProbe();
  rotateGesture=await freeRotateGesture('horizontal');
  await rightDragAt(rotateGesture[0], rotateGesture[1]);
  const afterHorizontalRotate=await cameraProbe();
  assert.ok(cameraDistance(beforeRotate.camera,afterHorizontalRotate.camera)>.1&&
    directionDistance(beforeRotate.directions,afterHorizontalRotate.directions)>.15,
    JSON.stringify({before:beforeRotate,after:afterHorizontalRotate}));
  rotateGesture=await freeRotateGesture('vertical');
  await rightDragAt(rotateGesture[0], rotateGesture[1]);
  const afterRotate=await cameraProbe();
  assert.ok(cameraDistance(afterHorizontalRotate.camera,afterRotate.camera)>.1&&
    directionDistance(afterHorizontalRotate.directions,afterRotate.directions)>.15&&
    angularDistance(afterHorizontalRotate.camera[2],afterRotate.camera[2])>.1&&
    Math.abs(afterRotate.directions[2][0])>.18,
    JSON.stringify({before:afterHorizontalRotate,after:afterRotate}));
  rotateGesture=await freeRotateGesture('vertical');
  await rightDragAt(rotateGesture[0], rotateGesture[1]);
  const afterFullTurn=await cameraProbe();
  assert.ok(cameraDistance(afterRotate.camera,afterFullTurn.camera)>.1&&
    directionDistance(afterRotate.directions,afterFullTurn.directions)>.15&&!afterFullTurn.trackball,
    JSON.stringify({before:afterRotate,after:afterFullTurn}));
  assert.deepEqual(afterFullTurn.bbox,afterPan.bbox,JSON.stringify({before:afterPan.bbox,after:afterFullTurn.bbox}));
  await evaluate(`(() => {const target=__boards.empty_toggle.containerObj,r=target.getBoundingClientRect();for(let i=0;i<12;i++)target.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:r.left+r.width*.5,clientY:r.top+r.height*.5,deltaY:-20}));})()`);
  await sleep(240);
  const emptyZoom = await evaluate(`(() => {const b=__boards.empty_toggle,e=__coordinateViews3d.empty_toggle,box=b.getBoundingBox();return {box,
    viewBox:e.view.bbox3D.map(range=>range.slice()),decorations:[...e.decorations].map(object=>({type:object.elType,color:object.visProp?.strokecolor,width:object.visProp?.strokewidth})),
    controls:b.containerObj.querySelectorAll('.lia-coordinate-3d-controls').length,points:e.points.size,errors:profileErrors.slice()};})()`);
  assert.deepEqual(emptyZoom.box,emptyToggles.bbox,JSON.stringify({before:emptyToggles.bbox,after:emptyZoom.box}));
  assert.ok(Math.abs((emptyZoom.viewBox[0][1]-emptyZoom.viewBox[0][0])-(emptyToggles.viewBox[0][1]-emptyToggles.viewBox[0][0]))>.05, JSON.stringify({before:emptyToggles.viewBox,after:emptyZoom.viewBox}));
  assert.ok(Math.abs((emptyZoom.viewBox[1][1]-emptyZoom.viewBox[1][0])-(emptyToggles.viewBox[1][1]-emptyToggles.viewBox[1][0]))>.05, JSON.stringify({before:emptyToggles.viewBox,after:emptyZoom.viewBox}));
  assert.ok(Math.abs((emptyZoom.viewBox[2][1]-emptyZoom.viewBox[2][0])-(emptyToggles.viewBox[2][1]-emptyToggles.viewBox[2][0]))>.05, JSON.stringify({before:emptyToggles.viewBox,after:emptyZoom.viewBox}));
  const emptyZoomGrid=emptyZoom.decorations.filter(item=>item.type==='line3d');
  assert.ok(emptyZoomGrid.length>=12&&emptyZoomGrid.every(item=>item.width>=.5&&item.width<=.6&&['#ff00ff','#00ffff','#ffff00'].includes(item.color)),JSON.stringify(emptyZoom));
  assert.equal(emptyZoom.controls, 1);
  assert.equal(emptyZoom.points, 0);
  assert.deepEqual(emptyZoom.errors, []);
  const projectionProbeGesture=await evaluate(`(()=>{const b=__boards.empty_toggle,e=__coordinateViews3d.empty_toggle;
    const center=e.spatialRanges.map(range=>(range[0]+range[1])/2),span=e.spatialRanges[0][1]-e.spatialRanges[0][0];
    const p=__coord.createCoordinatePoint3D(b,center,{name:'',withLabel:false});
    const q=__coord.createCoordinatePoint3D(b,[center[0]+span*.18,center[1],center[2]],{name:'',withLabel:false});
    const sphere=__coord.createCoordinateSphere3D(b,'center-point',[p,q],undefined,{name:'',withLabel:false,fillOpacity:.2});
    window.__panProjectionProbe={p,q,sphere};b.update();
    const r=b.containerObj.getBoundingClientRect();return [[r.left+r.width*.14,r.top+r.height*.82],[r.left+r.width*.24,r.top+r.height*.74]];})()`);
  const projectionPanStarted=performance.now();
  await dragAt(projectionProbeGesture[0],projectionProbeGesture[1]);
  const projectionPanDuration=performance.now()-projectionPanStarted;
  const projectionAfterPan=await evaluate(`(()=>{const b=__boards.empty_toggle,e=__coordinateViews3d.empty_toggle,
    probe=window.__panProjectionProbe;
    const snapshot=()=>{const points=[probe.p,probe.q].map(point=>{
      const projected=e.view.project3DTo2D([point.X(),point.Y(),point.Z()]);
      return {screen:point.element2D.coords.scrCoords.slice(1,3),
        expected:[b.origin.scrCoords[1]+projected[1]*b.unitX,b.origin.scrCoords[2]-projected[2]*b.unitY]};
    });const rect=probe.sphere.element2D.rendNode.getBoundingClientRect();
      const guides=probe.sphere.__liaSphere3DGuideCurves.map(guide=>{const box=guide.element2D.rendNode.getBoundingClientRect();
        return [box.left,box.top,box.width,box.height];});
      return {points,sphere:[rect.left,rect.top,rect.width,rect.height],guides};};
    const fast=snapshot();b.update();const full=snapshot();
    const guides=probe.sphere.__liaSphere3DGuideCurves.map(guide=>({
      role:guide.__liaSphere3DGuideRole,plane:guide.__liaSphere3DGuidePlane,
      dash:Number(guide.element2D?.visProp?.dash??guide.visProp?.dash),
      opacity:Number(guide.element2D?.visProp?.strokeopacity??guide.visProp?.strokeopacity),
      width:Number(guide.element2D?.visProp?.strokewidth??guide.visProp?.strokewidth),
      pathLength:String(guide.element2D?.rendNode?.getAttribute('d')||'').length,
      pointerEvents:guide.element2D?.rendNode?.style?.pointerEvents||'',
      interactive:guide.element2D?.hasPoint?.(0,0)===true
    }));
    return {fast,full,guides};})()`);
  const projectionDistances=projectionAfterPan.fast.points.map((point,index)=>({
    expected:Math.hypot(point.screen[0]-point.expected[0],point.screen[1]-point.expected[1]),
    full:Math.hypot(point.screen[0]-projectionAfterPan.full.points[index].screen[0],
      point.screen[1]-projectionAfterPan.full.points[index].screen[1])
  }));
  const sphereProjectionDelta=Math.hypot(...projectionAfterPan.fast.sphere.map(
    (value,index)=>value-projectionAfterPan.full.sphere[index]
  ));
  const guideProjectionDelta=Math.max(...projectionAfterPan.fast.guides.map((bounds,index)=>
    Math.hypot(...bounds.map((value,coordinate)=>value-projectionAfterPan.full.guides[index][coordinate]))
  ));
  const frontGuides=projectionAfterPan.guides.filter(guide=>guide.role==='front');
  const rearGuides=projectionAfterPan.guides.filter(guide=>guide.role==='rear');
  assert.ok(projectionPanDuration<550&&projectionDistances.every(delta=>delta.expected<.75&&delta.full<.75)&&
    sphereProjectionDelta<.75&&guideProjectionDelta<.75,
    JSON.stringify({projectionPanDuration,projectionDistances,sphereProjectionDelta,guideProjectionDelta,projectionAfterPan}));
  assert.equal(projectionAfterPan.guides.length,4,JSON.stringify(projectionAfterPan.guides));
  assert.deepEqual([...new Set(projectionAfterPan.guides.map(guide=>guide.plane))].sort(),['equator','meridian']);
  assert.ok(frontGuides.length===2&&rearGuides.length===2&&frontGuides.every(guide=>
    guide.dash===0&&guide.opacity>=.7&&guide.width>=1.3&&guide.pathLength>20&&!guide.interactive&&guide.pointerEvents==='none'
  )&&rearGuides.every(guide=>
    guide.dash!==0&&guide.opacity<.5&&guide.width<=1.1&&guide.pathLength>20&&!guide.interactive&&guide.pointerEvents==='none'
  ),JSON.stringify(projectionAfterPan.guides));
  console.log('PASS isolated 3D pan and zoom, live object projections, shaded sphere guides, stable ranges, full-turn camera rotation, and toolbar layout');

  await evaluate(`(() => {const section=document.createElement('section');section.className='linear-promotion-2d';section.style.width='620px';
    const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey='linear-promotion-2d';host.dataset.spec='id=flat_linear;xmin=-4;xmax=4;ymin=-3;ymax=3;width=580';section.append(host);
    const dgs=document.createElement('div');dgs.id='dgs-ui-flat-linear';dgs.dataset.spec='flat_linear';dgs.dataset.language='de';section.append(dgs);document.querySelector('#fixture').append(section);})()`);
  await evaluate(`(async()=>{for(let i=0;i<150;i++){const b=__boards?.flat_linear;if(b&&b.containerObj.querySelector('.lia-dgs-point-button'))return true;await new Promise(r=>setTimeout(r,40));}throw Error('linear promotion board timeout');})()`);
  await evaluate(`document.querySelector('.linear-promotion-2d').scrollIntoView({block:'center'})`);
  await sleep(180);
  const planarPositions = await evaluate(`(()=>{const r=__boards.flat_linear.containerObj.getBoundingClientRect();return [[r.left+r.width*.3,r.top+r.height*.7],[r.left+r.width*.55,r.top+r.height*.42],[r.left+r.width*.72,r.top+r.height*.68]]})()`);
  for (const position of planarPositions) {
    await evaluate(`(()=>{const c=__boards.flat_linear.containerObj;const b=c.querySelector('.lia-dgs-point-button');if(b.getAttribute('aria-pressed')!=='true'){b.click();c.querySelector('.lia-dgs-point-submenu .lia-dgs-geometry-tool').click()}})()`);
    await clickAt(position);
  }
  const planarNames = await evaluate(`Object.keys(__points.flat_linear).filter(n=>__points.flat_linear[n]?.__liaDgsPointName===n).sort()`);
  assert.deepEqual(planarNames, ['A','B','C']);
  const planarPointScreen = name => evaluate(`(()=>{const p=__points.flat_linear[${JSON.stringify(name)}],r=__boards.flat_linear.containerObj.getBoundingClientRect();return [r.left+p.coords.scrCoords[1],r.top+p.coords.scrCoords[2]]})()`);
  const createPlanarLinear = async (label, first, second) => {
    const active=await evaluate(`(()=>{const b=[...__boards.flat_linear.containerObj.querySelectorAll('.lia-dgs-geometry-tool')].find(x=>x.textContent.trim()===${JSON.stringify(label)});if(!b)return false;if(b.getAttribute('aria-pressed')!=='true')b.click();return b.getAttribute('aria-pressed')==='true'})()`);
    assert.equal(active,true,'Missing planar tool '+label);await clickAt(await planarPointScreen(first));await clickAt(await planarPointScreen(second));
  };
  await createPlanarLinear('Strecke','A','B');
  await createPlanarLinear('Gerade','A','C');
  await createPlanarLinear('Strahl','B','C');
  await createPlanarLinear('Vektor','C','A');
  const planarBefore = await evaluate(`(()=>{const b=__boards.flat_linear,objects=b.objectsList.filter(o=>o.__liaDgsSegment||o.__liaDgsLine||o.__liaDgsRay||o.__liaDgsVector);return {count:objects.length,ids:objects.map(o=>o.__liaDgsPersistentId).sort(),shared:objects.map(o=>[o.point1.__liaDgsPointName,o.point2.__liaDgsPointName]).sort()}})()`);
  assert.equal(planarBefore.count,4,JSON.stringify(planarBefore));
  const isolatedLinears = await evaluate(`(()=>{const b=__boards.flat_linear,p=__points.flat_linear,
    originals=b.objectsList.filter(o=>o.__liaDgsSegment||o.__liaDgsLine||o.__liaDgsRay||o.__liaDgsVector),
    result=__coord.requestCoordinateSceneMode(b,'3d'),e=__coordinateViews3d.flat_linear;
    const in3d={mode:b.__liaSceneMode,points:e.points.size,linears:e.linearObjects.size,
      pointKinds:['A','B','C'].map(n=>!!p[n].__liaPoint3D),linearKinds:originals.map(o=>!!o.__liaLinear3D),
      visible:originals.map(o=>o.visProp.visible)};
    b.containerObj.querySelector('[aria-label="2D-Ansicht"]').click();
    const in2d={mode:b.__liaSceneMode,visible:originals.map(o=>o.visProp.visible),ids:originals.map(o=>o.__liaDgsPersistentId).sort()};
    for(let i=0;i<20;i++){b.containerObj.querySelector('[aria-label="3D-Ansicht"]').click();b.containerObj.querySelector('[aria-label="2D-Ansicht"]').click();}
    return {result,in3d,in2d,controls:b.containerObj.querySelectorAll('.lia-coordinate-3d-controls').length};})()`);
  assert.equal(isolatedLinears.result.ok,true,JSON.stringify(isolatedLinears));
  assert.deepEqual(isolatedLinears.in3d,{mode:'3d',points:0,linears:0,pointKinds:[false,false,false],
    linearKinds:[false,false,false,false],visible:[false,false,false,false]});
  assert.deepEqual(isolatedLinears.in2d,{mode:'2d',visible:[true,true,true,true],ids:planarBefore.ids});
  assert.equal(isolatedLinears.controls,1);
  await evaluate(`(() => {const section=document.createElement('section');section.className='blocked-circle-2d';section.style.width='600px';
    const host=document.createElement('lia-coordinate-board');host.dataset.liaCoordinateKey='blocked-circle-2d';host.dataset.spec='id=flat_block;xmin=-4;xmax=4;ymin=-3;ymax=3;width=560';section.append(host);
    for(const [n,x,y] of [['U',-1,0],['V',2,1]]){const m=document.createElement('span');m.id='point-spec-flat-block-'+n;m.dataset.spec='flat_block;'+n+';'+x+';'+y+';#ff00ff;1';m.style.display='none';section.append(m);}
    const circle=document.createElement('span');circle.id='circle-spec-flat-block-circle';circle.dataset.spec='flat_block;k;U;#1565c0;0.2;radius=V';circle.dataset.language='de';circle.style.display='none';section.append(circle);
    const dgs=document.createElement('div');dgs.id='dgs-ui-flat-block';dgs.dataset.spec='flat_block';dgs.dataset.language='de';section.append(dgs);document.querySelector('#fixture').append(section);})()`);
  await evaluate(`(async()=>{for(let i=0;i<150;i++){const b=__boards?.flat_block;if(b&&b.objectsList.some(o=>o.__liaDgsCircle))return true;await new Promise(r=>setTimeout(r,50));}throw Error('unsupported circle board timeout');})()`);
  const isolatedCircle = await evaluate(`(() => {const b=__boards.flat_block,old=b.objectsList.find(o=>o.__liaDgsCircle),
    id=old.__liaDgsPersistentId,result=__coord.requestCoordinateSceneMode(b,'3d'),e=__coordinateViews3d.flat_block;
    const in3d={mode:b.__liaSceneMode,points:e.points.size,circles:e.circleObjects.size,is3d:!!old.__liaCircle3D,visible:old.visProp.visible};
    b.containerObj.querySelector('[aria-label="2D-Ansicht"]').click();
    const in2d={mode:b.__liaSceneMode,visible:old.visProp.visible,same:b.objectsList.find(o=>o.__liaDgsCircle)===old,id:old.__liaDgsPersistentId};
    b.containerObj.querySelector('[aria-label="3D-Ansicht"]').click();
    return {result,id,in3d,in2d,registry:Object.values(__circleEntries).some(x=>x.board===b&&x.circle===old)};})()`);
  assert.equal(isolatedCircle.result.ok,true,JSON.stringify(isolatedCircle));
  assert.deepEqual(isolatedCircle.in3d,{mode:'3d',points:0,circles:0,is3d:false,visible:false});
  assert.deepEqual(isolatedCircle.in2d,{mode:'2d',visible:true,same:true,id:isolatedCircle.id});
  assert.equal(isolatedCircle.registry,true);
  await evaluate(`__boards.raum.containerObj.scrollIntoView({block:'center'})`);
  await sleep(150);
  const resizeBefore = await evaluate(`(() => {const c=__boards.raum.containerObj,r=c.getBoundingClientRect(),h=c.querySelector('.lia-jxg-resize-handle').getBoundingClientRect();return {size:[r.width,r.height],at:[h.left+h.width-3,h.top+h.height-3]}})()`);
  await dragAt(resizeBefore.at,[resizeBefore.at[0]-90,resizeBefore.at[1]-90]);
  const resizeShrink = await evaluate(`(()=>{const c=__boards.raum.containerObj,r=c.getBoundingClientRect(),h=c.querySelector('.lia-jxg-resize-handle').getBoundingClientRect();return {size:[r.width,r.height],at:[h.left+h.width-3,h.top+h.height-3]}})()`);
  assert.ok(resizeShrink.size[0]<resizeBefore.size[0]-40&&resizeShrink.size[1]<resizeBefore.size[1]-40,JSON.stringify({resizeBefore,resizeShrink}));
  await dragAt(resizeShrink.at,[resizeShrink.at[0]+36,resizeShrink.at[1]+32]);
  const resizeAfter = await evaluate(`(()=>{const r=__boards.raum.containerObj.getBoundingClientRect();return [r.width,r.height]})()`);
  assert.ok(resizeAfter[0]>resizeShrink.size[0]+10&&resizeAfter[1]>resizeShrink.size[1]+10,JSON.stringify({resizeShrink,resizeAfter}));
  const minimizeBefore = await evaluate(`(()=>{const b=__boards.raum,c=b.containerObj,r=c.getBoundingClientRect(),h=c.querySelector('.lia-jxg-resize-handle').getBoundingClientRect();return {board:b.__liaBoardId,mode:b.__liaSceneMode,objects:b.objectsList.length,size:[r.width,r.height],at:[h.left+h.width-3,h.top+h.height-3]}})()`);
  await dragAt(minimizeBefore.at,[minimizeBefore.at[0]-resizeAfter[0],minimizeBefore.at[1]-resizeAfter[1]]);
  const minimizedBoard = await evaluate(`(()=>{const b=__boards.raum,c=b.containerObj,r=c.getBoundingClientRect(),button=c.querySelector('.lia-coordinate-restore-button'),state=__coordBoardStates.raum;return {board:b.__liaBoardId,mode:b.__liaSceneMode,objects:b.objectsList.length,minimized:b.__coordMinimized===true,classed:c.classList.contains('lia-coordinate-minimized'),size:[r.width,r.height],buttonDisplay:getComputedStyle(button).display,label:button.getAttribute('aria-label'),state:{minimized:state.minimized,width:state.width,height:state.height}}})()`);
  assert.deepEqual(minimizedBoard,{
    board:minimizeBefore.board,
    mode:minimizeBefore.mode,
    objects:minimizeBefore.objects,
    minimized:true,
    classed:true,
    size:[60,60],
    buttonDisplay:'flex',
    label:'Koordinatensystem öffnen',
    state:{minimized:true,width:380,height:300}
  });
  await evaluate(`__boards.raum.containerObj.querySelector('.lia-coordinate-restore-button').click()`);
  await sleep(220);
  const restoredBoard = await evaluate(`(()=>{const b=__boards.raum,c=b.containerObj,r=c.getBoundingClientRect(),button=c.querySelector('.lia-coordinate-restore-button'),state=__coordBoardStates.raum;return {board:b.__liaBoardId,mode:b.__liaSceneMode,objects:b.objectsList.length,minimized:b.__coordMinimized===true,classed:c.classList.contains('lia-coordinate-minimized'),size:[r.width,r.height],buttonDisplay:getComputedStyle(button).display,stateMinimized:state.minimized}})()`);
  assert.equal(restoredBoard.board,minimizeBefore.board,JSON.stringify(restoredBoard));
  assert.equal(restoredBoard.mode,minimizeBefore.mode,JSON.stringify(restoredBoard));
  assert.equal(restoredBoard.objects,minimizeBefore.objects,JSON.stringify(restoredBoard));
  assert.equal(restoredBoard.minimized,false,JSON.stringify(restoredBoard));
  assert.equal(restoredBoard.classed,false,JSON.stringify(restoredBoard));
  assert.equal(restoredBoard.buttonDisplay,'none',JSON.stringify(restoredBoard));
  assert.equal(restoredBoard.stateMinimized,false,JSON.stringify(restoredBoard));
  assert.ok(restoredBoard.size[0]>=379&&restoredBoard.size[1]>=299,JSON.stringify(restoredBoard));
  await sleep(350);
  assert.deepEqual(await evaluate(`(()=>{const e=__coordinateViews3d.flat_block;return {circles:e.circleObjects.size,points:e.points.size,errors:profileErrors.slice()}})()`),{circles:0,points:0,errors:[]});
  const germanDgs = await evaluate(`(()=>{const c=__boards.raum.containerObj,nodes=[c,...c.querySelectorAll('*')],strings=nodes.flatMap(node=>[node.textContent,node.getAttribute?.('aria-label'),node.getAttribute?.('title'),node.getAttribute?.('placeholder')]).filter(Boolean);return{language:c.dataset.liaDgsLanguage,strings,toolbar:c.querySelector('.lia-dgs-top-menu')?.getAttribute('aria-label'),axes:c.querySelector('.lia-dgs-axis-drag-3d')?.getAttribute('aria-label')}})()`);
  assert.equal(germanDgs.language,'de',JSON.stringify(germanDgs));
  assert.equal(germanDgs.toolbar,'DGS-Menüleiste',JSON.stringify(germanDgs));
  assert.equal(germanDgs.axes,'3D-Objektachsen',JSON.stringify(germanDgs));
  assert.ok(
    germanDgs.strings.every(value => !/[\u00c3\u00c2\u00e2]/.test(value)),
    JSON.stringify(germanDgs.strings.filter(value => /[\u00c3\u00c2\u00e2]/.test(value)))
  );
  assert.deepEqual(await evaluate(`profileErrors.slice()`),[]);
  console.log('PASS strict 2D/3D object isolation for points, linears, and circles across repeated view toggles');
  console.log('PASS Point3D create, XY/Z drag, exact edit, rename, color, fixation, visibility, delete, object list, undo and redo');
  console.log('PASS 3D initialization, views, projections, repeated switching, XY/Z dragging, and exact point properties');
} finally {
  try { ws?.close(); } catch {}
  try { proc?.kill(); } catch {}
  try { server.close(); } catch {}
  if (profile) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(100); }
    }
  }
}
