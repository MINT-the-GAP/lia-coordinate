import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/subsystems/dgs.ts', import.meta.url), 'utf8');
const start = source.indexOf('function readAxisStraightLast(');
const end = source.indexOf('function setColorPopupOpen(', start);
assert.ok(start >= 0 && end > start, 'expected the private menu-axis implementation');
const menuSource = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
}).outputText;
const constants = Object.fromEntries([
  'MENU_HEIGHT_PX', 'SIDE_MENU_WIDTH_PX', 'OBJECT_LIST_WIDTH_PX', 'MENU_TRANSITION_MS'
].map((name) => [name, Number(source.match(new RegExp('const ' + name + ' = (\\d+);'))?.[1])]));
for (const value of Object.values(constants)) assert.ok(value > 0);

function fixture({ suspended = false } = {}) {
  let now = 0;
  let nextFrame = 1;
  const frames = new Map();
  const calls = [];
  const rect = (kind, values) => () => {
    calls.push(['read', kind]);
    return values();
  };
  const board = {
    unitX: 35,
    unitY: 35,
    bbox: [-10, 10, 10, -10],
    isSuspendedUpdate: suspended,
    getBoundingBox() { calls.push(['read', 'bbox']); return this.bbox.slice(); },
    suspendUpdate() { calls.push(['suspend']); this.isSuspendedUpdate = true; },
    unsuspendUpdate() {
      calls.push(['unsuspend']);
      this.isSuspendedUpdate = false;
      this.fullUpdate();
    },
    fullUpdate() { calls.push(['fullUpdate']); },
    update() { if (!this.isSuspendedUpdate) calls.push(['update']); }
  };
  const axis = (key, endpoint) => ({
    _point1UsrCoordsOrg: [1, 0, 0],
    _point2UsrCoordsOrg: endpoint.slice(),
    visProp: { straightlast: true },
    point1: {
      setPositionDirectly(_, value) { calls.push(['write', key + '1', value]); }
    },
    point2: {
      coords: { usrCoords: endpoint.slice() },
      setPositionDirectly(_, value) { calls.push(['write', key + '2', value]); }
    },
    defaultTicks: {},
    setAttribute(attributes) {
      calls.push(['write', key, attributes]);
      this.visProp.straightlast = attributes.straightLast;
      board.update();
    }
  });
  const state = {
    board,
    axisSyncing: false,
    open: false,
    sideMenuOpen: false,
    objectListOpen: false,
    axisAdjusted: false,
    xAxisAdjusted: false,
    axisOriginalPoint2: [1, 0, 1],
    xAxisOriginalPoint2: [1, 1, 0],
    axisOriginalStraightLast: true,
    xAxisOriginalStraightLast: true,
    xAxis: axis('x', [1, 1, 0]),
    yAxis: axis('y', [1, 0, 1]),
    boardContainer: {
      clientTop: 0,
      clientLeft: 0,
      clientWidth: 700,
      getBoundingClientRect: rect('board', () => ({ top: 0, left: 0, right: 700 }))
    },
    menuBar: {
      getBoundingClientRect: rect('top-menu', () => ({ bottom: state.open ? constants.MENU_HEIGHT_PX : 0 }))
    },
    sideMenu: {
      getBoundingClientRect: rect('side-menu', () => ({
        left: state.sideMenuOpen ? 700 - constants.SIDE_MENU_WIDTH_PX : 700,
        right: state.sideMenuOpen ? 700 : 700 + constants.SIDE_MENU_WIDTH_PX
      }))
    },
    objectListPanel: {
      getBoundingClientRect: rect('object-list', () => ({
        left: state.objectListOpen ? 700 - constants.OBJECT_LIST_WIDTH_PX : 700,
        right: state.objectListOpen ? 700 : 700 + constants.OBJECT_LIST_WIDTH_PX
      }))
    }
  };
  const context = vm.createContext({
    ...constants,
    JXG: { COORDS_BY_USER: 0 },
    performance: { now: () => now },
    requestAnimationFrame(callback) {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); }
  });
  vm.runInContext(menuSource, context);
  return {
    state, board, calls, api: context, frames,
    flush(time) {
      now = time;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(time));
    },
    open() {
      state.open = true;
      state.sideMenuOpen = true;
      context.trackAxisWithMenu(state);
      context.trackXAxisWithSideMenu(state);
    },
    count(kind) { return calls.filter(([type]) => type === kind).length; }
  };
}

function point(axis) { return Array.from(axis._point2UsrCoordsOrg); }

