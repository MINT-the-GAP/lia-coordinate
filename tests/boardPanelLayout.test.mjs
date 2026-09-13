import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, next) {
    return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)
      ? specifier + '.ts' : specifier, context);
  },
  load(url, context, next) {
    const loaded = next(url, context);
    if (!url.endsWith('.ts')) return loaded;
    return { ...loaded, format: 'module', source: ts.transpileModule(String(loaded.source), {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 }
    }).outputText };
  }
});

const { boardPanelsStartTop, relayoutBoardPanels, observeBoardPanelLayout } = await import('../src/shared/boardPanelLayout.ts');
const { eventTargetsBoardUi } = await import('../src/shared/boardUiEvents.ts');

function fixture(scale = 1, viewportTop = 200, scrollTop = 0) {
  let nextFrame = 1;
  const frames = new Map(), listeners = new Map();
  const eventTarget = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); }
  };
  const view = {
    ...eventTarget,
    requestAnimationFrame(fn) { const id = nextFrame++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    getComputedStyle(element) { return { visibility: element.style.visibility || 'visible', display: element.style.display || 'block' }; }
  };
  const doc = { ...eventTarget, defaultView: view };
  const elements = [];
  const container = {
    ...eventTarget, ownerDocument: doc, isConnected: true, offsetHeight: 600, clientWidth: 800, clientTop: 2, scrollTop,
    getBoundingClientRect() { return { top: viewportTop, height: this.offsetHeight * scale, width: 800 * scale }; },
    querySelectorAll(selector) { return elements.filter(element => element.isConnected && element.matches(selector)); }
  };
  const make = (className, top, height, ownScale = 1) => {
    let writes = 0;
    const classes = new Set(className.split(' '));
    const style = new Proxy({ top: top + 'px', transform: `scale(${ownScale})` }, { set(target, name, value) { writes++; target[name] = value; return true; } });
    const element = {
      ownerDocument: doc, isConnected: true, hidden: false, style, height, ownScale,
      get writes() { return writes; },
      classList: { contains: name => classes.has(name) },
      matches(selector) { return selector.split(',').some(part => classes.has(part.trim().slice(1))); },
      querySelector() { return null; },
      getBoundingClientRect() {
        const shown = this.isConnected && !this.hidden && style.display !== 'none';
        const localTop = parseFloat(style.top) || 0;
        const renderedTop = viewportTop + (localTop + container.clientTop - scrollTop) * scale;
        const renderedHeight = shown ? this.height * this.ownScale * scale : 0;
        return { top: renderedTop, bottom: renderedTop + renderedHeight, height: renderedHeight, width: shown ? 240 * scale : 0 };
      }
    };
    elements.push(element);
    return element;
  };
  return { container, make, elements, frames, listeners,
    flush() { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); } };
}

for (const scale of [.55, 1, 1.5]) {
  test(`permanent controls and mixed panels keep local gaps under scale ${scale} and scrolling`, () => {
    const f = fixture(scale, -350, 19);
    f.make('lia-dgs-menu-button', 7.5, 35);
    f.make('lia-plot-undo-btn', 50, 35);
    const redo = f.make('lia-plot-redo-btn', 93, 35);
    // Regression can exist before a Schar marker is rendered.
    const regression = f.make('lia-plot-analyze-panel', 10, 180, .65);
    const first = f.make('lia-schar-panel', 10, 160, .8);
    const second = f.make('lia-schar-panel', 10, 90);
    assert.equal(boardPanelsStartTop(f.container), 138);
    relayoutBoardPanels(f.container);
    assert.equal(first.style.top, '138px');
    assert.equal(second.style.top, '276px');
    assert.equal(regression.style.top, '376px');
    const gap = first.getBoundingClientRect().top - redo.getBoundingClientRect().bottom;
    assert.ok(Math.abs(gap - 10 * scale) < 1e-8);
    const writes = first.writes + second.writes + regression.writes;
    relayoutBoardPanels(f.container);
    assert.equal(first.writes + second.writes + regression.writes, writes, 'unchanged layout must not emit style mutations');
    first.height = 32; // minimizing keeps the same shared stack
    relayoutBoardPanels(f.container);
    assert.equal(second.style.top, '174px');
    assert.equal(regression.style.top, '274px');
    first.height = 160;
    first.style.display = 'none';
    relayoutBoardPanels(f.container);
    assert.equal(second.style.top, '138px');
    assert.equal(regression.style.top, '238px');
  });
}

