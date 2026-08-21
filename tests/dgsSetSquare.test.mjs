import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  screenToUserCoordinates,
  userToScreenCoordinates
} = await import('../src/shared/boardCoordinates.ts');

function assertPointClose(actual, expected) {
  assert.ok(actual, 'expected a valid coordinate conversion');
  assert.ok(Math.abs(actual.x - expected.x) < 1e-10, `${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-10, `${actual.y} != ${expected.y}`);
}

test('set-square pivot keeps its board coordinate through pan and anisotropic zoom', () => {
  const board = {
    origin: { scrCoords: [1, 300, 300] },
    unitX: 50,
    unitY: 50
  };
  const userPivot = screenToUserCoordinates(board, { x: 400, y: 200 });
  assertPointClose(userPivot, { x: 2, y: 2 });

  board.origin.scrCoords = [1, 350, 260];
  const afterPan = userToScreenCoordinates(board, userPivot);
  assertPointClose(afterPan, { x: 450, y: 160 });
  assertPointClose(screenToUserCoordinates(board, afterPan), userPivot);

  board.unitX = 75;
  board.unitY = 80;
  const afterZoom = userToScreenCoordinates(board, userPivot);
  assertPointClose(afterZoom, { x: 500, y: 100 });
  assertPointClose(screenToUserCoordinates(board, afterZoom), userPivot);
});

test('set-square coordinate conversion rejects incomplete board transforms', () => {
  assert.equal(userToScreenCoordinates({}, { x: 2, y: 2 }), null);
  assert.equal(
    screenToUserCoordinates(
      { origin: { scrCoords: [1, 20, 20] }, unitX: 0, unitY: 50 },
      { x: 10, y: 10 }
    ),
    null
  );
});

test('DGS viewport updates reproject the pivot without applying the drag boundary clamp', () => {
  const source = readFileSync(
    new URL('../src/subsystems/dgs.ts', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /state\.onBoardViewportChange\s*=\s*\(\)\s*=>\s*\{[\s\S]*?scheduleDgsSetSquareLayout\(state, 'board'\);/
  );
  assert.match(
    source,
    /const constrainedPivot = projectedFromBoard\s*\?[\s\S]*?: constrainDgsSetSquarePivot\(/
  );
  assert.match(
    source,
    /const restoreToVisibleArea = visible && !state\.setSquareVisible;[\s\S]*?restoreToVisibleArea \? 'screen' : 'board'/
  );
  assert.match(source, /layoutDgsSetSquare\(state, 'screen'\);/);
});
