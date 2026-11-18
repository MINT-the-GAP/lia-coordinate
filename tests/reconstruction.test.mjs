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

const {
  RAW_DRAWING_TOLERANCE_FACTOR,
  checkRawDrawingStates,
  init
} = await import('../src/subsystems/reconstruction.ts');

const boardId = 'reconstruction-board';
const target = (x) => 2 * x - 1;
const sampleX = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5];

function stroke(offset = 0, points = sampleX) {
  return {
    color: '#ff0000',
    width: 3,
    points: points.map((x) => ({ x, y: target(x) + offset }))
  };
}

test('raw drawings use 150 percent of the configured tolerance', () => {
  assert.equal(RAW_DRAWING_TOLERANCE_FACTOR, 1.5);
  const accepted = checkRawDrawingStates(
    [{ boardId, strokes: [stroke(0.149)] }],
    boardId, target, sampleX, 0.1, [-4, 4]
  );
  assert.deepEqual(accepted, {
    matches: true,
    hasDrawing: true,
    hasEvaluableDrawing: true
  });

  const rejected = checkRawDrawingStates(
    [{ boardId, strokes: [stroke(0.151)] }],
    boardId, target, sampleX, 0.1, [-4, 4]
  );
  assert.equal(rejected.matches, false);
  assert.equal(rejected.hasEvaluableDrawing, true);
});

test('empty and incomplete drawings are not evaluable graphs', () => {
  assert.deepEqual(
    checkRawDrawingStates([], boardId, target, sampleX, 0.1, [-4, 4]),
    { matches: false, hasDrawing: false, hasEvaluableDrawing: false }
  );
  assert.deepEqual(
    checkRawDrawingStates(
      [{ boardId, strokes: [stroke(0, [-0.5, 0, 0.5])] }],
      boardId, target, sampleX, 0.1, [-4, 4]
    ),
    { matches: false, hasDrawing: true, hasEvaluableDrawing: false }
  );
});

function withReconstructionRuntime(states, run) {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame
  };
  const marker = { dataset: { spec: boardId + ';2*x-1;0.1' } };
  try {
    globalThis.window = {
      __boards: {
        [boardId]: { getBoundingBox() { return [-1.5, 4, 2.5, -4]; } }
      },
      __scharEntries: {},
      __liaRegressionStates: states
    };
    globalThis.document = {
      documentElement: { lang: 'de' },
      getElementById(id) { return id === 'rek-spec-raw' ? marker : null; },
      querySelectorAll() { return []; }
    };
    globalThis.requestAnimationFrame = () => 0;
    init();
    run(marker);
  } finally {
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
  }
}

test('the quiz accepts raw drawings without creating a graph model', () => {
  withReconstructionRuntime({
    raw: { boardId, strokes: [stroke(0.12)] }
  }, (marker) => {
    assert.equal(window.__checkRekonstruktionQuiz('raw', ''), true);
    assert.equal(marker.dataset.feedback, undefined);
    assert.equal(window.__liaRegressionStates.raw.analysisEntries, undefined);
  });
});

test('empty and incomplete quiz drawings receive specific feedback', () => {
  withReconstructionRuntime({}, (marker) => {
    assert.equal(window.__checkRekonstruktionQuiz('raw', ''), false);
    assert.match(marker.dataset.feedback, /Zeichne zuerst/);
  });

  withReconstructionRuntime({
    raw: { boardId, strokes: [stroke(0, [-0.5, 0, 0.5])] }
  }, (marker) => {
    assert.equal(window.__checkRekonstruktionQuiz('raw', ''), false);
    assert.match(marker.dataset.feedback, /nicht genug/);
  });
});

test('recognized graph models keep the configured tolerance unchanged', () => {
  withReconstructionRuntime({
    recognized: {
      boardId,
      strokes: [],
      analysisEntries: [{ model: { m: 2, n: -0.89 } }]
    }
  }, () => {
    assert.equal(
      window.__checkRekonstruktionFromSpec(boardId + ';2*x-1;0.1'),
      false,
      'an offset of 0.11 must not receive the raw drawing tolerance'
    );
    window.__liaRegressionStates.recognized.analysisEntries[0].model.n = -0.91;
    assert.equal(window.__checkRekonstruktionFromSpec(boardId + ';2*x-1;0.1'), true);
  });
});
