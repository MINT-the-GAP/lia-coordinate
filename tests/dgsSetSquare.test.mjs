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

test('standalone set-square lifecycle repairs partial DOM and downgrades implicit full shells', () => {
  const source = readFileSync(
    new URL('../src/subsystems/dgs.ts', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /function isLiveStandaloneSetSquare[\s\S]*?state\.setSquareOverlay\.parentElement === state\.boardContainer[\s\S]*?state\.button\.parentElement === state\.boardContainer[\s\S]*?state\.menuClip\.parentElement === state\.boardContainer[\s\S]*?state\.setSquareGraphic\.parentElement === state\.setSquareOverlay[\s\S]*?state\.setSquareSurface\.parentNode === state\.setSquareGraphic/
  );
  assert.match(
    source,
    /if \(canUseStandaloneSetSquare\(boardId\)\) \{[\s\S]*?fullState\.macroOwned[\s\S]*?getDgsInstrumentControllerUid\(boardId\)[\s\S]*?disposeDgsState\(fullState\)[\s\S]*?ensureStandaloneSetSquare\(boardId\)/
  );
  assert.match(source, /macroOwned:\s*!!anchor/);
});

test('removed DGS owners cannot revive and full disposal restores lightweight board modes', () => {
  const source = readFileSync(
    new URL('../src/subsystems/dgs.ts', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /window\.__setupDGS = function[\s\S]*?anchor\.isConnected[\s\S]*?document\.getElementById\('dgs-ui-' \+ uid\) !== anchor[\s\S]*?bootstrapDGS\(\)/
  );
  assert.match(
    source,
    /pendingRetryTimers\[uid\] = window\.setTimeout[\s\S]*?anchor\.isConnected[\s\S]*?clearPendingDgsRetry\(uid\)[\s\S]*?bootstrapDGS\(\)/
  );
  assert.match(
    source,
    /implicitInstrumentOwnerMissing[\s\S]*?getDgsInstrumentControllerUid\(boardId\)[\s\S]*?request\.kind === 'compass'[\s\S]*?implicitRegressionOwnerMissing[\s\S]*?getDgsRegressionControllerUid\(boardId\)[\s\S]*?getDgsRegressionRequestsForBoard\(boardId\)\.length === 0/
  );
  assert.match(
    source,
    /window\.__setupDGSInstrument = function[\s\S]*?anchor\.isConnected[\s\S]*?delete dgsInstrumentRequests\[uid\][\s\S]*?bootstrapDGS\(\)/
  );
  assert.match(
    source,
    /delete dgsRegressionRequests\[uid\];[\s\S]*?clearPendingDgsRetry\(getDgsRegressionControllerUid\(boardId\)\)/
  );
  assert.match(
    source,
    /delete dgsInstrumentRequests\[uid\];[\s\S]*?clearPendingDgsRetry\(getDgsInstrumentControllerUid\(boardId\)\)/
  );
  assert.match(
    source,
    /!hasRegressionOwner[\s\S]*?!hasMacroOwner[\s\S]*?!hasInstrumentOwner[\s\S]*?disposeDgsState\(fullState\)/
  );
  assert.match(
    source,
    /function restoreDgsBoardModes[\s\S]*?__liaDgsZoomMode = 'both'[\s\S]*?__liaDgsAxisScaleMode = 'cartesian'[\s\S]*?__liaDgsValueDisplayLocked = false[\s\S]*?applyDgsLogTickGenerator\(state, state\.xAxis, 'x', false\)[\s\S]*?graph\.Y = graph\.__liaDgsFunctionEvaluator[\s\S]*?refreshDgsValueDisplayRestriction\(state\)/
  );
  assert.match(
    source,
    /Object\.keys\(dgsInstrumentRequests\)\.forEach[\s\S]*?dgsInstrumentRequests\[uid\]\.appliedState === existing[\s\S]*?appliedState = null/
  );
  assert.match(
    source,
    /board\.off\('update', existing\.onBoardRootUpdate\)[\s\S]*?restoreAxis\(existing\)[\s\S]*?restoreDgsBoardModes\(existing\)/
  );
});

test('set-square layout gives real resize priority and persists viewport motion trailing', () => {
  const source = readFileSync(
    new URL('../src/subsystems/dgs.ts', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /const sizeChanged =[\s\S]*?setSquareLastContainerWidth[\s\S]*?const source = sizeChanged\s*\?\s*'ratio'/
  );
  assert.match(
    source,
    /if \(didLayout && source === 'board'\) scheduleDgsSetSquarePosePersist\(state\)/
  );
  assert.match(
    source,
    /function scheduleDgsSetSquarePosePersist[\s\S]*?window\.setTimeout\([\s\S]*?persistDgsSetSquarePose\(state\)[\s\S]*?, 140\)/
  );
});
