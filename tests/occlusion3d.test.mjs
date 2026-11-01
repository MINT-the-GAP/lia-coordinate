import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.endsWith('.ts')) return loaded;
    const source = Buffer.isBuffer(loaded.source) ? loaded.source.toString('utf8') : String(loaded.source);
    return { ...loaded, format: 'module', source: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});

const { occlusionHit3D, occlusionOpacity3D } = await import('../src/shared/occlusion3d.ts');
const { cylinderFromAxisRadius3D, coneFromBaseApexRadius3D, parallelepipedFromPointVectors3D } = await import('../src/shared/solid3d.ts');
const sphere = { kind: 'sphere', center: [0, 0, 0], radius: 1, opacity: .3 };
const towardZ = origin => ({ origin, direction: [0, 0, 1] });
const square = { kind: 'polygon', vertices: [[-2,-2,0], [2,-2,0], [2,2,0], [-2,2,0]], opacity: .4 };
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('parallel rays distinguish geometry behind, inside and in front of a sphere', () => {
  close(occlusionHit3D(towardZ([0,0,-3]), sphere).distance, 2);
  close(occlusionHit3D(towardZ([0,0,0]), sphere).distance, 1);
  assert.equal(occlusionHit3D(towardZ([0,0,3]), sphere), null);
  assert.equal(occlusionHit3D(towardZ([2,0,-3]), sphere), null);
  close(occlusionOpacity3D(towardZ([0,0,-3]), [sphere]), .3);
});

test('sphere tangencies and front-surface contacts do not darken an outline', () => {
  assert.equal(occlusionHit3D(towardZ([1,0,-3]), sphere), null);
  assert.equal(occlusionHit3D(towardZ([0,0,1]), sphere), null);
  close(occlusionHit3D(towardZ([0,0,-1]), sphere).distance, 2);
});

test('perspective rays stop at the eye and use actual viewing direction', () => {
  const point = [3,0,-3], eye = [0,0,3];
  const direction = eye.map((value, axis) => value - point[axis]);
  const ray = { origin: point, direction, maxDistance: Math.hypot(...direction) };
  const centeredOnSightline = { ...sphere, center: [1.5,0,0], radius: .4 };
  assert.ok(occlusionHit3D(ray, centeredOnSightline));
  assert.equal(occlusionHit3D(ray, { ...sphere, center: [-1.5,0,6], radius: .4 }), null);
  assert.equal(occlusionHit3D(ray, { ...sphere, center: [2.8,0,0], radius: .4 }), null);
});

test('normalizing a ray preserves world-space distances and robust remote coordinates', () => {
  close(occlusionHit3D({ origin: [0,0,-3], direction: [0,0,7], maxDistance: 2.5 }, sphere).distance, 2);
  assert.equal(occlusionHit3D({ origin: [0,0,-3], direction: [0,0,7], maxDistance: 1.5 }, sphere), null);
  close(occlusionHit3D({ origin: [1e9,1e9,1e9-3], direction: [0,0,1] },
    { ...sphere, center: [1e9,1e9,1e9] }).distance, 2);
});

test('clipped planes occlude only inside their polygon and only when in front', () => {
  close(occlusionHit3D(towardZ([0,0,-1]), square).distance, 1);
  assert.equal(occlusionHit3D(towardZ([3,0,-1]), square), null);
  assert.equal(occlusionHit3D(towardZ([0,0,1]), square), null);
  assert.equal(occlusionHit3D(towardZ([0,0,0]), square), null);
  assert.equal(occlusionHit3D({origin:[0,0,-1], direction:[1,0,0]}, square), null);
  close(occlusionHit3D(towardZ([2,0,-1]), square).distance, 1);
});

test('planar concave surfaces do not occlude their missing corner', () => {
  const polygon = { kind: 'polygon', vertices: [[0,0,0],[2,0,0],[2,1,0],[1,1,0],[1,2,0],[0,2,0]] };
  assert.ok(occlusionHit3D(towardZ([.5,1.5,-1]), polygon));
  assert.equal(occlusionHit3D(towardZ([1.5,1.5,-1]), polygon), null);
  assert.ok(occlusionHit3D(towardZ([1.5,.5,-1]), { ...polygon, vertices: polygon.vertices.slice().reverse() }));
});

