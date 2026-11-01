import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/subsystems/dgs.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('dgs.ts', source, ts.ScriptTarget.Latest, true);
const names = [
  'getDgsFunctionRoots', 'getDgsLineData', 'isPointOnDgsLinearObject', 'getDgsCircleData',
  'getDgsEllipseData', 'isDgsCurve3D',
  'getDgsIntersectionCircleData', 'normalizeDgsPositiveAngle', 'isPointOnDgsCompassArc',
  'getDgsCompassArcGeometry', 'getDgsIntersectionPositions', 'isDgsIntersectionTarget',
  'isDgsTangentTarget', 'findDgsIntersectionTarget', 'findNearestDgsLinearObject'
];
const selected = ast.statements.filter(node => names.includes(node.name?.text));
assert.equal(selected.length, names.length);
const implementation = ts.transpileModule(selected.map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target:ts.ScriptTarget.ES2020, module:ts.ModuleKind.ES2020 }
}).outputText;
function fixture() {
  const board = { origin:{scrCoords:[1,0,0]},unitX:50,unitY:50,canvasWidth:700,
    getBoundingBox:()=>[-10,10,10,-10],objectsList:[],objects:{} };
  const state = { board, selectedIntersectionObject:null,
    boardContainer:{getBoundingClientRect:()=>({left:0,top:0})} };
  const context = vm.createContext({
    isDgsCompassArc: o=>!!o?.__liaDgsCompassArc,
    isDgsCircle: o=>!!o?.__liaDgsCircle,
    isDgsCircle3D: o=>!!o?.__liaDgsCircle3D,
    isDgsSphere3D: o=>!!o?.__liaDgsSphere3D,
    isDgsPolygon3D: o=>!!o?.__liaDgsPolygon3D,
    isDgsSolid3D: o=>!!o?.__liaDgsSolid3D,
    isDgsEllipse: o=>!!o?.__liaDgsEllipse,
    isDgsPlane: o=>!!o?.__liaDgsPlane,
    getCoordinateView3D: ()=>null,
    isDgsFunctionTarget: o=>o?.elType==='functiongraph',
    isDgsLinearObject: o=>['segment','line','ray','vector'].includes(o?.elType),
    isDgsLine: o=>o?.elType==='line', isDgsRay: o=>o?.elType==='ray',
    findDgsContextObject:()=>state.topHit,
    getDgsBoardObjects:()=>board.objectsList,
    getDgsObjectRenderedLayer:o=>o.layer||0,
    dgsCircleContainsPointer:(_,o)=>o.hit===true
  });
  vm.runInContext(implementation,context);
  return {board,state,context,intersections:(a,b)=>context.getDgsIntersectionPositions(state,a,b)};
}
function point(x,y) { return {X:()=>x,Y:()=>y}; }
function arc(cx,cy,r,start=0,sweep=Math.PI*2,metadata={}) {
  return {__liaDgsCompassArc:true,__liaDgsCompassDraft:false,
    __liaDgsCompassCenterPoint:point(cx,cy),
    __liaDgsCompassRadiusPoint:point(cx+r*Math.cos(start+sweep),cy+r*Math.sin(start+sweep)),
    __liaDgsCompassSweepAngle:sweep,...metadata};
}
function linear(x1,y1,x2,y2,elType='segment') {
  return {elType,point1:point(x1,y1),point2:point(x2,y2)};
}
function close(actual,expected) {
  assert.equal(actual.length,expected.length);
  actual.forEach((p,i)=>assert.ok(Math.hypot(p.x-expected[i][0],p.y-expected[i][1])<1e-5,
    JSON.stringify(actual)+' != '+JSON.stringify(expected)));
}

test('two drawn compass circles yield two crossings, tangency one, disjoint or coincident circles none',()=>{
  const f=fixture(), a=arc(0,0,2);
  close(f.intersections(a,arc(2,0,2)),[[1,-Math.sqrt(3)],[1,Math.sqrt(3)]]);
  close(f.intersections(a,arc(4,0,2)),[[2,0]]);
  close(f.intersections(a,arc(5,0,2)),[]);
  close(f.intersections(a,arc(0,0,2)),[]);
});

