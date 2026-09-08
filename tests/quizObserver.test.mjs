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

const { initQuizDom } = await import('../src/shared/quizDom.ts');
const ANCHOR = '[data-lia-coordinate-quiz-anchor]';
const SOURCE_PREFIXES = [
  'point-ui-', 'polygon-metric-quiz-spec-', 'construction-quiz-spec-',
  'combined-quiz-spec-', 'rek-spec-', 'graph-ui-', 'multi-graph-ui-'
];

// Small DOM fixture: exercise the installed observer and real binding code.
class Element {
  nodeType = 1;
  children = [];
  parentElement = null;
  dataset = {};
  attributes = new Map();
  listeners = new Set();
  textContent = '';
  id = '';
  className = '';
  classList = { contains: (name) => this.className.split(/\s+/).includes(name) };

  constructor(attributes = {}, children = []) {
    Object.entries(attributes).forEach(([key, value]) => this.setAttribute(key, value));
    children.forEach((child) => this.appendChild(child));
  }
  get isConnected() { return this.connectedRoot === true || !!this.parentElement?.isConnected; }
  get nextElementSibling() {
    return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
    if (name.startsWith('data-')) {
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    }
  }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  matches(selector) {
    return selector.split(',').some((part) => {
      part = part.trim();
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      const prefix = part.match(/^\[id\^="([^"]+)"\]$/);
      if (prefix) return this.id.startsWith(prefix[1]);
      const attribute = part.match(/^\[([^\]]+)\]$/);
      return !!attribute && this.hasAttribute(attribute[1]);
    });
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  appendChild(child) { child.remove(); child.parentElement = this; this.children.push(child); return child; }
  remove() {
    if (this.parentElement) {
      this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
      this.parentElement = null;
    }
  }
  addEventListener(type, listener, capture) { this.listeners.add(listener); }
  removeEventListener(type, listener, capture) { this.listeners.delete(listener); }
}

function fixture(run) {
  const originals = Object.fromEntries(['window', 'document', 'MutationObserver'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]
  ));
  const root = new Element();
  root.connectedRoot = true;
  let scans = 0;
  const observers = [];
  globalThis.window = { __boards: { A1: {} } };
  globalThis.document = {
    documentElement: root,
    getElementById(id) {
      if (id === 'lia-coordinate-quiz-style') return {};
      return root.querySelectorAll('[id]').find((node) => node.id === id) || null;
    },
    querySelectorAll(selector) {
      if (selector === ANCHOR) scans += 1;
      return root.querySelectorAll(selector);
    }
  };
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
  };
  try {
    initQuizDom();
    assert.equal(scans, 1, 'initial synchronous binding pass');
    scans = 0;
    run({
      root, observers,
      scans: () => scans,
      emit: (...records) => observers[0].callback(records)
    });
  } finally {
    root.children.slice().forEach((node) => node.remove());
    window.__syncCoordinateQuizBindings();
    Object.entries(originals).forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
}

const childList = (target, addedNodes = [], removedNodes = []) => ({
  type: 'childList', target, addedNodes, removedNodes
});
const attributes = (target, attributeName) => ({ type: 'attributes', target, attributeName });

function addQuiz(root) {
  const source = new Element({ id: 'point-ui-q1', 'data-spec': 'A1;P;1;2' });
  const anchor = new Element({
    'data-lia-coordinate-quiz-anchor': '',
    'data-lia-coordinate-quiz-uid': 'q1',
    'data-lia-coordinate-quiz-kind': 'create-point'
  });
  const quiz = new Element({ class: 'lia-quiz' });
  const wrapper = new Element({}, [source, anchor, quiz]);
  root.appendChild(wrapper);
  return { source, anchor, quiz, wrapper };
}

test('SVG rulers, point labels, timer text, and quiz feedback trigger no global quiz scan', () => fixture(({ root, emit, scans }) => {
  const ruler = new Element({ class: 'lia-dgs-set-square-ruler-labels' });
  const math = new Element({ class: 'MathJax' });
  const timer = new Element({ class: 'lia-timer' });
  const feedback = new Element({ 'data-lia-coordinate-quiz-feedback': 'q1' });
  emit(
    childList(ruler, [new Element({ 'data-value': '1' })], [new Element()]),
    childList(math, [new Element()], [new Element()]),
    childList(timer, [{ nodeType: 3 }], [{ nodeType: 3 }]),
    childList(new Element({ class: 'lia-quiz' }), [feedback]),
    attributes(new Element({ 'data-spec': 'unrelated' }), 'data-spec')
  );
  assert.equal(scans(), 0);
  window.__syncCoordinateQuizBindings();
  assert.equal(scans(), 1, 'public hook remains synchronous even without relevant DOM mutations');
}));

