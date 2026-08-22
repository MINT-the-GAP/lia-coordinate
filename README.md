<!--
author:   MINT-the-GAP, Martin Lommatzsch, Jihad Hyadi
version:  0.0.3
language: en
edit: true
narrator: US English Female
comment:  Interactive coordinate system plugin for LiaScript, powered by JSXGraph. Provides macros for coordinate planes, points, function plots, and value tables.

import:   https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md

script:   ./dist/index.js

@CoordinateSystem: @CoordinateSystem_(@uid,`@0`)
@Koordinatensystem: @CoordinateSystem_(@uid,`@0`)

@CoordinateSystem_
<lia-coordinate-board data-lia-coordinate-key="@0" data-spec="@1"></lia-coordinate-board>
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
</div>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span id="point-check-@0" data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="create-point" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
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
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="polygon-metric" data-lia-coordinate-quiz-uid="@0" data-lia-coordinate-quiz-metric="@3" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
@end

@ConstructionQuiz: @ConstructionQuiz_(@uid,`@0`,`@1`,@language)
@KonstruktionQuiz: @ConstructionQuiz_(@uid,`@0`,`@1`,@language)

@ConstructionQuiz_
<span id='construction-quiz-spec-@0' data-spec='@1' data-language='@3' style='display:none'></span>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="construction" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
@end

@KoordQuiz: @CombinedQuiz_(@uid,`@0`,`@1`,@language)
@GeometrieQuiz: @CombinedQuiz_(@uid,`@0`,`@1`,@language)
@CoordinateQuiz: @CombinedQuiz_(@uid,`@0`,`@1`,@language)
@GeometryQuiz: @CombinedQuiz_(@uid,`@0`,`@1`,@language)

@CombinedQuiz_
<span id='combined-quiz-spec-@0' data-spec='@1' data-language='@3' style='display:none'></span>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="combined" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
@end

@Rekonstruktion: @Rekonstruktion_(@uid,`@0`,`<!-- -->`)
@Reconstruction: @Rekonstruktion_(@uid,`@0`,`<!-- -->`)
@RekonstruktionMitOptionen: @Rekonstruktion_(@uid,`@0`,`@1`)
@ReconstructionWithOptions: @Rekonstruktion_(@uid,`@0`,`@1`)

@Rekonstruktion_
<span id="rek-spec-@0" data-spec="@1" style="display:none;"></span>
<script modify="false">
  if (typeof window.__setupReconstructionQuiz === 'function') {
    window.__setupReconstructionQuiz('@0', '');
  } else if (typeof window.__setupRekonstruktionQuiz === 'function') {
    window.__setupRekonstruktionQuiz('@0', '');
  }
</script>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span id="rek-check-@0" data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="reconstruction" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
@end

@PointOnGraph: @PointOnGraph_(@uid,`@0`,`<!-- -->`)
@PunktGraph: @PointOnGraph_(@uid,`@0`,`<!-- -->`)
@PointOnGraphWithOptions: @PointOnGraph_(@uid,`@0`,`@1`)
@PunktGraphMitOptionen: @PointOnGraph_(@uid,`@0`,`@1`)

@PointOnGraph_
<span id="graph-spec-@0" style="display:none;">@1</span>
<div id="graph-ui-@0" data-spec="@1">
<div id="graph-task-@0" class="lia-graph-task"></div>
</div>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span id="graph-check-@0" data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="point-on-graph" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
@end

@PointsOnGraph: @PointsOnGraph_(@uid,`@0`,`<!-- -->`)
@PunkteAufGraph: @PointsOnGraph_(@uid,`@0`,`<!-- -->`)
@PointsOnGraphWithOptions: @PointsOnGraph_(@uid,`@0`,`@1`)
@PunkteAufGraphMitOptionen: @PointsOnGraph_(@uid,`@0`,`@1`)

@PointsOnGraph_
<div id="multi-graph-ui-@0" data-spec="@1">
<div id="multi-graph-task-@0" class="lia-multi-graph-task"></div>
</div>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span id="multi-graph-check-@0" data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="points-on-graph" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
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
For fixed and statically resolvable geometry, measurements, labels, and
self-contained plots, an explicitly enabled static mode renders a small native
SVG instead; an optional lightweight import avoids JSXGraph entirely.

__Try it on LiaScript:__
https://liascript.github.io/course/?https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/main/README.md

__See the project on GitHub:__
https://github.com/MINT-the-GAP/lia-coordinate

           {{1}}
1. Load the macros via

   `import: https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/main/README.md`

   or pin to a specific version:

   `import: https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/0.0.3/README.md`

