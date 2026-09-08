import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(specifier + '.ts', context);
    }
    return nextResolve(specifier, context);
  }
});

const { getDgsUpdateTargets, trackDgsUpdateObject } = await import('../src/shared/dgsUpdateTargets.ts');
const kinds = ['compass', 'trace', 'coordinates', 'slider'];
const flags = {
  compass: { __liaDgsCompassArc: true, __liaDgsCompassFixedRadius: true },
  trace: { __liaDgsTraceEnabled: true },
  coordinates: { __liaDgsCoordinateExpressions: { x: 'a', y: '2*a' } },
  slider: { __liaDgsSlider: true }
};

function boardWith(objects = []) {
  const board = { objectsList: objects.slice(), objects: Object.fromEntries(objects.map(object => [object.id, object])) };
  objects.forEach(object => { object.board = board; });
  return board;
}

function instrumentCollections(board) {
  const reads = { objects: 0, objectsList: 0, enumerations: 0, visits: 0 };
  const objects = new Proxy(board.objects, {
    ownKeys(target) { reads.enumerations += 1; return Reflect.ownKeys(target); }
  });
  const list = new Proxy(board.objectsList, {
    get(target, key, receiver) {
      if (key === 'forEach' || /^\d+$/.test(String(key))) reads.visits += 1;
      return Reflect.get(target, key, receiver);
    }
  });
  Object.defineProperties(board, {
    objects: { get() { reads.objects += 1; return objects; } },
    objectsList: { get() { reads.objectsList += 1; return list; } }
  });
  return reads;
}

test('repeated inactive queries perform no board collection reads after one seed', () => {
  const board = boardWith(Array.from({ length: 100 }, (_, index) => ({ id: 'point-' + index })));
  const reads = instrumentCollections(board);
  assert.deepEqual(getDgsUpdateTargets(board, 'compass'), []);
  assert.equal(reads.enumerations, 1);
  assert.ok(reads.visits >= 100, 'first query discovers pre-existing objects once');
  const afterSeed = { ...reads };
  for (let frame = 0; frame < 100; frame += 1) {
    for (const kind of kinds) assert.deepEqual(getDgsUpdateTargets(board, kind), []);
  }
  assert.deepEqual(reads, afterSeed, 'inactive features do not scan or even read board collections');
});

test('one seed finds every existing feature and deduplicates both object collections', () => {
  const objects = kinds.map(kind => ({ id: kind, ...flags[kind] }));
  const board = boardWith(objects);
  for (const kind of kinds) {
    assert.deepEqual(getDgsUpdateTargets(board, kind), [objects.find(object => object.id === kind)]);
  }
  const reads = instrumentCollections(board);
  for (let frame = 0; frame < 30; frame += 1) {
    for (const kind of kinds) assert.equal(getDgsUpdateTargets(board, kind).length, 1);
  }
  assert.equal(reads.enumerations, 0, 'active queries use id lookups without another collection scan');
  assert.equal(reads.objectsList, 0);
});

test('explicit registration activates properties and new objects after an empty seed', () => {
  for (const kind of kinds) {
    const existing = { id: 'existing' };
    const board = boardWith([existing]);
    assert.deepEqual(getDgsUpdateTargets(board, kind), []);
    Object.assign(existing, flags[kind]);
    trackDgsUpdateObject(board, existing);
    assert.deepEqual(getDgsUpdateTargets(board, kind), [existing]);

    const created = { id: 'created', board };
    board.objects.created = created;
    board.objectsList.push(created);
    // JSXGraph can emit an update before the constructor assigns feature flags.
    assert.deepEqual(getDgsUpdateTargets(board, kind), [existing]);
    Object.assign(created, flags[kind]);
    trackDgsUpdateObject(board, created);
    trackDgsUpdateObject(board, created);
    assert.deepEqual(getDgsUpdateTargets(board, kind), [existing, created]);
  }
});

