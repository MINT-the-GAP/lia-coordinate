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
    const source = Buffer.isBuffer(loaded.source)
      ? loaded.source.toString('utf8')
      : String(loaded.source);
    return {
      ...loaded,
      format: 'module',
      source: ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ES2020,
          target: ts.ScriptTarget.ES2020
        }
      }).outputText
    };
  }
});

const { init: initArea } = await import('../src/subsystems/area.ts');

function emptyCalls() {
  return {
    creates: [],
    removals: [],
    updates: 0,
    suspends: 0,
    unsuspends: 0,
    setAttributes: 0,
    shows: 0,
    hides: 0
  };
}

function fakeElement(board, type, extra = {}) {
  const element = {
    board,
    elType: type,
    attributes: [],
    setAttribute(attributes) {
      board.calls.setAttributes += 1;
      this.attributes.push(attributes);
    },
    showElement() { board.calls.shows += 1; },
    hideElement() { board.calls.hides += 1; },
    ...extra
  };
  board.objects.push(element);
  return element;
}

function fakeBoard(id, {
  suspended = false,
  inUpdate = false,
  suspendNoop = false
} = {}) {
  return {
    id,
    isSuspendedUpdate: suspended,
    inUpdate,
    calls: emptyCalls(),
    objects: [],
    resetCalls() { this.calls = emptyCalls(); },
    suspendUpdate() {
      this.calls.suspends += 1;
      if (!suspendNoop) this.isSuspendedUpdate = true;
    },
    unsuspendUpdate() {
      this.calls.unsuspends += 1;
      this.isSuspendedUpdate = false;
    },
    update() { this.calls.updates += 1; },
    removeObject(object) {
      this.calls.removals.push(object && object.elType);
    },
    create(type, parents, attributes) {
      this.calls.creates.push(type);
      if (type === 'point') {
        return fakeElement(this, 'point', {
          X() { return Number(parents[0]); },
          Y() { return Number(parents[1]); }
        });
      }
      if (type === 'polygon') {
        const polygon = fakeElement(this, 'polygon', {
          vertices: parents.slice()
        });
        polygon.borders = parents.map(() => fakeElement(this, 'segment'));
        return polygon;
      }
      if (type === 'text') {
        return fakeElement(this, 'text', {
          parents,
          creationAttributes: attributes
        });
      }
      throw new Error('Unexpected JSXGraph object type: ' + type);
    }
  };
}

function areaSpec(boardId, {
  color = '#e63946',
  opacity = '0.25',
  options = []
} = {}) {
  return [
    boardId,
    '[[0;0];[1;0];[1;1];[0;1]]',
    color,
    opacity,
    ...options
  ].join(';');
}

function marker(uid, spec) {
  return {
    id: 'area-spec-' + uid,
    nodeType: 1,
    dataset: { spec, language: 'en' },
    querySelector() { return null; }
  };
}

function replaceGlobal(t, name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value
  });
  t.after(function() {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  });
}

function areaHarness(t, boards) {
  const state = {
    nodes: [],
    backgroundColor: 'rgb(255, 255, 255)'
  };
  const scheduled = [];
  const themeListeners = new Set();
  const fakeDocument = {
    body: { className: '' },
    documentElement: { className: '' },
    querySelector() { return null; },
    querySelectorAll() { return state.nodes; }
  };
  const fakeWindow = {
    __boards: boards,
    __points: {},
    __liaThemeSync: { listeners: themeListeners, check() {} },
    __registerLiaThemeListener(listener) {
      themeListeners.add(listener);
    },
    getComputedStyle() {
      return {
        backgroundColor: state.backgroundColor,
        borderTopColor: 'rgb(0, 0, 0)',
        color: 'rgb(0, 0, 0)'
      };
    }
  };
  const schedule = function(kind) {
    return function(callback, delay) {
      scheduled.push({ callback, delay, kind });
      return scheduled.length;
    };
  };

  replaceGlobal(t, 'window', fakeWindow);
  replaceGlobal(t, 'document', fakeDocument);
  replaceGlobal(t, 'requestAnimationFrame', schedule('raf'));
  replaceGlobal(t, 'setTimeout', schedule('timeout'));
  replaceGlobal(t, 'setInterval', function() { return 0; });
  initArea();

  // Discard only the normal initialization retries.
  scheduled.length = 0;

  return {
    window: fakeWindow,
    scheduled,
    setNodes(nodes) { state.nodes = nodes; },
    bootstrap() { fakeWindow.__bootstrapAreas(); },
    refreshTheme() {
      themeListeners.forEach(listener => listener());
    },
    setBackgroundColor(color) {
      state.backgroundColor = color;
    }
  };
}