test('simultaneous open menus measure both axes first and render once per frame', () => {
  const f = fixture();
  f.open();
  assert.equal(f.frames.size, 1);
  f.flush(301);
  assert.equal(f.frames.size, 0);
  assert.equal(f.count('suspend'), 1);
  assert.equal(f.count('unsuspend'), 1);
  assert.equal(f.count('fullUpdate'), 1);
  assert.equal(f.count('update'), 0);
  assert.deepEqual(point(f.state.xAxis), [1, 10 - constants.SIDE_MENU_WIDTH_PX / 35, 0]);
  assert.deepEqual(point(f.state.yAxis), [1, 0, 10 - constants.MENU_HEIGHT_PX / 35]);
  const firstWrite = f.calls.findIndex(([kind]) => kind === 'write');
  assert.ok(firstWrite > 0);
  assert.equal(f.calls.slice(firstWrite).some(([kind]) => kind === 'read'), false);
});

test('stationary open menus produce no endpoint writes or full updates on repeated board events', () => {
  const f = fixture();
  f.open();
  f.flush(301);
  f.calls.length = 0;
  for (let i = 0; i < 12; i += 1) {
    f.api.scheduleAxisSync(f.state);
    f.api.scheduleXAxisSync(f.state);
    assert.equal(f.frames.size, 1);
    f.flush(320 + i * 16);
  }
  assert.equal(f.count('write'), 0);
  assert.equal(f.count('suspend'), 0);
  assert.equal(f.count('fullUpdate'), 0);
});

test('pan and anisotropic zoom reproject both clipped endpoints in one update', () => {
  const f = fixture();
  f.open();
  f.flush(301);
  f.calls.length = 0;
  f.board.bbox = [-5, 20, 5, -20];
  f.board.unitX = 70;
  f.board.unitY = 80;
  f.api.scheduleAxisSync(f.state);
  f.api.scheduleXAxisSync(f.state);
  f.flush(320);
  assert.deepEqual(point(f.state.xAxis), [1, 5 - constants.SIDE_MENU_WIDTH_PX / 70, 0]);
  assert.deepEqual(point(f.state.yAxis), [1, 0, 20 - constants.MENU_HEIGHT_PX / 80]);
  assert.equal(f.count('fullUpdate'), 1);
  assert.equal(f.state.axisSyncing, false);
});

test('closing transitions restore both original axes together and stop scheduling', () => {
  const f = fixture();
  f.open();
  f.flush(301);
  f.state.open = false;
  f.state.sideMenuOpen = false;
  f.api.trackAxisWithMenu(f.state);
  f.api.trackXAxisWithSideMenu(f.state);
  f.flush(400);
  assert.equal(f.state.axisAdjusted, true);
  assert.equal(f.state.xAxisAdjusted, true);
  f.calls.length = 0;
  f.flush(602);
  assert.deepEqual(point(f.state.xAxis), [1, 1, 0]);
  assert.deepEqual(point(f.state.yAxis), [1, 0, 1]);
  assert.equal(f.state.xAxis.visProp.straightlast, true);
  assert.equal(f.state.yAxis.visProp.straightlast, true);
  assert.equal(f.state.axisAdjusted, false);
  assert.equal(f.state.xAxisAdjusted, false);
  assert.equal(f.count('fullUpdate'), 1);
  assert.equal(f.frames.size, 0);
});

test('menu updates preserve an outer board suspension', () => {
  const f = fixture({ suspended: true });
  f.open();
  f.flush(301);
  assert.equal(f.board.isSuspendedUpdate, true);
  assert.equal(f.count('suspend'), 0);
  assert.equal(f.count('unsuspend'), 0);
  assert.equal(f.count('fullUpdate'), 0);
  assert.equal(f.state.axisSyncing, false);
  assert.equal(f.state.axisAdjusted, true);
  assert.equal(f.state.xAxisAdjusted, true);
});

test('rapid close and reopen keeps the latest menu state after the transition', () => {
  const f = fixture();
  f.open();
  f.flush(50);
  f.state.open = false;
  f.api.trackAxisWithMenu(f.state);
  f.flush(100);
  f.state.open = true;
  f.api.trackAxisWithMenu(f.state);
  f.flush(401);
  assert.equal(f.state.axisAdjusted, true);
  assert.equal(f.state.yAxis.visProp.straightlast, false);
  assert.deepEqual(point(f.state.yAxis), [1, 0, 10 - constants.MENU_HEIGHT_PX / 35]);
  assert.equal(f.frames.size, 0);
});