test('positive and negative sweeps restrict intersections to the drawn part including endpoints',()=>{
  const f=fixture();
  close(f.intersections(arc(0,0,2,0,Math.PI),arc(2,0,2)),[[1,Math.sqrt(3)]]);
  close(f.intersections(arc(0,0,2,0,-Math.PI),arc(2,0,2)),[[1,-Math.sqrt(3)]]);
  close(f.intersections(arc(0,0,2,0,Math.PI/2),linear(0,-3,0,3)),[[0,2]]);
  close(f.intersections(arc(0,0,2,Math.PI*1.75,Math.PI/2),linear(-3,0,3,0)),[[2,0]]);
});

test('compass intersections honor segment, ray and vector boundaries in either source order',()=>{
  const f=fixture(), a=arc(0,0,2);
  for(const kind of ['segment','vector']) {
    const line=linear(0,0,3,0,kind);
    close(f.intersections(a,line),[[2,0]]);
    close(f.intersections(line,a),[[2,0]]);
    close(f.intersections(a,linear(0,0,1,0,kind)),[]);
  }
  close(f.intersections(a,linear(0,0,1,0,'ray')),[[2,0]]);
  close(f.intersections(a,linear(0,0,1,0,'line')),[[-2,0],[2,0]]);
});

test('compass arcs intersect circles and function graphs without completing their carrier circle',()=>{
  const f=fixture(), a=arc(0,0,2,0,Math.PI/2);
  close(f.intersections(a,{__liaDgsCircle:true,center:point(2,0),Radius:()=>2}),[[1,Math.sqrt(3)]]);
  close(f.intersections(a,{elType:'functiongraph',Y:()=>1}),[[Math.sqrt(3),1]]);
});

test('drafts are excluded and moving source coordinates updates the computed crossings',()=>{
  const f=fixture(), a=arc(0,0,2), b=arc(2,0,2);
  close(f.intersections({...a,__liaDgsCompassDraft:true},b),[]);
  b.__liaDgsCompassCenterPoint=point(4,0);
  b.__liaDgsCompassRadiusPoint=point(6,0);
  close(f.intersections(a,b),[[2,0]]);
});

test('a second click on overlapping arcs excludes the already selected topmost arc',()=>{
  const f=fixture(), a={...arc(0,0,2),hasPoint:()=>true,layer:8}, b={...arc(2,0,2),hasPoint:()=>true,layer:5};
  f.board.objectsList=[a,b]; f.state.topHit=a;
  const event={clientX:50,clientY:80};
  assert.equal(f.context.findDgsIntersectionTarget(f.state,event),a);
  f.state.selectedIntersectionObject=a;
  assert.equal(f.context.findDgsIntersectionTarget(f.state,event),b);
  b.__liaDgsCompassDraft=true;
  assert.equal(f.context.findDgsIntersectionTarget(f.state,event),null);
  b.__liaDgsCompassDraft=false; b.__liaDgsShowObject=false;
  assert.equal(f.context.findDgsIntersectionTarget(f.state,event),null);
});

test('second selection can reach an underlying segment and excludes selected lines too',()=>{
  const f=fixture(), a={...arc(0,0,2),hasPoint:()=>true,layer:8};
  const b={...linear(-3,0,3,0),hasPoint:()=>true,layer:5};
  const c={...linear(0,-3,0,3),hasPoint:()=>true,layer:2};
  f.board.objectsList=[a,b]; f.state.topHit=a; f.state.selectedIntersectionObject=a;
  const event={clientX:0,clientY:0};
  assert.equal(f.context.findDgsIntersectionTarget(f.state,event),b);
  f.board.objectsList=[b,c]; f.state.topHit=b; f.state.selectedIntersectionObject=b;
  assert.equal(f.context.findDgsIntersectionTarget(f.state,event),c);
  f.board.objectsList=[b];
  assert.equal(f.context.findDgsIntersectionTarget(f.state,event),null);
});
