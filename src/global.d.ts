// Runtime globals injected by JSXGraph and MathJax CDN scripts
declare const JXG: any;

interface CoordinateView3DRegistryEntry {
  boardId: string;
  board: any;
  view: any;
  config: import('./shared/coordSpec').BoardConfig;
  projection: import('./shared/scene3d').Projection3D;
  camera: import('./shared/scene3d').Camera3D;
  viewMode: import('./shared/scene3d').SceneViewMode;
  points: Set<any>;
  linearObjects: Set<any>;
  planeObjects: Set<any>;
  circleObjects: Set<any>;
  sphereObjects: Set<any>;
  polygonObjects: Set<any>;
  solidObjects: Set<any>;
  curveObjects: Set<any>;
  surfaceObjects: Set<any>;
  decorations: Set<any>;
  controls?: HTMLElement;
  controlsCleanup?: () => void;
  cameraDragCleanup?: () => void;
  viewportCleanup?: () => void;
  viewportSignature?: string;
  decorationSignature?: string;
  spatialRanges: [[number, number], [number, number], [number, number]];
}

interface Window {
  // JSXGraph board registry
  JXG: any;
  __boards: Record<string, any>;
  __coordinateViews3d: Record<string, CoordinateView3DRegistryEntry>;

  // MathJax (loaded externally)
  MathJax: any;

  // Coord hook bootstrap
  __liaCoordHooks: Record<string, () => void> | undefined;
  __liaRunCoordHooks: Array<() => void> | { push(fn: () => void): void } | undefined;
  __coordBoardStates: Record<string, any>;
  __ensureCoordinateDynamicRuntime: (() => void) | undefined;
  __bootstrapDgsSegment6Tools: (() => void) | undefined;
  __mountDgsSegment6Tools: ((menu: HTMLElement) => void) | undefined;
  __dgsSegment6PropertyObjects: Record<string, any> | undefined;
  __coordinateDynamicRuntimeReady: boolean | undefined;
  __disposeDGSForBoard: ((boardId: string) => void) | undefined;
  __disposeRegressionForBoard: ((boardId: string) => void) | undefined;
  __syncCoordinateQuizBindings: (() => void) | undefined;

  // Explicit native-SVG coordinate boards (never mirrored into __boards)
  __staticCoordinateBoards: Record<string, any> | undefined;
  __staticCoordinateWarnings: Set<string> | undefined;
  __staticCoordinateRendererReady: boolean | undefined;
  __staticCoordinateObserver: MutationObserver | undefined;

  // Source-order layers for ordinary coordinate macros
  __macroCodeLayersReady: boolean | undefined;
  __applyMacroCodeOrderLayers: (() => void) | undefined;
  __scheduleMacroCodeOrderLayers: (() => void) | undefined;
  __initMacroCodeOrderLayers: (() => void) | undefined;
  __macroCodeOrderLayerObserver: MutationObserver | undefined;

