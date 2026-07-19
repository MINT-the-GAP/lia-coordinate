<!--
author:   MINT-the-GAP, Martin Lommatzsch, Jihad Hyadi
version:  0.0.1
language: en
edit: true
narrator: US English Female
comment:  Interactive coordinate system plugin for LiaScript, powered by JSXGraph. Provides macros for coordinate planes, points, function plots, and value tables.

import:   https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md

script:   ./dist/index.js

@CoordinateSystem: @CoordinateSystem_(`@0`)
@Koordinatensystem: @CoordinateSystem_(`@0`)

@CoordinateSystem_
``` javascript @JSX.Graph
(function () {
  function run() {
    JXG.Options.text.useMathJax = true;

    const C = window.__coord;
    const cfg         = C.parseCoordSpec(String.raw`@0`);
    const INITIAL_BBOX  = [cfg.xmin, cfg.ymax, cfg.xmax, cfg.ymin];
    const INITIAL_RATIO = (cfg.ymax - cfg.ymin) / (cfg.xmax - cfg.xmin);

    // Pre-size against the actual LiaScript content column before JSXGraph starts.
    // Only a size explicitly chosen with the resize handle is restored as manual.
    const presetState = C.loadStoredBoardState(cfg.id);
    C.prepareBoardContainer(jxgbox, cfg.width, INITIAL_RATIO, presetState);

    // board.create() calls must be inline — jxgbox is only available in this fence.
    const board = JXG.JSXGraph.initBoard(jxgbox, {
      axis: false, grid: false, showNavigation: false, showCopyright: false,
      boundingbox: presetState ? presetState.bbox.slice() : INITIAL_BBOX.slice(),
      keepaspectratio: true,
      zoom: { enabled: cfg.border, wheel: cfg.border, needShift: false, factorX: 1.15, factorY: 1.15 },
      pan:  { enabled: cfg.border, needShift: false, needTwoFingers: false }
    });

    C.createBoardDecorations(board, cfg, C.getNeutralColor(), C.getAccentColor());

    // Wire all hooks, event listeners, and sizing logic.
    C.wireBoard(board, cfg, INITIAL_BBOX, INITIAL_RATIO);
  }

  // Defer until dist/index.js has set window.__coord.
  if (window.__coord) {
    run();
  } else {
    window.__liaRunCoordHooks = window.__liaRunCoordHooks || [];
    window.__liaRunCoordHooks.push(run);
  }
})();
```
@end

@AxisLabel: @AxisLabel_(@uid,`@0`)
@AchsenBeschriftung: @AxisLabel_(@uid,`@0`)

@AxisLabel_
<span id="axis-title-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@CreatePoint: @CreatePoint_(@uid,`@0`,`@1`)
@ErzeugePunkt: @CreatePoint_(@uid,`@0`,`@1`)

@CreatePoint_
<div id="point-ui-@0" data-spec="@1">
  <div id="point-task-@0" class="lia-point-task"></div>

  <div id="point-check-@0">
    @2
    [[!]]
    <script modify="false">
      window.__checkPointFromSpec && window.__checkPointFromSpec(document.getElementById('point-ui-@0')?.dataset.spec || '')
    </script>
  </div>
</div>

@end

@Point: @Point_(@uid,`@0`)
@Punkt: @Point_(@uid,`@0`)

@Point_
<span id="point-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@CoordText: @CoordText_(@uid,`@0`)
@KoordText: @CoordText_(@uid,`@0`)

@CoordText_
<span class="lia-coord-text-spec" id="coord-text-spec-@0" data-spec="@1" style="display:none;"></span>
@end


@Strecke: @Distance_(@uid,`@0`,de)
@distance: @Distance_(@uid,`@0`,en)

@Distance_
<span id="distance-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Line: @LinearObject_(@uid,`@0`,line,en)
@Gerade: @LinearObject_(@uid,`@0`,line,de)
@Ray: @LinearObject_(@uid,`@0`,ray,en)
@Strahl: @LinearObject_(@uid,`@0`,ray,de)
@Vector: @LinearObject_(@uid,`@0`,vector,en)
@Vektor: @LinearObject_(@uid,`@0`,vector,de)

@LinearObject_
<span id="linear-spec-@0" data-spec="@1" data-kind="@2" data-language="@3" style="display:none;"></span>
@end

@Arc: @Arc_(@uid,`@0`,en)
@Bogen: @Arc_(@uid,`@0`,de)

@Arc_
<span id="arc-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Perpendicular: @RelationObject_(@uid,`@0`,orthogonal,en)
@Orthogonale: @RelationObject_(@uid,`@0`,orthogonal,de)
@Parallel: @RelationObject_(@uid,`@0`,parallel,en)
@Parallele: @RelationObject_(@uid,`@0`,parallel,de)
@Midpoint: @RelationObject_(@uid,`@0`,midpoint,en)
@Mittelpunkt: @RelationObject_(@uid,`@0`,midpoint,de)

@RelationObject_
<span id="relation-spec-@0" data-spec="@1" data-kind="@2" data-language="@3" style="display:none;"></span>
@end

@Area: @Area_(@uid,`@0`,en)
@Flaeche: @Area_(@uid,`@0`,de)

@Area_
<span id="area-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@angle: @Angle_(@uid,`@0`,en)
@Winkel: @Angle_(@uid,`@0`,de)

@Angle_
<span id="angle-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Circle: @Circle_(@uid,`@0`,en)
@Kreis: @Circle_(@uid,`@0`,de)

@Circle_
<span id="circle-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Tangent: @Tangent_(@uid,`@0`,en)
@Tangente: @Tangent_(@uid,`@0`,de)

@Tangent_
<span id="tangent-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@CircularSector: @CircularSector_(@uid,`@0`,en)
@Sector: @CircularSector_(@uid,`@0`,en)
@CircleSegment: @CircularSector_(@uid,`@0`,en)
@CircularSegment: @CircularSector_(@uid,`@0`,en)
@Kreissektor: @CircularSector_(@uid,`@0`,de)
@Kreissegment: @CircularSector_(@uid,`@0`,de)

@CircularSector_
<span id="sector-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@PlotFunction: @PlotFunction_(@uid,`@0`)
@PlotFunktion: @PlotFunction_(@uid,`@0`)

@PlotFunction_
<span id="plot-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@Zeros: @FunctionAnalysisPoints_(@uid,`@0`,roots,en)
@Nullstellen: @FunctionAnalysisPoints_(@uid,`@0`,roots,de)
@Extrema: @FunctionAnalysisPoints_(@uid,`@0`,extrema,en)
@Extrempunkte: @FunctionAnalysisPoints_(@uid,`@0`,extrema,de)
@InflectionPoints: @FunctionAnalysisPoints_(@uid,`@0`,inflections,en)
@Wendepunkte: @FunctionAnalysisPoints_(@uid,`@0`,inflections,de)

@FunctionAnalysisPoints_
<span id="function-analysis-spec-@0" data-spec="@1" data-kind="@2" data-language="@3" style="display:none;"></span>
@end

@OrdinateIntercept: @ObjectAnalysisPoints_(@uid,`@0`,ordinate-intercept,en)
@Ordinatenabschnitt: @ObjectAnalysisPoints_(@uid,`@0`,ordinate-intercept,de)
@Ordinatenachsenabschnitt: @ObjectAnalysisPoints_(@uid,`@0`,ordinate-intercept,de)
@Intersection: @ObjectAnalysisPoints_(@uid,`@0`,intersections,en)
@Schnittpunkt: @ObjectAnalysisPoints_(@uid,`@0`,intersections,de)

@ObjectAnalysisPoints_
<span id="object-analysis-spec-@0" data-spec="@1" data-kind="@2" data-language="@3" style="display:none;"></span>
@end

@Slider: @Slider_(@uid,`@0`,en)
@Regler: @Slider_(@uid,`@0`,de)
@Schieberegler: @Slider_(@uid,`@0`,de)

@Slider_
<span id="slider-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@PlotInput: @PlotInput_(@uid,`@0`)
@PlotEingabeLatex: @PlotInput_(@uid,`@0`)

@PlotInput_
<div id="lia-plot-input-@0" data-spec="@1"></div>
@end

@Schar: @Schar_(@uid,`@0`)

@Schar_
<span id="schar-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@PerimeterQuiz: @PolygonMetricQuiz_(@uid,`@0`,`@1`,perimeter,@language)
@UmfangQuiz: @PolygonMetricQuiz_(@uid,`@0`,`@1`,perimeter,@language)
@AreaQuiz: @PolygonMetricQuiz_(@uid,`@0`,`@1`,area,@language)
@FlaecheQuiz: @PolygonMetricQuiz_(@uid,`@0`,`@1`,area,@language)

@PolygonMetricQuiz_
<span id='polygon-metric-quiz-spec-@0' data-spec='@1' data-kind='@3' data-language='@4' style='display:none'></span>

@2
[[!]]
<script modify=false>
  typeof window.__checkPolygonMetricQuiz === 'function' &&
    window.__checkPolygonMetricQuiz('@0', "@'1", '@3') === true
</script>
@end

@ConstructionQuiz: @ConstructionQuiz_(@uid,`@0`,`@1`,@language)
@KonstruktionQuiz: @ConstructionQuiz_(@uid,`@0`,`@1`,@language)

@ConstructionQuiz_
<span id='construction-quiz-spec-@0' data-spec='@1' data-language='@3' style='display:none'></span>

@2
[[!]]
<script modify=false>
  typeof window.__checkConstructionQuiz === 'function' &&
    window.__checkConstructionQuiz('@0', "@'1") === true
</script>
@end

@Rekonstruktion: @Rekonstruktion_(@uid,`@0`)
@Reconstruction: @Rekonstruktion_(@uid,`@0`)

@Rekonstruktion_
<span id="rek-spec-@0" data-spec="@1" style="display:none;"></span>

<div id="rek-check-@0">
[[!]]
<script modify="false">
  (() => {
    const node = document.getElementById('rek-spec-@0');
    const spec = node ? String(node.dataset.spec || '') : String.raw`@1`;

    if (typeof window.__checkReconstructionQuiz === 'function') {
      return window.__checkReconstructionQuiz('@0', spec);
    }

    if (typeof window.__checkRekonstruktionQuiz === 'function') {
      return window.__checkRekonstruktionQuiz('@0', spec);
    }

    if (typeof window.__checkReconstructionFromSpec === 'function') {
      return window.__checkReconstructionFromSpec(spec);
    }

    if (typeof window.__checkRekonstruktionFromSpec === 'function') {
      return window.__checkRekonstruktionFromSpec(spec);
    }

    return false;
  })()
