import test from 'node:test';
import assert from 'node:assert/strict';

import { positionAngleLabel } from '../src/shared/angleLabelPosition.ts';

const point = (x, y) => ({ X: () => x, Y: () => y });

function acuteAngle(degrees = 40) {
  const half = degrees * Math.PI / 360;
  return [point(Math.cos(-half), Math.sin(-half)), point(0, 0),
    point(Math.cos(half), Math.sin(half))];
}

const measuredLabel = {
  rendNode: { getBoundingClientRect: () => ({ width: 60, height: 24 }) }
};

test('a large rendered angle places its name inside the sector', () => {
  const placement = positionAngleLabel({ unitX: 300, unitY: 300 }, acuteAngle(), 0.8, {
    label: measuredLabel,
    text: '\\(\\angle DEF\\)',
    fontSize: 18
  });

  assert.equal(placement.inside, true);
  assert.ok(placement.distancePx < placement.radiusPx);
  assert.ok(placement.distancePx > placement.widthPx / 2);
  assert.ok(Math.abs(placement.y) < 1e-12);
});

test('small angle marks keep the complete name just outside with a stable pixel gap', () => {
  for (const scale of [140, 80]) {
    const placement = positionAngleLabel({ unitX: scale, unitY: scale }, acuteAngle(), 0.8, {
      label: measuredLabel,
      text: '\\(\\angle DEF\\)',
      fontSize: 18
    });
    assert.equal(placement.inside, false, `scale ${scale}`);
    const radialHalfExtent = placement.widthPx / 2;
    assert.ok(Math.abs(placement.distancePx - placement.radiusPx - radialHalfExtent - 8) < 1e-9);
  }
});

test('fallback measurement and anisotropic zoom remain finite and relative to the visible mark', () => {
  const placement = positionAngleLabel({ unitX: 260, unitY: 150 }, acuteAngle(75), 0.8, {
    text: '\\(\\angle A_{1}BC \\approx 75^{\\circ}\\)',
    fontSize: 16
  });

  assert.ok(Number.isFinite(placement.x) && Number.isFinite(placement.y));
  assert.ok(placement.widthPx > 80);
  assert.ok(placement.heightPx >= 20);
  assert.ok(placement.inside
    ? placement.distancePx < placement.radiusPx
    : placement.distancePx > placement.radiusPx);
});
