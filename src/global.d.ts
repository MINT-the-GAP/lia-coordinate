// Runtime globals injected by JSXGraph and MathJax CDN scripts
declare const JXG: any;

interface Window {
  // JSXGraph board registry
  JXG: any;
  __boards: Record<string, any>;

  // MathJax (loaded externally)
  MathJax: any;

  // Coord hook bootstrap
  __liaCoordHooks: Record<string, () => void> | undefined;
  __liaRunCoordHooks: Array<() => void> | { push(fn: () => void): void } | undefined;
  __coordBoardStates: Record<string, any>;

  // Board helpers namespace exposed for inline macro code
  __coord: {
    parseCoordSpec: (spec: string) => any;
    getSafeBBox: (board: any, fallback: number[]) => number[];
    isValidBBox: (bb: any) => boolean;
    loadStoredBoardState: (id: string) => any;
    saveBoardState: (board: any, id: string, initialBBox: number[]) => void;
    getBoardStateStore: () => Record<string, any>;
    getConstrainedAncestorWidth: (el: HTMLElement | null) => number;
    clampWidth: (board: any, w: number) => number;
    clampHeight: (h: number) => number;
    solveAspectFittedSize: (board: any, preferredWidth: number, ratio: number) => { width: number; height: number };
    applyBoardSize: (board: any, w: number, h: number, useInitial: boolean, anchorBBox: number[], initialBBox: number[], boardId: string) => any;
    fitBoardSize: (board: any, initialBBox: number[], initialWidth: number | null, initialRatio: number, boardId: string) => void;
    restoreSavedBoardState: (board: any, initialBBox: number[], boardId: string) => boolean;
    applyBoardFrame: (board: any) => void;
    applyNavColors: (board: any) => void;
    applyGridColor: (board: any, color: string) => void;
    applyAxisColors: (board: any) => void;
    applyAdaptiveTicks: (board: any) => void;
    updateStickyTickLabelPositions: (board: any) => void;
    ensureResizeHandle: (board: any, initialBBox: number[], boardId: string, onResize: () => void) => void;
    runExternalBootstraps: () => void;
    buildStickyAxes: (board: any, axisCol: string, visible?: boolean) => void;
    createGrid: (board: any, gridCol: string) => void;
    createBoardDecorations: (board: any, cfg: any, axisCol: string, gridCol: string) => void;
    wireBoard: (board: any, cfg: any, initialBBox: number[], initialRatio: number) => void;
    getAccentColor: () => string;
    getNeutralColor: () => string;
  } | undefined;

  // Axis title subsystem
  __axisTitlesReady: boolean | undefined;
  __axisTitlesInterval: ReturnType<typeof setInterval> | undefined;
  __liaAxisTitleSpecs: Record<string, any>;
  __bootstrapAxisTitles: (() => void) | undefined;
  __refreshAllAxisTitles: (() => void) | undefined;
  renderAxisTitlesFromSpec: ((spec: string) => boolean) | undefined;

  // Theme sync
  __liaThemeSync: { listeners: Set<() => void>; check: () => void } | undefined;
  __registerLiaThemeListener: ((fn: () => void) => void) | undefined;

  // CreatePoint subsystem (@CreatePoint)
  __createPointReady: boolean | undefined;
  __createPointInstances: Record<string, any>;
  __bootstrapCreatePoints: (() => void) | undefined;
  __bootstrapCreatePointsRAF: number | undefined;
  __scheduleBootstrapCreatePoints: (() => void) | undefined;

  // Static point subsystem (@Point)
  __bootstrapStaticPoints: (() => void) | undefined;
  __bootstrapStaticPointsRAF: number | undefined;
  __scheduleBootstrapStaticPoints: (() => void) | undefined;
  placeStaticPointFromSpec: ((spec: string) => boolean) | undefined;
  renderStaticPointFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // Shared point state
  __points: Record<string, Record<string, any>>;
  __pointStates: Record<string, Record<string, any>>;
  __pointNeutralColor: (() => string) | undefined;