</script>
</div>

<script modify="false">
(function(){
  const node = document.getElementById('rek-spec-@0');
  const spec = node ? String(node.dataset.spec || '') : String.raw`@1`;
  if (typeof window.__setupReconstructionQuiz === 'function') {
    window.__setupReconstructionQuiz('@0', spec);
    return;
  }

  if (typeof window.__setupRekonstruktionQuiz === 'function') {
    window.__setupRekonstruktionQuiz('@0', spec);
  }
})();
</script>
@end

@PointOnGraph: @PointOnGraph_(@uid,`@0`)
@PunktGraph: @PointOnGraph_(@uid,`@0`)

@PointOnGraph_
<div id="graph-ui-@0">
  <div id="graph-task-@0" class="lia-graph-task"></div>
  <div id="graph-check-@0">
    [[!]]
    <script modify="false">
      window.__checkPointGraphFromSpec && window.__checkPointGraphFromSpec('@0', document.getElementById('graph-spec-@0')?.textContent || '')
    </script>
  </div>
</div>
<span id="graph-spec-@0" style="display:none;">@1</span>

@end

@PointsOnGraph: @PointsOnGraph_(@uid,`@0`)
@PunkteAufGraph: @PointsOnGraph_(@uid,`@0`)

@PointsOnGraph_
<div id="multi-graph-ui-@0" data-spec="@1">
  <div id="multi-graph-task-@0" class="lia-multi-graph-task"></div>

  <div id="multi-graph-check-@0">
    [[!]]
    <script modify="false">
      window.__checkPointsOnGraphFromSpec && window.__checkPointsOnGraphFromSpec('@0', document.getElementById('multi-graph-ui-@0')?.dataset.spec || '')
    </script>
  </div>
</div>

@end

@Table: @Table_(@uid,`@0`)
@Tabelle: @Table_(@uid,`@0`)

@Table_
<div id="lia-table-@0" data-spec="@1"></div>
@end

@DGS: @DGS_(@uid,`@0`,@language)

@DGS_
<span id="dgs-ui-@0" data-spec="@1" data-language="@2" style="display:none;"></span>

<script modify="false">
(function(){
  if (typeof window.__setupDGS === 'function') {
    window.__setupDGS('@0', '@1', '@2');
  }
})();
</script>
@end

@Compass: @DGSInstrument_(@uid,`@0`,compass,@language)
@Zirkel: @DGSInstrument_(@uid,`@0`,compass,@language)
@SetSquare: @DGSInstrument_(@uid,`@0`,set-square,@language)
@Geodreieck: @DGSInstrument_(@uid,`@0`,set-square,@language)

@DGSInstrument_
<span id='dgs-instrument-ui-@0' data-spec='@1' data-instrument='@2' data-language='@3' hidden aria-hidden=true></span>

<script modify=false>
(function(){
  if (typeof window.__setupDGSInstrument === 'function') {
    window.__setupDGSInstrument('@0', '@1', '@2', '@3');
  }
})();
</script>
@end

@Regression: @Regression_(@uid,`@0`,@language)
@Regession: @Regression_(@uid,`@0`,@language)
@PlotZeichnen: @Regression_(@uid,`@0`,@language)

@Regression_
<span id="regression-ui-@0" data-spec="@1" data-language="@2" style="display:none;"></span>

<script modify="false">
(function(){
  const spec = '@1';
  if (typeof window.__setupRegressionUI === 'function') {
    window.__setupRegressionUI('@0', spec, '@2');
  }
})();
</script>
@end

-->


# Coordinate System Plugin

          --{{0}}--
This plugin provides interactive coordinate systems for LiaScript courses, built on JSXGraph.
Place points, plot functions, draw graphs by hand, and connect value tables to coordinate planes.

__Try it on LiaScript:__
https://liascript.github.io/course/?https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/main/README.md

__See the project on GitHub:__
https://github.com/MINT-the-GAP/lia-coordinate

           {{1}}
1. Load the macros via

   `import: https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/main/README.md`

   or pin to a specific version:

   `import: https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/0.0.1/README.md`

2. Also requires JSXGraph (already included via the `import:` above):

   `import: https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md`

## `@CoordinateSystem`

          --{{0}}--
Renders an interactive JSXGraph coordinate plane. Supports panning, zooming, and a resize handle.

Parameters (semicolon-separated key=value pairs):
- `xmin`, `xmax`, `ymin`, `ymax` — axis bounds (defaults: -4, 4, -3, 3)
- `width` — maximum initial width in pixels; on narrower screens the board
  automatically scales down to the available content width. If `width` is empty
  or omitted, the board derives its start width from the current LiaScript content
  column on every mount, including LiveEditor recompiles.
- `id` — board identifier used to connect other macros to this board
- final positional flags `axes;grid;border` — `0` hides and `1` shows each element
  (when omitted, all remain enabled/visible)

`border=0` (or positional third flag `;0`) disables panning, zooming, and the
resize handle, and hides the frame. `border=1` (or omitted) keeps the current
interactive framed behavior.

For `axes;grid`, the combinations are `0;0` (neither), `0;1` (grid only),
`1;0` (axes only), and `1;1` (both). Named forms such as
`achsen=0;grid=1;border=0` are also accepted.

``` markdown
@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A1;1;1;1`)
```

---

@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A1`)

## `@AxisLabel`

          --{{0}}--
Adds axis labels (supporting LaTeX math) to a coordinate board.
Place it directly after `@CoordinateSystem` with the same `id`.

Parameters: `id=<boardId>;xlabel=<label>;ylabel=<label>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_axis`)

@AxisLabel(`id=ex_axis;xlabel=$x$;ylabel=$y$`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_axis`)

@AxisLabel(`id=ex_axis;xlabel=$x$;ylabel=$y$`)

## `@CreatePoint`

          --{{0}}--
Creates a draggable point exercise. The student drags a point to a target coordinate and checks their answer.
A "Create point" button appears — clicking it places the draggable point. The check button validates position within a tolerance of 0.05 units.

Parameters: `<boardId>;<pointName>;<targetX>;<targetY>`

The second argument must always be provided. Pass an empty string (with a space) to use the default check button.

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_point_ez`)

@AxisLabel(`id=ex_point_ez;xlabel=$x$;ylabel=$y$`)

Drag point $A$ to the coordinates $(2 | 3)$.

@CreatePoint(`ex_point_ez;A;2;3`,` `)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_point_ez`)

@AxisLabel(`id=ex_point_ez;xlabel=$x$;ylabel=$y$`)

Drag point $A$ to the coordinates $(2 | 3)$.

@CreatePoint(`ex_point_ez;A;2;3`,` `)

## `@Point`

          --{{0}}--
Places a pre-defined point on the board. Color and opacity apply to both the
X marker and its label. Opacity is clamped to `0` through `1`; add `fix` to make
the point immovable. The legacy form with `fix` directly after the coordinates
remains supported.

Parameters: `<boardId>;<pointName>[=0];<x>;<y>;<color>;<opacity>;fix`

For every macro name position in this template, a terminal `=0` hides only
the displayed name. The part before it remains the technical object name:
`A=0` creates a point whose label is hidden, but later macros still refer to
it as `A`. Without exactly `=0`, names are always displayed. This also
applies to function names, parameter names, line names, angle names, and
automatically generated analysis-point names.

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_point`)

@AxisLabel(`id=ex_point;xlabel=$x$;ylabel=$y$`)

@Point(`ex_point;A;2;3`)
@Point(`ex_point;B=0;-3;-1;#e63946;0.65;fix`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_point`)

@AxisLabel(`id=ex_point;xlabel=$x$;ylabel=$y$`)

@Point(`ex_point;A;2;3`)
@Point(`ex_point;B=0;-3;-1;#e63946;0.65;fix`)

## `@CoordText` / `@KoordText`

          --{{0}}--
Places text at a fixed coordinate. Color is optional and defaults to the current
theme accent color; opacity is clamped to `0` through `1`. Text enclosed in
dollar signs is rendered as TeX, so both plain text and expressions such as
`$f(x)$` are supported. Parentheses can be written directly in the backtick-
wrapped macro argument; the legacy spelling `$f{{x}}$` remains supported.

Parameters: `<boardId>;[<x>;<y>];<content>;<color>;<opacity>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_coord_text`)

