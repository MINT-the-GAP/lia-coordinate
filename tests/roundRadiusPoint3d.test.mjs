import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import ts from 'typescript';
registerHooks({
  resolve(specifier, context, next) {
    return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
  },
  load(url, context, next) {
    const result = next(url, context);
    return !url.endsWith('.ts') ? result : { ...result, format: 'module', source: ts.transpileModule(String(result.source), {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});
const { installRoundRadiusPoint3D } = await import('../src/coord/roundRadiusPoint3d.ts');
class Point {
  constructor(value) {
    this.__liaPoint3D = true;
    this.coords = [1, ...value];
    this.F = value.slice();
    this.view = { project3DTo2D: p => [1, p[1], p[2]] };
    this.element2D = { coords: { usrCoords: [1, ...value.slice(0, 2)], setCoordinates(_type, value) { this.usrCoords = value; } } };
  }
  X() { return this.coords[1]; }
  Y() { return this.coords[2]; }
  Z() { return this.coords[3]; }
  setPosition(value) { this.coords = [1, ...value]; return this; }
  update() { if(this.nextDrag) { this.coords = [1, ...this.nextDrag]; this.nextDrag = null; } return this; }
}
const xyz = p => [p.X(), p.Y(), p.Z()];
const close = (actual, expected) => actual.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 1e-9, `${actual} != ${expected}`));
const setup = () => ({ a: new Point([0,0,0]), b: new Point([0,0,4]), c: new Point([2,3,5]) });

test('radius control projects to its cap plane and native/programmatic dragging stays constrained', () => {
  const {a,b,c} = setup();
  installRoundRadiusPoint3D(c,a,b);
  close(xyz(c),[2,3,0]);
  assert.equal(c.__liaPoint3DBindingSource, undefined, 'implicit radius constraints must preserve whole-object dragging');
  c.setPosition([4,5,9]); close(xyz(c),[4,5,0]);
  c.nextDrag=[-2,7,8]; c.update(); close(xyz(c),[-2,7,0]);
  close(c.element2D.coords.usrCoords,[1,-2,7]);
  c.setPosition([2,8,10,12]); close(xyz(c),[4,5,0]);
});

test('axis changes parallel-transport the radius without shrinking or waiting for another frame', () => {
  const {a,b,c} = setup();
  installRoundRadiusPoint3D(c,a,b);
  b.setPosition([4,0,0]); close(xyz(c),[0,3,-2]);
  b.setPosition([-4,0,0]); close(xyz(c),[0,3,-2]);
  a.setPosition([1,2,3]); b.setPosition([-3,2,3]); close(xyz(c),[1,5,1]);
  assert.ok(Math.abs(Math.hypot(c.X()-a.X(),c.Y()-a.Y(),c.Z()-a.Z()) - Math.sqrt(13)) < 1e-9);
  const before=xyz(c), offset=[4,-1,2];
  a.setPosition(xyz(a).map((v,i)=>v+offset[i]));
  b.setPosition(xyz(b).map((v,i)=>v+offset[i]));
  c.setPosition(before.map((v,i)=>v+offset[i]));
  close(xyz(c),before.map((v,i)=>v+offset[i]));
});

test('same-axis bodies share the constraint and deletion restores native point methods', () => {
  const {a,b,c} = setup(), nativeSet=c.setPosition, nativeX=c.X;
  const release1=installRoundRadiusPoint3D(c,a,b,{}), release2=installRoundRadiusPoint3D(c,a,b,{});
  release1(); release1(); c.setPosition([1,2,6]); close(xyz(c),[1,2,0]);
  assert.throws(()=>installRoundRadiusPoint3D(c,a,new Point([0,0,4])),/different body axis/);
  release2(); assert.equal(c.setPosition,nativeSet); assert.equal(c.X,nativeX);
  assert.equal(c.__liaRoundRadiusPoint3DSync,undefined);
  c.setPosition([1,2,6]); close(xyz(c),[1,2,6]);
});

test('degenerate and incompatible existing dependencies are rejected without mutation', () => {
  const {a,b,c}=setup();
  c.__liaPoint3DDependent=true;
  assert.throws(()=>installRoundRadiusPoint3D(c,a,b),/base plane/); close(xyz(c),[2,3,5]);
  c.setPosition([2,3,0]); const nativeSet=c.setPosition;
  const cleanup=installRoundRadiusPoint3D(c,a,b); cleanup(); assert.equal(c.setPosition,nativeSet);
  const d=new Point([0,0,2]), original=d.setPosition;
  assert.throws(()=>installRoundRadiusPoint3D(d,a,b),/outside the body axis/);
  assert.equal(d.setPosition,original); close(xyz(d),[0,0,2]);
});