  // Board helpers namespace exposed for inline macro code
  __coord: {
    parseCoordSpec: (spec: string) => any;
    initializeCoordinateBoard: (jxgbox: HTMLElement, spec: string) => any;
    getSafeBBox: (board: any, fallback: number[]) => number[];
    isValidBBox: (bb: any) => boolean;
    loadStoredBoardState: (id: string) => any;
    saveBoardState: (board: any, id: string, initialBBox: number[]) => void;
    getBoardStateStore: () => Record<string, any>;
    getConstrainedAncestorWidth: (el: HTMLElement | null) => number;
    prepareBoardContainer: (el: HTMLElement, initialWidth: number | null, initialRatio: number, storedState: any) => void;
    clampWidth: (board: any, w: number) => number;
    clampHeight: (h: number) => number;
    solveAspectFittedSize: (board: any, preferredWidth: number, ratio: number) => { width: number; height: number };
    applyBoardSize: (board: any, w: number, h: number, useInitial: boolean, anchorBBox: number[], initialBBox: number[], boardId: string, limitHeight?: boolean) => any;
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
    initializeStaticCoordinateBoard: (container: HTMLElement, cfg: any) => any;
    disposeStaticCoordinateBoard: (id: string, expectedContainer?: HTMLElement) => void;
    isStaticCoordinateBoard: (id: string) => boolean;
    bootstrapStaticCoordinateBoards: () => void;
    scheduleStaticBootstrap: () => void;
    initCoordinateBoardElement: () => void;
    coordinateLinear3DEndpoint: (object: any) => [number, number, number] | null;
    coordinateLinear3DData: (object: any) => any;
    coordinatePlane3DData: (object: any) => any;
    coordinateCircle3DData: (object: any) => any;
    coordinateSphere3DData: (object: any) => any;
    coordinatePolygon3DData: (object: any) => any;
    coordinateSolid3DData: (object: any) => any;
    coordinateCurve3DData: (object: any) => any;
    coordinateSurface3DData: (object: any) => any;
    coordinateLinear3DSourcePoints: (object: any) => [any, any] | null;
    coordinateVector3DComponents: (object: any) => [number, number, number] | null;
    createCoordinateFreeVector3D: (board: any, anchor: any, components: [number, number, number], attributes?: Record<string, unknown>) => any;
    createCoordinateLinear3D: (board: any, kind: 'segment' | 'line' | 'ray' | 'vector', point1: any, point2: any, attributes?: Record<string, unknown>) => any;
    createCoordinatePoint3D: (board: any, coordinates: [number, number, number], attributes?: Record<string, unknown>) => any;
    createCoordinatePlane3D: (board: any, definition: 'three-points' | 'point-vectors' | 'point-normal', points: any[], vectors?: any[], attributes?: Record<string, unknown>) => any;
    createCoordinateCircle3D: (board: any, definition: 'three-points' | 'center-normal-radius' | 'center-normal-point', points: any[], vectors?: any[], radius?: number | (() => number), attributes?: Record<string, unknown>) => any;
    createCoordinateDependentCircle3D: (board: any, evaluator: () => any, attributes?: Record<string, unknown>) => any;
    createCoordinateSphere3D: (board: any, definition: 'center-point' | 'center-radius' | 'four-points', points: any[], radius?: number | (() => number), attributes?: Record<string, unknown>) => any;
    createCoordinatePolygon3D: (board: any, points: any[], attributes?: Record<string, unknown>) => any;
    createCoordinateDependentPolygon3D: (board: any, evaluator: () => any, attributes?: Record<string, unknown>) => any;
    createCoordinateSolid3D: (board: any, definition: import('./shared/scene3d').Solid3DDefinition, points?: any[], vectors?: any[], polygon?: any, radius?: number | (() => number), attributes?: Record<string, unknown>) => any;
    createCoordinateDependentSolid3D: (board: any, evaluator: () => any, attributes?: Record<string, unknown>) => any;
    createCoordinateCurve3D: (board: any, curveOrEvaluator: any, attributes?: Record<string, unknown>) => any;
    createCoordinateSurface3D: (board: any, surfaceOrEvaluator: any, attributes?: Record<string, unknown>) => any;
    createCoordinateTransformedObject3D: (board: any, source: any, evaluator: () => import('./shared/transform3d').SimilarityTransform3D | null, definition: import('./shared/scene3d').Transformation3DDefinition, references?: any[], value?: number | (() => number), attributes?: Record<string, unknown>) => any;
    disposeCoordinateView3D: (boardOrId: any) => void;
    ensureCoordinateView3D: (board: any, config?: any) => any;
    getCoordinateView3D: (boardOrId: any) => any;
    mountCoordinateView3DControls: (board: any, container: HTMLElement, language?: 'de' | 'en') => HTMLElement;
    point3DCoordinates: (point: any) => [number, number, number] | null;
    projectBoardCoordinatesToXYPlane: (board: any, x: number, y: number) => [number, number, number];
    requestCoordinateSceneMode: (board: any, mode: '2d' | '3d') => { ok: boolean; message?: string };
    setCoordinateCamera: (entryOrBoard: any, camera: any, emit?: boolean) => void;
    setCoordinateFreeVector3DComponents: (object: any, components: [number, number, number]) => boolean;
    setCoordinatePoint3D: (point: any, coordinates: [number, number, number], updateBoardAfterwards?: boolean) => boolean;
    setCoordinateProjection: (entryOrBoard: any, projection: 'parallel' | 'central', emit?: boolean) => void;
    setCoordinateViewMode: (entryOrBoard: any, viewMode: '2d' | '3d') => void;
  } | undefined;