@CoordText(`ex_coord_text;[-2;2];Hinweis;#00ff00;0.8`)
@KoordText(`ex_coord_text;[2;1];$f(x)=x^2$;#e63946;1`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_coord_text`)

@CoordText(`ex_coord_text;[-2;2];Hinweis;#00ff00;0.8`)
@KoordText(`ex_coord_text;[2;1];$f(x)=x^2$;#e63946;1`)

## `@Strecke` / `@distance`

          --{{0}}--
Connects either two existing named points or a directly supplied coordinate list.
Named points remain attached when they move. Coordinate input such as
`[[2;3];[4;4];[6;2]]` creates fixed invisible helper points and connects each
successive pair as one continuous polygonal path; no point markers or names are
shown. Point names are case-sensitive; the color is optional and defaults to the
current theme accent color. A supplied segment name is displayed by default.
Add `length=1` to display the dynamic total path length
near its geometric midpoint. `@Strecke` uses a decimal comma and `LE`;
`@distance` uses a decimal point and `LU`. A name ending in `=0` is kept
for references but omitted from the label; with `length=1`, the numeric
length and unit remain visible. Without a name and without exactly
`length=1`, only the path is rendered.

The optional design follows `@Arc` / `@Bogen`: `->`, `<-`, and
`<->` add arrows, while a leading or trailing `|` adds a short
perpendicular cap at that end (for example `|->`, `->|`, or
`|<->|`). An empty design or `-` keeps the ordinary segment.
For coordinate lists, arrows and caps are applied only to the two outer ends
of the complete polygonal path. An optional line width such as `2px`
defaults to `3px`; use `-;2px` when only the width should change.
The unambiguous aliases `design=...` and `width=...` are accepted as well.

Parameters: `<boardId>;[<pointName1>;<pointName2>]|[[<x1>;<y1>];...];<color>;<segmentName>[=0][;length=1][;<design>][;<lineWidth>]`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_distance`)

@Point(`ex_distance;A;-2;-1`)
@Point(`ex_distance;B;3;2`)

@Strecke(`ex_distance;[A;B];#e63946;a;length=1;->|;2px`)

@Strecke(`ex_distance;[[2;3];[4;4];[6;2]];#457b9d;s=0;length=1;|<->|;4px`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_distance;1;1;0`)

@Point(`ex_distance;A;-2;-1`)
@Point(`ex_distance;B;3;2`)

@Strecke(`ex_distance;[A;B];#e63946;a;length=1;->|;2px`)

@Strecke(`ex_distance;[[2;3];[4;4];[6;2]];#00ffff;s=0;length=1;|<->|;4px`)

## `@Line` / `@Gerade`, `@Ray` / `@Strahl`, `@Vector` / `@Vektor`

          --{{0}}--
Creates a straight line, a ray, or a vector from two existing named points or
from two directly supplied coordinates. Named points remain attached when they
move; coordinate input creates fixed invisible helper points. Rays are rendered
without arrowheads. Vectors use the JSXGraph arrow and are labelled as
`\overrightarrow{...}`; if no explicit vector name is given, named endpoints are
used automatically, for example `\overrightarrow{AB}`.

Parameters: `<boardId>;[<pointName1>;<pointName2>]|[[<x1>;<y1>];[<x2>;<y2>]];<color>;<name>[=0]`

For a vector using its automatic endpoint name, append the standalone option
`name=0` to hide that automatic label.

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_linear`)

@Point(`ex_linear;A;-3;-1`)
@Point(`ex_linear;B;2;2`)
@Point(`ex_linear;C;-1;3`)
@Point(`ex_linear;D;3;1`)

@Gerade(`ex_linear;[A;B];#e63946;g`)
@Strahl(`ex_linear;[C;D];#457b9d;r`)
@Vektor(`ex_linear;[A;D];#ff00ff`)
@Vector(`ex_linear;[[0;0];[2;1]];#00ffff;w`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_linear;1;1;0`)

@Point(`ex_linear;A;-3;-1`)
@Point(`ex_linear;B;2;2`)
@Point(`ex_linear;C;-1;3`)
@Point(`ex_linear;D;3;1`)

@Gerade(`ex_linear;[A;B];#e63946;g`)
@Strahl(`ex_linear;[C;D];#457b9d;r`)
@Vektor(`ex_linear;[A;D];#ff00ff`)
@Vector(`ex_linear;[[0;0];[2;1]];#00ffff;w`)

## `@Arc` / `@Bogen`

          --{{0}}--
Draws a cubic Bézier arc whose tangent directions are controlled independently
at the start and end. Each endpoint may be an existing point name or a direct
coordinate `[x;y]`. Named points stay dynamically attached when they move;
direct coordinates create invisible fixed helper points.

Angles follow the unit-circle convention: `0` points right, `90` up,
`180` left, and `270` down. The exit angle points from the start
towards its control arm. The entry angle points from the end back towards the
incoming control arm, following the familiar TikZ-like `out`/`in` convention.
Consequently, `out=0` and `in=180` form a straight left-to-right
connection. Both control arms use one third of the endpoint distance.

The design may be `->`, `<-`, or `<->`. A leading `|` adds a
short perpendicular cap at the start, while a trailing `|` adds one at
the end, for example `|->`, `->|`, or `|<->|`. An empty design or
`-` draws the curve without arrows. The caption accepts plain text and
dollar-delimited TeX; leave its field empty with two adjacent separators
(`...;<entryAngle>;;<design>;...`) to omit it. Line widths such as `2px`
are measured in screen pixels; the default is `3px`. An optional final CSS
color, for example `#e63946`, colors the curve, arrowheads, caps, and caption.
Without that argument, the curve follows the current theme accent color. For
compatibility with the color position of the other geometry macros,
`<caption>;<color>;<design>;<lineWidth>` is accepted as an alias as well.

Parameters: `<boardId>;<startPoint>|[<x>;<y>];<exitAngle>;<endPoint>|[<x>;<y>];<entryAngle>;<caption>;<design>;<lineWidth>[;<color>]`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_arc`)

@Point(`ex_arc;A;-3;0`)
@Point(`ex_arc;B;3;0`)

@Bogen(`ex_arc;A;90;B;90;$b$;->|;2px;#e63946`)
@Arc(`ex_arc;[-3;-2];270;[3;-2];270;$c$;|<->|;3px;#457b9d`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_arc;1;1;0`)

@Point(`ex_arc;A;-3;0`)
@Point(`ex_arc;B;3;0`)

@Bogen(`ex_arc;A;90;B;90;$b$;->|;2px;#e63946`)
@Arc(`ex_arc;[-3;-2];270;[3;-2];270;$c$;|<->|;3px;#457b9d`)

## `@Perpendicular` / `@Orthogonale`, `@Parallel` / `@Parallele`, `@Midpoint` / `@Mittelpunkt`

          --{{0}}--
Creates a perpendicular line, a parallel line, or the midpoint of two points.
Perpendicular and parallel lines can reference an existing named line-like
object (`@Strecke`, `@Gerade`, `@Strahl`, `@Vektor`) or use a point pair as an
implicit base line. The midpoint is registered as a point, so later macros can
refer to it by name. Add `wert=1` / `value=1` to show its coordinates.

Parameters for perpendicular/parallel: `<boardId>;<baseName>|[<basePoint1>;<basePoint2>];<throughPoint>;<color>;<name>[=0]`

Parameters for midpoint: `<boardId>;[<point1>;<point2>]|[[<x1>;<y1>];[<x2>;<y2>]];<color>;<name>[=0];wert=1`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_relations`)

@Point(`ex_relations;A;-3;-1`)
@Point(`ex_relations;B;2;2`)
@Point(`ex_relations;C;-2;3`)
@Point(`ex_relations;D;3;-1`)

@Gerade(`ex_relations;[A;B];#e63946;g`)
@Orthogonale(`ex_relations;g;C;#ff00ff;h`)
@Parallel(`ex_relations;[A;B];D;#457b9d;p`)
@Mittelpunkt(`ex_relations;[A;B];#ff00ff;M;wert=1`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_relations;1;1;0`)

@Point(`ex_relations;A;-3;-1`)
@Point(`ex_relations;B;2;2`)
@Point(`ex_relations;C;-2;3`)
@Point(`ex_relations;D;3;-1`)

@Gerade(`ex_relations;[A;B];#e63946;g`)
@Orthogonale(`ex_relations;g;C;#ff00ff;h`)
@Parallel(`ex_relations;[A;B];D;#457b9d;p`)
@Mittelpunkt(`ex_relations;[A;B];#ff00ff;M;wert=1`)

## `@Area` / `@Flaeche`

          --{{0}}--
Creates a filled polygon from at least three existing named points or directly
supplied coordinates. Coordinate input such as `[[1;1];[3;1];[2;4]]` creates
fixed invisible vertices, so only the polygon and optional measurements are shown.
The fill opacity is clamped to the range `0` to `1`. Add `inhalt=1` and/or `umfang=1`
to show live measurements at the polygon center. German output uses `FE` and
`LE`; English output uses `AU` and `LU`. The English option aliases `area=1`
and `perimeter=1` are also accepted.

Parameters: `<boardId>;[<point1>;<point2>;...]|[[<x1>;<y1>];...];<color>;<opacity>;inhalt=1;umfang=1`

``` markdown
@CoordinateSystem(`xmin=-1;xmax=6;ymin=-1;ymax=5;width=800;id=ex_area`)

@Point(`ex_area;A;0;0;#e63946;0`)
@Point(`ex_area;B;4;0;#e63946;0`)
@Point(`ex_area;C;4;3;#e63946;0`)
@Point(`ex_area;D;0;3;#e63946;0`)

@Flaeche(`ex_area;[A;B;C;D];#e63946;0.25;inhalt=1;umfang=1`)

@Flaeche(`ex_area;[[1;3.25];[3;3.25];[2;4]];#00ffff;0.5;inhalt=1;umfang=1`)
```

---

@CoordinateSystem(`xmin=-1;xmax=6;ymin=-1;ymax=5;width=800;id=ex_area;1;0`)

@Point(`ex_area;A;0;0;;0`)
@Point(`ex_area;B;4;0;;0`)
@Point(`ex_area;C;4;3;;0`)
@Point(`ex_area;D;0;3;;0`)

@Flaeche(`ex_area;[A;B;C;D];#e63946;0.25;inhalt=1;umfang=1`)

@Flaeche(`ex_area;[[1;3.25];[3;3.25];[2;4]];#00ffff;0.5;inhalt=1;umfang=1`)

## `@angle` / `@Winkel`

          --{{0}}--
Draws the directed angle defined by three existing named points. The middle
point is the vertex, so `[A;B;C]` means the counterclockwise angle from `BA` to
`BC`. Reversing the outer points produces the complementary angle up to 360 degrees.
The name and optional value use the selected color and opacity. Add exactly
`Wert=1` or `value=1` to show the live angle measure rounded to two decimal
places. `@Winkel` uses a decimal comma; `@angle` uses a decimal point. Common
Greek names such as `alpha` may be written with or without the leading TeX
backslash.

Parameters: `<boardId>;<name>[=0];[<point1>;<vertex>;<point3>];<color>;<opacity>;Wert=1`

``` markdown
@CoordinateSystem(`xmin=-1;xmax=5;ymin=-1;ymax=5;width=800;id=ex_angle`)

@Point(`ex_angle;A;4;0`)
@Point(`ex_angle;B;0;0`)
@Point(`ex_angle;C;3;3`)

@Winkel(`ex_angle;alpha;[A;B;C];#e63946;0.85;Wert=1`)
```

---

@CoordinateSystem(`xmin=-1;xmax=5;ymin=-1;ymax=5;width=800;id=ex_angle;0;0`)

@Point(`ex_angle;A;4;0;#e63946;0`)
@Point(`ex_angle;B;0;0;#e63946;0`)
@Point(`ex_angle;C;3;3;#e63946;0`)


@Flaeche(`ex_angle;[A;B;C];#00ff00;0.15;inhalt=0;umfang=0`)

@Winkel(`ex_angle;alpha;[C;A;B];#ff0000;0.95;Wert=1`)

@Winkel(`ex_angle;beta;[A;B;C];#ff0000;0.95;Wert=1`)

@Winkel(`ex_angle;gamma;[A;C;B];#ff0000;0.95;Wert=1`)

## `@Circle` / `@Kreis`

          --{{0}}--
Creates a circle around an existing named point. `radius=<number>` sets a fixed
radius and defaults to `1`; decimal commas are accepted. With `radius=P`, the
named point `P` lies on the circumference and moving either point updates the
circle. The fill opacity is clamped from `0` to `1`, while the outline and circle name remain clearly
visible. Add `inhalt=1` and/or `umfang=1` to display live measurements at the
center, rounded to three decimal places. German output uses `FE` and `LE`;
English output uses `AU` and `LU`. The aliases `area=1`, `circumference=1`, and
`perimeter=1` are also accepted.

Parameters: `<boardId>;<name>[=0];<centerPoint>;<color>;<opacity>;radius=<number|point>;inhalt=1;umfang=1`

``` markdown
@CoordinateSystem(`xmin=-4;xmax=4;ymin=-4;ymax=4;width=800;id=ex_circle`)

@Point(`ex_circle;M;0;0`)
@Point(`ex_circle;P;2;0`)

@Kreis(`ex_circle;k;M;#e63946;0.2;radius=P;inhalt=1;umfang=1`)
```

---

@CoordinateSystem(`xmin=-4;xmax=4;ymin=-4;ymax=4;width=800;id=ex_circle;0;1`)

@Point(`ex_circle;M;-1;0`)
@Point(`ex_circle;N;2;2`)
@Point(`ex_circle;P;1;0`)

@Kreis(`ex_circle;k_2;M;#e63946;0.2;radius=P;inhalt=1;umfang=1`)

@Kreis(`ex_circle;k_1;N;#00ff00;0.2;radius=1;inhalt=1;umfang=1`)

## `@Tangent` / `@Tangente`, `@CircularSector` / `@Kreissektor` / `@Kreissegment`

          --{{0}}--
Creates a dependent tangent to a named function graph, line-like object, or circle.
The contact point is given as `[x;y]`; for function graphs, the y-value is recomputed
from the function. A line-like source can also be supplied directly as a point pair
such as `[A;B]`, which is useful for exported polygon sides. The tangent registers
as a named line, so intersection and ordinate-intercept macros can use it afterwards.
The circular-sector macro uses three existing points in center--radius point--second
arm point order. `@Kreissegment` is accepted as an alias for exported DGS sectors.

Parameters for tangents: `<boardId>;<sourceName>|[<point1>;<point2>];[<x>;<y>];<color>;<lineName>[=0];<contactPointName>[=0]`

Parameters for circular sectors: `<boardId>;[<center>;<radiusPoint>;<anglePoint>];<color>;<opacity>;<name>[=0];inhalt=1;umfang=1`

``` markdown
@CoordinateSystem(`xmin=-4;xmax=4;ymin=-4;ymax=4;width=800;id=ex_tangent_sector`)

@Point(`ex_tangent_sector;M;0;0`)
@Point(`ex_tangent_sector;P;2;0`)
@Point(`ex_tangent_sector;Q;0;2`)
@PlotFunction(`ex_tangent_sector;f;0.25*x^2;#e63946`)
@Kreis(`ex_tangent_sector;k;M;#457b9d;0.15;radius=P`)

@Tangente(`ex_tangent_sector;f;[2;1];#ff00ff;t;T`)
@Kreissektor(`ex_tangent_sector;[M;P;Q];#ff00ff;0.25;s;inhalt=1;umfang=1`)
```

---

@CoordinateSystem(`xmin=-4;xmax=4;ymin=-4;ymax=4;width=800;id=ex_tangent_sector`)

@Point(`ex_tangent_sector;M;0;0`)
@Point(`ex_tangent_sector;P;2;0`)
@Point(`ex_tangent_sector;Q;0;2`)
@PlotFunction(`ex_tangent_sector;f;0.25*x^2;#e63946`)
@Kreis(`ex_tangent_sector;k;M;#457b9d;0.15;radius=P`)

@Tangente(`ex_tangent_sector;f;[2;1];#ff00ff;t;T`)
@Kreissegment(`ex_tangent_sector;[M;P;Q];#ff00ff;0.25;s;inhalt=1;umfang=1`)



## `@PlotFunction`

          --{{0}}--
Plots a function curve on the board using a formula. The formula uses standard math syntax.

Parameters: `<boardId>;<funcName>[=0];<formula>;<color>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_plot`)

@AxisLabel(`id=ex_plot;xlabel=$x$;ylabel=$f(x)$`)

@PlotFunction(`ex_plot;f;0.5*x^2-2;#b41f65`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_plot`)

@AxisLabel(`id=ex_plot;xlabel=$x$;ylabel=$f(x)$`)

@PlotFunction(`ex_plot;f;0.5*x^2-2;#b41f65`)

## `@Zeros` / `@Nullstellen`, `@Extrema` / `@Extrempunkte`, `@InflectionPoints` / `@Wendepunkte`

          --{{0}}--
Creates dynamic analysis points for a named function: roots, extrema, or inflection points. The points update when the function, parameters, sliders, or the visible board range change.

Parameters: `<boardId>;<funcName>;<color>;<prefix>[=0];wert=1`

Options: `names=[N_1;N_2;...]`, `wert=1` / `value=1`,
`werte=[1;0;...]` / `values=[1;0;...]`, and
`sichtbar=[1;0;...]` / `visible=[1;0;...]`. A hidden prefix (for example
`N=0`) hides every generated point name; names, value labels, and point
visibility can also be controlled separately by index.

``` markdown
@CoordinateSystem(`xmin=-4;xmax=4;ymin=-4;ymax=5;width=800;id=ex_function_analysis`)

@PlotFunction(`ex_function_analysis;f;x^3-3*x+1;#e63946`)
@Nullstellen(`ex_function_analysis;f;#ff00ff;N;wert=1`)
@Extrempunkte(`ex_function_analysis;f;#457b9d;E;wert=1`)
@Wendepunkte(`ex_function_analysis;f;#ff00ff;W;wert=1`)
```

---

@CoordinateSystem(`xmin=-4;xmax=4;ymin=-4;ymax=5;width=800;id=ex_function_analysis`)

@PlotFunction(`ex_function_analysis;f;x^3-3*x+1;#e63946`)
@Nullstellen(`ex_function_analysis;f;#ff00ff;N;wert=1`)
@Extrempunkte(`ex_function_analysis;f;#457b9d;E;wert=1`)
@Wendepunkte(`ex_function_analysis;f;#ff00ff;W;wert=1`)

## `@Regler` / `@Slider`, `@Ordinatenabschnitt` / `@OrdinateIntercept`, `@Schnittpunkt` / `@Intersection`

          --{{0}}--
Creates reusable parameter sliders and dependent object-analysis points. Sliders
can be used as scalar parameters in function terms. The ordinate-intercept macro
accepts a named function or linear object. The intersection macro accepts two
named functions, linear objects, or circles.

Parameters:

- `@Regler`: `<boardId>;<name>[=0];<min>;<max>;<step>;<value>;<color>;[[x1;y1];[x2;y2]];lockposition=1`
- `@Ordinatenabschnitt`: `<boardId>;<objectName>;<color>;<prefix>[=0];wert=1`
- `@Schnittpunkt`: `<boardId>;<objectName1>;<objectName2>;<color>;<prefix>[=0];wert=1`

Options: `names=[S_1;S_2;...]`, `wert=1` / `value=1`,
`werte=[1;0;...]` / `values=[1;0;...]`, and
`sichtbar=[1;0;...]` / `visible=[1;0;...]`; for sliders additionally
`visible=0`, `fontsize=...`, `lockposition=1`.

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=5;width=800;id=ex_object_analysis`)

@Regler(`ex_object_analysis;a;-3;3;0.1;1;#ff00ff;[[-4;4];[-2.5;4]]`)
@PlotFunction(`ex_object_analysis;f;a*x^2-2;#e63946`)
@Gerade(`ex_object_analysis;[[0;1];[4;3]];#457b9d;g`)
@Ordinatenabschnitt(`ex_object_analysis;f;#ff00ff;O;wert=1`)
@Schnittpunkt(`ex_object_analysis;f;g;#ff00ff;S;wert=1`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=5;width=800;id=ex_object_analysis`)

@Regler(`ex_object_analysis;a;-3;3;0.1;1;#ff00ff;[[-4;4];[-2.5;4]]`)
@PlotFunction(`ex_object_analysis;f;a*x^2-2;#e63946`)
@Gerade(`ex_object_analysis;[[0;1];[4;3]];#457b9d;g`)
@Ordinatenabschnitt(`ex_object_analysis;f;#ff00ff;O;wert=1`)
@Schnittpunkt(`ex_object_analysis;f;g;#ff00ff;S;wert=1`)

## `@PlotInput`

          --{{0}}--
Renders a LaTeX input field where students can type a function and see it plotted live.

Parameters: `<boardId>;<funcName>;<color>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_input`)

@AxisLabel(`id=ex_input;xlabel=$x$;ylabel=$g(x)$`)

@PlotInput(`ex_input;g;#0055cc`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_input`)

@AxisLabel(`id=ex_input;xlabel=$x$;ylabel=$g(x)$`)

@PlotInput(`ex_input;g;#0055cc`)

## `@PointOnGraph`

          --{{0}}--
Point-on-graph exercise: the student drags a point onto the graph of a given function.
The check validates whether the point lies on the curve within the given tolerance.

Parameters: `<boardId>;<pointName>;<funcName>;<formula>;<tolerance>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_pg`)

@AxisLabel(`id=ex_pg;xlabel=$x$;ylabel=$f(x)$`)

Drag point $A$ onto the graph of $f(x) = 2x - 1$.

@PointOnGraph(`ex_pg;A;f;2*x-1;0.05`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_pg`)

@AxisLabel(`id=ex_pg;xlabel=$x$;ylabel=$f(x)$`)

Drag point $A$ onto the graph of $f(x) = 2x - 1$.

@PointOnGraph(`ex_pg;A;f;2*x-1;0.05`)

## `@PointsOnGraph`

          --{{0}}--
Multi-point-on-graph exercise: places several draggable points that must all land on the graph.

Parameters: `<boardId>;n=<count>;d=<step>;<pointName>;<funcName>;<formula>;<tolerance>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_points_on_graph`)

@AxisLabel(`id=ex_points_on_graph;xlabel=$x$;ylabel=$f(x)$`)

Drag all 3 points onto the graph of $f(x) = x - 1$.

@PointsOnGraph(`ex_points_on_graph;n=3;d=2;A;f;x-1;0.05`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_points_on_graph`)

@AxisLabel(`id=ex_points_on_graph;xlabel=$x$;ylabel=$f(x)$`)

Drag all 3 points onto the graph of $f(x) = x - 1$.

@PointsOnGraph(`ex_points_on_graph;n=3;d=2;A;f;x-1;0.05`)

## `@Table`

          --{{0}}--
Renders a value table connected to a coordinate board. Students fill in x/y values and the corresponding points appear on the graph.

Parameters: `n=<startColumns>;x;<funcName>;<pointName>;id=<boardId>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_tab`)

@AxisLabel(`id=ex_tab;xlabel=$x$;ylabel=$f(x)$`)

@Table(`n=3;x;f;P;id=ex_tab`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_tab`)

@AxisLabel(`id=ex_tab;xlabel=$x$;ylabel=$f(x)$`)

@Table(`n=3;x;f;P;id=ex_tab`)


## `@DGS`

          --{{0}}--
Adds a DGS menu button to the top-left corner of a coordinate board.
Clicking the hamburger button slides a tool bar into the board from above.
The mouse-pointer button between the hamburger and the point tool represents the normal board
mode. It is highlighted whenever no DGS construction, function dialog, regression, drawing, or
eraser tool is active. Clicking it cancels the current tool and any unfinished multi-step
selection. Its pointer icon follows the neutral light/dark-mode color, while the vertical
divider before the construction tools uses the selected theme color.
The set-square button between the normal pointer and the compass independently toggles a
screen-space geometry instrument without changing the active drawing tool. Its triangular
surface uses 10 percent opacity, while the ruler, angle scale, guides, and zero mark remain
fully legible in the current light/dark and theme colors. The protractor uses one semicircular
measurement ring with larger values once inside and once outside the ring; its ten-degree
guides continue from the ring to the outer triangle edges. The long ruler keeps the same
adaptive major metric as the coordinate axes, but always divides it into substantially finer
ten or twenty-part intervals. Its metric updates while the board is zoomed or the instrument
is rotated. Two bright theme-colored guides mark exactly 45 degrees on both sides without
leaving the triangle. Drag
inside the triangular surface to pan the complete instrument. Drag the circular handle near
the lower tip to rotate it precisely around the zero mark at the center of the long ruler
edge; holding Shift snaps the angle in five-degree steps. The handles on both acute corners
scale the instrument around that fixed zero mark. Visibility, relative position, rotation,
and scale survive responsive resizing, fullscreen, and LiaScript slide or board replacement.
In freehand mode, new strokes cannot be drawn through the triangular surface. Pointer samples
near an outer edge snap to one finite edge, allowing a straight ruler-guided stroke even after
the set square has been rotated or scaled; a free stroke entering the triangle is clipped at
its first boundary intersection.
The formatting button directly beside the compass is a two-step one-shot tool. Select the
source object first and then the target object; DGS copies text, line, fill, and applicable
trace colors together with the object-label or text font size. The source is highlighted while
the tool waits for its target, and the normal pointer mode is restored after the transfer.
Transferred formatting participates in persistence and DGS undo/redo.
Right-clicking the visible horizontal or vertical axis opens a dedicated axis editor. The
variable name and the additional axis label are edited separately and rendered through the
existing TeX-capable axis-title overlay. For example, variable t and label in [s] produce
$t$ in [s]. Axis-label changes participate in DGS undo/redo and remain positioned outside the
open top and side menus.
The eraser removes freehand strokes, generated regression points, and every object created
with the DGS tools. Dragging across several dependent DGS objects records the DGS part of the
gesture as one undoable history step; deleting a construction point also removes its dependent
constructions through the same cleanup path as the object menu.
The point tool places freely movable points by clicking the coordinate board and names them
alphabetically (`A` to `Z`, then `A'` to `Z'`, `A''`, and so on), skipping names already in use.
The coordinate fields in a point's right-click menu accept numbers as well as the same
arithmetic and TeX-aware expressions used for functions. Existing named function graphs may be
referenced directly. For example, entering `x` and `f(x)+1` creates the dynamic point
`A(x|f(x)+1)`: dragging it changes the free horizontal parameter, while its vertical
coordinate follows the function. Changes to `f`, undo/redo, and restoring the board keep the
dependency intact. Entering two plain numbers removes the dependency and makes the point freely
movable again.
Each point menu also provides a Trace checkbox. While enabled, movement is sampled at regular
spatial intervals and rendered as smaller cross markers in board coordinates, so the trail
continues to fit when the board is zoomed or panned. Fast movements are interpolated to avoid
large gaps. Recording can be paused without removing existing markers; once markers exist, a
Clear trace button appears. Trace color has its own entry in the integrated color palette and
does not change the point or label color. Trace state, color, and marker positions participate
in DGS persistence and undo/redo.
The segment tool connects two successively selected points, labels the magenta segment with
lowercase letters (`a`, `b`, `c`, …), and then switches itself off automatically.
The same line-tools submenu also provides rays, straight lines, vectors, and cubic arcs. For a ray, the first selected
point is its endpoint and the second selected point determines its direction. A vector is drawn as
a finite arrow from the first selected point to the second selected point. Named endpoints produce
an automatic vector label such as `\overrightarrow{AB}`; otherwise a lowercase fallback such as
`\overrightarrow{a}` is used. The arrow spans the complete label. The arc tool is located directly
below the vector. Select its start and end point, then enter the exit and entry angles in the
centered dialog using the same unit-circle convention as `@Arc` / `@Bogen`. The resulting magenta
cubic Bézier curve stays attached to both movable endpoints and receives the next free lowercase
object name. Both tangent angles can later be changed on blur or Enter in the right-click object
menu; invalid values remain marked for correction.
The right-click menus of standalone segments and arcs also contain an Appearance section.
Its Design selector offers the plain line plus all directional arrow and orthogonal end-cap
combinations supported by the macros, including `|<->|`. Line width accepts values from
`0.25` to `20` with or without the `px` suffix and is applied on blur or Enter. Arrowheads
and end caps stay attached while endpoints move or the board is zoomed. Both settings participate
in DGS persistence and undo/redo and are included in the object-list macro export.
The line-relations submenu sits between the line and shape tools and provides perpendicular,
parallel, midpoint, and angle-bisector constructions. For a perpendicular or parallel, select a
segment, ray, vector, or straight line and a point in either order; it creates the dynamically
linked straight line through that point and then switches itself off. The midpoint tool accepts
exactly two already existing points and creates an alphabetically named dependent point halfway
between them. Its object menu provides a Show coordinates checkbox for the dynamic coordinate
pair. The angle-bisector tool accepts three existing points in arm–vertex–arm order and
creates the dynamically linked internal angle-bisector line through the vertex.
The line, ray, vector, arc, segment, perpendicular, parallel, polygon, circle, circular-sector, and angle tools reuse a nearby existing point or
automatically place a new alphabetically named DGS point when clicking an empty board position.
The polygon tool selects points in sequence. Selecting the first point again after at
least three distinct points closes the sequence and creates a movable polygon (for example,
`A → B → C → A` or `B → C → A → B`).
Every polygon side is also registered as an individual DGS segment. It can be selected on
the board or in the object list and used as the source for perpendiculars, parallels,
tangents, intersections, and the other line-based constructions. Side names stay hidden by
default to keep the polygon uncluttered, but can be shown or combined with the length display
from the segment object menu. Side formatting and dependent constructions participate in
DGS persistence and undo/redo together with their polygon.
The circular-sector tool is located directly below the circle tool. Select or place three
points in center–radius point–second arm point order. It creates a dynamically linked magenta
sector; its object menu can show the area and perimeter and edit line, fill, and label colors.
The angle submenu also provides an angle-by-measure construction. Select the first arm point
and then the vertex, enter a value between 0 and 360 degrees in the centered dialog, and DGS
creates the third point counterclockwise with equal arm lengths. Its angle measure can later be
changed from the right-click object menu.
In German mode, right angles remain rounded; when their angle value is shown, the sector uses
the conventional centered dot instead of changing to a square marker.
The f(x) button between the geometry and regression groups opens a compact centered input
dialog and creates a magenta JSXGraph function graph. It accepts familiar expressions such as
x^2 - 2x, sin(x), or Math.sin(x) as well as TeX input such as
\frac{1}{2}x^2 and \sqrt{x}. Enter confirms the expression, Escape closes the dialog,
and invalid expressions keep the dialog open for correction. Created functions participate in
the DGS undo/redo history. A new function may also reference an already existing named graph,
for example `g(x)=f(x)+1`; compositions such as `g(f(x))` are supported and circular
dependencies resolve to an invalid value instead of recursing indefinitely. The function
equation is shown as rendered TeX in the right-click
menu and can be edited there; leaving the field or pressing Enter updates the existing graph.
Simple quotients such as 5/7 are rendered as TeX fractions. Function labels stay inside the
visible graph area below the open top menu; the object menu offers Show expression instead of
the inapplicable Lock option.
The slider button directly to the left of the text tool creates a JSXGraph parameter slider.
No initial dialog is opened: each click immediately creates the next uniquely named parameter
with range `-5` to `5`, current value `1`, and step size `0.1`. Name, value, minimum,
maximum, and step size can be edited later through the right-click menu; German decimal commas
are accepted as well. While unlocked, its ruler and endpoints can be repositioned. The Lock
position checkbox freezes that placement without disabling the value knob. Slider labels are
rendered as TeX and their font size follows board zooming. Slider values are registered as
dynamic scalar symbols in the shared DGS expression evaluator. They can therefore be used in
function terms and point-coordinate expressions, for example `f(x)=a*x^2` or
`A(a|f(a)+1)`, and all geometry derived from those objects follows while the slider moves.
When a newly entered or edited function term contains a valid scalar parameter for which no
slider exists, DGS creates that slider automatically. For example, `a*x^2+b` creates sliders
`a` and `b` with the standard range and step. The whole expression is validated first, so
invalid input does not leave orphan sliders, while known built-in and named functions are not
mistaken for parameters.
Implicit products containing the independent variable are expanded before parameter detection
and evaluation: for example, `sin(ax)` is treated as `sin(a*x)` and creates only the slider
`a`. Built-in and named function identifiers remain intact, and multi-letter parameters that
do not contain `x` are not split.
Renaming a parameter updates existing DGS expression references. Position, range, step, value,
colors, visibility, layer, deletion, persistence, and undo/redo are retained with the
construction.
The text button is part of the final toolbar group on the far right, separated by a theme-colored
vertical divider. Activate it, click the desired board position, and enter ordinary plain text
in the centered dialog. The resulting magenta text object is movable and participates in DGS
undo/redo, persistence, deletion, and erasing. Its right-click menu edits the text directly and
provides a font-size field from 8 to 96 pixels.
The button directly to the right of the text tool controls board zooming. Each click cycles
through both axes, vertical only, horizontal only, and back to both axes. Three direction-arrow
icons show the active mode without extra text. The selected direction applies consistently to
mouse-wheel, keyboard, and pinch zoom while panning and programmatic resizing remain
unaffected; the mode is kept with the board state.
The adjacent axis-scale button opens four base-10 scale choices: Cartesian, logarithmic x with
Cartesian y, Cartesian x with logarithmic y, and double-logarithmic. Logarithmic axes show their
physical values on evenly spaced exponent coordinates, and DGS function graphs are transformed
accordingly (for example, power functions become straight lines in a log-log view). Values at or
below zero are not displayed on a logarithmic axis. The selected scale is retained for the board;
switching back to Cartesian restores ordinary tick labels and function plotting.
The fullscreen button directly before the object-list button toggles the complete DGS board
between its embedded size and browser fullscreen. Entering and leaving fullscreen resizes
JSXGraph to the available viewport; Escape or a browser-initiated exit also synchronizes the
button state and restores the previous embedded size while retaining the current pan/zoom view.
The final toolbar button opens an object list from the right. It contains every user-facing DGS
object with its name, type, color, and current visibility. Right-clicking an entry opens the
ordinary object-properties panel immediately to the left of the list, so both panels remain
usable at the same time. The horizontal axis shortens by the combined visible panel width, and
the open top menu moves both panels downward. The button at the bottom of the object list opens
a centered export dialog. It creates a fresh eight-character board id and emits the current board
as reusable LiaScript macros for all DGS objects that already have standalone macros: coordinate
system, axis labels, points, coordinate text, parameter sliders, function graphs, function-analysis
points, ordinate-axis intercepts, intersections, segments, straight lines, rays, vectors, arcs,
perpendiculars, parallels, midpoints, polygons/areas, circles, circular sectors/segments,
tangents, and angles. Objects without standalone macros are listed in a short HTML comment so
the exported block stays pasteable.
The exported block is roundtrip-safe: importing and exporting it again keeps the construction
order, hidden dependency objects, point-coordinate expressions, polygon-side references, names,
visibility, the logical viewport, and the supported appearance settings. Automatically responsive coordinate systems
remain responsive instead of turning their currently measured LiveEditor width into a new pixel
limit on every export; only an explicitly capped or manually resized width is serialized.
The export dialog first shows a grouped overview of the DGS tools. Every included tool has a
green check badge; clicking it excludes the tool, dims its icon, and changes the badge to a red
cross. Continue opens the generated macro block. This selection only configures the imported
toolbar and does not remove existing objects or change the currently open DGS.
Below the tool overview, four checkmark options configure permissions in the imported DGS. They
are serialized independently as `restrictions=[...]`: `100` disables object properties from the
board, object list, and keyboard context-menu shortcut; `200` limits object properties to colors,
opacity, and point traces; `300` removes and locks the checkmarks for lengths, equations, areas,
perimeters, angles, function terms, coordinates, and analysis values; and `400` hides and disables
the Export button in the object list. Restriction `300` also suppresses values that were already
visible or would normally be shown automatically; the underlying author settings are preserved
and reappear if the restriction is removed. The two object-property modes are mutually exclusive
in the dialog. The complete lock (`100`) takes precedence if `100` and `200` are written by hand.
Missing, empty, or nonnumeric `restrictions` mean unrestricted behavior. Unknown positive
restriction ids are preserved during re-export so future permissions remain roundtrip-safe.
Tool profiles use immutable numeric capability ids rather than toolbar positions:
`@DGS(`boardId;tools=[100;200;310;700]`)`. Therefore, a future tool can be inserted anywhere in
the visual toolbar without changing the meaning of an older export. Missing `tools`, an empty
list, or a list without numbers retains the complete legacy DGS; `tools=[0]` explicitly keeps
only the permanent infrastructure. Hamburger, normal mouse mode, undo/redo, fullscreen, and the
object list remain permanently available; the set square and compass are also always present and
are intentionally not part of the export-tool selection. Export remains available unless
restriction `400` is set.
The compass submenu offers the ordinary two-point radius and a fixed-radius mode. In fixed-radius
mode, enter a positive radius, click the center, and use the second click to choose the drawing
direction. The drawing point is created at exactly that radius and can immediately be dragged
around the center to draw the arc. Once the fixed-radius arc is finished, moving either of its
points translates the complete compass construction; the direction vector and radius remain
unchanged. Connected fixed-radius compass constructions move as one unit.
The currently assigned ids are: `100` formatting, reserved always-on id `140` for the set square,
reserved always-on id `150` for the compass,
`200` point, `310` segment, `320` ray,
`330` line, `340` vector, `350` arc, `410` perpendicular, `420` parallel, `430` midpoint,
`440` angle bisector, `510` polygon, `520` circle, `530` circular sector, `610` angle,
`620` measured angle, `700` function, `810` zeros, `820` extrema, `830` inflection points,
`840` ordinate-axis intercept, `850` tangent, `860` intersection, `910` freehand drawing,
`920` eraser, `930` regression tools, `1000` slider, `1010` text, `1110` zoom mode, and
`1120` axis scaling. These ids are reserved permanently and are never derived from display order.
The adjacent analysis button opens a submenu for zeros, extrema, inflection points, the
ordinate-axis intercept, tangents, and intersections. All entries are one-shot construction
modes. The zero and ordinate-axis-intercept tools accept a function graph, segment, ray, vector, or straight line;
the extrema and inflection tools accept a function graph. Tangents can be attached to function
graphs, segments, rays, vectors, straight lines, and circles. The point tools create
alphabetically named dependent points at all isolated zeros, local extrema, actual changes of
concavity, or the intersection with the ordinate axis and then switch themselves off. For
bounded or directed linear objects, the ordinate-axis intercept is only created when the
intersection lies on the object. The tangent tool uses the selected object position as its
contact point, constrains a movable glider to that object, and adds the dependent tangent line.
For circles its direction remains perpendicular to the radius at the contact point. The points
and tangent move with term or geometry changes. The intersection tool takes two objects in
sequence and supports every combination of function graphs, segments, rays, vectors, straight
lines, tangents, circles, and compass arcs; it creates every isolated visible crossing or contact
point. Compass-arc intersections are restricted to the actually drawn sweep rather than the
invisible remainder of the carrier circle, and the resulting points can be used in later DGS
constructions like ordinary dependent points.
Viewport changes also
add or remove visible analysis points. All constructions participate in DGS undo/redo and can be
removed from their object menus.
Each zero point also offers Show value; enabling it adds the current x-value to its dynamic
label. Extremum and inflection points offer the same option and display their current coordinate
pair; an ordinate-axis intercept displays its current ordinate value.
Right-clicking a DGS point, segment, ray, vector, arc, line, function, or polygon opens an object menu from the right. It can lock the
object and independently show or hide its name and visual representation; an open top menu
pushes this object menu downward. Point coordinates are applied on blur or Enter, and an
inline color palette with hue and hexadecimal controls recolors DGS objects.
`@DGS` automatically adds the regression drawing tools to the same board;
undo and redo remain permanently stacked below the hamburger button, so no additional
`@Regression` macro is required.
Regression analysis panels are stacked below these permanent controls.

Parameters: `<boardId>[;tools=[<stableToolId>;...]][;restrictions=[<stableRestrictionId>;...]]`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=;ymax=;width=;id=ex_dgs`)

@DGS(`ex_dgs`)
```

A restricted toolbar containing only the point, segment, and function tools can be embedded as:

``` markdown
@DGS(`ex_dgs;tools=[200;310;700]`)
```

The same toolbar can allow only color and trace changes, lock value-display checkmarks, and hide
the Export button with:

``` markdown
@DGS(`ex_dgs;tools=[200;310;700];restrictions=[200;300;400]`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=;ymax=;width=;id=ex_dgs`)

@DGS(`ex_dgs`)


## `@UmfangQuiz` / `@PerimeterQuiz` and `@FlaecheQuiz` / `@AreaQuiz`

          --{{0}}--
Adds a normal LiaScript Check quiz to an existing DGS board. On every click of the
Check button, the quiz reads the current live construction and searches for a
learner-created polygon with exactly the requested number of vertices. Preset
polygons created by `@Area` or `@Flaeche` do not count. Additional incorrect
polygons do not prevent a matching polygon from solving the quiz.

`@UmfangQuiz` / `@PerimeterQuiz` compares the closed Euclidean perimeter;
`@FlaecheQuiz` / `@AreaQuiz` compares the absolute shoelace area. The tolerance is
absolute and may be `0`; German decimal commas are accepted. Moving, deleting,
undoing, restoring, or recreating a polygon is reflected the next time Check is
pressed. Quiz settings are passed as a separate second macro argument. The HTML
comment is emitted unchanged directly before `[[!]]`, just like for `@CreatePoint`;
for example, `<!-- data-solution-button="5" -->` reveals the solution button after
five unsuccessful checks.

Parameters:

1. Geometry specification: `<boardId>;<numberOfVertices>;<targetValue>;<absoluteTolerance>`
2. LiaScript quiz comment: `<!-- data-solution-button="5" -->` (use `<!-- -->` if no option is needed)

``` markdown
@CoordinateSystem(`xmin=-1;xmax=6;ymin=-1;ymax=5;width=;id=ex_polygon_metric_quiz`)

@DGS(`ex_polygon_metric_quiz;tools=[200;510;920]`)

Construct a triangle with perimeter 12 and area 6.

@UmfangQuiz(`ex_polygon_metric_quiz;3;12;0.05`,`<!-- data-solution-button="5" -->`)

@FlaecheQuiz(`ex_polygon_metric_quiz;3;6;0.05`,`<!-- data-solution-button="5" -->`)
```

---

@CoordinateSystem(`xmin=-1;xmax=6;ymin=-1;ymax=5;width=;id=ex_polygon_metric_quiz`)

@DGS(`ex_polygon_metric_quiz;tools=[200;510;920]`)

Construct a triangle with perimeter 12 and area 6.

@UmfangQuiz(`ex_polygon_metric_quiz;3;12;0.05`,`<!-- data-solution-button="5" -->`)

@FlaecheQuiz(`ex_polygon_metric_quiz;3;6;0.05`,`<!-- data-solution-button="5" -->`)


## `@KonstruktionQuiz` / `@ConstructionQuiz`

          --{{0}}--
Adds a normal LiaScript construction quiz to an existing DGS board. The quiz
accepts a learner-created, closed, non-self-intersecting polygon with exactly the
requested number of genuine corners. A repeated JSXGraph closing vertex does not
count; preset polygons created by `@Area` / `@Flaeche` are ignored.

Each required property consists of a type followed by its target value:

- `S4`, `Strecke:4`, `Side=4`, or `Length4` means a side of length 4.
- `W90`, `Winkel:90°`, or `Angle=90deg` means an interior angle of 90 degrees.

The compact comma-separated list uses a decimal point inside values. German and
English long forms may be mixed.

With `fest` / `fixed`, the polygon is read geometrically counterclockwise. Its
starting corner is cyclically free, but the list is never read backwards. A
property of the other type refers to the immediately following boundary feature;
a repeated type refers to the next feature of that same type. Consequently,
`S4,W90,S3` is the included-angle case SWS, while `S4,S3,W53.13` is the
different SSW placement. This preserves the distinction between congruence
patterns and mirror images.

With `offen` / `open`, incidence and order are ignored. All requested side
lengths and angles merely have to occur somewhere in the same polygon, including
the requested multiplicity. In both modes, unlisted sides and angles remain
unconstrained.

Parameters:

1. `<boardId>;<numberOfCorners>;<fest|offen>;<propertyList>`
2. LiaScript quiz comment, for example `<!-- data-solution-button="5" -->`

Optional fields after the property list:

- `streckentoleranz=0.05` / `lengthTolerance=0.05`
- `winkeltoleranz=1` / `angleTolerance=1`

The defaults are 0.05 coordinate units and 1 degree.

``` markdown
@CoordinateSystem(`xmin=-1;xmax=7;ymin=-1;ymax=5;width=;id=ex_construction_quiz`)

@DGS(`ex_construction_quiz;tools=[200;510]`)

Construct counterclockwise a triangle with a side of length 4, its following
interior angle of 90 degrees, and the following side of length 3.

@KonstruktionQuiz(`ex_construction_quiz;3;fest;S4,W90,S3;streckentoleranz=0.05;winkeltoleranz=1`,`<!-- data-solution-button="5" -->`)

@ConstructionQuiz(`ex_construction_quiz;3;open;W90,S3,S4`,`<!-- data-solution-button="5" -->`)
```

---

@CoordinateSystem(`xmin=-1;xmax=7;ymin=-1;ymax=5;width=;id=ex_construction_quiz`)

@DGS(`ex_construction_quiz;tools=[200;510]`)

Construct counterclockwise a triangle with a side of length 4, its following
interior angle of 90 degrees, and the following side of length 3.

@KonstruktionQuiz(`ex_construction_quiz;3;fest;S4,W90,S3;streckentoleranz=0.15;winkeltoleranz=0.75`,`<!-- data-solution-button="5" -->`)

@ConstructionQuiz(`ex_construction_quiz;3;open;W90,S3,S4;streckentoleranz=0.15;winkeltoleranz=0.75`,`<!-- data-solution-button="5" -->`)



## `@Geodreieck` / `@SetSquare`

          --{{0}}--
Adds the set-square instrument to an existing coordinate system and displays it immediately.
Its ruler subdivision follows the current axis metric, while both catheti carry exact
radial 1-degree angle marks with stronger 5-degree and 10-degree divisions. Used on its own,
the set square can be pushed roughly 95 percent beyond the board while at least 5 percent of its
actual triangular surface remains visible and draggable. This limited off-board position persists
across layout changes. The compact toolbar contains the set square
but no compass. Repeated LiaScript
bootstraps do not reopen a set square that the user has deliberately hidden. If `@DGS`,
`@Zirkel`, or `@Compass` targets the same board, all macros share one DGS controller.

Parameters: `<boardId>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=;id=ex_set_square_macro`)

@Geodreieck(`ex_set_square_macro`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=;id=ex_set_square_macro`)

@Geodreieck(`ex_set_square_macro`)


## `@Zirkel` / `@Compass`

          --{{0}}--
Adds the compass instrument to an existing coordinate system, opens the shared instrument
toolbar, and initially selects the ordinary two-point-radius mode. Used on its own, this
toolbar contains the compass but no set square. The fixed-radius mode,
movable compass constructions, persistence, and intersections are the same as in `@DGS`.
Returning to a slide reapplies the initial macro state to the replacement board, while repeated
bootstraps on the same board do not override a later user selection.

Parameters: `<boardId>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=;id=ex_compass_macro`)

@Zirkel(`ex_compass_macro`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=;id=ex_compass_macro`)

@Zirkel(`ex_compass_macro`)



## `@Regression`

          --{{0}}--
Creates a regression analysis interface where students can reconstruct or draw a target function.
Provides buttons for clearing, hints, and solution display.

Parameters: `<boardId>`

``` markdown
@Regression(`A9`)
```

---

@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A9`)

@AxisLabel(`id=A9;xlabel=$x$;ylabel=$y$`)

@Regression(`A9`)


@Point(`A9;A;2;3`)
@Point(`A9;B;0;-1`)
@Point(`A9;C;-3;2`)


## `@Reconstruction`

          --{{0}}--
Checks whether the currently adjusted graph matches a target function on a board.

Parameters: `<boardId>;<targetExpr>;<tolerance>`

``` markdown
@Reconstruction(`ex_schar;2x-1;0.1`)
```


@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=recon`)

@AxisLabel(`id=recon;xlabel=$x$;ylabel=$y$`)

Reconstruct or draw the function $f(x) = 2x -1$.

@Point(`recon;A;1;1`)
@Point(`recon;B;0;-1`)

@Reconstruction(`recon;2x-1;0.1`)


## `@Schar`

          --{{0}}--
Creates an adjustable function family with sliders directly on the board.

Parameters: `<name>;<variable>;<term>;<boardId>;term=<0|1>;<color>`

``` markdown
@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=ex_schar`)

@AxisLabel(`id=ex_schar;xlabel=$x$;ylabel=$y$`)

@Schar(`f;x;mx+n;ex_schar;term=1;#00ffff`)
```

---

@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=ex_schar`)

@AxisLabel(`id=ex_schar;xlabel=$x$;ylabel=$y$`)

@Schar(`f;x;mx+n;ex_schar;term=1;#00ffff`)

## Sliding Function Family 2

          --{{0}}--
Legacy-style multi-family setup with quadratic, cubic, and quartic parameterized functions.

``` markdown
@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A3`)

@AxisLabel(`id=A3;xlabel=$x$;ylabel=$y$`)

@Schar(`g;x;d(x+b)^2+c;A3;term=1;#ff00ff`)

@Schar(`p;x;ax^3+bx^2+cx+d;A3;term=1;#ff0000`)

@Schar(`r;x;ax^4+bx^3+cx^2+dx+f;A3;term=1;#55ff55`)
```

---

@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A3`)

