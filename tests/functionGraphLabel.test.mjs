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

function assertVerticallyInside(result, box, unitY, top = 10, bottom = 10) {
  const halfHeight = result.heightPx / (2 * unitY);
  assert.ok(result.y + halfHeight <= box[1] - top / unitY + 1e-9,
    `top edge ${result.y + halfHeight} must remain inside`);
  assert.ok(result.y - halfHeight >= box[3] + bottom / unitY - 1e-9,
    `bottom edge ${result.y - halfHeight} must remain inside`);
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

test('a graph completely above the viewport keeps its complete label above it', () => {
  const box = [-5, 8, 5, -2];
  const target = board(box);
  const label = { rendNode: { getBoundingClientRect: () => ({ width: 90, height: 30 }) } };
  const result = positionFunctionGraphLabel(target, () => 12, {
    label,
    text: '\\(f(x)\\)',
    fontSize: 24
  });
  const labelBottom = result.y - result.heightPx / (2 * target.unitY);
  assert.ok(labelBottom > box[1], `label bottom ${labelBottom} must stay above the viewport`);
});

test('a graph completely below stays outside even when its label offset points inward', () => {
  const box = [-5, 8, 5, -2];
  const target = board(box);
  const label = { rendNode: { getBoundingClientRect: () => ({ width: 90, height: 30 }) } };
  const result = positionFunctionGraphLabel(target, () => -2.05, {
    label,
    text: '\\(g(x)\\)',
    fontSize: 24,
    verticalOffsetUser: 0.18
  });
  const labelTop = result.y + result.heightPx / (2 * target.unitY);
  assert.ok(labelTop < box[3], `label top ${labelTop} must stay below the viewport`);
});

test('a graph touching the viewport edge still receives a fully visible label', () => {
  const box = [-5, 8, 5, -2];
  const target = board(box);
  const label = { rendNode: { getBoundingClientRect: () => ({ width: 90, height: 30 }) } };
  const result = positionFunctionGraphLabel(target, () => box[1], {
    label,
    text: '\\(h(x)\\)',
    fontSize: 24
  });
  assertVerticallyInside(result, box, target.unitY);
});

test('a very steep graph crossing between samples is treated as visible', () => {
  const box = [-5, 8, 5, -2];
  const target = board(box);
  const label = { rendNode: { getBoundingClientRect: () => ({ width: 90, height: 30 }) } };
  const result = positionFunctionGraphLabel(target, x => 5000 * (x - 0.01) + 3, {
    label,
    text: '\\(s(x)\\)',
    fontSize: 24
  });
  assertInside(result, box, target.unitX);
  assertVerticallyInside(result, box, target.unitY);
});

test('a graph undefined across the viewport keeps its label horizontally outside', () => {
  const box = [-5, 8, 5, -2];
  const target = board(box);
  const result = positionFunctionGraphLabel(target, () => NaN, {
    text: '\\(u(x)\\)',
    fontSize: 24
  });
  assert.ok(result.x > box[2], `label x ${result.x} must stay outside the viewport`);
});
