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

const { createRegularSolid3DRecipe } = await import('../src/shared/regularSolid3d.ts');
const kinds = ['tetrahedron', 'pyramid', 'prism', 'parallelepiped', 'cuboid'];
const expectedVolumes = {
  tetrahedron: 1 / (6 * Math.sqrt(2)),
  pyramid: Math.SQRT1_2 / 3,
  prism: Math.sqrt(3) / 4,
  parallelepiped: Math.SQRT1_2,
  cuboid: 1
};
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), message || actual + ' != ' + expected);
const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);

test('drag recipes create five closed equal-edge bodies with the first vertex fixed', () => {
  for (const kind of kinds) {
    const anchor = [4, -2, 3], edge = 2.3;
    const recipe = createRegularSolid3DRecipe(kind, anchor, edge);
    assert.ok(recipe, kind);
    assert.deepEqual(recipe.points[0], anchor, kind + ' must retain its click anchor');
    assert.deepEqual(recipe.solid.vertices[0], anchor);
    assert.equal(recipe.solid.kind, kind);
    close(recipe.solid.volume, expectedVolumes[kind] * edge ** 3, kind + ' volume');
    assert.ok(recipe.solid.surfaceArea > 0);
    for (const [a, b] of recipe.solid.edges) {
      close(Math.hypot(...subtract(recipe.solid.vertices[b], recipe.solid.vertices[a])), edge,
        kind + ' must have equal edges');
    }
    for (const vertex of recipe.solid.vertices) assert.ok(vertex[2] >= anchor[2]);
    // Every boundary edge belongs to exactly two faces: there are no open caps.
    const incidence = new Map();
    recipe.solid.faces.forEach(face => face.forEach((index, position) => {
      const next = face[(position + 1) % face.length];
      const key = [index, next].sort((a,b) => a-b).join(':');
      incidence.set(key, (incidence.get(key) || 0) + 1);
    }));
    assert.ok([...incidence.values()].every(count => count === 2), kind + ' must be closed');
  }
});

test('recipes preserve their editable point, polygon and vector dependencies', () => {
  for (const kind of kinds) {
    const recipe = createRegularSolid3DRecipe(kind, [0, 0, 0], 1);
    assert.ok(recipe);
    const valid = index => Number.isInteger(index) && index >= 0 && index < recipe.points.length;
    assert.ok(recipe.pointIndices.every(valid));
    assert.ok(recipe.baseIndices.every(valid));
    assert.ok(recipe.vectorIndices.every(pair => pair.length === 2 && pair.every(valid)));
    if (kind === 'tetrahedron') assert.deepEqual(recipe.pointIndices, [0,1,2,3]);
    if (kind === 'pyramid') {
      assert.equal(recipe.baseIndices.length, 4);
      assert.equal(recipe.pointIndices.length, 1);
    }
    if (kind === 'prism') {
      assert.equal(recipe.baseIndices.length, 3);
      const [a,b] = recipe.vectorIndices[0];
      assert.deepEqual(subtract(recipe.points[b], recipe.points[a]), [0,0,1]);
    }
    if (kind === 'parallelepiped' || kind === 'cuboid') {
      const vectors = recipe.vectorIndices.map(([a,b]) => subtract(recipe.points[b], recipe.points[a]));
      for (let i = 0; i < 3; i++) for (let j = i+1; j < 3; j++) {
        close(dot(vectors[i], vectors[j]), kind === 'cuboid' ? 0 : .5);
      }
    }
  }
});

test('uniform scaling changes lengths, areas and volumes independently of anchor position', () => {
  for (const kind of kinds) {
    const initial = createRegularSolid3DRecipe(kind, [0, 0, 0], 1);
    const moved = createRegularSolid3DRecipe(kind, [-6, 9, -4], 3);
    assert.ok(initial && moved);
    moved.solid.vertices.forEach((point, index) => point.forEach((value, axis) =>
      close(value, [-6,9,-4][axis] + 3 * initial.solid.vertices[index][axis])));
    close(moved.solid.surfaceArea, initial.solid.surfaceArea * 9);
    close(moved.solid.volume, initial.solid.volume * 27);
  }
});

test('invalid anchors, sizes and kinds do not create partial geometry', () => {
  for (const kind of kinds) {
    for (const size of [0, -1, Infinity, NaN]) {
      assert.equal(createRegularSolid3DRecipe(kind, [0,0,0], size), null);
    }
    for (const anchor of [[NaN,0,0], [0,Infinity,0], [0,0]]) {
      assert.equal(createRegularSolid3DRecipe(kind, anchor, 1), null);
    }
  }
  assert.equal(createRegularSolid3DRecipe('sphere', [0,0,0], 1), null);
});