@AxisLabel(`id=A3;xlabel=$x$;ylabel=$y$`)

@Schar(`g;x;d(x+b)^2+c;A3;term=1;#ff00ff`)

@Schar(`p;x;ax^3+bx^2+cx+d;A3;term=1;#ff0000`)

@Schar(`r;x;ax^4+bx^3+cx^2+dx+f;A3;term=1;#55ff55`)

## Sliding Function Family 3

          --{{0}}--
Legacy-style multi-family setup with sinus, exponential, and logarithmic parameterized functions.

``` markdown
@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A11`)

@AxisLabel(`id=A11;xlabel=$x$;ylabel=$y$`)

@Schar(`f;x;A sin(b(x+c))+d;A11;term=1;#0077ff`)

@Schar(`h;x;A e^(b(x+c))+d;A11;term=1;#00ff00`)

@Schar(`l;x;A ln(b(x+c))+d;A11;term=1;#22aa66`)
```

---

@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A11`)

@AxisLabel(`id=A11;xlabel=$x$;ylabel=$y$`)

@Schar(`f;x;A sin(b(x+c))+d;A11;term=1;#0077ff`)

@Schar(`h;x;A e^(b(x+c))+d;A11;term=1;#00ff00`)

@Schar(`l;x;A ln(b(x+c))+d;A11;term=1;#22aa66`)