2. Also requires JSXGraph (already included via the `import:` above):

   `import: https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md`

   An all-static course can instead use the separate lightweight import shown
   under [Static SVG mode](#static-svg-mode). Do not combine both imports.

## Drawing order

Drawable macros that target the same coordinate system are stacked in their
source-code order. The first macro uses layer `0`, the next one layer `1`, and
so on, so an object written farther down in the course is rendered above an
earlier object. Visible geometry and decorations created by one macro share
that source rank. Each rank has small internal sublayers for geometry, hit
targets, handles, and annotations, but the source rank remains primary: every
SVG part of a later macro is above every SVG part of an earlier one.
HTML/MathJax annotations remain in the board overlay and follow the same source
order among themselves. Layer values are capped at `20`; additional macros
share that top rank. A layer that was changed and restored through DGS remains
an explicit override. Layering changes only drawing order; objects keep their
user coordinates and therefore continue to follow board panning and zooming.

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

## Static SVG mode

          --{{0}}--
For a coordinate system that contains only the fixed and statically resolvable
objects listed below, add `static=1` or its German alias `statisch=1`. This
explicit flag renders one native responsive `<svg>` instead of creating a
JSXGraph board. The SVG keeps the aspect ratio defined by `xmin`, `xmax`,
`ymin`, and `ymax`; `width` is its maximum width, while `max-width: 100%` and
automatic height let the browser scale it on narrow screens. Non-scaling
strokes keep line widths stable; ticks, arrowheads, and labels scale with the
responsive SVG. Mathematical y coordinates are projected to the SVG's
downward y axis.

`border=0` is independent. It only hides the frame and disables the usual
JSXGraph pan, zoom, and resize interaction. It never activates static mode.
Without `static=1` or `statisch=1`, including when only `border=0` is present,
the existing JSXGraph path is used unchanged.

### Fixed-point registry and dependency boundary

`@Point` / `@Punkt` contributes to a board-local immutable
name-to-coordinate registry only when both coordinates are finite numeric
literals. Static mode freezes such a point even when `fix` is omitted.
`opacity=0` hides its marker and label but keeps it referenceable. A terminal
`=0`, for example `A=0`, hides only the displayed name and also keeps `A`
referenceable. Expressions and runtime bindings including `xexpr=...`,
`yexpr=...`, `parameter=...`, and `param=...` are rejected.

Named references in supported static macros resolve only against those
directly authored literal points on the same board. Derived points and objects
are not registered: in particular, a rendered midpoint cannot be referenced
later. Names assigned to lines, circles, sectors, or other objects are labels,
not dependency targets. Perpendicular and parallel constructions therefore
accept only a direct base point pair or a pair of fixed-point names; the name
of an earlier line, ray, vector, or segment is not a static relation basis.

### Supported objects

- `@AxisLabel` / `@AchsenBeschriftung` renders `xlabel` and `ylabel`. When
  axes are enabled, the SVG also supplies stable axis arrowheads,
  automatically spaced ticks, and numeric tick labels.
- `@Point` / `@Punkt` renders each accepted literal fixed point and creates
  the registry entry described above.
- `@CoordText` / `@KoordText` places text at one direct coordinate.
- `@distance` / `@Strecke` and `@Area` / `@Flaeche` accept either direct
  coordinate lists or names from the fixed-point registry. Segment names and
  requested length labels are rendered. Requested polygon area and perimeter
  measurements are rendered at the polygon center.
- `@Line` / `@Gerade`, `@Ray` / `@Strahl`, and `@Vector` / `@Vektor`
  accept exactly two direct coordinates or two fixed-point names. Lines and
  rays are clipped to the board; vectors retain their endpoint arrow. Visible
  object names are rendered.
- `@Arc` / `@Bogen` accepts direct endpoints or fixed-point names and is rendered
  as a cubic Bézier path. Exit and entry angles follow the unit-circle
  convention, and each control arm is one third of the endpoint distance.
  Designs `-`, `->`, `<-`, and `<->`, plus leading or trailing `|` end caps,
  are supported. Color, line width, visibility, and line style are retained,
  including for vertical curves. A non-empty caption is centered on the curve;
  an empty caption does not create a text element.
- `@Midpoint` / `@Mittelpunkt` accepts a direct or named point pair and can
  render its name and `wert=1` / `value=1` coordinate label. The result is not
  inserted into the fixed-point registry.
- `@Perpendicular` / `@Orthogonale` and `@Parallel` / `@Parallele`
  accept the base and through-point forms described above; a named basis object
  is not resolved.
- `@angle` / `@Winkel` accepts three names from the fixed-point registry.
  The middle entry is the vertex; the directed angle,
  optional name, and `Wert=1` / `value=1` measurement are rendered.
- `@Circle` / `@Kreis` accepts a center from the fixed-point registry and
  either a numeric radius or another registered point as radius reference.
  Circle name, fill, and
  requested area and circumference measurements are retained.
- `@CircularSector`, `@Sector`, `@CircleSegment`, `@CircularSegment`,
  `@Kreissektor`, and `@Kreissegment` share the same three-point,
  counterclockwise sector rendering. The second point determines the radius
  and the third its end direction. The segment aliases remain sectors rather
  than chord-bounded circular segments. Names and requested measurements are
  rendered.
- `@PlotFunction` / `@PlotFunktion` accepts only a self-contained expression
  using `x`, built-in constants, and supported built-in mathematical functions.
  The shared safe expression compiler runs without slider, parameter,
  custom-variable, foreign-function, or previously defined function bindings.
  Deterministic sampling clips the graph to the board and splits SVG paths at
  non-finite values and detected discontinuities instead of bridging poles.

Names ending in `=0`, and `name=0` where accepted, suppress only the visible
label. German measurements retain decimal commas and `FE` / `LE`; English
measurements retain decimal points and `AU` / `LU`. Plain and dollar-delimited
text uses a safe readable SVG fallback without MathJax. Complex TeX remains
readable source text rather than fully typeset output.

Color, opacity, `visible=0` / `sichtbar=0`, line width, supported arrow and
end-cap designs, and `linestyle=solid|dashed|dotted|dashdotted` (German:
`linienstil=...`) are retained where the public macro accepts them. Supported
objects preserve their course-source drawing order.

### Remaining interactive-only features

`@CreatePoint` / `@ErzeugePunkt`, tangents, sliders, plot input, function
families, function and object analysis points, DGS, regression,
reconstruction, tables, point-on-graph tasks, and all coordinate/construction
quiz macros remain interactive. With the normal import, an unsupported object
targeting a static board produces a developer warning and is not put into a
retry loop. There is deliberately no automatic whole-board fallback: remove
`static=1` / `statisch=1` to select JSXGraph and avoid duplicate output.

``` markdown
@Koordinatensystem(`xmin=-5;xmax=5;ymin=-4;ymax=5;width=720;id=static_geometry;achsen=1;grid=1;border=1;statisch=1`)

@AchsenBeschriftung(`id=static_geometry;xlabel=$x$;ylabel=$y$`)

@Punkt(`static_geometry;A;-3;-1;#e63946;0;fix`)
@Punkt(`static_geometry;B;3;-1;#e63946;0;fix`)
@Punkt(`static_geometry;C;0;3;#e63946;0;fix`)
@Punkt(`static_geometry;M;0;0;#457b9d;0`)
@Punkt(`static_geometry;P;2;0;#457b9d;0`)
@Punkt(`static_geometry;Q;0;2;#457b9d;0`)

@Flaeche(`static_geometry;[A;B;C];#e63946;0.18;inhalt=1;umfang=1`)
@Strecke(`static_geometry;[A;B];#1d3557;c;length=1;->;2px`)
@Winkel(`static_geometry;alpha;[B;A;C];#ff8800;0.8;Wert=1`)
@Kreis(`static_geometry;k;M;#457b9d;0.08;radius=P`)
@Kreissektor(`static_geometry;[M;P;Q];#457b9d;0.25;s=0`)
@PlotFunktion(`static_geometry;f=0;0.12*x^2-2.5;#6a4c93;linestyle=dashed`)
```

### Normal versus lightweight download

The normal `README.md` import remains fully backward compatible and continues
to import the JSXGraph template. A board with `static=1` avoids JSXGraph board
creation and reduces CPU and memory use, but JSXGraph is still downloaded
because the course header may contain other interactive boards.

If every coordinate system in a course uses only the supported static subset,
import the lightweight template instead:

``` markdown
import: https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/main/README.static.md
```

Or pin the static template to this release:

``` markdown
import: https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/0.0.3/README.static.md
```

Alternatively, the same template is available through jsDelivr:

``` markdown
import: https://cdn.jsdelivr.net/gh/MINT-the-GAP/lia-coordinate@main/README.static.md
```

That template loads only `dist/static.js`, contains no JSXGraph import, and
defines the English and German static aliases for coordinate systems, axis
labels, points, coordinate text, distances, lines, rays, vectors, arcs,
perpendiculars, parallels, midpoints, areas, angles, circles, all six
sector/segment aliases, and function plots. It still requires `static=1` or
`statisch=1` on every board and has no dynamic fallback. Do not import
`README.md` and `README.static.md` together. Use the pinned URL above for a
reproducible course.

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

The second argument must always be provided. Pass `<!-- -->` to use the default
quiz controls. This non-empty no-op comment is also safe when the task is placed
inside DynFlex.

All quiz macros in this template support native LiaScript hints and detailed
solutions directly after the macro call, with or without a separating blank
line. The parser-stable pattern is:

``` markdown
@CreatePoint(`board;A;2;3`,`<!-- data-hint-button="2" data-solution-button="3" -->`)
[[?]] This is a hint.
*****************
This is the detailed solution.
*****************
```

The quiz comment can also contain `data-solution-timer*` attributes when the
course imports `lia-timer`. `lia-coordinate` preserves the comment; `lia-timer`
implements the countdown.

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_point_ez`)

