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
const { createLocusCurve3D, createLocusSurface3D } = await import('../src/shared/locus3d.ts');

test('locus sampling batches changes and restoration without board redraws', () => {
  const state = { a: 3, b: -2 }, updates = [];
  let inBatch = false;
  const driver = key => ({
    id: key, range: [-4, 4], get: () => state[key],
    set: value => { state[key] = value; if (!inBatch) updates.push(key); }
  });
  const batch = action => { inBatch = true; try { action(); } finally { inBatch = false; } };
  const curve = createLocusCurve3D(driver('a'), 'P', () => [state.a, state.a ** 2, 0], { batch });
  const surface = createLocusSurface3D(driver('a'), driver('b'), 'P', () => [state.a, state.b, state.a * state.b], { batch });
  assert.deepEqual(curve.curve.evaluate(2), [2, 4, 0]);
  assert.deepEqual(surface.surface.evaluate(1, 2), [1, 2, 2]);
  assert.deepEqual(state, { a: 3, b: -2 });
  assert.deepEqual(updates, [], 'restoration must not cause an unbatched board redraw');
});

test('locus reevaluates changed dependencies and recovers after trace failure', () => {
  let position = 3, scale = 1, fail = false, inBatch = false;
  const driver = { id: 'a', range: [0, 4], get: () => position, set: value => {
    assert.ok(inBatch); position = value;
  } };
  const curve = createLocusCurve3D(driver, 'P', () => {
    if (fail) throw Error('invalid temporary geometry');
    return [position, scale * position, 0];
  }, { batch: action => { inBatch = true; try { action(); } finally { inBatch = false; } } });
  assert.deepEqual(curve.curve.evaluate(2), [2, 2, 0]);
  scale = 7;
  assert.deepEqual(curve.curve.evaluate(2), [2, 14, 0]);
  fail = true;
  assert.equal(curve.curve.evaluate(2), null);
  assert.equal(position, 3);
  fail = false;
  assert.deepEqual(curve.curve.evaluate(1), [1, 7, 0]);
  assert.equal(position, 3);
});

test('recursive dependency evaluation stops without leaving sampled driver values behind', () => {
  let position = 3, nested = 0, curve;
  const driver = { id: 'a', range: [0, 4], get: () => position, set: value => { position = value; } };
  curve = createLocusCurve3D(driver, 'P', () => {
    nested += 1;
    assert.equal(curve.curve.evaluate(0), null);
    return [position, 0, 0];
  });
  assert.deepEqual(curve.curve.evaluate(2), [2, 0, 0]);
  assert.equal(nested, 1);
  assert.equal(position, 3);
});