## Sliding Function Family 4

          --{{0}}--
Legacy-style multi-family setup with square-root and reciprocal parameterized functions.

``` markdown
@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A11`)

@AxisLabel(`id=A11;xlabel=$x$;ylabel=$y$`)

@Schar(`k;x;A sqrt(b(x+c))+d;A11;term=1;#ff9900`)

@Schar(`q;x;A/(b(x+c))+d;A11;term=1;#ffff00`)

@Schar(`g;x;A/(b(x+c)^2)+d;A11;term=1;#0066ff`)
```

---

@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A11`)

@AxisLabel(`id=A11;xlabel=$x$;ylabel=$y$`)

@Schar(`k;x;A sqrt(b(x+c))+d;A11;term=1;#ff9900`)

@Schar(`q;x;A/(b(x+c))+d;A11;term=1;#ffff00`)

@Schar(`g;x;A/(b(x+c)^2)+d;A11;term=1;#0066ff`)



## Sliding Function Quiz

          --{{0}}--
This is the requested legacy-style quiz example.

``` markdown
@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A3`)

@AxisLabel(`id=A3;xlabel=$x$;ylabel=$y$`)

@Schar(`f;x;mx+n;A3;term=1;#00ffff`)

Passe die Funktion so an, dass $f(x) = 2x -1$ dargestellt ist.