test('inactive properties and draft/deleted objects are pruned and can be reactivated', () => {
  for (const [kind, disable, enable] of [
    ['compass', object => { object.__liaDgsCompassDraft = true; }, object => { object.__liaDgsCompassDraft = false; }],
    ['compass', object => { object.__liaDgsCompassFixedRadius = false; }, object => { object.__liaDgsCompassFixedRadius = true; }],
    ['trace', object => { object.__liaDgsTraceEnabled = false; }, object => { object.__liaDgsTraceEnabled = true; }],
    ['coordinates', object => { delete object.__liaDgsCoordinateExpressions; }, object => Object.assign(object, flags.coordinates)],
    ['slider', object => { object.__liaDgsSliderDeleted = true; }, object => { object.__liaDgsSliderDeleted = false; }]
  ]) {
    const object = { id: 'feature', ...flags[kind] };
    const board = boardWith([object]);
    assert.deepEqual(getDgsUpdateTargets(board, kind), [object]);
    disable(object);
    assert.deepEqual(getDgsUpdateTargets(board, kind), []);
    enable(object);
    trackDgsUpdateObject(board, object);
    assert.deepEqual(getDgsUpdateTargets(board, kind), [object]);
  }
});

test('changing one feature preserves other active properties on the same point', () => {
  const point = { id: 'P', ...flags.trace, ...flags.coordinates };
  const board = boardWith([point]);
  trackDgsUpdateObject(board, point);
  delete point.__liaDgsCoordinateExpressions;
  trackDgsUpdateObject(board, point);
  assert.deepEqual(getDgsUpdateTargets(board, 'coordinates'), []);
  assert.deepEqual(getDgsUpdateTargets(board, 'trace'), [point]);
});

test('indirect removal and id replacement prune stale objects even if objectsList still contains them', () => {
  for (const kind of kinds) {
    const oldObject = { id: 'shared-id', ...flags[kind] };
    const board = boardWith([oldObject]);
    assert.deepEqual(getDgsUpdateTargets(board, kind), [oldObject]);
    delete board.objects[oldObject.id];
    assert.deepEqual(getDgsUpdateTargets(board, kind), []);
    const replacement = { id: oldObject.id, board, ...flags[kind] };
    board.objects[replacement.id] = replacement;
    board.objectsList.push(replacement);
    trackDgsUpdateObject(board, replacement);
    assert.deepEqual(getDgsUpdateTargets(board, kind), [replacement]);

    const secondReplacement = { id: replacement.id, board, ...flags[kind] };
    board.objects[replacement.id] = secondReplacement;
    trackDgsUpdateObject(board, secondReplacement);
    assert.deepEqual(getDgsUpdateTargets(board, kind), [secondReplacement]);
  }
});

test('array-only boards still detect removal and a replacement board owns a separate registry', () => {
  const point = { id: 'P', ...flags.trace };
  const arrayBoard = { objectsList: [point] };
  assert.deepEqual(getDgsUpdateTargets(arrayBoard, 'trace'), [point]);
  arrayBoard.objectsList = [];
  assert.deepEqual(getDgsUpdateTargets(arrayBoard, 'trace'), []);

  const oldBoard = boardWith([{ id: 'P', ...flags.coordinates }]);
  const oldPoint = getDgsUpdateTargets(oldBoard, 'coordinates')[0];
  const newBoard = boardWith([{ id: 'P', ...flags.coordinates }]);
  const newPoint = getDgsUpdateTargets(newBoard, 'coordinates')[0];
  assert.notEqual(newPoint, oldPoint);
  assert.equal(newPoint.board, newBoard);
  assert.deepEqual(getDgsUpdateTargets(oldBoard, 'coordinates'), [oldPoint]);
  assert.deepEqual(getDgsUpdateTargets(newBoard, 'coordinates'), [newPoint]);
  for (const kind of kinds) assert.deepEqual(getDgsUpdateTargets(null, kind), []);
});