function activity(board) {
  return {
    creates: board.calls.creates.length,
    removals: board.calls.removals.length,
    updates: board.calls.updates,
    suspends: board.calls.suspends,
    unsuspends: board.calls.unsuspends,
    setAttributes: board.calls.setAttributes,
    shows: board.calls.shows,
    hides: board.calls.hides
  };
}

function assertNoActivity(board) {
  assert.deepEqual(activity(board), {
    creates: 0,
    removals: 0,
    updates: 0,
    suspends: 0,
    unsuspends: 0,
    setAttributes: 0,
    shows: 0,
    hides: 0
  });
}

test('390 areas on eight boards batch once per board and repeat as a complete no-op', (t) => {
  const boards = {};
  for (let index = 0; index < 8; index += 1) {
    boards['board-' + index] = fakeBoard('board-' + index);
  }
  const harness = areaHarness(t, boards);
  harness.setNodes(Array.from({ length: 390 }, function(_, index) {
    return marker(
      String(index),
      areaSpec('board-' + (index % 8))
    );
  }));

  harness.bootstrap();

  assert.equal(Object.keys(harness.window.__areaEntries).length, 390);
  assert.equal(
    Object.values(boards).reduce((sum, board) => sum + board.objects.length, 0),
    3510,
    'four helper points, one polygon, and four borders per area'
  );
  Object.values(boards).forEach(function(board) {
    assert.equal(board.calls.suspends, 1, board.id);
    assert.equal(board.calls.unsuspends, 1, board.id);
    assert.equal(board.calls.updates, 0, board.id);
    assert.equal(board.isSuspendedUpdate, false, board.id);
  });
  assert.equal(harness.scheduled.length, 0);

  const originalEntries = { ...harness.window.__areaEntries };
  Object.values(boards).forEach(board => board.resetCalls());
  harness.bootstrap();

  Object.values(boards).forEach(assertNoActivity);
  Object.keys(originalEntries).forEach(function(key) {
    assert.strictEqual(harness.window.__areaEntries[key], originalEntries[key]);
  });
  assert.equal(harness.scheduled.length, 0);
});

test('measurement-label refreshes scale with scheduler passes, not label count', (t) => {
  const boardA = fakeBoard('board-a');
  const boardB = fakeBoard('board-b');
  const harness = areaHarness(t, {
    'board-a': boardA,
    'board-b': boardB
  });
  harness.setNodes(Array.from({ length: 75 }, function(_, index) {
    const boardId = index < 40 ? 'board-a' : 'board-b';
    return marker(
      'label-' + index,
      areaSpec(boardId, { options: ['area=1'] })
    );
  }));

  harness.bootstrap();

  assert.equal(harness.scheduled.length, 6);
  assert.deepEqual(
    harness.scheduled.map(item => [item.kind, item.delay]),
    [
      ['timeout', 0],
      ['timeout', 80],
      ['timeout', 220],
      ['timeout', 0],
      ['timeout', 80],
      ['timeout', 220]
    ]
  );
  assert.equal(boardA.calls.suspends, 1);
  assert.equal(boardA.calls.unsuspends, 1);
  assert.equal(boardA.calls.updates, 0);
  assert.equal(boardB.calls.suspends, 1);
  assert.equal(boardB.calls.unsuspends, 1);
  assert.equal(boardB.calls.updates, 0);

  boardA.resetCalls();
  boardB.resetCalls();
  for (let pass = 1; pass <= 3; pass += 1) {
    const scheduled = harness.scheduled.shift();
    assert.equal(scheduled.kind, 'timeout');
    scheduled.callback();
    assert.equal(boardA.calls.updates, pass);
    assert.equal(boardB.calls.updates, 0);
  }
  for (let pass = 1; pass <= 3; pass += 1) {
    const scheduled = harness.scheduled.shift();
    assert.equal(scheduled.kind, 'timeout');
    scheduled.callback();
    assert.equal(boardA.calls.updates, 3);
    assert.equal(boardB.calls.updates, pass);
  }
  assert.equal(harness.scheduled.length, 0);
  assert.equal(boardA.calls.suspends, 0);
  assert.equal(boardA.calls.unsuspends, 0);
  assert.equal(boardB.calls.suspends, 0);
  assert.equal(boardB.calls.unsuspends, 0);
});