@Rekonstruktion(`A3;2x-1;0.1`)
```

---

@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A3`)

@AxisLabel(`id=A3;xlabel=$x$;ylabel=$y$`)

@Schar(`f;x;mx+n;A3;term=1;#00ffff`)

Passe die Funktion so an, dass $f(x) = 2x -1$ dargestellt ist.

@Rekonstruktion(`A3;2x-1;0.1`)

## Implementation

          --{{0}}--
If you prefer not to use `import:`, copy the following block directly into the header of your LiaScript document.
It uses the current `main` bundle so that all macros documented here are
available. For a reproducible course, replace `main` with a release tag that
already contains the macros you use.

```` markdown
import:   https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md

script:   https://cdn.jsdelivr.net/gh/MINT-the-GAP/lia-coordinate@main/dist/index.js

@CoordinateSystem: @CoordinateSystem_(`@0`)
@Koordinatensystem: @CoordinateSystem_(`@0`)

@CoordinateSystem_
``` javascript @JSX.Graph
(function () {
  function run() {
    JXG.Options.text.useMathJax = true;

    const C = window.__coord;
    const cfg         = C.parseCoordSpec(String.raw`@0`);
    const INITIAL_BBOX  = [cfg.xmin, cfg.ymax, cfg.xmax, cfg.ymin];
    const INITIAL_RATIO = (cfg.ymax - cfg.ymin) / (cfg.xmax - cfg.xmin);

    const presetState = C.loadStoredBoardState(cfg.id);
    C.prepareBoardContainer(jxgbox, cfg.width, INITIAL_RATIO, presetState);

    const board = JXG.JSXGraph.initBoard(jxgbox, {
      axis: false, grid: false, showNavigation: false, showCopyright: false,
      boundingbox: presetState ? presetState.bbox.slice() : INITIAL_BBOX.slice(),
      keepaspectratio: true,
      zoom: { enabled: true, wheel: true, needShift: false, factorX: 1.15, factorY: 1.15 },
      pan:  { enabled: true, needShift: false, needTwoFingers: false }
    });

    C.createBoardDecorations(board, cfg, C.getNeutralColor(), C.getAccentColor());
    C.wireBoard(board, cfg, INITIAL_BBOX, INITIAL_RATIO);
  }

  if (window.__coord) {
    run();
  } else {
    window.__liaRunCoordHooks = window.__liaRunCoordHooks || [];
    window.__liaRunCoordHooks.push(run);
  }
})();
```
@end