@AxisLabel(`id=ex_point_ez;xlabel=$x$;ylabel=$y$`)

Drag point $A$ to the coordinates $(2 | 3)$.

@CreatePoint(`ex_point_ez;A;2;3`,`<!-- -->`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_point_ez`)

@AxisLabel(`id=ex_point_ez;xlabel=$x$;ylabel=$y$`)

Drag point $A$ to the coordinates $(2 | 3)$.

@CreatePoint(`ex_point_ez;A;2;3`,`<!-- -->`)

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

## Line styles

          --{{0}}--
The line-like macros listed below accept the additive named
option `linestyle=solid|dashed|dotted|dashdotted`. The German alias
`linienstil=...` is equivalent; names are case-insensitive. Put the option at
the end of the existing specification. If it is omitted, the line remains
`solid`, preserving the appearance of existing courses. If an option occurs
more than once, the last valid value wins.

The renderer mapping is `solid` to JSXGraph `dash: 0`, `dashed` to `dash: 2`,
and `dotted` to the round-dot preset `dash: 7`. JSXGraph has no native
dash-dot preset; `dashdotted` therefore uses its renderer-native alternating
long/short pattern `dash: 6` as the closest portable approximation. The
corresponding German descriptions are durchgezogen, gestrichelt, gepunktet,
and strichpunktiert.

Specifically, the option is supported by `@Strecke` / `@distance`; `@Line` /
`@Gerade`, `@Ray` / `@Strahl`, and `@Vector` / `@Vektor`; `@Arc` /
`@Bogen`; perpendiculars and parallels; `@Area` / `@Flaeche` polygon
outlines; angles, circles, tangents, and circular sectors; `@PlotFunction` and
`@PlotInput`; `@PointOnGraph` and `@PointsOnGraph`; and `@Schar`. Midpoints
are points rather than strokes, and freehand `@Regression` traces keep their
separate drawing-tool styles. The option changes only the stroke pattern.
Arrow/end-cap `design`, line width, color, fill, and opacity remain independent.

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

Parameters: `<boardId>;[<pointName1>;<pointName2>]|[[<x1>;<y1>];...];<color>;<segmentName>[=0][;length=1][;<design>][;<lineWidth>][;linestyle=<style>]`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_distance`)

