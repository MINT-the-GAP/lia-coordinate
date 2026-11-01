import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({ resolve(s,c,n){ return /^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?n(s+'.ts',c):n(s,c); } });
const T=await import('../src/shared/quiz3dTypes.ts');
const G=await import('../src/shared/quiz3dGeometry.ts');
const {planeFromPointNormal}=await import('../src/shared/plane3d.ts');
const {circleFromCenterNormalRadius}=await import('../src/shared/circle3d.ts');
const {sphereFromCenterRadius}=await import('../src/shared/sphere3d.ts');
const {polygonFromPoints3D}=await import('../src/shared/polygon3d.ts');
const {createParametricCurve3D}=await import('../src/shared/curve3d.ts');
const {createParametricSurface3D}=await import('../src/shared/surface3d.ts');
const S=await import('../src/shared/solid3d.ts');
const cfg=(expected,options={})=>T.parseConstructionQuiz3DSpec(JSON.stringify({boardId:'space',expected,...options}));
const act=(key,kind,geometry,options={})=>({key,kind,dimension:3,geometry,...options});
const exp=(kind,geometry,options={})=>({id:options.id||kind,kind,geometry,...options});
const cmp=(object,target,options={})=>G.compareQuizObjects3D(object,target,cfg([target],options));

test('parser accepts JSON/compact aliases and rejects author errors',()=>{
 const q=T.parseConstructionQuiz3DSpec('space;modus=konstruktion;ansicht=3d;objekte=[{"id":"A","typ":"Punkt3D","point":[1,2,3]}];bedingungen=[];toleranz={"koordinate":0.01};versuche=3;livefeedback=ja');
 assert.deepEqual([q.valid,q.mode,q.viewPolicy,q.expected[0].kind,q.maxAttempts,q.liveFeedback],[true,'construction','3d','point3d',3,true]);
 assert.equal(q.tolerance.coordinate,.01);
 const angleSpec=T.parseConstructionQuiz3DSpec(JSON.stringify({boardId:'space',expected:[{id:'g',kind:'line3d',point:[0,0,0],direction:[1,0,0]},{id:'h',kind:'line3d',point:[0,0,0],direction:[0,1,0]}],conditions:[{kind:'angle',objects:['g','h'],value:Math.PI/2,unit:'rad',tolerance:.01}]}));
 assert.equal(angleSpec.conditions[0].unit,'rad'); assert.equal(angleSpec.conditions[0].tolerance,.01); assert.equal(angleSpec.valid,true);
 const incomplete=T.parseConstructionQuiz3DSpec(JSON.stringify({boardId:'space',expected:[{id:'A',kind:'point3d',point:[0,0,0]}],conditions:[{kind:'measurement',objects:['A'],unit:'turn'}]}));
 assert.equal(incomplete.valid,false); assert.match(incomplete.errors.join('|'),/invalid angle unit|finite value|measurement/);
 const contradictory=T.parseConstructionQuiz3DSpec(JSON.stringify({boardId:'space',expected:[{id:'g',kind:'line3d',point:[0,0,0],direction:[1,0,0]},{id:'h',kind:'line3d',point:[0,1,0],direction:[1,0,0]}],conditions:[{kind:'parallel',objects:['g','h']},{kind:'orthogonal',objects:['h','g']}]}));
 assert.equal(contradictory.valid,false); assert.match(contradictory.errors.join('|'),/contradictory/);
 const degreeTolerance=T.parseConstructionQuiz3DSpec(JSON.stringify({boardId:'space',expected:[{id:'g',kind:'line3d',point:[0,0,0],direction:[1,0,0]},{id:'h',kind:'line3d',point:[0,0,0],direction:[0,1,0]}],conditions:[{kind:'angle',objects:['g','h'],value:90,tolerance:1}]}));
 assert.ok(Math.abs(degreeTolerance.conditions[0].tolerance-Math.PI/180)<1e-12);
 const bad=T.parseConstructionQuiz3DSpec(JSON.stringify({boardId:'space',expected:[{id:'A',kind:'point',point:[0,0,0]},{id:'A',kind:'point',point:[1,0,0]}],conditions:[{kind:'distance',objects:['A','X'],value:1}],tolerance:{coordinate:-1},maxAttempts:0}));
 assert.equal(bad.valid,false); for(const word of ['unique','unknown expected object','invalid tolerance','positive integer']) assert.match(bad.errors.join('|'),new RegExp(word));
});