  // Point3D subsystem (@Point3D/@Punkt3D)
  __point3DReady: boolean | undefined;
  __point3DObserver: MutationObserver | undefined;
  __bootstrapPoint3D: (() => void) | undefined;
  __bootstrapPoint3DRAF: number | undefined;
  __scheduleBootstrapPoint3D: (() => void) | undefined;
  renderPoint3DFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // Linear 3D subsystems (@Segment3D/@Line3D/@Ray3D/@Vector3D and German aliases)
  __linear3DReady: boolean | undefined;
  __linear3DObserver: MutationObserver | undefined;
  __linear3DEntries: Record<string, any>;
  __bootstrapLinear3D: (() => void) | undefined;
  __bootstrapLinear3DRAF: number | undefined;
  __scheduleBootstrapLinear3D: (() => void) | undefined;
  renderLinear3DFromSpec: ((uid: string, spec: string, kind: string, language?: string) => boolean) | undefined;

  // Plane 3D subsystem
  __plane3DReady: boolean | undefined;
  __intersection3DReady: boolean | undefined;
  __intersection3DObserver: MutationObserver | undefined;
  __intersection3DEntries: Record<string, any> | undefined;
  __bootstrapIntersection3D: (() => void) | undefined;
  __bootstrapIntersection3DRAF: number | undefined;
  __scheduleBootstrapIntersection3D: (() => void) | undefined;
  renderIntersection3DFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;
  __plane3DObserver: MutationObserver | undefined;
  __plane3DEntries: Record<string, any>;
  __circle3DEntries: Record<string, any>;
  __sphere3DEntries: Record<string, any>;
  __bootstrapPlane3D: (() => void) | undefined;
  __bootstrapPlane3DRAF: number | undefined;
  __scheduleBootstrapPlane3D: (() => void) | undefined;
  renderPlane3DFromSpec: ((uid: string, spec: string, definition: string, language?: string) => boolean) | undefined;
  // Circle/Sphere 3D subsystems
  __circle3DReady: boolean | undefined;
  __circle3DObserver: MutationObserver | undefined;
  __bootstrapCircle3D: (() => void) | undefined;
  __bootstrapCircle3DRAF: number | undefined;
  __scheduleBootstrapCircle3D: (() => void) | undefined;
  renderCircle3DFromSpec: ((uid: string, spec: string, definition: string, language?: string) => boolean) | undefined;
  __sphere3DReady: boolean | undefined;
  __sphere3DObserver: MutationObserver | undefined;
  __bootstrapSphere3D: (() => void) | undefined;
  __bootstrapSphere3DRAF: number | undefined;
  __scheduleBootstrapSphere3D: (() => void) | undefined;
  renderSphere3DFromSpec: ((uid: string, spec: string, definition: string, language?: string) => boolean) | undefined;
  // Polygon/Solid/Transformation 3D subsystems
  __solid3DReady: boolean | undefined;
  __solid3DObserver: MutationObserver | undefined;
  __solid3DEntries: Record<string, any> | undefined;
  __bootstrapSolid3D: (() => void) | undefined;
  __bootstrapSolid3DRAF: number | undefined;
  __scheduleBootstrapSolid3D: (() => void) | undefined;
  renderSolid3DFromSpec: ((uid: string, spec: string, definition: string, language?: string) => boolean) | undefined;
  __transformation3DReady: boolean | undefined;
  __transformation3DObserver: MutationObserver | undefined;
  __transformation3DEntries: Record<string, any> | undefined;
  __bootstrapTransformation3D: (() => void) | undefined;
  __bootstrapTransformation3DRAF: number | undefined;
  __scheduleBootstrapTransformation3D: (() => void) | undefined;
  renderTransformation3DFromSpec: ((uid: string, spec: string, definition: string, language?: string) => boolean) | undefined;
  // Locus curve and locus surface 3D subsystems
  __locus3DReady: boolean | undefined;
  __locus3DObserver: MutationObserver | undefined;
  __locus3DEntries: Record<string, any> | undefined;
  __locusSurface3DEntries: Record<string, any> | undefined;
  __bootstrapLocus3D: (() => void) | undefined;
  __bootstrapLocus3DRAF: number | undefined;
  __scheduleBootstrapLocus3D: (() => void) | undefined;
  renderLocus3DFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  renderLocusSurface3DFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // Analytic geometry 3D subsystem
  __analytic3DReady: boolean | undefined;
  __analytic3DObserver: MutationObserver | undefined;
  __analytic3DEntries: Record<string, any> | undefined;
  __bootstrapAnalytic3D: (() => void) | undefined;
  __bootstrapAnalytic3DRAF: number | undefined;
  __scheduleBootstrapAnalytic3D: (() => void) | undefined;
  renderAnalytic3DFromSpec: ((uid: string, spec: string, operation: string) => boolean) | undefined;