  // Public point API
  restorePointFromSpec: ((spec: string) => any) | undefined;
  getPointFromSpec: ((spec: string) => any) | undefined;
  ensurePointFromSpec: ((spec: string) => boolean) | undefined;
  finalizePointFromSpec: ((spec: string) => boolean) | undefined;
  renderCreatePointFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  __checkPointFromSpec: ((spec: string) => boolean) | undefined;

  // PlotFunction subsystem (@PlotFunction)
  __plotFunctionReady: boolean | undefined;
  __plotFunctionEntries: Record<string, any>;
  __bootstrapPlotFunctions: (() => void) | undefined;
  renderPlotFunctionFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // PlotInput subsystem (@PlotInput)
  __plotInputReady: boolean | undefined;
  __plotInput: Record<string, any>;
  __plotInputInstances: Record<string, any>;
  __plotInputStates: Record<string, any>;
  __plotInputNeutralColor: (() => string) | undefined;
  __plotInputThemeSync: any;
  __registerPlotInputThemeListener: ((fn: () => void) => void) | undefined;
  __bootstrapPlotInputs: (() => void) | undefined;
  __bootstrapPlotInputsRAF: number | undefined;
  __scheduleBootstrapPlotInputs: (() => void) | undefined;
  renderPlotInputFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // PointOnGraph subsystem (@PointOnGraph)
  __pointOnGraphReady: boolean | undefined;
  __pointGraphs: Record<string, any>;
  __pointGraphStates: Record<string, any>;
  __pointOnGraphInstances: Record<string, any>;
  __pointOnGraphLocks: Record<string, any>;
  __bootstrapPointOnGraphs: (() => void) | undefined;
  __bootstrapPointOnGraphsRAF: number | undefined;
  __scheduleBootstrapPointOnGraphs: (() => void) | undefined;
  __checkPointGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  restorePointGraphFromSpec: ((spec: string) => any) | undefined;
  getPointGraphFromSpec: ((spec: string) => any) | undefined;
  ensurePointGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  finalizePointGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  checkPointGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  showGraphFromPointGraphSpec: ((spec: string) => void) | undefined;
  restorePointGraphVisualState: ((uid: string) => void) | undefined;
  renderPointOnGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // PointsOnGraph subsystem (@PointsOnGraph)
  __pointsOnGraphReady: boolean | undefined;
  __pointsOnGraphInstances: Record<string, any>;
  __pointsOnGraphLocks: Record<string, any>;
  __bootstrapPointsOnGraph: (() => void) | undefined;
  __bootstrapPointsOnGraphRAF: number | undefined;
  __scheduleBootstrapPointsOnGraph: (() => void) | undefined;
  __checkPointsOnGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  checkPointsOnGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  getPointsOnGraphFromSpec: ((uid: string, spec: string) => any) | undefined;
  ensurePointsOnGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  finalizePointsOnGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  restorePointsOnGraphFromSpec: ((spec: string) => any) | undefined;
  restorePointsOnGraphVisualState: ((uid: string) => void) | undefined;
  showGraphFromPointsOnGraphSpec: ((spec: string) => void) | undefined;
  renderPointsOnGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // Segment subsystem (@Strecke / @distance)
  __distanceReady: boolean | undefined;
  __distanceEntries: Record<string, any>;
  __distanceRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapDistances: (() => void) | undefined;
  __bootstrapDistancesRAF: number | undefined;
  __scheduleBootstrapDistances: (() => void) | undefined;
  renderDistanceFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Area subsystem (@Area / @Fläche)
  __areaReady: boolean | undefined;
  __areaEntries: Record<string, any>;
  __areaRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapAreas: (() => void) | undefined;
  __bootstrapAreasRAF: number | undefined;
  __scheduleBootstrapAreas: (() => void) | undefined;
  renderAreaFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Angle subsystem (@angle / @Winkel)
  __angleReady: boolean | undefined;
  __angleEntries: Record<string, any>;
  __angleRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapAngles: (() => void) | undefined;
  __bootstrapAnglesRAF: number | undefined;
  __scheduleBootstrapAngles: (() => void) | undefined;
  renderAngleFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Circle subsystem (@Circle / @Kreis)
  __circleReady: boolean | undefined;
  __circleEntries: Record<string, any>;
  __circleRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapCircles: (() => void) | undefined;
  __bootstrapCirclesRAF: number | undefined;
  __scheduleBootstrapCircles: (() => void) | undefined;
  renderCircleFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Schar subsystem (@Schar)
  __scharReady: boolean | undefined;
  __scharEntries: Record<string, any>;
  __liaScharStateStore: Record<string, any>;
  __bootstrapScharen: (() => void) | undefined;
  renderScharFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // Rekonstruktion subsystem (@Rekonstruktion)
  __rekonstruktionReady: boolean | undefined;
  __bootstrapRekonstruktion: (() => void) | undefined;
  __bootstrapReconstruction: (() => void) | undefined;
  __setupRekonstruktionQuiz: ((uid: string, spec: string) => void) | undefined;
  __setupReconstructionQuiz: ((uid: string, spec: string) => void) | undefined;
  __checkRekonstruktionFromSpec: ((spec: string) => boolean) | undefined;
  __checkReconstructionFromSpec: ((spec: string) => boolean) | undefined;
  __checkRekonstruktionQuiz: ((uid: string, spec: string) => boolean) | undefined;
  __checkReconstructionQuiz: ((uid: string, spec: string) => boolean) | undefined;