test('tilted faces are tested in their actual plane, not by screen bounding box', () => {
  const tilted = { kind: 'polygon', vertices: [[0,0,0],[2,0,2],[2,2,2],[0,2,0]] };
  close(occlusionHit3D(towardZ([1,1,0]), tilted).distance, 1);
  assert.equal(occlusionHit3D(towardZ([1,1,2]), tilted), null);
  assert.equal(occlusionHit3D(towardZ([3,1,0]), tilted), null);
});

test('closed bodies cover their rear geometry without repeated face opacity', () => {
  const cube = parallelepipedFromPointVectors3D([-1,-1,-1], [2,0,0], [0,2,0], [0,0,2]);
  assert.ok(cube);
  const body = {kind:'solid',solid:cube,opacity:.5};
  close(occlusionHit3D(towardZ([0,0,-3]), body).distance, 2);
  close(occlusionOpacity3D(towardZ([0,0,-3]), [body]), .5);
  assert.equal(occlusionHit3D(towardZ([0,0,3]), body), null);
});

test('cylinder and cone tests use smooth side and cap intersections', () => {
  const cylinder = {kind:'solid',solid:cylinderFromAxisRadius3D([0,0,-1],[0,0,1],1)};
  const cone = {kind:'solid',solid:coneFromBaseApexRadius3D([0,0,-1],[0,0,1],1)};
  assert.ok(cylinder.solid && cone.solid);
  close(occlusionHit3D(towardZ([0,0,-3]), cylinder).distance, 2);
  close(occlusionHit3D({origin:[-3,0,0],direction:[1,0,0]}, cylinder).distance, 2);
  close(occlusionHit3D({origin:[-3,0,0],direction:[1,0,0]}, cone).distance, 2.5);
  assert.equal(occlusionHit3D(towardZ([2,0,-3]), cone), null);
});

test('transparent cover combines once per object and supports self-exclusion', () => {
  const owner = {};
  const front = { ...square, owner, opacity:.4 };
  const rear = { ...square, owner, opacity:.4, vertices:square.vertices.map(p=>[p[0],p[1],p[2]+1]) };
  close(occlusionOpacity3D(towardZ([0,0,-3]), [front,rear]), .4);
  close(occlusionOpacity3D(towardZ([0,0,-3]), [front,rear,sphere]), .58);
  close(occlusionOpacity3D(towardZ([0,0,-3]), [front,rear,sphere], owner), .3);
  assert.equal(occlusionOpacity3D(towardZ([0,0,-3]), [{...sphere,opacity:0}]), 0);
});

test('invalid and degenerate input does not attenuate valid geometry', () => {
  assert.equal(occlusionHit3D({origin:[0,0,0],direction:[0,0,0]},sphere),null);
  assert.equal(occlusionHit3D({origin:[NaN,0,0],direction:[0,0,1]},sphere),null);
  assert.equal(occlusionHit3D(towardZ([0,0,-3]),{...sphere,radius:0}),null);
  assert.equal(occlusionHit3D(towardZ([0,0,-3]),{kind:'polygon',vertices:[[0,0,0],[1,0,0],[2,0,0]]}),null);
  assert.equal(occlusionOpacity3D(towardZ([0,0,-3]),[{...sphere,opacity:NaN}]),0);
});

test('filled disks attenuate only their circular footprint in their actual plane', () => {
  const disk = {kind:'disk',center:[0,0,0],normal:[0,0,3],radius:2,opacity:.25};
  close(occlusionHit3D(towardZ([1,0,-3]),disk).distance,3);
  close(occlusionOpacity3D(towardZ([1,0,-3]),[disk]),.25);
  assert.equal(occlusionHit3D(towardZ([1.9,1.9,-3]),disk),null);
  assert.equal(occlusionHit3D(towardZ([0,0,1]),disk),null);
  assert.equal(occlusionHit3D(towardZ([0,0,0]),disk),null);
  assert.equal(occlusionHit3D({origin:[0,0,-1],direction:[1,0,0]},disk),null);
  assert.equal(occlusionHit3D({origin:[0,0,-3],direction:[0,0,1],maxDistance:2},disk),null);
  close(occlusionHit3D({origin:[-3,1,0],direction:[1,0,0]},
    {...disk,normal:[-5,0,0]}).distance,3);
  close(occlusionHit3D(towardZ([0,0,-3]),{...disk,normal:[1,0,1]}).distance,3);
  for (const invalid of [{normal:[0,0,0]},{radius:0},{center:[NaN,0,0]}]) {
    assert.equal(occlusionHit3D(towardZ([0,0,-3]),{...disk,...invalid}),null);
  }
});