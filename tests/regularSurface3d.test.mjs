import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(/^\.\.?\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)
      ? specifier + '.ts' : specifier, context);
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.endsWith('.ts')) return loaded;
    return { ...loaded, format: 'module', source: ts.transpileModule(String(loaded.source), {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});

const { createRegularSurface3DRecipe } = await import('../src/shared/regularSurface3d.ts');
const { circleArea, pointOnCircle } = await import('../src/shared/circle3d.ts');
const close = (actual, expected, label = '') => assert.ok(
  Math.abs(actual - expected) < 1e-9 * Math.max(1, Math.abs(expected)),
  label + ': ' + actual + ' != ' + expected);
test('circle uses the click as center and supplies a radius point on its rim', () => {
  const anchor = [-2,4,-6], radius = 3.75;
  const recipe = createRegularSurface3DRecipe('circle', anchor, radius);
  assert.ok(recipe?.circle);
  assert.equal(recipe.points.length, 3);
  assert.deepEqual(recipe.circle.center, anchor);
  assert.deepEqual(recipe.points[0], anchor);
  assert.deepEqual(recipe.circle.normal, [0,0,1]);
  assert.ok(pointOnCircle(recipe.points[1], recipe.circle));
  assert.deepEqual(recipe.points[2].map((value,axis) => value - anchor[axis]), [0,0,radius]);
  close(recipe.circle.radius, radius);
  close(circleArea(recipe.circle), Math.PI*radius**2);
});

test('draw size scales lengths and area without changing the click anchor', () => {
  const original = createRegularSurface3DRecipe('circle', [0,0,0], 1);
  const moved = createRegularSurface3DRecipe('circle', [-7,3,5], 4);
  assert.ok(original && moved);
  moved.points.forEach((point,index) => point.forEach((value,axis) =>
    close(value, [-7,3,5][axis] + 4*original.points[index][axis])));
  close(circleArea(moved.circle), circleArea(original.circle)*16);
});

test('circle recipe owns its anchor and input source arrays', () => {
  const anchor = [1,2,3];
  const recipe = createRegularSurface3DRecipe('circle', anchor, 2);
  assert.ok(recipe);
  anchor[0] = 99;
  assert.equal(recipe.anchor[0], 1);
  assert.equal(recipe.points[0][0], 1);
  recipe.points[0].unshift(1);
  assert.equal(recipe.anchor.length, 3);
});

test('unsupported kinds and degenerate circles are rejected', () => {
  for (const size of [0,-1,NaN,Infinity,1e-15]) {
    assert.equal(createRegularSurface3DRecipe('circle',[0,0,0],size),null);
  }
  for (const anchor of [[0,0], [NaN,0,0], [0,0,Infinity]]) {
    assert.equal(createRegularSurface3DRecipe('circle',anchor,1),null);
  }
  for (const kind of ['sphere','polygon']) {
    assert.equal(createRegularSurface3DRecipe(kind,[0,0,0],1),null);
  }
  assert.equal(createRegularSurface3DRecipe('circle',[Number.MAX_VALUE,0,0],Number.MAX_VALUE),null);
});