  // Curve, surface and conic 3D subsystems
  __curveSurface3DReady: boolean | undefined;
  __lastCurveSurface3DError: string | undefined;
  __curveSurface3DObserver: MutationObserver | undefined;
  __curve3DEntries: Record<string, any> | undefined;
  __surface3DEntries: Record<string, any> | undefined;
  __conic3DEntries: Record<string, any> | undefined;
  __bootstrapCurveSurface3D: (() => void) | undefined;
  __bootstrapCurveSurface3DRAF: number | undefined;
  __scheduleBootstrapCurveSurface3D: (() => void) | undefined;
  renderCurve3DFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  renderSurface3DFromSpec: ((uid: string, spec: string, functionGraph?: boolean) => boolean) | undefined;
  renderConic3DFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // Axis title subsystem
  __axisTitlesReady: boolean | undefined;
  __axisTitlesInterval: ReturnType<typeof setInterval> | undefined;
  __liaAxisTitleSpecs: Record<string, any>;
  __bootstrapAxisTitles: (() => void) | undefined;
  __refreshAllAxisTitles: (() => void) | undefined;
  __refreshAxisTitlesForBoard: ((boardId: string) => void) | undefined;
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
  renderCreatePointFromSpec: ((uid: string, spec: string, languageCode?: string) => boolean) | undefined;
  __checkPointFromSpec: ((spec: string) => boolean) | undefined;
  __checkCreatePointQuiz: ((uid: string, spec: string) => boolean) | undefined;

  // PlotFunction subsystem (@PlotFunction)
  __plotFunctionReady: boolean | undefined;
  __plotFunctionEntries: Record<string, any>;
  __bootstrapPlotFunctions: (() => void) | undefined;
  __bootstrapPlotFunctionsRAF: number | undefined;
  __scheduleBootstrapPlotFunctions: (() => void) | undefined;
  renderPlotFunctionFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // Slider subsystem (@Slider/@Regler)
  __sliderReady: boolean | undefined;
  __sliderEntries: Record<string, any>;
  __sliderRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapSliders: (() => void) | undefined;
  __bootstrapSlidersRAF: number | undefined;
  __scheduleBootstrapSliders: (() => void) | undefined;
  __getCoordSliderBindings: ((boardId?: string, excludeObject?: any) => Record<string, () => number>) | undefined;
  __refreshDgsSliderAnimationControls: ((boardId?: string) => void) | undefined;
  renderSliderFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Function analysis point subsystem (@Zeros/@Nullstellen, @Extrema/@Extrempunkte, @InflectionPoints/@Wendepunkte)
  __functionAnalysisPointsReady: boolean | undefined;
  __functionAnalysisPointEntries: Record<string, any>;
  __functionAnalysisPointsRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapFunctionAnalysisPoints: (() => void) | undefined;
  __bootstrapFunctionAnalysisPointsRAF: number | undefined;
  __scheduleBootstrapFunctionAnalysisPoints: (() => void) | undefined;
  __scheduleFunctionAnalysisPointsForBoard: ((boardId?: string) => void) | undefined;
  renderFunctionAnalysisPointsFromSpec: ((uid: string, spec: string, kind: string, language?: string) => boolean) | undefined;