@Point(`ex_distance;A;-2;-1`)
@Point(`ex_distance;B;3;2`)

@Strecke(`ex_distance;[A;B];#e63946;a;length=1;->|;2px;linestyle=dashed`)

@Strecke(`ex_distance;[[2;3];[4;4];[6;2]];#457b9d;s=0;length=1;|<->|;4px`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_distance;1;1;0`)

@Point(`ex_distance;A;-2;-1`)
@Point(`ex_distance;B;3;2`)

@Strecke(`ex_distance;[A;B];#e63946;a;length=1;->|;2px;linestyle=dashed`)

@Strecke(`ex_distance;[[2;3];[4;4];[6;2]];#00ffff;s=0;length=1;|<->|;4px`)

## `@Line` / `@Gerade`, `@Ray` / `@Strahl`, `@Vector` / `@Vektor`

          --{{0}}--
Creates a straight line, a ray, or a vector from two existing named points or
from two directly supplied coordinates. Named points remain attached when they
move; coordinate input creates fixed invisible helper points. Rays are rendered
without arrowheads. Vectors use the JSXGraph arrow and are labelled as
`\overrightarrow{...}`; if no explicit vector name is given, named endpoints are
used automatically, for example `\overrightarrow{AB}`.

Parameters: `<boardId>;[<pointName1>;<pointName2>]|[[<x1>;<y1>];[<x2>;<y2>]];<color>;<name>[=0][;linestyle=<style>]`

For a vector using its automatic endpoint name, append the standalone option
`name=0` to hide that automatic label.

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_linear`)

@Point(`ex_linear;A;-3;-1`)
@Point(`ex_linear;B;2;2`)
@Point(`ex_linear;C;-1;3`)
@Point(`ex_linear;D;3;1`)

@Gerade(`ex_linear;[A;B];#e63946;g;linienstil=dotted`)
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

@Gerade(`ex_linear;[A;B];#e63946;g;linienstil=dotted`)
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

Parameters: `<boardId>;<startPoint>|[<x>;<y>];<exitAngle>;<endPoint>|[<x>;<y>];<entryAngle>;<caption>;<design>;<lineWidth>[;<color>][;linestyle=<style>]`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_arc`)

@Point(`ex_arc;A;-3;0`)
@Point(`ex_arc;B;3;0`)

@Bogen(`ex_arc;A;90;B;90;$b$;->|;2px;#e63946;linestyle=dashdotted`)
@Arc(`ex_arc;[-3;-2];270;[3;-2];270;$c$;|<->|;3px;#457b9d`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_arc;1;1;0`)

@Point(`ex_arc;A;-3;0`)
@Point(`ex_arc;B;3;0`)

@Bogen(`ex_arc;A;90;B;90;$b$;->|;2px;#e63946;linestyle=dashdotted`)
@Arc(`ex_arc;[-3;-2];270;[3;-2];270;$c$;|<->|;3px;#457b9d`)

## `@Perpendicular` / `@Orthogonale`, `@Parallel` / `@Parallele`, `@Midpoint` / `@Mittelpunkt`

          --{{0}}--
Creates a perpendicular line, a parallel line, or the midpoint of two points.
Perpendicular and parallel lines can reference an existing named line-like
object (`@Strecke`, `@Gerade`, `@Strahl`, `@Vektor`) or use a point pair as an
implicit base line. The midpoint is registered as a point, so later macros can
refer to it by name. Add `wert=1` / `value=1` to show its coordinates.

Parameters for perpendicular/parallel: `<boardId>;<baseName>|[<basePoint1>;<basePoint2>];<throughPoint>;<color>;<name>[=0][;linestyle=<style>]`

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

Parameters: `<boardId>;[<point1>;<point2>;...]|[[<x1>;<y1>];...];<color>;<opacity>;inhalt=1;umfang=1[;linestyle=<style>]`

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

Parameters: `<boardId>;<name>[=0];[<point1>;<vertex>;<point3>];<color>;<opacity>;Wert=1[;linestyle=<style>]`

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

Parameters: `<boardId>;<name>[=0];<centerPoint>;<color>;<opacity>;radius=<number|point>;inhalt=1;umfang=1[;linestyle=<style>]`

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

Parameters for tangents: `<boardId>;<sourceName>|[<point1>;<point2>];[<x>;<y>];<color>;<lineName>[=0];<contactPointName>[=0][;linestyle=<style>]`

Parameters for circular sectors: `<boardId>;[<center>;<radiusPoint>;<anglePoint>];<color>;<opacity>;<name>[=0];inhalt=1;umfang=1[;linestyle=<style>]`

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

Parameters: `<boardId>;<funcName>[=0];<formula>;<color>[;linestyle=<style>]`

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

Parameters: `<boardId>;<funcName>;<color>[;linestyle=<style>]`

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

Parameters: `<boardId>;<pointName>;<funcName>;<formula>;<tolerance>[;linestyle=<style>]`

Use `@PointOnGraphWithOptions` / `@PunktGraphMitOptionen` with the same first
argument and a LiaScript quiz comment as the second argument when custom hint,
solution, or timer controls are needed. The original one-argument aliases remain
fully compatible and use the default controls.

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

Parameters: `<boardId>;n=<count>;d=<step>;<pointName>;<funcName>;<formula>;<tolerance>[;linestyle=<style>]`

Use `@PointsOnGraphWithOptions` / `@PunkteAufGraphMitOptionen` for an additional
LiaScript quiz-comment argument. The original one-argument aliases keep the
default controls.

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
screen-sized geometry instrument without changing the active drawing tool. Its zero mark stays
anchored to the same board coordinate while the board is panned or zoomed, while its displayed
angle and size remain screen-space based. Its triangular
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
If panning carries the anchored instrument completely beyond the viewport, hiding and showing it
again restores the draggable 5-percent portion at the nearest board edge.
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
The object menu opened by right-clicking the board or an object-list entry contains an
Appearance section with a Line style / Linienart selector. It offers Solid, Dashed,
Dotted, and Dash-dotted for segments (including polygon sides), rays, vectors, straight
lines, tangents, perpendiculars, parallels, angle bisectors, custom and compass arcs,
polygon outlines, angle contours, circles, circular sectors, and DGS-created or
`@PlotFunction` function graphs. For
multi-part objects such as polygons and sectors, selecting the owner changes the complete
visible outline together. A registered polygon side remains separately selectable and can
therefore receive its own override. Such a per-side override participates in DGS
persistence and undo/redo, but it cannot be represented by the single outline style of
`@Area` / `@Flaeche` and is consequently not part of macro export.

Standalone segments and custom arcs additionally retain their Design selector for
directional arrows and orthogonal end caps, including `|<->|`, and their Line width field.
Line width accepts values from `0.25` to `20` with or without the `px` suffix and is
applied on blur or Enter. Arrowheads and end caps stay attached while endpoints move or
the board is zoomed. Line style, design, and width are independent. All supported
appearance settings participate in DGS persistence and undo/redo. For exportable object
types they are also included in the object-list macro export. A non-solid style is exported
canonically as
`linestyle=dashed`, `linestyle=dotted`, or `linestyle=dashdotted`; the default
`solid` is omitted to keep exported legacy-compatible specifications compact.
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
Right-clicking a DGS point or a supported geometry object opens an object menu from the right. It can lock the
object and independently show or hide its name and visual representation; an open top menu
pushes this object menu downward. Point coordinates are applied on blur or Enter, and an
inline color palette with hue and hexadecimal controls recolors DGS objects.
`@DGS` automatically adds the regression drawing tools to the same board;
undo and redo remain permanently stacked below the hamburger button, so no additional
`@Regression` macro is required.
Regression analysis panels are stacked below these permanent controls.
Conversely, `@Regression` and `@Reconstruction` automatically add the same DGS shell with
the compact tool profile `tools=[910;920;930]` (freehand pen, eraser, and regression tools).
The set square, compass, and unrelated DGS tool groups stay hidden in this implicit profile.
If an explicit `@DGS` targets the same board, its complete `tools` and `restrictions` profile
takes precedence, regardless of whether it appears before or after the regression macro.

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
comment is emitted unchanged directly before the hidden LiaScript quiz input,
just like for `@CreatePoint`; for example,
`<!-- data-solution-button="5" -->` reveals the solution button after five
unsuccessful checks.

If area, perimeter, and construction properties belong to one task, use
`@KoordQuiz` instead of placing several individual quiz macros below each
other. It emits one quiz and requires one and the same learner polygon to
satisfy every listed condition.

Parameters:

1. Geometry specification: `<boardId>;<numberOfVertices>;<targetValue>;<absoluteTolerance>`
2. LiaScript quiz comment: `<!-- data-solution-button="5" -->` (use `<!-- -->` if no option is needed)

``` markdown
@CoordinateSystem(`xmin=-1;xmax=6;ymin=-1;ymax=5;width=;id=ex_polygon_metric_quiz`)

@DGS(`ex_polygon_metric_quiz;tools=[200;510;920]`)

Construct a triangle with perimeter 12 and area 6.

@KoordQuiz(`ex_polygon_metric_quiz;3;Umfang(12;0.05);Flaeche(6;0.05)`,`<!-- data-solution-button="5" -->`)
```

---

@CoordinateSystem(`xmin=-1;xmax=6;ymin=-1;ymax=5;width=;id=ex_polygon_metric_quiz`)

@DGS(`ex_polygon_metric_quiz;tools=[200;510;920]`)

Construct a triangle with perimeter 12 and area 6.

@KoordQuiz(`ex_polygon_metric_quiz;3;Umfang(12;0.05);Flaeche(6;0.05)`,`<!-- data-solution-button="5" -->`)


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



## `@KoordQuiz` / `@GeometrieQuiz` and `@CoordinateQuiz` / `@GeometryQuiz`

          --{{0}}--
Combines construction, quadrilateral-form, area, and perimeter requirements
into one normal LiaScript quiz. Every condition is joined with AND and is tested on the same
learner-created polygon. Thus, one polygon cannot satisfy the construction
while a different polygon supplies the requested area. The existing individual
quiz macros remain available for tasks with only one check.

Parameters:

1. `<boardId>;<numberOfCorners>;<condition>;<condition>;...`
2. LiaScript quiz comment, for example `<!-- data-solution-button="5" -->`

Supported conditions use the shorter form without repeating the board ID and
corner count:

- `Konstruktion(<fest|offen>;<propertyList>;optional tolerances)` or
  `Construction(<fixed|open>;<propertyList>;optional tolerances)`
- `Form(<quadrilateralType>)` or
  `Form(<quadrilateralType>;exklusiv=<type>[|<type>...])`
- `Flaeche(<targetValue>;<absoluteTolerance>)` or
  `Area(<targetValue>;<absoluteTolerance>)`
- `Umfang(<targetValue>;<absoluteTolerance>)` or
  `Perimeter(<targetValue>;<absoluteTolerance>)`

The conditions may appear in any order. Construction and metric conditions keep
the detailed property and tolerance syntax of the corresponding individual quiz
macros.

`Form(...)` is available only for specifications with exactly four corners. It
accepts the following case-insensitive German and English names. Every
definition is inclusive:

| German name | English name | Property checked |
|---|---|---|
| `Parallelogramm` | `Parallelogram` | Both pairs of opposite sides are parallel. |
| `Rechteck` | `Rectangle` | All four interior angles are right angles. Squares therefore count as rectangles. |
| `Raute` | `Rhombus` | All four sides have equal length. Squares therefore count as rhombi. |
| `Quadrat` | `Square` | All four sides have equal length and all four interior angles are right angles. |
| `Trapez` | `Trapezoid` | At least one pair of opposite sides is parallel. Parallelograms, rectangles, rhombi, and squares therefore count as trapezoids. |
| `Drachenviereck` | `Kite` | Two distinct pairs of adjacent sides have equal length: $a=b$ and $c=d$, or $b=c$ and $d=a$. Rhombi and squares therefore count as kites. |

Consequently, rectangles and rhombi (including squares) also count as
parallelograms. This inclusive hierarchy remains closed even when individual
numeric predicates lie on different sides of their tolerance boundaries.

The only public `Form` attribute is `exklusiv`. It rejects a construction when
the construction has any listed excluded property, even if the required base
property is satisfied. A single exclusion uses
`Form(Rechteck;exklusiv=Quadrat)`; multiple exclusions are separated with `|`,
for example `Form(Parallelogramm;exklusiv=Raute|Rechteck)`. Because exclusions
are property-based, a square is also rejected by `exklusiv=Raute` and by
`exklusiv=Rechteck`. Repeated exclusions are deduplicated. Unknown base or
excluded names, attributes other than `exklusiv`, and a self-contradiction such
as `Form(Raute;exklusiv=Raute)` make the complete quiz specification invalid.
There are no `modus`, `inklusiv`, `exakt`, or separate form-variant options.

Before classifying a form, the checker rejects repeated or practically
identical vertices, near-zero sides or area, three practically collinear
consecutive vertices, and self-intersections. Concave, non-self-intersecting
quadrilaterals remain valid, including concave kites. Position, rotation,
reflection, traversal direction, and the cyclic starting corner do not affect
classification.

`Form` deliberately exposes no tolerance attribute. Internally it uses the
construction defaults `streckentoleranz=0.05` and `winkeltoleranz=1`. For an
equality comparison, let $L_{max}$ be the longest side, let $S$ be the larger
of 1, the bounding-box width, and the bounding-box height, and let
$\varepsilon$ be JavaScript's floating-point epsilon. The effective length
tolerance is

$$
\min(0.05,\;0.01L_{max})
+64\varepsilon\max(1,L_{max},S).
$$

Thus, the existing absolute length tolerance is an upper bound while a 1%
relative cap prevents very small freely sized quadrilaterals from being
classified too generously; the final term only absorbs scale-dependent
floating-point noise. All-four-side equality compares the longest with the
shortest side, so chained comparisons cannot accumulate tolerance. Parallelism
uses the normalized cross product
$|\vec u\times\vec v|/(|\vec u||\vec v|)\leq\sin(1^\circ)$ and therefore treats
parallel and antiparallel directions alike. Right interior angles are compared
with $90^\circ$ using the same 1-degree angular tolerance.

Typical combinations are:

``` markdown
@GeometrieQuiz(`R1;4;Form(Raute);Flaeche(20;0.05)`,`<!-- -->`)

@GeometrieQuiz(`R2;4;Form(Rechteck;exklusiv=Quadrat);Umfang(24;0.05)`,`<!-- -->`)

@GeometrieQuiz(`R3;4;Form(Parallelogramm;exklusiv=Raute|Rechteck);Flaeche(18;0.05)`,`<!-- -->`)
```

In every case, the form, exclusions, construction properties, area, and
perimeter are evaluated on one and the same polygon. On an unsuccessful check,
the quiz reports whether the candidate is invalid or degenerate, misses the
base form, has an excluded form, or misses another combined condition. These
messages follow the LiaScript course language in German or English.

``` markdown
@CoordinateSystem(`xmin=-1;xmax=6;ymin=-1;ymax=5;width=;id=ex_combined_quiz`)

@DGS(`ex_combined_quiz;tools=[200;510]`)

Construct a rectangle with area 12 and perimeter 14.

@KoordQuiz(`ex_combined_quiz;4;Konstruktion(offen;W90,W90,W90,W90);Flaeche(12;0.05);Umfang(14;0.05)`,`<!-- data-solution-button="5" -->`)
```

---

@CoordinateSystem(`xmin=-1;xmax=6;ymin=-1;ymax=5;width=;id=ex_combined_quiz`)

@DGS(`ex_combined_quiz;tools=[200;510]`)

Construct a rectangle with area 12 and perimeter 14.

@KoordQuiz(`ex_combined_quiz;4;Konstruktion(offen;W90,W90,W90,W90);Flaeche(12;0.05);Umfang(14;0.05)`,`<!-- data-solution-button="5" -->`)

---

The following executable example leaves the common side length and orientation
free while requiring a rhombus with area $20\,FE$:

``` markdown
@CoordinateSystem(`xmin=-1;xmax=10;ymin=-1;ymax=10;width=500;id=rhombus_area;1;1;1`)
@AxisLabel(`id=rhombus_area;xlabel=$x$;ylabel=$y$`)
@DGS(`rhombus_area;tools=[200;510;920]`)

Erzeuge eine Raute mit einem Flächeninhalt von $20\,FE$.

@GeometrieQuiz(`rhombus_area;4;Form(Raute);Flaeche(20;0.05)`,`<!-- data-solution-button="5" -->`)
```

---

@CoordinateSystem(`xmin=-1;xmax=10;ymin=-1;ymax=10;width=500;id=rhombus_area;1;1;1`)
@AxisLabel(`id=rhombus_area;xlabel=$x$;ylabel=$y$`)
@DGS(`rhombus_area;tools=[200;510;920]`)

Erzeuge eine Raute mit einem Flächeninhalt von $20\,FE$.

@GeometrieQuiz(`rhombus_area;4;Form(Raute);Flaeche(20;0.05)`,`<!-- data-solution-button="5" -->`)



## `@Geodreieck` / `@SetSquare`

          --{{0}}--
Adds the set-square instrument to an existing coordinate system and displays it immediately.
Its ruler subdivision follows the current axis metric, while both catheti carry exact
radial 1-degree angle marks with stronger 5-degree and 10-degree divisions.
Its zero mark remains anchored to the same board coordinate during panning and zooming, while
the displayed angle and size remain screen-space based. Used on its own,
the set square can be pushed roughly 95 percent beyond the board while at least 5 percent of its
actual triangular surface remains visible and draggable. This limited off-board position persists
across layout changes. If board panning carries it completely out of view, hiding and showing it
again restores that draggable portion at the nearest board edge. The compact toolbar contains the set square
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
Creates the freehand drawing and regression-analysis interface for a coordinate board.
It automatically uses the compact DGS menu containing the pen, eraser, and regression-tool
button. Add an explicit `@DGS` for the same board when a different tool or restriction profile
is required; that explicit profile takes precedence in either macro order.

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
Checks whether the currently adjusted graph matches a target function on a board and activates
the same compact DGS regression menu as `@Regression`. An explicit `@DGS` for the board controls
the complete tool and restriction profile.

Parameters: `<boardId>;<targetExpr>;<tolerance>`

Use `@ReconstructionWithOptions` / `@RekonstruktionMitOptionen` with the same
first argument and a LiaScript quiz comment as the second argument for custom
hint, solution, or timer controls. The original one-argument aliases keep the
default controls.

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

Parameters: `<name>;<variable>;<term>;<boardId>;term=<0|1>;<color>[;linestyle=<style>]`

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

@CoordinateSystem: @CoordinateSystem_(@uid,`@0`)
@Koordinatensystem: @CoordinateSystem_(@uid,`@0`)

@CoordinateSystem_
<lia-coordinate-board data-lia-coordinate-key="@0" data-spec="@1"></lia-coordinate-board>
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
</div>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span id="point-check-@0" data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="create-point" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
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

@Rekonstruktion: @Rekonstruktion_(@uid,`@0`,`<!-- -->`)
@Reconstruction: @Rekonstruktion_(@uid,`@0`,`<!-- -->`)
@RekonstruktionMitOptionen: @Rekonstruktion_(@uid,`@0`,`@1`)
@ReconstructionWithOptions: @Rekonstruktion_(@uid,`@0`,`@1`)

@Rekonstruktion_
<span id="rek-spec-@0" data-spec="@1" style="display:none;"></span>
<script modify="false">
  if (typeof window.__setupReconstructionQuiz === 'function') {
    window.__setupReconstructionQuiz('@0', '');
  } else if (typeof window.__setupRekonstruktionQuiz === 'function') {
    window.__setupRekonstruktionQuiz('@0', '');
  }
</script>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span id="rek-check-@0" data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="reconstruction" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
@end

@PointOnGraph: @PointOnGraph_(@uid,`@0`,`<!-- -->`)
@PunktGraph: @PointOnGraph_(@uid,`@0`,`<!-- -->`)
@PointOnGraphWithOptions: @PointOnGraph_(@uid,`@0`,`@1`)
@PunktGraphMitOptionen: @PointOnGraph_(@uid,`@0`,`@1`)

@PointOnGraph_
<span id="graph-spec-@0" style="display:none;">@1</span>
<div id="graph-ui-@0" data-spec="@1">
<div id="graph-task-@0" class="lia-graph-task"></div>
</div>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span id="graph-check-@0" data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="point-on-graph" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
@end

@PointsOnGraph: @PointsOnGraph_(@uid,`@0`,`<!-- -->`)
@PunkteAufGraph: @PointsOnGraph_(@uid,`@0`,`<!-- -->`)
@PointsOnGraphWithOptions: @PointsOnGraph_(@uid,`@0`,`@1`)
@PunkteAufGraphMitOptionen: @PointsOnGraph_(@uid,`@0`,`@1`)

@PointsOnGraph_
<div id="multi-graph-ui-@0" data-spec="@1">
<div id="multi-graph-task-@0" class="lia-multi-graph-task"></div>
</div>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span id="multi-graph-check-@0" data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="points-on-graph" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
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
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="polygon-metric" data-lia-coordinate-quiz-uid="@0" data-lia-coordinate-quiz-metric="@3" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
@end
@ConstructionQuiz: @ConstructionQuiz_(@uid,`@0`,`@1`,@language)
@KonstruktionQuiz: @ConstructionQuiz_(@uid,`@0`,`@1`,@language)

@ConstructionQuiz_
<span id='construction-quiz-spec-@0' data-spec='@1' data-language='@3' style='display:none'></span>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="construction" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
@end


@KoordQuiz: @CombinedQuiz_(@uid,`@0`,`@1`,@language)
@GeometrieQuiz: @CombinedQuiz_(@uid,`@0`,`@1`,@language)
@CoordinateQuiz: @CombinedQuiz_(@uid,`@0`,`@1`,@language)
@GeometryQuiz: @CombinedQuiz_(@uid,`@0`,`@1`,@language)

@CombinedQuiz_
<span id='combined-quiz-spec-@0' data-spec='@1' data-language='@3' style='display:none'></span>
<input type="hidden" data-lia-coordinate-dynflex-guard aria-hidden="true">

@2
<span data-lia-coordinate-quiz-anchor data-lia-coordinate-quiz-kind="combined" data-lia-coordinate-quiz-uid="@0" style="display:none" aria-hidden="true"></span>_<span data-lia-coordinate-quiz-input style='display:none' aria-hidden='true'>[[lia-coordinate-check]]</span>_
@end
````


### Testaufgabe:




@Koordinatensystem(`xmin=-2;xmax=80;ymin=-8;ymax=4;width=900;id=G3602;achsen=0;grid=0;border=1`)

@Vektor(`G3602;[[0;0];[76;0]];#000000;u=0`)

@Strecke(`G3602;[[0;-0.8];[0;0.8]];#000000;;-;3px`)
@Strecke(`G3602;[[24;-0.8];[24;0.8]];#000000;;-;3px`)
@Strecke(`G3602;[[36;-0.8];[36;0.8]];#000000;;-;3px`)
@Strecke(`G3602;[[48;-0.8];[48;0.8]];#000000;;-;3px`)
@Strecke(`G3602;[[60;-0.8];[60;0.8]];#000000;;-;3px`)
@Strecke(`G3602;[[72;-0.8];[72;0.8]];#000000;;-;3px`)
@Bogen(`G3602;[12;-0.8];90;[12;0.8];270;;-;5px;#ff0000`)


@KoordText(`G3602;[0;-5.1];$0$;#000000;1`)
@KoordText(`G3602;[36;-5.1];$45$;#000000;1`)
@KoordText(`G3602;[60;-5.1];$60$;#000000;1`)
@KoordText(`G3602;[79.3;-0.15];$x$;#000000;1`)