test('a late measurement label receives three fresh deferred refreshes', (t) => {
  const board = fakeBoard('board-a');
  const harness = areaHarness(t, { 'board-a': board });
  const labelSpec = areaSpec('board-a', { options: ['area=1'] });
  harness.setNodes([marker('first-label', labelSpec)]);
  harness.bootstrap();

  assert.equal(harness.scheduled.length, 3);
  board.resetCalls();
  harness.scheduled.shift().callback();
  assert.equal(board.calls.updates, 1);

  assert.equal(
    harness.window.renderAreaFromSpec('late-label', labelSpec, 'en'),
    true
  );
  assert.equal(harness.scheduled.length, 2);
  board.resetCalls();

  harness.scheduled.shift().callback();
  harness.scheduled.shift().callback();
  assert.equal(board.calls.updates, 2);
  assert.deepEqual(
    harness.scheduled.map(item => [item.kind, item.delay]),
    [
      ['timeout', 0],
      ['timeout', 80],
      ['timeout', 220]
    ]
  );

  while (harness.scheduled.length) {
    harness.scheduled.shift().callback();
  }
  assert.equal(board.calls.updates, 3);
});

test('a visual change reuses geometry and flushes its board once', (t) => {
  const board = fakeBoard('board-a');
  const harness = areaHarness(t, { 'board-a': board });
  const node = marker('style', areaSpec('board-a'));
  harness.setNodes([node]);
  harness.bootstrap();

  const entry = harness.window.__areaEntries['area-style'];
  const polygon = entry.polygon;
  const points = entry.points.slice();
  board.resetCalls();
  node.dataset.spec = areaSpec('board-a', {
    color: '#00aaff',
    opacity: '0.6',
    options: ['visible=0']
  });
  harness.bootstrap();

  const updated = harness.window.__areaEntries['area-style'];
  assert.strictEqual(updated, entry);
  assert.strictEqual(updated.polygon, polygon);
  assert.deepEqual(updated.points, points);
  assert.equal(updated.color, '#00aaff');
  assert.equal(updated.opacity, 0.6);
  assert.equal(updated.visible, false);
  assert.equal(board.calls.creates.length, 0);
  assert.equal(board.calls.removals.length, 0);
  assert.ok(board.calls.setAttributes > 0);
  assert.equal(board.calls.suspends, 1);
  assert.equal(board.calls.unsuspends, 1);
  assert.equal(board.calls.updates, 0);
});