test('linear objects implement the intended equivalence and orientation rules',()=>{
 assert.equal(cmp(act('P','point3d',{coordinates:[1e6+4,2,3]}),exp('point3d',{point:[1e6,2,3]}),{tolerance:{coordinate:1e-6,scalarRelative:1e-5}}).matches,true);
 assert.equal(cmp(act('s','segment3d',{line:{anchor:[1,2,3],direction:[-1,-2,-3],domain:'segment'}}),exp('segment3d',{start:[0,0,0],end:[1,2,3]})).matches,true);
 assert.equal(cmp(act('g','line3d',{line:{anchor:[-4,2,2],direction:[-7,0,0],domain:'line'}}),exp('line3d',{point:[2,2,2],direction:[2,0,0]})).matches,true);
 assert.equal(cmp(act('r','ray3d',{line:{anchor:[0,0,0],direction:[-2,0,0],domain:'ray'}}),exp('ray3d',{start:[0,0,0],direction:[1,0,0]})).matches,false);
 assert.equal(cmp(act('v','vector3d',{line:{anchor:[9,9,9],direction:[1,-2,3],domain:'segment'}}),exp('vector3d',{components:[1,-2,3]})).matches,true);
});

test('planes, circles and spheres accept equivalent representations',()=>{
 const plane=planeFromPointNormal([0,0,2],[0,0,-5]); assert.ok(plane);
 assert.equal(cmp(act('E','plane3d',{plane}),exp('plane3d',{coefficients:[0,0,3,-6]})).matches,true);
 const circle=circleFromCenterNormalRadius([1,2,3],[0,0,-1],4); assert.ok(circle);
 assert.equal(cmp(act('k','circle3d',{circle}),exp('circle3d',{center:[1,2,3],normal:[0,0,6],radius:4})).matches,true);
 const sphere=sphereFromCenterRadius([-1,0,2],3); assert.ok(sphere);
 assert.equal(cmp(act('S','sphere3d',{sphere}),exp('sphere3d',{center:[-1,0,2],radius:3.1})).code,'size-mismatch');
});

test('polygons match cyclic order and make orientation optional',()=>{
 const v=[[0,0,0],[2,0,0],[2,1,0],[0,1,0]];
 const shifted=polygonFromPoints3D([v[2],v[3],v[0],v[1]]); assert.ok(shifted);
 assert.equal(cmp(act('p','polygon3d',{polygon:shifted}),exp('polygon3d',{vertices:v})).matches,true);
 const reverse=polygonFromPoints3D(v.slice().reverse()); assert.ok(reverse);
 assert.equal(cmp(act('r','polygon3d',{polygon:reverse}),exp('polygon3d',{vertices:v},{orientationRelevant:false})).matches,true);
 assert.equal(cmp(act('r','polygon3d',{polygon:reverse}),exp('polygon3d',{vertices:v},{orientationRelevant:true})).matches,false);
});

test('tetrahedra, pyramids, prisms, cuboids, cylinders and cones are comparable',()=>{
 const base=polygonFromPoints3D([[0,0,0],[2,0,0],[2,1,0],[0,1,0]]); assert.ok(base);
 const solids=[S.tetrahedronFromPoints3D([[0,0,0],[1,0,0],[0,1,0],[0,0,1]]),S.pyramidFromBaseApex3D(base,[1,.5,2]),S.prismFromBaseVector3D(base,[0,0,2]),S.parallelepipedFromPointVectors3D([0,0,0],[2,0,0],[0,1,0],[0,0,3],true),S.cylinderFromAxisRadius3D([0,0,0],[0,0,3],2),S.coneFromBaseApexRadius3D([0,0,0],[0,0,3],2)];
 for(const [i,solid] of solids.entries()) { assert.ok(solid,'factory '+i); const geometry=solid.kind==='cylinder'?{solidKind:'cylinder',baseCenter:solid.baseCenter,topCenter:solid.topCenter,radius:2,volume:solid.volume}:solid.kind==='cone'?{solidKind:'cone',baseCenter:solid.baseCenter,apex:solid.apex,radius:2,volume:solid.volume}:{solidKind:solid.kind,vertices:solid.vertices.slice().reverse(),volume:solid.volume}; assert.equal(cmp(act('s'+i,'solid3d',{solid}),exp('solid3d',geometry)).matches,true,solid.kind); }
});