  // Object analysis point subsystem (@OrdinateIntercept/@Ordinatenabschnitt, @Intersection/@Schnittpunkt)
  __objectAnalysisPointsReady: boolean | undefined;
  __objectAnalysisPointEntries: Record<string, any>;
  __objectAnalysisPointsRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapObjectAnalysisPoints: (() => void) | undefined;
  __bootstrapObjectAnalysisPointsRAF: number | undefined;
  __scheduleBootstrapObjectAnalysisPoints: (() => void) | undefined;
  __scheduleObjectAnalysisPointsForBoard: ((boardId?: string) => void) | undefined;
  renderObjectAnalysisPointsFromSpec: ((uid: string, spec: string, kind: string, language?: string) => boolean) | undefined;

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
  renderPlotInputFromSpec: ((uid: string, spec: string, languageCode?: string) => boolean) | undefined;

  // PointOnGraph subsystem (@PointOnGraph)
  __pointOnGraphReady: boolean | undefined;
  __pointGraphs: Record<string, any>;
  __pointGraphStates: Record<string, any>;
  __pointOnGraphInstances: Record<string, any>;
  __pointOnGraphLocks: Record<string, any>;
  __pointOnGraphLayerEntries: Record<string, any>;
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
  renderPointOnGraphFromSpec: ((uid: string, spec: string, languageCode?: string) => boolean) | undefined;

  // PointsOnGraph subsystem (@PointsOnGraph)
  __pointsOnGraphReady: boolean | undefined;
  __pointsOnGraphInstances: Record<string, any>;
  __pointsOnGraphLocks: Record<string, any>;
  __pointsOnGraphLayerEntries: Record<string, any>;
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
  renderPointsOnGraphFromSpec: ((uid: string, spec: string, languageCode?: string) => boolean) | undefined;

  // Segment subsystem (@Strecke / @distance)
  __distanceReady: boolean | undefined;
  __distanceEntries: Record<string, any>;
  __distanceRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapDistances: (() => void) | undefined;
  __bootstrapDistancesRAF: number | undefined;
  __scheduleBootstrapDistances: (() => void) | undefined;
  renderDistanceFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Linear object subsystem (@Line/@Gerade, @Ray/@Strahl, @Vector/@Vektor)
  __linearObjectsReady: boolean | undefined;
  __linearObjectEntries: Record<string, any>;
  __linearObjectsRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapLinearObjects: (() => void) | undefined;
  __bootstrapLinearObjectsRAF: number | undefined;
  __scheduleBootstrapLinearObjects: (() => void) | undefined;
  renderLinearObjectFromSpec: ((uid: string, spec: string, kind: string, language?: string) => boolean) | undefined;

  // Cubic arc subsystem (@Arc/@Bogen)
  __arcReady: boolean | undefined;
  __arcEntries: Record<string, any>;
  __arcRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapArcs: (() => void) | undefined;
  __bootstrapArcsRAF: number | undefined;
  __scheduleBootstrapArcs: (() => void) | undefined;
  renderArcFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Relation object subsystem (@Perpendicular/@Orthogonale, @Parallel/@Parallele, @Midpoint/@Mittelpunkt)
  __relationObjectsReady: boolean | undefined;
  __relationObjectEntries: Record<string, any>;
  __relationObjectsRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapRelationObjects: (() => void) | undefined;
  __bootstrapRelationObjectsRAF: number | undefined;
  __scheduleBootstrapRelationObjects: (() => void) | undefined;
  renderRelationObjectFromSpec: ((uid: string, spec: string, kind: string, language?: string) => boolean) | undefined;

  // Dependent transformation point subsystem (@TransformPoint/@Transformationspunkt)
  __transformedPointsReady: boolean | undefined;
  __transformedPointEntries: Record<string, any>;
  __transformedPointsRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapTransformedPoints: (() => void) | undefined;
  __bootstrapTransformedPointsRAF: number | undefined;
  __scheduleBootstrapTransformedPoints: (() => void) | undefined;
  renderTransformedPointFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Area subsystem (@Area / @FlÃ¤che)
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