test('all source families and inserted or removed quiz subtrees retain lifecycle scans', () => fixture(({ root, emit, scans }) => {
  for (const prefix of SOURCE_PREFIXES) {
    const source = new Element({ id: prefix + 'fixture' });
    emit(childList(root, [source]));
    emit(childList(root, [], [source]));
    emit(attributes(source, 'data-spec'));
    emit(attributes(source, 'data-lia-static-claimed'));
    emit(childList(source, [{ nodeType: 3 }]));
  }
  assert.equal(scans(), SOURCE_PREFIXES.length * 5);
  const wrapper = new Element({}, [new Element({ 'data-lia-coordinate-quiz-anchor': '' })]);
  emit(childList(root, [wrapper]));
  emit(childList(root, [], [wrapper]));
  emit(childList(root, [new Element({ class: 'lia-quiz' })], [new Element({ class: 'lia-quiz' })]));
  assert.equal(scans(), SOURCE_PREFIXES.length * 5 + 3);
}));

test('one mutation delivery scans once and installing twice does not duplicate observers', () => fixture(({ root, emit, scans, observers }) => {
  const quiz = new Element({ class: 'lia-quiz' });
  emit(...Array.from({ length: 40 }, () => childList(root, [quiz])));
  assert.equal(scans(), 1);
  initQuizDom();
  assert.equal(observers.length, 1);
  assert.equal(scans(), 2);
  assert.deepEqual(observers[0].options.attributeFilter, ['data-lia-static-claimed', 'data-spec']);
}));

test('static claiming and restoring a source detach and reattach exactly one quiz listener', () => fixture(({ root, emit }) => {
  const { source, anchor, quiz, wrapper } = addQuiz(root);
  emit(childList(root, [wrapper]));
  assert.equal(quiz.listeners.size, 1);
  assert.equal(anchor.dataset.liaCoordinateQuizBound, '1');
  source.setAttribute('data-lia-static-claimed', '1');
  emit(attributes(source, 'data-lia-static-claimed'));
  assert.equal(quiz.listeners.size, 0);
  assert.equal(anchor.dataset.liaCoordinateQuizBound, undefined);
  source.removeAttribute('data-lia-static-claimed');
  emit(attributes(source, 'data-lia-static-claimed'));
  assert.equal(quiz.listeners.size, 1);
  emit(attributes(source, 'data-spec'));
  assert.equal(quiz.listeners.size, 1);
  source.remove();
  emit(childList(wrapper, [], [source]));
  assert.equal(quiz.listeners.size, 0);
  wrapper.appendChild(source);
  emit(childList(wrapper, [source]));
  assert.equal(quiz.listeners.size, 1);
}));

test('quiz rerender, wrapper remount and board restoration preserve native bindings', () => fixture(({ root, emit }) => {
  const { anchor, quiz, wrapper } = addQuiz(root);
  emit(childList(root, [wrapper]));
  quiz.remove();
  const replacement = new Element({ class: 'lia-quiz' });
  wrapper.appendChild(replacement);
  emit(childList(wrapper, [replacement], [quiz]));
  assert.equal(quiz.listeners.size, 0);
  assert.equal(replacement.listeners.size, 1);
  wrapper.remove();
  emit(childList(root, [], [wrapper]));
  assert.equal(replacement.listeners.size, 0);
  assert.equal(anchor.dataset.liaCoordinateQuizBound, undefined);
  root.appendChild(wrapper);
  emit(childList(root, [wrapper]));
  assert.equal(replacement.listeners.size, 1);
  delete window.__boards.A1;
  window.__syncCoordinateQuizBindings();
  assert.equal(replacement.listeners.size, 0);
  window.__boards.A1 = {};
  window.__syncCoordinateQuizBindings();
  assert.equal(replacement.listeners.size, 1);
}));