test('curves and surfaces compare loci unless parameterization matters',()=>{
 const curve=createParametricCurve3D(['-t','0','0'],[-1,0]); assert.ok(curve); const ct=exp('curve3d',{expressions:['t','0','0'],range:[0,1],quality:48});
 assert.equal(cmp(act('c','curve3d',{curve}),ct).matches,true); assert.equal(cmp(act('c','curve3d',{curve}),{...ct,parameterizationRelevant:true}).matches,false);
 const surface=createParametricSurface3D(['v','u','u+v'],[0,1],[0,1]); assert.ok(surface); const st=exp('surface3d',{expressions:['u','v','u+v'],uRange:[0,1],vRange:[0,1]});
 assert.equal(cmp(act('f','surface3d',{surface}),st).matches,true); assert.equal(cmp(act('f','surface3d',{surface}),{...st,parameterizationRelevant:true}).matches,false);
});

test('conics and scalar analysis results are first-class objects',()=>{
 const plane=planeFromPointNormal([0,0,0],[0,0,1]); const conic={conicKind:'ellipse',plane,branches:[[]],canonical:{radii:[2,1]}};
 assert.equal(cmp(act('Q','conic3d',{conic}),exp('conic3d',{conicKind:'ellipse',branches:1,radii:[1,2],plane:{point:[0,0,0],normal:[0,0,-1]}})).matches,true);
 assert.equal(cmp(act('m','scalar3d',{value:Math.sqrt(2),unit:'LE'}),exp('scalar3d',{value:Math.sqrt(2)+1e-7,unit:'le'})).matches,true);
});

test('construction mode enforces dependencies while result mode ignores them',()=>{
 const target=exp('point3d',{point:[1,2,3]},{dependency:{boundTo:'g',bindingKind:'line',dependent:true}}); const point=act('A','point3d',{coordinates:[1,2,3]});
 assert.equal(cmp(point,target,{mode:'result'}).matches,true); const c=cmp(point,target,{mode:'construction'}); assert.deepEqual([c.matches,c.code],[false,'dependency-mismatch']);
 assert.equal(G.dependenciesMatch3D({sourceIds:['B','A'],transformation:'rotation'},{sourceIds:['A','B'],transformation:'Rotation'},false),true);
 assert.equal(G.dependenciesMatch3D({sourceIds:['B','A']},{sourceIds:['A','B']},true),false);
 assert.equal(G.dependenciesMatch3D({boundTo:'g',parameters:{kind:'line',t:.50000001}},{boundTo:'g',parameters:{kind:'line',t:.5}}),true);
 assert.equal(G.dependenciesMatch3D({boundTo:'g',parameters:{kind:'line',t:.7}},{boundTo:'g',parameters:{kind:'line',t:.5}}),false);
});

test('bipartite matching never reuses one actual object',()=>{
 const q=cfg([{id:'A',kind:'point3d',point:[0,0,0],weight:2},{id:'B',kind:'point3d',point:[0,0,0],weight:1}]); const r=G.evaluateConstructionQuiz3D([act('one','point3d',{coordinates:[0,0,0]})],q,'de');
 assert.equal(r.correct,false); assert.equal(r.status,'partial'); assert.equal(r.matches.length,1); assert.equal(r.issues[0].code,'missing-object'); assert.ok(r.score>0&&r.score<1); assert.match(r.message,/Objekt fehlt/);
});

test('incidence, parallel, orthogonal, distance, angle and measurement conditions combine',()=>{
 const expected=[{id:'P',kind:'point3d',point:[1,0,0]},{id:'g',kind:'line3d',point:[0,0,0],direction:[1,0,0]},{id:'h',kind:'line3d',point:[0,1,0],direction:[2,0,0]},{id:'k',kind:'line3d',point:[0,0,0],direction:[0,1,0]},{id:'S',kind:'sphere3d',center:[0,0,0],radius:2}];
 const q=cfg(expected,{conditions:[{kind:'incidence',objects:['P','g']},{kind:'parallel',objects:['g','h']},{kind:'orthogonal',objects:['g','k']},{kind:'distance',objects:['P','h'],value:1},{kind:'angle',objects:['g','k'],value:90},{kind:'measurement',objects:['S'],measurement:'radius',value:2}]});
 const line=(a,d)=>({anchor:a,direction:d,domain:'line'}); const objects=[act('P','point3d',{coordinates:[1,0,0]}),act('g','line3d',{line:line([0,0,0],[1,0,0])}),act('h','line3d',{line:line([0,1,0],[2,0,0])}),act('k','line3d',{line:line([0,0,0],[0,1,0])}),act('S','sphere3d',{sphere:sphereFromCenterRadius([0,0,0],2)})];
 const r=G.evaluateConstructionQuiz3D(objects,q,'en'); assert.equal(r.correct,true); assert.equal(r.matches.length,expected.length); assert.match(r.message,/completely correct/);
});

