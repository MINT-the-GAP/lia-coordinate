// Entry point: initializes all subsystems in order and exposes board helpers.

import { init as initAxisTitle } from './subsystems/axisTitle';
import { init as initCreatePoint } from './subsystems/createPoint';
import { init as initPlotFunction } from './subsystems/plotFunction';
import { init as initPlotInput } from './subsystems/plotInput';
import { init as initPointOnGraph } from './subsystems/pointOnGraph';
import { init as initPointsOnGraph } from './subsystems/pointsOnGraph';
import { init as initDistance } from './subsystems/distance';
import { init as initArea } from './subsystems/area';
import { init as initAngle } from './subsystems/angle';
import { init as initSchar } from './subsystems/schar';
import { init as initTable } from './subsystems/table';
import { init as initReconstruction } from './subsystems/reconstruction';
import { init as initRegression } from './subsystems/regression';
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
  createBoardDecorations,
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
initPlotFunction();
initPlotInput();
initPointOnGraph();
initPointsOnGraph();
initDistance();
initArea();
initAngle();
initSchar();
initTable();
initReconstruction();
initRegression();
