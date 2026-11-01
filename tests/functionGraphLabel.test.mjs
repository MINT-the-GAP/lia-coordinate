import test from 'node:test';
import assert from 'node:assert/strict';

import { positionFunctionGraphLabel } from '../src/shared/functionGraphLabel.ts';

function board(box = [-5, 8, 5, -2], width = 500, height = 500) {
  return {
    unitX: width / (box[2] - box[0]),
    unitY: height / (box[1] - box[3]),
    getBoundingBox: () => box.slice(),
    containerObj: { getBoundingClientRect: () => ({ width, height }) }
  };
}

function assertInside(result, box, unitX, left = 10, right = 10) {
  const labelLeft = (result.x - box[0]) * unitX;
  const labelRight = labelLeft + result.widthPx;
  assert.ok(labelLeft >= left - 1, `left edge ${labelLeft} must remain inside`);
  assert.ok(labelRight <= (box[2] - box[0]) * unitX - right + 1,
    `right edge ${labelRight} must remain inside`);
}

test('a steep graph at the right edge flips its complete function label to the left', () => {
  const box = [-5, 8, 5, -2];
  const target = board(box);
  const label = { rendNode: { getBoundingClientRect: () => ({ width: 180, height: 32 }) } };
  const result = positionFunctionGraphLabel(target, x => 18 * (x - 4.45) + 3, {
    label,
    text: '\\(f_{Regression}(x)\\)',
    fontSize: 24
  });
  assert.equal(result.side, 'left');
  assert.ok(result.x < result.graphX);
  assertInside(result, box, target.unitX);
});

test('a graph visible only at the left edge keeps the label on its right side', () => {
  const box = [-5, 8, 5, -2];
  const target = board(box);
  const label = { rendNode: { getBoundingClientRect: () => ({ width: 130, height: 28 }) } };
  const result = positionFunctionGraphLabel(target, x => 18 * (x + 4.45) + 3, {
    label,
    text: '\\(g(x)\\)',
    fontSize: 24
  });
  assert.equal(result.side, 'right');
  assert.ok(result.x > result.graphX);
  assertInside(result, box, target.unitX);
});

test('fallback text measurement also reserves enough room for a long name', () => {
  const box = [-5, 8, 5, -2];
  const target = board(box, 720, 500);
  const result = positionFunctionGraphLabel(target, x => x * x * x, {
    text: '\\(sehrLangerFunktionsname(x)\\)',
    fontSize: 20
  });
  assert.ok(result.widthPx > 250);
  assertInside(result, box, target.unitX);
});
