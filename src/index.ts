// Entry point: initializes all subsystems in order and exposes board helpers.

import { init as initAxisTitle } from './subsystems/axisTitle';
import { init as initCreatePoint } from './subsystems/createPoint';
import { init as initPoint3D } from './subsystems/point3d';
import { init as initLinear3D } from './subsystems/linear3d';
import { init as initPlane3D } from './subsystems/plane3d';
import { init as initCircle3D } from './subsystems/circle3d';
import { init as initSphere3D } from './subsystems/sphere3d';
import { init as initSolid3D } from './subsystems/solid3d';
import { init as initCurveSurface3D } from './subsystems/curveSurface3d';
import { init as initAnalytic3D } from './subsystems/analytic3d';
import { init as initLocus3D } from './subsystems/locus3d';
import { init as initDgsSegment6Tools } from './subsystems/dgsSegment6Tools';
import { init as initTransformation3D } from './subsystems/transformation3d';
import { init as initIntersection3D } from './subsystems/intersection3d';
import { createCoordinateTransformedObject3D } from './coord/transform3dObjects';
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
import { init as initTransformedPoint } from './subsystems/transformedPoint';
import { init as initArea } from './subsystems/area';
import { init as initAngle } from './subsystems/angle';
import { init as initCoordText } from './subsystems/coordText';
import { init as initCircle } from './subsystems/circle';
import { init as initCompassArc } from './subsystems/compassArc';
import { init as initTangentSector } from './subsystems/tangentSector';
import { init as initObjectFormat } from './subsystems/objectFormat';
import { init as initSchar } from './subsystems/schar';
import { init as initTable } from './subsystems/table';
import { init as initReconstruction } from './subsystems/reconstruction';
import { init as initPolygonMetricQuiz } from './subsystems/polygonMetricQuiz';
import { init as initConstructionQuiz } from './subsystems/constructionQuiz';
import { init as initCombinedQuiz } from './subsystems/combinedQuiz';
import { init as initConstructionQuiz3D } from './subsystems/constructionQuiz3d';
import { init as initRegression } from './subsystems/regression';
import { init as initDGS } from './subsystems/dgs';
import { init as initFullscreenNote } from './subsystems/fullscreenNote';
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
import {
  coordinateLinear3DEndpoint,
  coordinateLinear3DData,
  coordinatePlane3DData,
  coordinateCircle3DData,
  coordinateSphere3DData,
  coordinatePolygon3DData,
  coordinateSolid3DData,
  coordinateCurve3DData,
  coordinateSurface3DData,
  coordinateLinear3DSourcePoints,
  coordinateVector3DComponents,
  createCoordinateFreeVector3D,
  createCoordinateLinear3D,
  createCoordinatePoint3D,
  createCoordinatePlane3D,
  createCoordinateCircle3D,
  createCoordinateDependentCircle3D,
  createCoordinateSphere3D,
  createCoordinatePolygon3D,
  createCoordinateDependentPolygon3D,
  createCoordinateSolid3D,
  createCoordinateDependentSolid3D,
  createCoordinateCurve3D,
  createCoordinateSurface3D,
  disposeCoordinateView3D,
  ensureCoordinateView3D,
  getCoordinateView3D,
  mountCoordinateView3DControls,
  point3DCoordinates,
  projectBoardCoordinatesToXYPlane,
  requestCoordinateSceneMode,
  setCoordinateCamera,
  setCoordinateFreeVector3DComponents,
  setCoordinatePoint3D,
  setCoordinateProjection,
  setCoordinateViewMode
} from './coord/view3d';
import { getNeutralColor, getAccentColor } from './shared/theme';
import { initQuizDom } from './shared/quizDom';
import { initCoordinateBoardElement } from './coord/coordinateElement';
import {
  bootstrapStaticCoordinateBoards,
  disposeStaticCoordinateBoard,
  initStaticRenderer,
  initializeStaticCoordinateBoard,
  isStaticCoordinateBoard,
  scheduleStaticBootstrap,
} from './static/staticSvg';

let dynamicRuntimeReady = false;
let drainingCoordinateHooks = false;
let dynamicRuntimeRequested = false;

