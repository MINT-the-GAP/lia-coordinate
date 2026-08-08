// Entry point: initializes all subsystems in order and exposes board helpers.

import { init as initAxisTitle } from './subsystems/axisTitle';
import { init as initCreatePoint } from './subsystems/createPoint';
import { init as initSlider } from './subsystems/slider';
import { init as initPlotFunction } from './subsystems/plotFunction';
import { init as initPlotInput } from './subsystems/plotInput';
import { init as initPointOnGraph } from './subsystems/pointOnGraph';
import { init as initPointsOnGraph } from './subsystems/pointsOnGraph';
import { init as initFunctionAnalysisPoints } from './subsystems/functionAnalysisPoints';
import { init as initObjectAnalysisPoints } from './subsystems/objectAnalysisPoints';
import { init as initDistance } from './subsystems/distance';
import { init as initLinearObjects } from './subsystems/linearObjects';
import { init as initArc } from './subsystems/arc';
import { init as initRelationObjects } from './subsystems/relationObjects';
import { init as initArea } from './subsystems/area';
import { init as initAngle } from './subsystems/angle';
import { init as initCoordText } from './subsystems/coordText';
import { init as initCircle } from './subsystems/circle';
import { init as initTangentSector } from './subsystems/tangentSector';
import { init as initSchar } from './subsystems/schar';
import { init as initTable } from './subsystems/table';
import { init as initReconstruction } from './subsystems/reconstruction';
import { init as initPolygonMetricQuiz } from './subsystems/polygonMetricQuiz';
import { init as initConstructionQuiz } from './subsystems/constructionQuiz';
import { init as initCombinedQuiz } from './subsystems/combinedQuiz';
import { init as initRegression } from './subsystems/regression';
import { init as initDGS } from './subsystems/dgs';
import {
  initMacroCodeOrderLayers,
  scheduleMacroCodeOrderLayers,
} from './shared/macroLayer';
import {
  parseCoordSpec,
  initializeCoordinateBoard,
  getSafeBBox,
  isValidBBox,
  loadStoredBoardState,
  saveBoardState,
  getBoardStateStore,
  getConstrainedAncestorWidth,
  prepareBoardContainer,
  clampWidth,
  clampHeight,
  solveAspectFittedSize,
  applyBoardSize,
  fitBoardSize,
  restoreSavedBoardState,
  applyBoardFrame,
  applyNavColors,
  applyGridColor,
  applyAxisColors,
  applyAdaptiveTicks,
  updateStickyTickLabelPositions,
  ensureResizeHandle,
  runExternalBootstraps,
  buildStickyAxes,
  createGrid,
  createBoardDecorations,
  wireBoard,
} from './coord/boardHelpers';
import { getNeutralColor, getAccentColor } from './shared/theme';

// Install source-order layer reconciliation before pending board macros run.
// The initial pass may precede subsystem registration; delayed passes below
// reconcile the entries once all renderers have been initialized.
initMacroCodeOrderLayers();

// Expose board helpers on window.__coord for use by the inline macro code.
window.__coord = {
  parseCoordSpec,
  initializeCoordinateBoard,
  getSafeBBox,
  isValidBBox,
  loadStoredBoardState,
  saveBoardState,
  getBoardStateStore,
  getConstrainedAncestorWidth,
  prepareBoardContainer,
  clampWidth,
  clampHeight,
  solveAspectFittedSize,
  applyBoardSize,
  fitBoardSize,
  restoreSavedBoardState,
  applyBoardFrame,
  applyNavColors,
  applyGridColor,
  applyAxisColors,
  applyAdaptiveTicks,
  updateStickyTickLabelPositions,
  ensureResizeHandle,
  runExternalBootstraps,
  buildStickyAxes,
  createGrid,
  createBoardDecorations,
  wireBoard,
  getNeutralColor,
  getAccentColor,
};

// Drain any board-init callbacks queued by @CoordinateSystem macros that ran
// before this script loaded.
(function () {
  const pending: Array<() => void> = Array.isArray(window.__liaRunCoordHooks)
    ? (window.__liaRunCoordHooks as unknown as Array<() => void>)
    : [];

  pending.forEach(fn => { try { fn(); } catch (e) {} });

  // Future macros call push() — fire immediately since __coord is now ready.
  (window.__liaRunCoordHooks as unknown) = {
    push(fn: () => void) { try { fn(); } catch (e) {} }
  };
})();

initAxisTitle();
initCreatePoint();
initSlider();
initPlotFunction();
initPlotInput();
initPointOnGraph();
initPointsOnGraph();
initFunctionAnalysisPoints();
initDistance();
initLinearObjects();
initArc();
initRelationObjects();
initArea();
initAngle();
initCoordText();
initCircle();
initTangentSector();
initObjectAnalysisPoints();
initSchar();
initTable();
initReconstruction();
initPolygonMetricQuiz();
initConstructionQuiz();
initCombinedQuiz();
initRegression();
initDGS();
scheduleMacroCodeOrderLayers();