  // Regression subsystem (@Regression)
  __regressionReady: boolean | undefined;
  __bootstrapRegression: (() => void) | undefined;
  __setupRegressionUI: ((uid: string, spec: string) => void) | undefined;
  __relayoutRegressionForBoard: ((boardId: string, dgsOpen?: boolean) => void) | undefined;
  __liaRegressionStates: Record<string, any>;
  __checkRegressionFromSpec: ((spec: string) => boolean) | undefined;
  __checkRegressionQuiz: ((uid: string, spec: string) => boolean) | undefined;
  undoAction: ((boardId: string) => void) | undefined;
  redoAction: ((boardId: string) => void) | undefined;

  // DGS subsystem (@DGS)
  __dgsReady: boolean | undefined;
  __bootstrapDGS: (() => void) | undefined;
  __setupDGS: ((uid: string, spec: string) => void) | undefined;

  // Table subsystem (@Table)
  __tableReady: boolean | undefined;
  __tableStates: Record<string, any>;
  __bootstrapTables: (() => void) | undefined;
  __bootstrapTablesRAF: number | undefined;
  __scheduleBootstrapTables: (() => void) | undefined;
  renderTableFromSpec: ((uid: string, spec: string, force?: boolean) => boolean) | undefined;
  getTableValues: ((uid: string) => any) | undefined;
  getTableData: ((uid: string) => any) | undefined;
  setTableValues: ((uid: string, values: any) => boolean) | undefined;
}

// Custom properties attached directly to DOM element instances
interface HTMLElement {
  __liaAxisBootstrapped: boolean | undefined;
  __liaAxisLastSpec: string | undefined;
  __liaPointEnsureBound: boolean | undefined;
  __liaPointUiObserved: boolean | undefined;
  __liaPointUiScheduled: boolean | undefined;
  __liaPointGraphEnsureBound: boolean | undefined;
  __liaPointGraphUiObserved: boolean | undefined;
  __liaPointGraphUiScheduled: boolean | undefined;
  __liaMultiGraphEnsureBound: boolean | undefined;
  __liaMultiGraphUiObserved: boolean | undefined;
  __liaTableMounted: boolean | undefined;
  __liaTableLastSpec: string | undefined;
  __liaHtml: string | undefined;
  // JSXGraph board overlays
  __xTitleOverlay: HTMLElement | undefined;
  __yTitleOverlay: HTMLElement | undefined;
  // State flags
  __liaStateBound: boolean | undefined;
  __restoreLockUntil: number | undefined;
  [key: string]: any;
}