  // Coordinate text subsystem (@CoordText / @KoordText)
  __coordTextReady: boolean | undefined;
  __coordTextEntries: Record<string, any>;
  __coordTextRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapCoordTexts: (() => void) | undefined;
  __bootstrapCoordTextsRAF: number | undefined;
  __scheduleBootstrapCoordTexts: (() => void) | undefined;
  renderCoordTextFromSpec: ((uid: string, spec: string) => boolean) | undefined;

  // Exported DGS object formatting (@ObjectFormat / @ObjektFormat)
  __objectFormatReady: boolean | undefined;
  __objectFormatEntries: Record<string, any>;
  __objectFormatRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapObjectFormats: (() => void) | undefined;
  __bootstrapObjectFormatsRAF: number | undefined;
  __scheduleBootstrapObjectFormats: (() => void) | undefined;
  renderObjectFormatFromSpec: ((uid: string, spec: string) => boolean) | undefined;
  __applyDgsObjectExportFormat: ((boardId: string, object: any, config: any) => boolean) | undefined;

  // Circle subsystem (@Circle / @Kreis)
  __circleReady: boolean | undefined;
  __circleEntries: Record<string, any>;
  __circleRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapCircles: (() => void) | undefined;
  __bootstrapCirclesRAF: number | undefined;
  __scheduleBootstrapCircles: (() => void) | undefined;
  renderCircleFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Compass arc subsystem (@CompassArc / @Zirkelbogen)
  __compassArcReady: boolean | undefined;
  __compassArcEntries: Record<string, any>;
  __compassArcRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapCompassArcs: (() => void) | undefined;
  __bootstrapCompassArcsRAF: number | undefined;
  __scheduleBootstrapCompassArcs: (() => void) | undefined;
  renderCompassArcFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Tangent and circular-sector subsystem (@Tangent/@Tangente, @CircularSector/@Kreissektor/@Kreissegment)
  __tangentSectorReady: boolean | undefined;
  __tangentEntries: Record<string, any>;
  __sectorEntries: Record<string, any>;
  __tangentSectorRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapTangentSectorObjects: (() => void) | undefined;
  __bootstrapTangentSectorObjectsRAF: number | undefined;
  __scheduleBootstrapTangentSectorObjects: (() => void) | undefined;
  renderTangentFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;
  renderCircularSectorFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Schar subsystem (@Schar)
  __scharReady: boolean | undefined;
  __scharEntries: Record<string, any>;
  __liaScharStateStore: Record<string, any>;
  __bootstrapScharen: (() => void) | undefined;
  renderScharFromSpec: ((uid: string, spec: string, languageCode?: string) => boolean) | undefined;

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

  // Polygon metric quizzes (@PerimeterQuiz/@UmfangQuiz, @AreaQuiz/@FlaecheQuiz)
  __polygonMetricQuizReady: boolean | undefined;
  __bootstrapPolygonMetricQuizzes: (() => void) | undefined;
  __setupPolygonMetricQuiz: ((
    uid: string,
    spec: string,
    kind: string,
    language?: string
  ) => void) | undefined;
  __checkPolygonMetricFromSpec: ((spec: string, kind: string) => boolean) | undefined;
  __checkPolygonMetricQuiz: ((uid: string, spec: string, kind: string) => boolean) | undefined;

  // Polygon construction quizzes (@KonstruktionQuiz/@ConstructionQuiz)
  __constructionQuizReady: boolean | undefined;
  __bootstrapConstructionQuizzes: (() => void) | undefined;
  __setupConstructionQuiz: ((
    uid: string,
    spec: string,
    language?: string
  ) => void) | undefined;
  __checkConstructionQuizFromSpec: ((spec: string) => boolean) | undefined;
  __checkConstructionQuiz: ((uid: string, spec: string) => boolean) | undefined;

  // 3D and combined 2D/3D construction quizzes
  __constructionQuiz3DReady: boolean | undefined;
  __constructionQuiz3DObserver: MutationObserver | undefined;
  __constructionQuiz3DEntries: Record<string, any> | undefined;
  __bootstrapConstructionQuiz3D: (() => void) | undefined;
  __setupConstructionQuiz3D: ((uid: string, spec: string, language?: string) => void) | undefined;
  __checkConstructionQuiz3DFromSpec: ((spec: string, language?: string) => any) | undefined;
  __checkConstructionQuiz3D: ((uid: string, spec: string) => boolean) | undefined;
  __getConstructionQuiz3DResult: ((uid: string) => any) | undefined;
  __resetConstructionQuiz3D: ((uid: string) => void) | undefined;