@AxisLabel: @AxisLabel_(@uid,`@0`)
@AchsenBeschriftung: @AxisLabel_(@uid,`@0`)

@AxisLabel_
<span id="axis-title-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@CreatePoint: @CreatePoint_(@uid,`@0`,`@1`)
@ErzeugePunkt: @CreatePoint_(@uid,`@0`,`@1`)

@CreatePoint_
<div id="point-ui-@0" data-spec="@1">
  <div id="point-task-@0" class="lia-point-task"></div>

  <div id="point-check-@0">
    @2
    [[!]]
    <script modify="false">
      window.__checkPointFromSpec && window.__checkPointFromSpec(document.getElementById('point-ui-@0')?.dataset.spec || '')
    </script>
  </div>
</div>
@end

@Point: @Point_(@uid,`@0`)
@Punkt: @Point_(@uid,`@0`)

@Point_
<span id="point-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@CoordText: @CoordText_(@uid,`@0`)
@KoordText: @CoordText_(@uid,`@0`)

@CoordText_
<span class="lia-coord-text-spec" id="coord-text-spec-@0" data-spec="@1" style="display:none;"></span>
@end


@Strecke: @Distance_(@uid,`@0`,de)
@distance: @Distance_(@uid,`@0`,en)

@Distance_
<span id="distance-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Line: @LinearObject_(@uid,`@0`,line,en)
@Gerade: @LinearObject_(@uid,`@0`,line,de)
@Ray: @LinearObject_(@uid,`@0`,ray,en)
@Strahl: @LinearObject_(@uid,`@0`,ray,de)
@Vector: @LinearObject_(@uid,`@0`,vector,en)
@Vektor: @LinearObject_(@uid,`@0`,vector,de)