test('theme refresh preserves foreign DGS metadata and only advances automatic colors', (t) => {
  const board = fakeBoard('board-a');
  const harness = areaHarness(t, { 'board-a': board });
  harness.setNodes([
    marker('explicit-theme', areaSpec('board-a')),
    marker(
      'automatic-theme',
      'board-a;[[0;0];[1;0];[1;1];[0;1]]'
    )
  ]);
  harness.bootstrap();

  const explicit = harness.window.__areaEntries['area-explicit-theme'];
  const automatic = harness.window.__areaEntries['area-automatic-theme'];
  const explicitLabel = { kind: 'foreign-explicit-label' };
  const automaticLabel = { kind: 'foreign-automatic-label' };
  explicit.polygon.__liaDgsMeasurementLabel = explicitLabel;
  explicit.polygon.__liaDgsShowArea = true;
  explicit.polygon.__liaDgsShowPerimeter = true;
  explicit.polygon.__liaDgsColor = '#custom-color';
  explicit.polygon.__liaDgsLineColor = '#custom-line';
  explicit.polygon.__liaDgsFillColor = '#custom-fill';

  assert.equal(automatic.color, '#000');
  automatic.polygon.__liaDgsMeasurementLabel = automaticLabel;
  automatic.polygon.__liaDgsShowArea = true;
  automatic.polygon.__liaDgsShowPerimeter = true;
  automatic.polygon.__liaDgsLineColor = '#custom-auto-line';
  automatic.polygon.borders[0].__liaDgsTextColor = '#custom-border-text';

  board.resetCalls();
  harness.setBackgroundColor('rgb(0, 0, 0)');
  harness.refreshTheme();

  assert.strictEqual(explicit.polygon.__liaDgsMeasurementLabel, explicitLabel);
  assert.equal(explicit.polygon.__liaDgsShowArea, true);
  assert.equal(explicit.polygon.__liaDgsShowPerimeter, true);
  assert.equal(explicit.polygon.__liaDgsColor, '#custom-color');
  assert.equal(explicit.polygon.__liaDgsLineColor, '#custom-line');
  assert.equal(explicit.polygon.__liaDgsFillColor, '#custom-fill');

  assert.equal(automatic.color, '#fff');
  assert.strictEqual(automatic.polygon.__liaDgsMeasurementLabel, automaticLabel);
  assert.equal(automatic.polygon.__liaDgsShowArea, true);
  assert.equal(automatic.polygon.__liaDgsShowPerimeter, true);
  assert.equal(automatic.polygon.__liaDgsColor, '#fff');
  assert.equal(automatic.polygon.__liaDgsFillColor, '#fff');
  assert.equal(automatic.polygon.__liaDgsLineColor, '#custom-auto-line');
  assert.equal(
    automatic.polygon.borders[0].__liaDgsTextColor,
    '#custom-border-text'
  );
  assert.equal(automatic.polygon.borders[1].__liaDgsTextColor, '#fff');
  assert.equal(board.calls.suspends, 1);
  assert.equal(board.calls.unsuspends, 1);
  assert.equal(board.calls.updates, 0);
});

test('board replacement and marker removal flush every affected board once', (t) => {
  const oldBoard = fakeBoard('old-board');
  const boards = { 'board-a': oldBoard };
  const harness = areaHarness(t, boards);
  const node = marker('moving', areaSpec('board-a'));
  harness.setNodes([node]);
  harness.bootstrap();

  const oldEntry = harness.window.__areaEntries['area-moving'];
  const newBoard = fakeBoard('new-board');
  oldBoard.resetCalls();
  boards['board-a'] = newBoard;
  harness.bootstrap();

  const replacement = harness.window.__areaEntries['area-moving'];
  assert.notStrictEqual(replacement, oldEntry);
  assert.strictEqual(replacement.board, newBoard);
  assert.deepEqual(
    oldBoard.calls.removals,
    ['polygon', 'point', 'point', 'point', 'point']
  );
  assert.equal(oldBoard.calls.suspends, 1);
  assert.equal(oldBoard.calls.unsuspends, 1);
  assert.equal(oldBoard.calls.updates, 0);
  assert.equal(newBoard.calls.creates.length, 5);
  assert.equal(newBoard.calls.suspends, 1);
  assert.equal(newBoard.calls.unsuspends, 1);
  assert.equal(newBoard.calls.updates, 0);

  oldBoard.resetCalls();
  newBoard.resetCalls();
  harness.setNodes([]);
  harness.bootstrap();

  assert.equal(harness.window.__areaEntries['area-moving'], undefined);
  assertNoActivity(oldBoard);
  assert.deepEqual(
    newBoard.calls.removals,
    ['polygon', 'point', 'point', 'point', 'point']
  );
  assert.equal(newBoard.calls.suspends, 1);
  assert.equal(newBoard.calls.unsuspends, 1);
  assert.equal(newBoard.calls.updates, 0);
});

