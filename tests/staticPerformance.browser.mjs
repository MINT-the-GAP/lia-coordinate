import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const browserCandidates = [
  process.env.CHROME_PATH,
  process.env.EDGE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

const browserPath = browserCandidates.find(candidate => existsSync(candidate));
const bundlePath = new URL('../dist/static.js', import.meta.url);
const fixtureUrl = new URL('./fixtures/static-performance.html', import.meta.url);
const fullBundlePath = new URL('../dist/index.js', import.meta.url);
const fullBundleFixtureUrl = new URL('./fixtures/static-full-bundle-lazy.html', import.meta.url);
const hostOrderFixtureUrl = new URL('./fixtures/static-host-order.html', import.meta.url);
const mixedRuntimeFixtureUrl = new URL('./fixtures/static-mixed-runtime.html', import.meta.url);
const numberlinesFixtureUrl = new URL('./fixtures/static-numberlines.html', import.meta.url);
const expandedFixtureUrl = new URL('./fixtures/static-expanded.html', import.meta.url);
const dynamicDynFlexFixtureUrl =
  new URL('./fixtures/dynamic-dynflex-performance.html', import.meta.url);

test('headless browser renders the many-diamonds fixture as 259 native geometries', {
  skip: !browserPath ? 'No supported local Chrome/Edge executable was found' : false,
  timeout: 30_000
}, () => {
  assert.equal(
    existsSync(bundlePath),
    true,
    'dist/static.js is required; run npm run build:static first'
  );

  const profileDirectory = mkdtempSync(join(tmpdir(), 'lia-coordinate-static-browser-'));
  try {
    const browser = spawnSync(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=2000',
      '--user-data-dir=' + profileDirectory,
      '--dump-dom',
      fixtureUrl.href
    ], {
      encoding: 'utf8',
      timeout: 25_000,
      windowsHide: true
    });

    assert.equal(
      browser.status,
      0,
      'headless browser failed:\n' + String(browser.stderr || browser.error || '')
    );
    const match = String(browser.stdout || '').match(/STATIC_PERF_RESULT:(\{[^<]+\})/);
    assert.ok(
      match,
      'performance result was not written to the dumped DOM; browser=' + browserPath +
        '; fixture=' + fixtureUrl.href + '; stdout=' + String(browser.stdout || '').slice(0, 800) +
        '; stderr=' + String(browser.stderr || '').slice(0, 800)
    );
    const result = JSON.parse(match[1].replace(/&quot;/g, '"'));

    assert.deepEqual({
      svgCount: result.svgCount,
      polygonCount: result.polygonCount,
      polylineCount: result.polylineCount,
      geometryCount: result.geometryCount,
      claimedCount: result.claimedCount,
      duplicateHostCount: result.duplicateHostCount,
      jsxBoardCount: result.jsxBoardCount,
      intervalCount: result.intervalCount,
      observerCount: result.observerCount
    }, {
      svgCount: 6,
      polygonCount: 130,
      polylineCount: 129,
      geometryCount: 259,
      claimedCount: 259,
      duplicateHostCount: 0,
      jsxBoardCount: 0,
      intervalCount: 0,
      observerCount: 1
    });
    assert.ok(result.initMs > 0 && result.initMs < 2000, 'unexpected initMs: ' + result.initMs);

    console.log('static SVG browser metrics:', JSON.stringify(result));
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
});

test('headless browser renders twelve complete static number lines with one shared lifecycle', {
  skip: !browserPath ? 'No supported local Chrome/Edge executable was found' : false,
  timeout: 30_000
}, () => {
  assert.equal(
    existsSync(bundlePath),
    true,
    'dist/static.js is required; run npm run build:static first'
  );

  const profileDirectory = mkdtempSync(join(tmpdir(), 'lia-coordinate-numberlines-browser-'));
  try {
    const browser = spawnSync(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=2000',
      '--user-data-dir=' + profileDirectory,
      '--dump-dom',
      numberlinesFixtureUrl.href
    ], {
      encoding: 'utf8',
      timeout: 25_000,
      windowsHide: true
    });

    assert.equal(
      browser.status,
      0,
      'headless browser failed:\n' + String(browser.stderr || browser.error || '')
    );
    const match = String(browser.stdout || '').match(/STATIC_NUMBERLINES_RESULT:(\{[^<]+\})/);
    assert.ok(
      match,
      'number-lines result was not written to the dumped DOM; browser=' + browserPath +
        '; fixture=' + numberlinesFixtureUrl.href +
        '; stdout=' + String(browser.stdout || '').slice(0, 1000) +
        '; stderr=' + String(browser.stderr || '').slice(0, 800)
    );
    const result = JSON.parse(match[1].replaceAll('&quot;', String.fromCharCode(34)));

    assert.deepEqual({
      svgCount: result.svgCount,
      areaCount: result.areaCount,
      vectorCount: result.vectorCount,
      distanceCount: result.distanceCount,
      arcCount: result.arcCount,
      textCount: result.textCount,
      vectorArrowCount: result.vectorArrowCount,
      arcArrowCount: result.arcArrowCount,
      objectCount: result.objectCount,
      claimedCount: result.claimedCount,
      duplicateHostCount: result.duplicateHostCount,
      duplicateObjectCount: result.duplicateObjectCount,
      labelsRendered: result.labelsRendered,
      jsxBoardCount: result.jsxBoardCount,
      intervalCount: result.intervalCount,
      observerCount: result.observerCount,
      warningCount: result.warningCount
    }, {
      svgCount: 12,
      areaCount: 12,
      vectorCount: 12,
      distanceCount: 108,
      arcCount: 12,
      textCount: 108,
      vectorArrowCount: 12,
      arcArrowCount: 12,
      objectCount: 252,
      claimedCount: 252,
      duplicateHostCount: 0,
      duplicateObjectCount: 0,
      labelsRendered: true,
      jsxBoardCount: 0,
      intervalCount: 0,
      observerCount: 1,
      warningCount: 0
    });
    assert.ok(result.initMs > 0 && result.initMs < 2000, 'unexpected initMs: ' + result.initMs);

    console.log('twelve static number lines browser metrics:', JSON.stringify(result));
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
});

test('headless browser resolves the expanded fixed-object subset with one shared lifecycle', {
  skip: !browserPath
    ? 'No supported local Chrome/Edge executable was found'
    : !existsSync(bundlePath)
      ? 'dist/static.js is not available'
      : false,
  timeout: 30_000
}, () => {
  const profileDirectory = mkdtempSync(join(tmpdir(), 'lia-coordinate-expanded-browser-'));
  try {
    const browser = spawnSync(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=2000',
      '--user-data-dir=' + profileDirectory,
      '--dump-dom',
      expandedFixtureUrl.href
    ], {
      encoding: 'utf8',
      timeout: 25_000,
      windowsHide: true
    });

    assert.equal(
      browser.status,
      0,
      'headless browser failed:\n' + String(browser.stderr || browser.error || '')
    );
    const match = String(browser.stdout || '').match(/STATIC_EXPANDED_RESULT:(\{[^<]+\})/);
    assert.ok(
      match,
      'expanded-static result was not written to the dumped DOM; browser=' + browserPath +
        '; fixture=' + expandedFixtureUrl.href +
        '; stdout-head=' + String(browser.stdout || '').slice(0, 1200) +
        '; stdout-tail=' + String(browser.stdout || '').slice(-5000) +
        '; stderr=' + String(browser.stderr || '').slice(0, 800)
    );
    const result = JSON.parse(match[1].replaceAll('&quot;', String.fromCharCode(34)));

    assert.deepEqual(result.groupKinds, [
      'axis-label',
      'line',
      'ray',
      'circle',
      'angle',
      'sector',
      'midpoint',
      'parallel',
      'plot',
      'point',
      'point',
      'point',
      'point',
      'point'
    ], 'expanded-static diagnostics: ' + JSON.stringify(result));
    assert.deepEqual({
      svgCount: result.svgCount,
      groupCount: result.groupCount,
      pointCount: result.pointCount,
      claimedCount: result.claimedCount,
      unclaimedCount: result.unclaimedCount,
      duplicateHostCount: result.duplicateHostCount,
      duplicateObjectCount: result.duplicateObjectCount,
      jsxBoardCount: result.jsxBoardCount,
      jxgPresent: result.jxgPresent,
      intervalCount: result.intervalCount,
      observerCount: result.observerCount,
      warningCount: result.warningCount,
      errorCount: result.errorCount
    }, {
      svgCount: 1,
      groupCount: 14,
      pointCount: 5,
      claimedCount: 14,
      unclaimedCount: 0,
      duplicateHostCount: 0,
      duplicateObjectCount: 0,
      jsxBoardCount: 0,
      jxgPresent: false,
      intervalCount: 0,
      observerCount: 1,
      warningCount: 0,
      errorCount: 0
    });
    assert.ok(result.plotPathCount >= 1, 'the fixed plot must render at least one path');
    assert.ok(
      Number.isInteger(result.plotEvaluationCount) &&
        result.plotEvaluationCount >= 513 &&
        result.plotEvaluationCount <= 4097 &&
        result.plotEvaluationCount % 2 === 1,
      'unexpected fixed-plot evaluation count: ' + result.plotEvaluationCount
    );
    assert.ok(result.initMs > 0 && result.initMs < 2000, 'unexpected initMs: ' + result.initMs);

    console.log('expanded static objects browser metrics:', JSON.stringify(result));
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
});

test('normal full bundle drains a static hook without touching JSXGraph or starting retry intervals', {
  skip: !browserPath ? 'No supported local Chrome/Edge executable was found' : false,
  timeout: 30_000
}, () => {
  assert.equal(
    existsSync(fullBundlePath),
    true,
    'dist/index.js is required; run npm run build:full first'
  );

  const profileDirectory = mkdtempSync(join(tmpdir(), 'lia-coordinate-static-full-browser-'));
  try {
    const browser = spawnSync(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=2000',
      '--user-data-dir=' + profileDirectory,
      '--dump-dom',
      fullBundleFixtureUrl.href
    ], {
      encoding: 'utf8',
      timeout: 25_000,
      windowsHide: true
    });

    assert.equal(
      browser.status,
      0,
      'headless browser failed: ' + String(browser.stderr || browser.error || '')
    );
    const match = String(browser.stdout || '').match(/STATIC_FULL_RESULT:(\{[^<]+\})/);
    assert.ok(
      match,
      'full-bundle static result was not written to the dumped DOM; browser=' + browserPath +
        '; fixture=' + fullBundleFixtureUrl.href +
        '; stdout=' + String(browser.stdout || '').slice(0, 800) +
        '; stderr=' + String(browser.stderr || '').slice(0, 800)
    );
    const result = JSON.parse(match[1].replaceAll('&quot;', String.fromCharCode(34)));

    assert.deepEqual(result, {
      hookCalls: 1,
      hostName: 'lia-coordinate-board',
      hostKey: 'normal-readme-static',
      customElementDefined: true,
      svgCount: 1,
      polygonCount: 1,
      polylineCount: 1,
      dynamicWrapperCount: 0,
      viewBox: '0 0 10 5',
      viewBoxRatio: 2,
      cssAspectRatio: '10 / 5',
      intrinsicWidth: '240',
      claimedCount: 2,
      jsxBoardCount: 0,
      jxgAccessCount: 0,
      jxgAssignmentCount: 0,
      intervalCount: 0,
      errorCount: 0,
      errors: []
    });
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
});

test('hybrid-host upgrade claims later static markers before an earlier dynamic wrapper connects', {
  skip: !browserPath ? 'No supported local Chrome/Edge executable was found' : false,
  timeout: 30_000
}, () => {
  assert.equal(existsSync(fullBundlePath), true, 'dist/index.js is required; run npm run build:full first');
  const profileDirectory = mkdtempSync(join(tmpdir(), 'lia-coordinate-static-order-browser-'));
  try {
    const browser = spawnSync(browserPath, [
      '--headless=new', '--disable-gpu', '--disable-background-networking',
      '--disable-component-update', '--disable-default-apps', '--disable-extensions',
      '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files',
      '--run-all-compositor-stages-before-draw', '--virtual-time-budget=2000',
      '--user-data-dir=' + profileDirectory, '--dump-dom', hostOrderFixtureUrl.href
    ], { encoding: 'utf8', timeout: 25_000, windowsHide: true });

    assert.equal(browser.status, 0, 'headless browser failed: ' + String(browser.stderr || browser.error || ''));
    const match = String(browser.stdout || '').match(/STATIC_HOST_ORDER_RESULT:(\{[^<]+\})/);
    assert.ok(match, 'host-order result missing; stdout=' + String(browser.stdout || '').slice(0, 1200));
    const result = JSON.parse(match[1].replaceAll('&quot;', String.fromCharCode(34)));
    assert.deepEqual(result, {
      dynamicBeforeStatic: true,
      dynamicConnections: 1,
      runtimeCalls: 1,
      claimAtDynamicConnect: 'order-static',
      finalClaim: 'order-static',
      staticSvgCount: 1,
      dynamicChildCount: 1,
      dynamicCodeQueued: true,
      errorCount: 0,
      errors: []
    });
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
});

test('active dynamic runtime respects static guards and prunes a dynamic board synchronously', {
  skip: !browserPath ? 'No supported local Chrome/Edge executable was found' : false,
  timeout: 30_000
}, () => {
  assert.equal(existsSync(fullBundlePath), true, 'dist/index.js is required; run npm run build:full first');
  const profileDirectory = mkdtempSync(join(tmpdir(), 'lia-coordinate-static-mixed-browser-'));
  try {
    const browser = spawnSync(browserPath, [
      '--headless=new', '--disable-gpu', '--disable-background-networking',
      '--disable-component-update', '--disable-default-apps', '--disable-extensions',
      '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files',
      '--run-all-compositor-stages-before-draw', '--virtual-time-budget=2000',
      '--user-data-dir=' + profileDirectory, '--dump-dom', mixedRuntimeFixtureUrl.href
    ], { encoding: 'utf8', timeout: 25_000, windowsHide: true });

    assert.equal(browser.status, 0, 'headless browser failed: ' + String(browser.stderr || browser.error || ''));
    const match = String(browser.stdout || '').match(/STATIC_MIXED_RESULT:(\{[^<]+\})/);
    assert.ok(
      match,
      'mixed-runtime result missing; stdout=' + String(browser.stdout || '').slice(0, 1600) +
        '; stderr=' + String(browser.stderr || '').slice(0, 800)
    );
    const result = JSON.parse(match[1].replaceAll('&quot;', String.fromCharCode(34)));
    console.log('mixed runtime browser metrics:', JSON.stringify(result));
    const normalizedResult = Object.assign({}, result, {
      hostListenerRemovals: result.hostListenerRemovals >= 6,
      documentListenerRemovals: result.documentListenerRemovals >= 6,
      windowListenerRemovals: result.windowListenerRemovals >= 1,
      boardListenerRemovals: result.boardListenerRemovals >= 6,
      resizeObserverDisconnects: result.resizeObserverDisconnects >= 2,
      canceledAnimationFrames: result.canceledAnimationFrames >= 1
    });
    assert.deepEqual(normalizedResult, {
      dynamicRuntimeWasActive: true,
      unclaimedBeforeDirect: 4,
      directTimeoutDelta: 0,
      directIntervalDelta: 0,
      directClaimedCount: 4,
      directUiCount: 0,
      generatedReconstructionAnchors: 0,
      regressionStateCount: 0,
      retryWasQueued: true,
      lateMarkerClaim: 'mixed-late-static',
      retryDeltaAfterStaticCallback: 0,
      claimedRegressionClaim: 'mixed-static-board',
      claimedRegressionRetryDelta: 0,
      cleanupCount: 1,
      freeBoardCount: 1,
      dgsDisposeBeforeFree: true,
      regressionDisposeBeforeFree: true,
      cleanupBeforeFree: true,
      tableStateBeforeStatic: true,
      tableUiBeforeStatic: true,
      tableStatePruned: true,
      tableUiPruned: true,
      inputStateBeforeStatic: true,
      inputUiBeforeStatic: true,
      inputStatePruned: true,
      inputUiPruned: true,
      regressionStateBeforeStatic: 1,
      regressionStatePruned: true,
      dgsUiBeforeStatic: 1,
      dgsUiPruned: true,
      residualDynamicUiClasses: [],
      hostListenerRemovals: true,
      documentListenerRemovals: true,
      windowListenerRemovals: true,
      boardListenerRemovals: true,
      resizeObserverDisconnects: true,
      canceledAnimationFrames: true,
      removedObjectCount: 8,
      oldBoardRegistryRemoved: true,
      oldCleanupReleased: true,
      registriesPrunedImmediately: true,
      transitionAreaClaim: 'mixed-transition',
      transitionDistanceClaim: 'mixed-transition',
      transitionTableClaim: 'mixed-transition',
      transitionInputClaim: 'mixed-transition',
      transitionRegressionClaim: 'mixed-transition',
      transitionDgsClaim: 'mixed-transition',
      intervalDeltaAfterStaticWork: 0,
      errorCount: 0,
      errors: []
    });
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
});

test('six DynFlex boards keep angle and standalone set-square bootstraps and viewport bursts cheap', {
  skip: !browserPath ? 'No supported local Chrome/Edge executable was found' : false,
  timeout: 30_000
}, () => {
  assert.equal(
    existsSync(fullBundlePath),
    true,
    'dist/index.js is required; run npm run build:full first'
  );

  const profileDirectory = mkdtempSync(join(tmpdir(), 'lia-coordinate-dynflex-browser-'));
  try {
    const browser = spawnSync(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=2500',
      '--user-data-dir=' + profileDirectory,
      '--dump-dom',
      dynamicDynFlexFixtureUrl.href
    ], {
      encoding: 'utf8',
      timeout: 25_000,
      windowsHide: true
    });

    assert.equal(
      browser.status,
      0,
      'headless browser failed:\n' + String(browser.stderr || browser.error || '')
    );
    const match = String(browser.stdout || '')
      .match(/DYNAMIC_DYNFLEX_PERF_RESULT:(\{[^<]+\})/);
    assert.ok(
      match,
      'dynamic DynFlex result missing; browser=' + browserPath +
        '; fixture=' + dynamicDynFlexFixtureUrl.href +
        '; stdout-head=' + String(browser.stdout || '').slice(0, 1600) +
        '; stdout-tail=' + String(browser.stdout || '').slice(-4000) +
        '; stderr=' + String(browser.stderr || '').slice(0, 1000)
    );
    const result = JSON.parse(match[1].replaceAll('&quot;', String.fromCharCode(34)));

    assert.deepEqual({
      boardCount: result.boardCount,
      dynFlexChildCount: result.dynFlexChildCount,
      setSquareOverlayCount: result.setSquareOverlayCount,
      visibleSetSquareCount: result.visibleSetSquareCount,
      standaloneMenuCount: result.standaloneMenuCount,
      fullSideMenuCount: result.fullSideMenuCount,
      regressionCanvasCount: result.regressionCanvasCount,
      angleEntryCount: result.angleEntryCount,
      createDeltaAfterRepeatedBootstraps: result.createDeltaAfterRepeatedBootstraps,
      updateDeltaAfterRepeatedBootstraps: result.updateDeltaAfterRepeatedBootstraps,
      overlayIdentityPreserved: result.overlayIdentityPreserved,
      repairedOverlayCount: result.repairedOverlayCount,
      completeStandaloneUiCount: result.completeStandaloneUiCount,
      resizeDisconnectDeltaAfterRepair: result.resizeDisconnectDeltaAfterRepair,
      panScheduledRafCount: result.panScheduledRafCount,
      panCanceledRafCount: result.panCanceledRafCount,
      panTransformMutationCount: result.panTransformMutationCount,
      panPivotChangedCount: result.panPivotChangedCount,
      updateDeltaAfterPan: result.updateDeltaAfterPan,
      resizeObserverCallbackDelta: result.resizeObserverCallbackDelta,
      resizeScheduledRafCount: result.resizeScheduledRafCount,
      resizeCanceledRafCount: result.resizeCanceledRafCount,
      resizeWidthBefore: result.resizeWidthBefore,
      resizeWidthAfter: result.resizeWidthAfter,
      resizePivotChanged: result.resizePivotChanged,
      resizeTransformChanged: result.resizeTransformChanged,
      moveListenerCount: result.moveListenerCount,
      boundingBoxListenerCount: result.boundingBoxListenerCount,
      errorCount: result.errorCount
    }, {
      boardCount: 6,
      dynFlexChildCount: 6,
      setSquareOverlayCount: 6,
      visibleSetSquareCount: 6,
      standaloneMenuCount: 6,
      fullSideMenuCount: 0,
      regressionCanvasCount: 0,
      angleEntryCount: 6,
      createDeltaAfterRepeatedBootstraps: 0,
      updateDeltaAfterRepeatedBootstraps: 0,
      overlayIdentityPreserved: true,
      repairedOverlayCount: 3,
      completeStandaloneUiCount: 6,
      resizeDisconnectDeltaAfterRepair: 3,
      panScheduledRafCount: 6,
      panCanceledRafCount: 0,
      panTransformMutationCount: 6,
      panPivotChangedCount: 6,
      updateDeltaAfterPan: 0,
      resizeObserverCallbackDelta: 1,
      resizeScheduledRafCount: 1,
      resizeCanceledRafCount: 0,
      resizeWidthBefore: 320,
      resizeWidthAfter: 400,
      resizePivotChanged: true,
      resizeTransformChanged: true,
      moveListenerCount: 6,
      boundingBoxListenerCount: 6,
      errorCount: 0
    }, 'dynamic DynFlex diagnostics: ' + JSON.stringify(result));
    assert.ok(
      result.resizePivotXRatioError < 1e-6,
      'container resize should preserve the set-square x-pivot ratio: ' +
        JSON.stringify(result)
    );

    console.log('dynamic DynFlex browser metrics:', JSON.stringify(result));
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
});
