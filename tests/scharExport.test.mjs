import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, next) {
    return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
  },
  load(url, context, next) {
    const loaded = next(url, context);
    if (!url.endsWith('.ts')) return loaded;
    let source = Buffer.from(loaded.source).toString('utf8');
    if (url.endsWith('/subsystems/schar.ts')) source += '\nexport { parseScharSpec, extractParams, compileFamilyExpr };';
    if (url.endsWith('/subsystems/regression.ts')) source += '\nexport { GRAPH_MODELS };';
    return { ...loaded, format:'module', source:ts.transpileModule(source, {
      compilerOptions:{module:ts.ModuleKind.ES2020,target:ts.ScriptTarget.ES2020}
    }).outputText };
  }
});
globalThis.window = {};
const { getScharExportDefinition, parseScharInitialValues, formatScharInitialValues } = await import('../src/shared/scharExport.ts');
const { parseScharSpec, extractParams, compileFamilyExpr } = await import('../src/subsystems/schar.ts');
const { GRAPH_MODELS } = await import('../src/subsystems/regression.ts');

for (const classKey of Object.keys(GRAPH_MODELS)) {
  test(classKey + ' exports the actual regression model as a Schar, including negative scale and domains', () => {
    const model = {m:-2.345,n:.4321,a:.123456789123,b:-1.75,c:1.25,d:-.65,f:1e-12,A:2.34};
    const entry = {classKey,model,color:'#1255aa'};
    const object = {__liaRegressionAnalysisGraph:true,__liaRegressionEntry:entry};
    const family = getScharExportDefinition(object);
    assert.ok(family);
    const spec = parseScharSpec('f;x;'+family.expression+';board;term=1;'+family.color+';'+formatScharInitialValues(family.values));
    assert.equal(spec.color,entry.color);
    const params=extractParams(spec.expr,spec.variableName);
    assert.deepEqual(new Set(params),new Set(Object.keys(family.values)));
    const fn=compileFamilyExpr(spec.expr,spec.variableName,params);
    assert.ok(fn,'Schar expression compiles');
    const original=GRAPH_MODELS[classKey].basis(model);
    for(const x of [-5,-1.25,-1,0,.4,1,3,8]) {
      const expected=original(x),actual=fn(x,spec.initialValues);
      if(!Number.isFinite(expected)) assert.equal(Number.isFinite(actual),false,'domain at '+x);
      else assert.ok(Math.abs(actual-expected)<1e-12*Math.max(1,Math.abs(expected)),x+': '+actual+' vs '+expected);
    }
    assert.deepEqual(entry,{classKey,model,color:'#1255aa'},'export does not modify the model');
  });
}

test('parameter defaults preserve precision, zeros, negative values and scientific notation', () => {
  const values={a:1e-20,b:-.987654321987654,c:0,d:1e22};
  assert.deepEqual({...parseScharInitialValues([formatScharInitialValues(values)])},values);
  assert.deepEqual({...parseScharInitialValues(['params=[a=2;b=-.5;a=0]','params=[b=3e-8]'])},{a:0,b:3e-8});
});

test('invalid parameter values are ignored and old Schar syntax is unchanged', () => {
  assert.deepEqual({...parseScharInitialValues(['params=[a=Infinity;b=NaN;c=;d=alert(1);f=0x10;m=1e999;n=2]'])},{n:2});
  const legacy=parseScharSpec('g;x;m*x+n;board;#00ffff;term=0;linestyle=dashed');
  assert.equal(legacy.showTerm,false);assert.equal(legacy.color,'#00ffff');assert.equal(legacy.lineStyle,'dashed');
  assert.deepEqual({...legacy.initialValues},{});
});

test('raw drawings, hit proxies and invalid recognized models are not exported as families', () => {
  for(const object of [{points:[{x:1,y:2}]},{__liaDgsAnalysisTarget:{}},
    {__liaRegressionAnalysisGraph:true,__liaRegressionEntry:{classKey:'unknown',model:{}}},
    {__liaRegressionAnalysisGraph:true,__liaRegressionEntry:{classKey:'linear',model:{m:NaN,n:0}}}]) {
    assert.equal(getScharExportDefinition(object),null);
  }
});

for(const degree of [3,4]) {
  test('a dragged degree '+degree+' Schar exports its visible polynomial without modifying the original',()=>{
    const parameters=degree===3?['a','b','c','d']:['a','b','c','d','f'];
    const values=Object.fromEntries(parameters.map((p,i)=>[p,i+.2345]));
    const mapping=Object.fromEntries(parameters.map((p,i)=>[degree-i,p]));
    const expression=parameters.map((p,i)=>p+(degree-i?'*x^'+(degree-i):'')).join('+');
    const entry={params:parameters,values,cfg:{name:'g',showName:true,variableName:'x',expr:expression,
      showTerm:true,color:'#124567',lineStyle:'dashed'},polyCoeffDrag:{maxDegree:degree,degreeToParam:mapping},dragShiftX:1.37};
    const object={__liaScharEntry:entry};entry.graph=object;
    const family=getScharExportDefinition(object);
    const fn=compileFamilyExpr(expression,'x',parameters);
    for(const x of [-5,-1,0,1.37,3,5]) assert.ok(Math.abs(fn(x,family.values)-fn(x-1.37,values))<1e-8);
    assert.equal(entry.values,values);assert.equal(entry.dragShiftX,1.37);
    assert.equal(family.lineStyle,'dashed');
  });
}