@LinearObject_
<span id="linear-spec-@0" data-spec="@1" data-kind="@2" data-language="@3" style="display:none;"></span>
@end

@Arc: @Arc_(@uid,`@0`,en)
@Bogen: @Arc_(@uid,`@0`,de)

@Arc_
<span id="arc-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Perpendicular: @RelationObject_(@uid,`@0`,orthogonal,en)
@Orthogonale: @RelationObject_(@uid,`@0`,orthogonal,de)
@Parallel: @RelationObject_(@uid,`@0`,parallel,en)
@Parallele: @RelationObject_(@uid,`@0`,parallel,de)
@Midpoint: @RelationObject_(@uid,`@0`,midpoint,en)
@Mittelpunkt: @RelationObject_(@uid,`@0`,midpoint,de)

@RelationObject_
<span id="relation-spec-@0" data-spec="@1" data-kind="@2" data-language="@3" style="display:none;"></span>
@end

@Area: @Area_(@uid,`@0`,en)
@Flaeche: @Area_(@uid,`@0`,de)

@Area_
<span id="area-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@angle: @Angle_(@uid,`@0`,en)
@Winkel: @Angle_(@uid,`@0`,de)

@Angle_
<span id="angle-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Circle: @Circle_(@uid,`@0`,en)
@Kreis: @Circle_(@uid,`@0`,de)

@Circle_
<span id="circle-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@PlotFunction: @PlotFunction_(@uid,`@0`)
@PlotFunktion: @PlotFunction_(@uid,`@0`)

@PlotFunction_
<span id="plot-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@Zeros: @FunctionAnalysisPoints_(@uid,`@0`,roots,en)
@Nullstellen: @FunctionAnalysisPoints_(@uid,`@0`,roots,de)
@Extrema: @FunctionAnalysisPoints_(@uid,`@0`,extrema,en)
@Extrempunkte: @FunctionAnalysisPoints_(@uid,`@0`,extrema,de)
@InflectionPoints: @FunctionAnalysisPoints_(@uid,`@0`,inflections,en)
@Wendepunkte: @FunctionAnalysisPoints_(@uid,`@0`,inflections,de)

@FunctionAnalysisPoints_
<span id="function-analysis-spec-@0" data-spec="@1" data-kind="@2" data-language="@3" style="display:none;"></span>
@end

@OrdinateIntercept: @ObjectAnalysisPoints_(@uid,`@0`,ordinate-intercept,en)
@Ordinatenabschnitt: @ObjectAnalysisPoints_(@uid,`@0`,ordinate-intercept,de)
@Ordinatenachsenabschnitt: @ObjectAnalysisPoints_(@uid,`@0`,ordinate-intercept,de)
@Intersection: @ObjectAnalysisPoints_(@uid,`@0`,intersections,en)
@Schnittpunkt: @ObjectAnalysisPoints_(@uid,`@0`,intersections,de)

@ObjectAnalysisPoints_
<span id="object-analysis-spec-@0" data-spec="@1" data-kind="@2" data-language="@3" style="display:none;"></span>
@end

@Slider: @Slider_(@uid,`@0`,en)
@Regler: @Slider_(@uid,`@0`,de)
@Schieberegler: @Slider_(@uid,`@0`,de)

@Slider_
<span id="slider-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@PlotInput: @PlotInput_(@uid,`@0`)
@PlotEingabeLatex: @PlotInput_(@uid,`@0`)

@PlotInput_
<div id="lia-plot-input-@0" data-spec="@1"></div>
@end

@Schar: @Schar_(@uid,`@0`)

@Schar_
<span id="schar-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@Rekonstruktion: @Rekonstruktion_(@uid,`@0`)
@Reconstruction: @Rekonstruktion_(@uid,`@0`)

@Rekonstruktion_
<span id="rek-spec-@0" data-spec="@1" style="display:none;"></span>

<div id="rek-check-@0">
[[!]]
<script modify="false">
  (() => {
    const node = document.getElementById('rek-spec-@0');
    const spec = node ? String(node.dataset.spec || '') : String.raw`@1`;

    if (typeof window.__checkReconstructionQuiz === 'function') {
      return window.__checkReconstructionQuiz('@0', spec);
    }

    if (typeof window.__checkRekonstruktionQuiz === 'function') {
      return window.__checkRekonstruktionQuiz('@0', spec);
    }

    if (typeof window.__checkReconstructionFromSpec === 'function') {
      return window.__checkReconstructionFromSpec(spec);
    }

    if (typeof window.__checkRekonstruktionFromSpec === 'function') {
      return window.__checkRekonstruktionFromSpec(spec);
    }

    return false;
  })()
</script>
</div>

<script modify="false">
(function(){
  const node = document.getElementById('rek-spec-@0');
  const spec = node ? String(node.dataset.spec || '') : String.raw`@1`;
  if (typeof window.__setupReconstructionQuiz === 'function') {
    window.__setupReconstructionQuiz('@0', spec);
    return;
  }

  if (typeof window.__setupRekonstruktionQuiz === 'function') {
    window.__setupRekonstruktionQuiz('@0', spec);
  }
})();
</script>
@end

@PointOnGraph: @PointOnGraph_(@uid,`@0`)
@PunktGraph: @PointOnGraph_(@uid,`@0`)

@PointOnGraph_
<div id="graph-ui-@0">
  <div id="graph-task-@0" class="lia-graph-task"></div>
  <div id="graph-check-@0">
    [[!]]
    <script modify="false">
      window.__checkPointGraphFromSpec && window.__checkPointGraphFromSpec('@0', document.getElementById('graph-spec-@0')?.textContent || '')
    </script>
  </div>
</div>
<span id="graph-spec-@0" style="display:none;">@1</span>
@end

@PointsOnGraph: @PointsOnGraph_(@uid,`@0`)
@PunkteAufGraph: @PointsOnGraph_(@uid,`@0`)

@PointsOnGraph_
<div id="multi-graph-ui-@0" data-spec="@1">
  <div id="multi-graph-task-@0" class="lia-multi-graph-task"></div>

  <div id="multi-graph-check-@0">
    [[!]]
    <script modify="false">
      window.__checkPointsOnGraphFromSpec && window.__checkPointsOnGraphFromSpec('@0', document.getElementById('multi-graph-ui-@0')?.dataset.spec || '')
    </script>
  </div>
</div>
@end

@Table: @Table_(@uid,`@0`)
@Tabelle: @Table_(@uid,`@0`)

@Table_
<div id="lia-table-@0" data-spec="@1"></div>
@end

@PerimeterQuiz: @PolygonMetricQuiz_(@uid,`@0`,`@1`,perimeter,@language)
@UmfangQuiz: @PolygonMetricQuiz_(@uid,`@0`,`@1`,perimeter,@language)
@AreaQuiz: @PolygonMetricQuiz_(@uid,`@0`,`@1`,area,@language)
@FlaecheQuiz: @PolygonMetricQuiz_(@uid,`@0`,`@1`,area,@language)

@PolygonMetricQuiz_
<span id='polygon-metric-quiz-spec-@0' data-spec='@1' data-kind='@3' data-language='@4' style='display:none'></span>

@2
[[!]]
<script modify=false>
  typeof window.__checkPolygonMetricQuiz === 'function' &&
    window.__checkPolygonMetricQuiz('@0', "@'1", '@3') === true
</script>
@end
@ConstructionQuiz: @ConstructionQuiz_(@uid,`@0`,`@1`,@language)
@KonstruktionQuiz: @ConstructionQuiz_(@uid,`@0`,`@1`,@language)

@ConstructionQuiz_
<span id='construction-quiz-spec-@0' data-spec='@1' data-language='@3' style='display:none'></span>

@2
[[!]]
<script modify=false>
  typeof window.__checkConstructionQuiz === 'function' &&
    window.__checkConstructionQuiz('@0', "@'1") === true
</script>
@end
````