test('hidden controls and the legacy bottom toolbar do not reserve the top of the board', () => {
  const f = fixture();
  const legacy = f.make('lia-plot-undo-btn', 560, 30);
  legacy.style.top = 'auto'; legacy.style.bottom = '10px';
  const hidden = f.make('lia-plot-redo-btn', 93, 35); hidden.style.visibility = 'hidden';
  assert.equal(boardPanelsStartTop(f.container), 10);
  const menu = f.make('lia-dgs-menu-button', 7.5, 35);
  assert.equal(boardPanelsStartTop(f.container), 53);
  menu.hidden = true;
  assert.equal(boardPanelsStartTop(f.container), 10);
});

test('one shared observer tracks control changes, new panels, resize/fullscreen and releases its listeners', () => {
  const f = fixture();
  const sizes = [], mutations = [];
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); sizes.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); this.disconnected = true; }
  };
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; mutations.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  const redo = f.make('lia-plot-redo-btn', 93, 35);
  const first = f.make('lia-schar-panel', 10, 160);
  const releaseA = observeBoardPanelLayout(f.container), releaseB = observeBoardPanelLayout(f.container);
  assert.equal(sizes.length, 1); assert.equal(mutations.length, 1);
  f.flush(); assert.equal(first.style.top, '138px');
  mutations[0].callback([{ type: 'childList', addedNodes: [{ matches: () => false, querySelector: () => null }], removedNodes: [] }]);
  assert.equal(f.frames.size, 0, 'unrelated board DOM changes do not schedule panel layout');
  redo.style.top = '101px';
  mutations[0].callback([{ type: 'attributes', target: redo }]);
  f.flush(); assert.equal(first.style.top, '146px');
  const second = f.make('lia-schar-panel', 10, 60);
  mutations[0].callback([{ type: 'childList', addedNodes: [second], removedNodes: [] }]);
  f.flush(); assert.ok(sizes[0].targets.has(second)); assert.equal(second.style.top, '316px');
  first.height = 30; sizes[0].callback(); f.flush(); assert.equal(second.style.top, '186px');
  for (const callback of f.listeners.get('fullscreenchange')) callback();
  assert.equal(f.frames.size, 1);
  f.flush();
  second.isConnected = false;
  mutations[0].callback([{ type: 'childList', addedNodes: [], removedNodes: [second] }]);
  f.flush(); assert.equal(sizes[0].targets.has(second), false);
  releaseA(); assert.equal(sizes[0].disconnected, undefined);
  releaseA(); assert.equal(sizes[0].disconnected, undefined, 'cleanup is idempotent');
  releaseB(); assert.equal(sizes[0].disconnected, true); assert.equal(mutations[0].disconnected, true);
  assert.ok([...f.listeners.values()].every(set => set.size === 0));
  assert.equal(f.frames.size, 0);
});

test('board capture recognizes range controls across retargeted Shadow DOM paths and nested UI targets', () => {
  const panel = { closest: selector => selector.includes('.lia-schar-panel') ? panel : null };
  const range = { closest: selector => selector.includes('input') ? range : null };
  const host = { closest: () => null };
  assert.equal(eventTargetsBoardUi({ target: host, composedPath: () => [range, panel, host] }), true);
  assert.equal(eventTargetsBoardUi({ target: { closest: () => panel } }), true);
  assert.equal(eventTargetsBoardUi({ target: host, composedPath: () => [host] }), false);
});

test('a widened Schar panel fits the local board width after DynFlex resizes', () => {
  const f = fixture(.65);
  const panel = f.make('lia-schar-panel', 10, 160, 1.45);
  f.container.clientWidth = 210;
  relayoutBoardPanels(f.container);
  assert.ok(Math.abs(parseFloat(panel.style.maxWidth) * 1.45 - 190) < 1e-8);
  f.container.clientWidth = 510;
  relayoutBoardPanels(f.container);
  assert.ok(Math.abs(parseFloat(panel.style.maxWidth) * 1.45 - 490) < 1e-8);
});