test('spatial relation aliases, analytic measurements and dependency alternatives are graded',()=>{
 const line=(anchor,direction)=>({anchor,direction,domain:'line'});
 const plane=planeFromPointNormal([0,0,0],[0,0,1]); assert.ok(plane);
 const objects=new Map([
  ['g',act('g','line3d',{line:line([0,0,0],[1,0,0])})],
  ['same',act('same','line3d',{line:line([4,0,0],[-2,0,0])})],
  ['parallel',act('parallel','line3d',{line:line([0,1,0],[3,0,0])})],
  ['skew',act('skew','line3d',{line:line([0,0,1],[0,1,0])})],
  ['cross',act('cross','line3d',{line:line([0,0,0],[1,1,0])})],
  ['E',act('E','plane3d',{plane})],
  ['n',act('n','line3d',{line:line([0,0,0],[0,0,1])})],
 ]);
 const condition=(relation,ids)=>({kind:'relation',objects:ids,relation});
 assert.equal(G.evaluateQuizCondition3D(condition('identisch',['g','same']),objects,T.DEFAULT_QUIZ_TOLERANCE_3D),true);
 assert.equal(G.evaluateQuizCondition3D(condition('parallel',['g','same']),objects,T.DEFAULT_QUIZ_TOLERANCE_3D),true);
 assert.equal(G.evaluateQuizCondition3D(condition('echt parallel',['g','parallel']),objects,T.DEFAULT_QUIZ_TOLERANCE_3D),true);
 assert.equal(G.evaluateQuizCondition3D({kind:'parallel',objects:['g','E']},objects,T.DEFAULT_QUIZ_TOLERANCE_3D),true);
 assert.equal(G.evaluateQuizCondition3D({kind:'angle',objects:['n','E'],value:Math.PI/2,unit:'rad'},objects,T.DEFAULT_QUIZ_TOLERANCE_3D),true);
 assert.equal(G.evaluateQuizCondition3D(condition('windschief',['g','skew']),objects,T.DEFAULT_QUIZ_TOLERANCE_3D),true);
 assert.equal(G.evaluateQuizCondition3D(condition('schneidend',['g','cross']),objects,T.DEFAULT_QUIZ_TOLERANCE_3D),true);
 assert.equal(G.evaluateQuizCondition3D(condition('liegt in Ebene',['g','E']),objects,T.DEFAULT_QUIZ_TOLERANCE_3D),true);
 const solid=S.cylinderFromAxisRadius3D([0,0,0],[0,0,3],2); assert.ok(solid);
 const curve=createParametricCurve3D(['t','0','0'],[0,2]); assert.ok(curve);
 const measured=new Map([['Z',act('Z','solid3d',{solid})],['c',act('c','curve3d',{curve})]]);
 assert.equal(G.evaluateQuizCondition3D({kind:'measurement',objects:['Z'],measurement:'volumen',value:solid.volume},measured,T.DEFAULT_QUIZ_TOLERANCE_3D),true);
 assert.equal(G.evaluateQuizCondition3D({kind:'measurement',objects:['Z'],measurement:'oberflaeche',value:solid.surfaceArea},measured,T.DEFAULT_QUIZ_TOLERANCE_3D),true);
 assert.equal(G.evaluateQuizCondition3D({kind:'measurement',objects:['c'],measurement:'bogenlaenge',value:2,tolerance:.002},measured,T.DEFAULT_QUIZ_TOLERANCE_3D),true);
 const target=exp('point3d',{point:[1,2,3]},{dependency:{transformation:'translation',sourceIds:['A']},dependencyAlternatives:[{transformation:'rotation',sourceIds:['A','axis'],parameters:{angle:Math.PI/2}}]});
 const rotated=act('P','point3d',{coordinates:[1,2,3]},{dependency:{transformation:'Rotation',sourceIds:['axis','A'],parameters:{angle:Math.PI/2+1e-7}}});
 assert.equal(cmp(rotated,target,{mode:'construction'}).matches,true);
});
test('combined z=0 objects and auxiliary-object policy work',()=>{
 const target={id:'A',kind:'point3d',point:[2,3,0]}; const point={...act('A2','point3d',{coordinates:[2,3,0]}),dimension:2}; const helper=act('helper','point3d',{coordinates:[8,8,8]},{auxiliary:true});
 assert.equal(G.evaluateConstructionQuiz3D([point],cfg([target]),'de').correct,true);
 assert.equal(G.evaluateConstructionQuiz3D([point,helper],cfg([target],{forbidExtra:true,allowAuxiliary:true}),'de').correct,true);
 const forbidden=G.evaluateConstructionQuiz3D([point,helper],cfg([target],{forbidExtra:true,allowAuxiliary:false}),'de'); assert.equal(forbidden.correct,false); assert.equal(forbidden.issues.at(-1).code,'extra-object');
});

