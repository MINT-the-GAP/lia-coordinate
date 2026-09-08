import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) {
      return nextResolve(specifier + '.ts', context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.endsWith('.ts')) return loaded;
    return {
      ...loaded,
      format: 'module',
      source: ts.transpileModule(Buffer.from(loaded.source).toString('utf8'), {
        compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
      }).outputText
    };
  }
});

const {
  applyAdaptiveTicks,
  updateStickyTickLabelPositions,
  updateViewportAxes
} = await import('../src/coord/boardHelpers.ts');

function createBoard() {
  const board = {
    bbox: [-10, 10, 10, -10],
    containerObj: { clientWidth: 700, clientHeight: 700 },
    calls: [],
    isSuspendedUpdate: false,
    getBoundingBox() { this.calls.push(['read']); return this.bbox.slice(); },
    update() { if (!this.isSuspendedUpdate) this.calls.push(['update']); },
    fullUpdate() { this.calls.push(['fullUpdate']); },
    suspendUpdate() { this.calls.push(['suspend']); this.isSuspendedUpdate = true; },
    unsuspendUpdate() {
      this.calls.push(['unsuspend']);
      this.isSuspendedUpdate = false;
      this.fullUpdate();
    }
  };
  const element = (name) => ({
    setAttribute(attributes) {
      board.calls.push(['attribute', name, attributes]);
      board.update();
    }
  });
  board.defaultAxes = Object.fromEntries(['x', 'y'].map((key) => [key, {
    ...element(key),
    defaultTicks: element(key + 'Ticks')
  }]));
  board.makeTicks = element;
  return board;
}

function mutationCalls(board) { return board.calls.filter(([kind]) => kind !== 'read'); }
function count(board, kind) { return board.calls.filter(([type]) => type === kind).length; }
function initializedBoard() {
  const board = createBoard();
  updateViewportAxes(board);
  board.calls.length = 0;
  return board;
}

test('pan and small zooms with unchanged axis settings perform no attribute or board updates', () => {
  const board = initializedBoard();
  for (const bbox of [[-9.5, 10.5, 10.5, -9.5], [-9.8, 9.8, 9.8, -9.8]]) {
    board.bbox = bbox;
    updateViewportAxes(board);
  }
  assert.deepEqual(mutationCalls(board), []);
});

test('simultaneous tick and sticky-label changes complete layout reads before one renderer update', () => {
  const board = initializedBoard();
  board.bbox = [1, 101, 101, 1];
  updateViewportAxes(board);
  assert.equal(count(board, 'suspend'), 1);
  assert.equal(count(board, 'unsuspend'), 1);
  assert.equal(count(board, 'fullUpdate'), 1);
  assert.equal(count(board, 'update'), 0);
  const firstWrite = board.calls.findIndex(([kind]) => kind === 'attribute');
  assert.ok(firstWrite > 0);
  assert.equal(board.calls.slice(firstWrite).some(([kind]) => kind === 'read'), false);
  const labels = board.calls.filter(([kind, name, attrs]) => kind === 'attribute' &&
    (name === 'xTicks' || name === 'yTicks') && attrs.label?.anchorX);
  assert.deepEqual(labels.map(([, name, attrs]) => [name, attrs.label]), [
    ['xTicks', { anchorX: 'middle', anchorY: 'bottom', offset: [0, 5] }],
    ['yTicks', { anchorX: 'left', anchorY: 'middle', offset: [10, 0] }]
  ]);
  board.calls.length = 0;
  updateViewportAxes(board);
  assert.deepEqual(mutationCalls(board), []);
});

test('anisotropic zoom and crossing one sticky boundary update only the affected axis', () => {
  const board = initializedBoard();
  board.bbox = [-10, 10, 10, -90];
  updateViewportAxes(board);
  assert.deepEqual(board.calls.filter(([kind]) => kind === 'attribute').map(([, key]) => key), ['y', 'yTicks']);
  board.calls.length = 0;
  board.bbox = [1, 10, 21, -90];
  updateViewportAxes(board);
  assert.deepEqual(board.calls.filter(([kind]) => kind === 'attribute').map(([, key]) => key), ['y', 'yTicks']);
});

test('replacement tick objects receive settings even at an unchanged viewport', () => {
  const board = initializedBoard();
  board.defaultAxes.x.defaultTicks = board.makeTicks('replacement');
  updateViewportAxes(board);
  const attributes = board.calls.filter(([kind]) => kind === 'attribute');
  assert.equal(attributes.some(([, key]) => key === 'y' || key === 'yTicks'), false);
  assert.equal(attributes.filter(([, key]) => key === 'replacement').length, 2);
  assert.equal(count(board, 'fullUpdate'), 1);
});

test('existing public tick helpers preserve an outer suspension', () => {
  const board = createBoard();
  board.isSuspendedUpdate = true;
  applyAdaptiveTicks(board);
  updateStickyTickLabelPositions(board);
  assert.equal(board.isSuspendedUpdate, true);
  assert.equal(count(board, 'suspend'), 0);
  assert.equal(count(board, 'unsuspend'), 0);
  assert.equal(count(board, 'fullUpdate'), 0);
  assert.ok(count(board, 'attribute') > 0);
});

test('failed attributes still release the owned suspension and are retried', () => {
  const board = createBoard();
  const write = board.defaultAxes.x.setAttribute;
  board.defaultAxes.x.setAttribute = () => { throw new Error('temporary renderer failure'); };
  updateViewportAxes(board);
  assert.equal(board.isSuspendedUpdate, false);
  assert.equal(count(board, 'unsuspend'), 1);
  board.defaultAxes.x.setAttribute = write;
  board.calls.length = 0;
  updateViewportAxes(board);
  assert.ok(board.calls.some(([kind, key]) => kind === 'attribute' && key === 'x'));
  assert.equal(count(board, 'fullUpdate'), 1);
});

test('unsuspend is never called without acquiring suspension', () => {
  for (const mode of ['noop', 'throws', 'missing-unsuspend']) {
    const board = createBoard();
    if (mode === 'missing-unsuspend') delete board.unsuspendUpdate;
    else board.suspendUpdate = () => {
      board.calls.push(['suspend']);
      if (mode === 'throws') throw new Error('cannot suspend');
    };
    updateViewportAxes(board);
    assert.equal(count(board, 'unsuspend'), 0, mode);
    assert.equal(board.isSuspendedUpdate, false, mode);
    assert.equal(count(board, 'fullUpdate'), 1, mode);
    if (mode === 'missing-unsuspend') assert.equal(count(board, 'suspend'), 0);
  }
});

test('a suspend method that throws after setting the flag is still paired', () => {
  const board = createBoard();
  board.suspendUpdate = () => {
    board.calls.push(['suspend']);
    board.isSuspendedUpdate = true;
    throw new Error('partially completed suspend');
  };
  updateViewportAxes(board);
  assert.equal(board.isSuspendedUpdate, false);
  assert.equal(count(board, 'unsuspend'), 1);
  assert.equal(count(board, 'fullUpdate'), 1);
});