/** Initialize the JSXGraph-dependent registries only when a dynamic board needs them. */
export function ensureDynamicRuntime(): void {
  if (dynamicRuntimeReady) return;
  if (drainingCoordinateHooks) {
    dynamicRuntimeRequested = true;
    return;
  }
  dynamicRuntimeReady = true;
  window.__coordinateDynamicRuntimeReady = true;

  initQuizDom();
  initMacroCodeOrderLayers();
  initAxisTitle();
  initCreatePoint();
  initPoint3D();
  initLinear3D();
  initPlane3D();
  initCircle3D();
  initSphere3D();
  initSolid3D();
  initCurveSurface3D();
  initAnalytic3D();
  initLocus3D();
  initDgsSegment6Tools();
  initTransformation3D();
  initIntersection3D();
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
  initTransformedPoint();
  initArea();
  initAngle();
  initCoordText();
  initCircle();
  initCompassArc();
  initTangentSector();
  initObjectAnalysisPoints();
  initObjectFormat();
  initSchar();
  initTable();
  initReconstruction();
  initPolygonMetricQuiz();
  initConstructionQuiz();
  initCombinedQuiz();
  initConstructionQuiz3D();
  initRegression();
  initDGS();
  initFullscreenNote();
  scheduleMacroCodeOrderLayers();
}

window.__ensureCoordinateDynamicRuntime = ensureDynamicRuntime;

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
  initializeStaticCoordinateBoard,
  disposeStaticCoordinateBoard,
  isStaticCoordinateBoard,
  bootstrapStaticCoordinateBoards,
  scheduleStaticBootstrap,
  initCoordinateBoardElement,
  coordinateLinear3DEndpoint,
  coordinateLinear3DData,
  coordinatePlane3DData,
  coordinateCircle3DData,
  coordinateSphere3DData,
  coordinatePolygon3DData,
  coordinateSolid3DData,
  coordinateCurve3DData,
  coordinateSurface3DData,
  coordinateLinear3DSourcePoints,
  coordinateVector3DComponents,
  createCoordinateFreeVector3D,
  createCoordinateLinear3D,
  createCoordinatePoint3D,
  createCoordinatePlane3D,
  createCoordinateCircle3D,
  createCoordinateDependentCircle3D,
  createCoordinateSphere3D,
  createCoordinatePolygon3D,
  createCoordinateDependentPolygon3D,
  createCoordinateSolid3D,
  createCoordinateDependentSolid3D,
  createCoordinateCurve3D,
  createCoordinateSurface3D,
  createCoordinateTransformedObject3D,
  disposeCoordinateView3D,
  ensureCoordinateView3D,
  getCoordinateView3D,
  mountCoordinateView3DControls,
  point3DCoordinates,
  projectBoardCoordinatesToXYPlane,
  requestCoordinateSceneMode,
  setCoordinateCamera,
  setCoordinateFreeVector3DComponents,
  setCoordinatePoint3D,
  setCoordinateProjection,
  setCoordinateViewMode,
};

// The static lifecycle observer must be installed before dynamic subsystem
// observers. Static-only courses therefore never create their retry intervals.
initStaticRenderer();
initCoordinateBoardElement();

// Drain any board-init callbacks queued by @CoordinateSystem macros that ran
// before this script loaded.
(function () {
  const pending: Array<() => void> = Array.isArray(window.__liaRunCoordHooks)
    ? (window.__liaRunCoordHooks as unknown as Array<() => void>)
    : [];

  drainingCoordinateHooks = true;
  try {
    pending.forEach(fn => { try { fn(); } catch (e) {} });
  } finally {
    drainingCoordinateHooks = false;
  }
  if (dynamicRuntimeRequested) {
    dynamicRuntimeRequested = false;
    ensureDynamicRuntime();
  }

  // Future macros call push() â€” fire immediately since __coord is now ready.
  (window.__liaRunCoordHooks as unknown) = {
    push(fn: () => void) { try { fn(); } catch (e) {} }
  };
})();

// Preserve hot-reload compatibility if a dynamic board registry already
// existed before this bundle instance was evaluated.
if (window.__boards && Object.keys(window.__boards).length > 0) {
  ensureDynamicRuntime();
}