test('an already suspended board stays suspended for its external owner', (t) => {
  const board = fakeBoard('board-a', { suspended: true });
  const harness = areaHarness(t, { 'board-a': board });
  harness.setNodes([marker('suspended', areaSpec('board-a'))]);
  harness.bootstrap();

  assert.equal(board.calls.creates.length, 5);
  assert.equal(board.calls.suspends, 0);
  assert.equal(board.calls.unsuspends, 0);
  assert.equal(board.calls.updates, 0);
  assert.equal(board.isSuspendedUpdate, true);

  board.resetCalls();
  harness.bootstrap();
  assertNoActivity(board);
  assert.equal(board.isSuspendedUpdate, true);
});

test('an in-progress board update is deferred when suspension has no effect', (t) => {
  const board = fakeBoard('board-a', {
    inUpdate: true,
    suspendNoop: true
  });
  const harness = areaHarness(t, { 'board-a': board });
  harness.setNodes([marker('deferred', areaSpec('board-a'))]);
  harness.bootstrap();

  assert.equal(board.calls.creates.length, 5);
  assert.equal(board.calls.suspends, 1);
  assert.equal(board.calls.unsuspends, 0);
  assert.equal(board.calls.updates, 0);
  assert.equal(board.isSuspendedUpdate, false);
  assert.equal(harness.scheduled.length, 1);

  board.inUpdate = false;
  const scheduled = harness.scheduled.shift();
  assert.equal(scheduled.kind, 'raf');
  scheduled.callback();
  assert.equal(board.calls.updates, 1);
  assert.equal(harness.scheduled.length, 0);
});

test('direct rendering updates once and then becomes idempotent', (t) => {
  const board = fakeBoard('board-a');
  const harness = areaHarness(t, { 'board-a': board });
  const spec = areaSpec('board-a');

  assert.equal(harness.window.renderAreaFromSpec('direct', spec, 'en'), true);
  assert.equal(board.calls.creates.length, 5);
  assert.equal(board.calls.updates, 1);
  assert.equal(board.calls.suspends, 0);
  assert.equal(board.calls.unsuspends, 0);
  assert.equal(harness.scheduled.length, 0);

  const entry = harness.window.__areaEntries['area-direct'];
  board.resetCalls();
  assert.equal(harness.window.renderAreaFromSpec('direct', spec, 'en'), true);
  assert.strictEqual(harness.window.__areaEntries['area-direct'], entry);
  assertNoActivity(board);
  assert.equal(harness.scheduled.length, 0);
});

test('line-style options update a polygon outline in place, including every border', (t) => {
  const board = fakeBoard('board-a');
  const harness = areaHarness(t, { 'board-a': board });
  const dotted = areaSpec('board-a', { options: ['linestyle=dotted'] });

  assert.equal(harness.window.renderAreaFromSpec('line-style', dotted, 'en'), true);
  const entry = harness.window.__areaEntries['area-line-style'];
  const polygon = entry.polygon;
  assert.equal(entry.lineStyle, 'dotted');
  assert.ok(polygon.attributes.some(attributes => attributes.dash === 7));
  assert.ok(polygon.borders.every(border =>
    border.attributes.some(attributes => attributes.dash === 7)
  ));

  board.resetCalls();
  const dashDotted = areaSpec('board-a', { options: ['Linienstil = DASH-DOTTED'] });
  assert.equal(harness.window.renderAreaFromSpec('line-style', dashDotted, 'en'), true);
  const updated = harness.window.__areaEntries['area-line-style'];
  assert.strictEqual(updated, entry);
  assert.strictEqual(updated.polygon, polygon);
  assert.equal(updated.lineStyle, 'dashdotted');
  assert.equal(board.calls.creates.length, 0);
  assert.equal(board.calls.removals.length, 0);
  assert.ok(polygon.attributes.some(attributes => attributes.dash === 6));
  assert.ok(polygon.borders.every(border =>
    border.attributes.some(attributes => attributes.dash === 6)
  ));
});