  // Combined polygon quizzes (@KoordQuiz/@GeometrieQuiz and English aliases)
  __combinedQuizReady: boolean | undefined;
  __bootstrapCombinedQuizzes: (() => void) | undefined;
  __setupCombinedQuiz: ((
    uid: string,
    spec: string,
    language?: string
  ) => void) | undefined;
  __checkCombinedQuizFromSpec: ((spec: string) => boolean) | undefined;
  __checkCombinedQuiz: ((uid: string, spec: string) => boolean) | undefined;

  // Regression subsystem (@Regression)
  __regressionReady: boolean | undefined;
  __bootstrapRegression: (() => void) | undefined;
  __setupRegressionUI: ((uid: string, spec: string, language?: string) => void) | undefined;
  __relayoutRegressionForBoard: ((boardId: string, dgsOpen?: boolean) => void) | undefined;
  __setDgsExternalToolActive: ((boardId: string, active: boolean) => void) | undefined;
  __refreshDgsToolAvailabilityForBoard: ((boardId: string) => void) | undefined;
  __dgsMayDisplayValuesForBoard: ((boardId: string) => boolean) | undefined;
  __captureDgsSceneSnapshot: ((boardId: string) => any) | undefined;
  __persistDgsSegment6: ((boardId: string) => void) | undefined;
  __liaRegressionStates: Record<string, any>;
  __checkRegressionFromSpec: ((spec: string) => boolean) | undefined;
  __checkRegressionQuiz: ((uid: string, spec: string) => boolean) | undefined;
  undoAction: ((boardId: string) => void) | undefined;
  redoAction: ((boardId: string) => void) | undefined;
  __recordDgsHistory: ((boardId: string, before: any, after: any) => void) | undefined;
  __applyDgsHistory: ((boardId: string, snapshot: any) => void) | undefined;
  __createDgsDrawnSegment: ((boardId: string, start: { x: number; y: number }, end: { x: number; y: number }, color: string, width: number) => boolean) | undefined;
  __beginDgsErase: ((boardId: string) => void) | undefined;
  __eraseDgsAtClientPoint: ((boardId: string, clientX: number, clientY: number) => boolean) | undefined;
  __finishDgsErase: ((boardId: string) => void) | undefined;

  // DGS subsystem (@DGS)
  __dgsReady: boolean | undefined;
  __bootstrapDGS: (() => void) | undefined;
  __prepareDgsBoardReplacement: (() => void) | undefined;
  __syncDgsFixedCompassPoint: ((boardId: string, point: any) => boolean) | undefined;
  __persistDgsBoardState: ((boardId: string, recordHistory?: boolean) => void) | undefined;
  __detachDgsAnalysisFunctionTarget: ((boardId: string, target: any) => void) | undefined;
  __setupDGS: ((uid: string, spec: string, language?: string) => void) | undefined;
  __setupDGSRegression: ((uid: string, spec: string, language?: string) => void) | undefined;
  __setupDGSInstrument: ((
    uid: string,
    spec: string,
    kind: string,
    language?: string
  ) => void) | undefined;
  __dgsLocusEntries: Record<string, any>;
  __dgsLocusRetryInterval: ReturnType<typeof setInterval> | undefined;
  __bootstrapDgsLoci: (() => void) | undefined;
  renderDgsLocusFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;
  __dgsEllipseEntries: Record<string, any>;
  __bootstrapDgsEllipses: (() => void) | undefined;
  renderDgsEllipseFromSpec: ((uid: string, spec: string, language?: string) => boolean) | undefined;

  // Table subsystem (@Table)
  __tableReady: boolean | undefined;
  __tableStates: Record<string, any>;
  __bootstrapTables: (() => void) | undefined;
  __bootstrapTablesRAF: number | undefined;
  __scheduleBootstrapTables: (() => void) | undefined;
  renderTableFromSpec: ((uid: string, spec: string, force?: boolean, languageCode?: string) => boolean) | undefined;
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
