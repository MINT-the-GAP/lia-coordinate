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
  __liaAxisTitlesReady: boolean | undefined;
  __liaAxisTitleSpecs: Record<string, any>;
  __bootstrapAxisTitles: (() => void) | undefined;
  __refreshAllAxisTitles: (() => void) | undefined;
  renderAxisTitlesFromSpec: ((spec: string) => boolean) | undefined;

  // Theme sync
  __liaThemeSync: { listeners: Set<() => void>; check: () => void } | undefined;
  __registerLiaThemeListener: ((fn: () => void) => void) | undefined;

  // ErzeugePunkt subsystem
  __erzeugePunktReady: boolean | undefined;
  __erzeugePunktInstances: Record<string, any>;
  __bootstrapErzeugePunkte: (() => void) | undefined;
  __bootstrapErzeugePunkteRAF: number | undefined;
  __scheduleBootstrapErzeugePunkte: (() => void) | undefined;

  // Koord point subsystem
  __points: Record<string, Record<string, any>>;
  __pointStates: Record<string, Record<string, any>>;
  __pointNeutralColor: (() => string) | undefined;
  __bootstrapKoordPunkte: (() => void) | undefined;
  __bootstrapKoordPunkteRAF: number | undefined;
  __scheduleBootstrapKoordPunkte: (() => void) | undefined;

  // Public point API
  restorePointFromSpec: ((spec: string) => any) | undefined;
  getPointFromSpec: ((spec: string) => any) | undefined;
  ensurePointFromSpec: ((spec: string) => boolean) | undefined;
  finalizePointFromSpec: ((spec: string) => boolean) | undefined;
  placeKoordPointFromSpec: ((spec: string) => boolean) | undefined;
  renderKoordPunktFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  renderErzeugePunktFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  __checkPointFromSpec: ((spec: string) => boolean) | undefined;

  // PunktGraph public API
  restorePointGraphFromSpec: ((spec: string) => any) | undefined;
  getPointGraphFromSpec: ((spec: string) => any) | undefined;
  ensurePointGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  finalizePointGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  checkPointGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  showGraphFromPointGraphSpec: ((spec: string) => void) | undefined;
  restorePointGraphVisualState: ((uid: string) => void) | undefined;
  renderPunktGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // PunkteAufGraph public API
  getPunkteAufGraphFromSpec: ((uid: string, spec: string) => any) | undefined;
  ensurePunkteAufGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  renderPunkteAufGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  checkPunkteAufGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  showGraphFromPunkteAufGraphSpec: ((spec: string) => void) | undefined;
  restorePunkteAufGraphVisualState: ((uid: string) => void) | undefined;
  restorePunkteAufGraphFromSpec: ((spec: string) => any) | undefined;
  finalizePunkteAufGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // Tabelle public API
  renderTabelleFromSpec: ((uid: string, spec: string, force?: boolean) => boolean) | undefined;
  getTabelleWerte: ((uid: string) => any) | undefined;
  getTabelleDaten: ((uid: string) => any) | undefined;
  setTabelleWerte: ((uid: string, werte: any) => void) | undefined;

  // Plot function subsystem
  __plotFunktionReady: boolean | undefined;
  __plotFunctionEntries: Record<string, any>;
  __bootstrapPlotFunctions: (() => void) | undefined;
  renderPlotFunctionFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // LaTeX student plot (graph-drawing) subsystem
  __liaLatexStudentPlotReady: boolean | undefined;
  __liaLatexStudentPlot: Record<string, any>;
  __liaLatexStudentPlotInstances: Record<string, any>;
  __liaLatexStudentPlotStates: Record<string, any>;
  __liaLatexStudentPlotNeutralColor: (() => string) | undefined;
  __liaLatexStudentPlotThemeSync: any;
  __registerLiaLatexStudentPlotThemeListener: ((fn: () => void) => void) | undefined;
  __bootstrapPlotInputs: (() => void) | undefined;
  __bootstrapPlotInputsRAF: number | undefined;
  __scheduleBootstrapPlotInputs: (() => void) | undefined;
  renderPlotEingabeLatexFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // PunktGraph subsystem
  __punktGraphReady: boolean | undefined;
  __pointGraphs: Record<string, any>;
  __pointGraphStates: Record<string, any>;
  __punktGraphInstances: Record<string, any>;
  __punktGraphLocks: Record<string, any>;
  __bootstrapPunktGraphs: (() => void) | undefined;
  __bootstrapPunktGraphsRAF: number | undefined;
  __scheduleBootstrapPunktGraphs: (() => void) | undefined;
  __checkPointGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // PunkteAufGraph subsystem
  __punkteAufGraphReady: boolean | undefined;
  __punkteAufGraphInstances: Record<string, any>;
  __punkteAufGraphLocks: Record<string, any>;
  __bootstrapPunkteAufGraph: (() => void) | undefined;
  __bootstrapPunkteAufGraphRAF: number | undefined;
  __scheduleBootstrapPunkteAufGraph: (() => void) | undefined;
  __checkPunkteAufGraphFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // Tabelle subsystem
  __liaTabelleReadyV2: boolean | undefined;
  __liaTableStates: Record<string, any>;
  __liaTableMounted: Record<string, any>;
  __liaTableLastSpec: Record<string, any>;
  __bootstrapTabellen: (() => void) | undefined;
  __bootstrapTabellenRAF: number | undefined;
  __scheduleBootstrapTabellen: (() => void) | undefined;

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
