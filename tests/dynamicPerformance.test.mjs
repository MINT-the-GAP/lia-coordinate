import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boardHelpers = readFileSync(
  new URL('../src/coord/boardHelpers.ts', import.meta.url),
  'utf8'
);
const angle = readFileSync(
  new URL('../src/subsystems/angle.ts', import.meta.url),
  'utf8'
);
const axisTitle = readFileSync(
  new URL('../src/subsystems/axisTitle.ts', import.meta.url),
  'utf8'
);

test('internal board layout batches global bootstraps while the public hook stays synchronous', () => {
  assert.match(
    boardHelpers,
    /function applyAll\(\): void \{\s*applyAppearance\(\);\s*scheduleExternalBootstraps\(\);\s*\}/
  );
  assert.match(
    boardHelpers,
    /function applyPublicHook\(\): void \{\s*applyAppearance\(\);\s*runExternalBootstraps\(\);\s*\}[\s\S]*?__liaCoordHooks\[cfg\.id\] = applyPublicHook/
  );
  assert.match(
    boardHelpers,
    /function scheduleLayoutRefit[\s\S]*?fitBoardSize\([\s\S]*?applyAppearance\(\);/
  );
});

test('pan and zoom avoid theme, resize-handle, global title, and synchronous state work', () => {
  const viewportBlock = boardHelpers.match(
    /\/\/ Bounding-box change \(pan\/zoom\)\.([\s\S]*?)\/\/ Theme color polling/
  )?.[1] || '';
  assert.ok(viewportBlock, 'expected the bounding-box lifecycle block');
  assert.match(viewportBlock, /scheduleBoardStateSave\(\)/);
  assert.match(viewportBlock, /__refreshAxisTitlesForBoard\(cfg\.id\)/);
  assert.doesNotMatch(viewportBlock, /applyAxisColors\(/);
  assert.doesNotMatch(viewportBlock, /ensureResizeHandle\(/);
  assert.doesNotMatch(viewportBlock, /__refreshAllAxisTitles\(\)/);
  assert.doesNotMatch(viewportBlock, /saveBoardState\(board, cfg\.id, initialBBox\);\s*\n\s*\/\/ Suspend/);
});

test('unchanged angles are no-ops and labels add no deferred board update', () => {
  assert.match(
    angle,
    /old\.valueDisplayAllowed === valueDisplayAllowed\s*\n\s*\) return true;/
  );
  const createLabelBlock = angle.match(
    /function createLabel[\s\S]*?(?=\n  function samePoints)/
  )?.[0] || '';
  assert.ok(createLabelBlock, 'expected createLabel implementation');
  assert.doesNotMatch(createLabelBlock, /scheduleBootstrap|board\.update/);
});

test('axis-title observer is marker-scoped and exposes a board-local refresh', () => {
  assert.match(
    axisTitle,
    /window\.__refreshAxisTitlesForBoard = function\(boardId: string\)/
  );
  assert.match(
    axisTitle,
    /function containsAxisTitleMarker[\s\S]*?if \(relevant\) kickAxisTitles\(\)/
  );
});