test('invalid definitions are author errors with localized feedback',()=>{
 const r=G.evaluateConstructionQuiz3D([],T.parseConstructionQuiz3DSpec('{broken'),'en'); assert.equal(r.status,'author-error'); assert.equal(r.code,'invalid-config'); assert.match(r.message,/cannot be checked/);
});
test('three independent segments become a quiz polygon without projection data',async()=>{
 globalThis.window={__coordinateViews3d:{},__analytic3DEntries:{},__curve3DEntries:{},__surface3DEntries:{},__conic3DEntries:{},__locus3DEntries:{},__locusSurface3DEntries:{}};
 const point=(id,x,y)=>({id,name:id,elType:'point',__liaDgsPoint:true,__liaDgsPersistentId:id,X:()=>x,Y:()=>y});
 const A=point('A',0,0),B=point('B',3,0),C=point('C',0,2);
 const segment=(id,p,q)=>({id,name:id,__liaDgsSegment:true,__liaDgsPersistentId:id,__liaDgsLinearPoints:[p,q]});
 const objects=[A,B,C,segment('AB',A,B),segment('BC',B,C),segment('CA',C,A)];
 const board={__liaCoordinateBoardId:'space',objectsList:objects,objects:Object.fromEntries(objects.map(o=>[o.id,o]))};
 const {collectCanonicalQuizObjects3D}=await import('../src/subsystems/constructionQuiz3d.ts');
 const canonical=collectCanonicalQuizObjects3D(board); const triangle=canonical.find(o=>o.key.startsWith('synthetic-polygon:'));
 assert.ok(triangle); assert.equal(triangle.dimension,2); assert.equal(triangle.geometry.polygon.area,3);
 const q=cfg([{id:'triangle',kind:'polygon3d',vertices:[[0,0,0],[3,0,0],[0,2,0]]}],{forbidExtra:true});
 assert.equal(G.evaluateConstructionQuiz3D(canonical,q,'de').correct,true);
});
test('appearance checks are opt-in and author cycles are rejected',()=>{
 const target=exp('point3d',{point:[0,0,0]},{visible:true,fixed:true,style:{strokeColor:'#ff00ff',opacity:.5}});
 const object=act('A','point3d',{coordinates:[0,0,0]},{visible:false,fixed:false,style:{strokeColor:'#00ffff',opacity:.5}});
 assert.equal(cmp(object,target).matches,true);
 assert.equal(cmp(object,target,{visibilityRelevant:true}).matches,false);
 assert.equal(cmp({...object,visible:true},target,{fixedRelevant:true}).matches,false);
 assert.equal(cmp({...object,visible:true,fixed:true},target,{formattingRelevant:true}).matches,false);
 const cyclic=T.parseConstructionQuiz3DSpec(JSON.stringify({boardId:'space',expected:[{id:'A',kind:'point3d',point:[0,0,0],dependency:{sourceIds:['B']}},{id:'B',kind:'point3d',point:[1,0,0],dependency:{sourceIds:['A']}}]}));
 assert.equal(cyclic.valid,false); assert.match(cyclic.errors.join('|'),/cycle/);
 const degenerate=T.parseConstructionQuiz3DSpec(JSON.stringify({boardId:'space',expected:[{id:'g',kind:'line3d',point:[0,0,0],direction:[0,0,0]}]}));
 assert.equal(degenerate.valid,false); assert.match(degenerate.errors.join('|'),/degenerate/);
});