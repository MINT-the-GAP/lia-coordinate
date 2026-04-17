// Entry point: initializes all subsystems in order and exposes board helpers.

import { init as initAxisTitle } from './subsystems/axisTitle';
import { init as initCreatePoint } from './subsystems/createPoint';
import { init as initPlotFunction } from './subsystems/plotFunction';
import { init as initPlotInput } from './subsystems/plotInput';
import { init as initPointOnGraph } from './subsystems/pointOnGraph';
import { init as initPointsOnGraph } from './subsystems/pointsOnGraph';
import { init as initTable } from './subsystems/table';
import {
  parseCoordSpec,
  getSafeBBox,
  isValidBBox,
  loadStoredBoardState,
  saveBoardState,
  getBoardStateStore,
  getConstrainedAncestorWidth,
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
  wireBoard,
} from './coord/boardHelpers';
import { getNeutralColor, getAccentColor } from './shared/theme';

// Expose board helpers on window.__coord for use by the inline macro code.
window.__coord = {
  parseCoordSpec,
  getSafeBBox,
  isValidBBox,
  loadStoredBoardState,
  saveBoardState,
  getBoardStateStore,
  getConstrainedAncestorWidth,
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
  wireBoard,
  getNeutralColor,
  getAccentColor,
};

// Run any pending coord hooks registered by the @CoordinateSystem macro.
if (window.__liaRunCoordHooks) {
  window.__liaRunCoordHooks();
  requestAnimationFrame(() => {
    if (window.__liaRunCoordHooks) window.__liaRunCoordHooks();
  });
  setTimeout(() => {
    if (window.__liaRunCoordHooks) window.__liaRunCoordHooks();
  }, 0);
  setTimeout(() => {
    if (window.__liaRunCoordHooks) window.__liaRunCoordHooks();
  }, 120);
}

initAxisTitle();
initCreatePoint();
initPlotFunction();
initPlotInput();
initPointOnGraph();
initPointsOnGraph();
initTable();
