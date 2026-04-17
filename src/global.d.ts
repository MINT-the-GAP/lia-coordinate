// Runtime globals injected by JSXGraph and MathJax CDN scripts
declare const JXG: any;

interface Window {
  // JSXGraph board registry
  JXG: any;
  __boards: Record<string, any>;

  // MathJax (loaded externally)
  MathJax: any;

  // Coord hook bootstrap
  __liaRunCoordHooks: (() => void) | undefined;
  __coordBoardStates: Record<string, any>;

  // Axis title subsystem
  __axisTitlesReady: boolean | undefined;
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
