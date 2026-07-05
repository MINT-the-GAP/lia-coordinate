<!--
author:   MINT-the-GAP, Martin Lommatzsch, Jihad Hyadi
version:  0.0.1
language: en
edit: true
narrator: US English Female
comment:  Interactive coordinate system plugin for LiaScript, powered by JSXGraph. Provides macros for coordinate planes, points, function plots, and value tables.

import:   https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md

script:   ./dist/index.js

@CoordinateSystem: @CoordinateSystem_(@0)
@Koordinatensystem: @CoordinateSystem_(@0)

@CoordinateSystem_
``` javascript @JSX.Graph
(function () {
  function run() {
    JXG.Options.text.useMathJax = true;

    const C = window.__coord;
    const cfg         = C.parseCoordSpec(String.raw`@0`);
    const INITIAL_BBOX  = [cfg.xmin, cfg.ymax, cfg.xmax, cfg.ymin];
    const INITIAL_RATIO = (cfg.ymax - cfg.ymin) / (cfg.xmax - cfg.xmin);

    // Pre-size from stored state before initBoard so it sees the right dimensions.
    const presetState = C.loadStoredBoardState(cfg.id);
    if (presetState) {
      try {
        const maxPresetWidth = C.getConstrainedAncestorWidth(jxgbox);
        const maxPresetHeight = C.clampHeight(presetState.height);
        const presetScale = Math.min(
          1,
          maxPresetWidth / presetState.width,
          maxPresetHeight / presetState.height
        );
        jxgbox.style.width  = Math.round(presetState.width * presetScale)  + 'px';
        jxgbox.style.height = Math.round(presetState.height * presetScale) + 'px';
      } catch (e) {}
    }
    try { jxgbox.style.visibility = 'hidden'; } catch (e) {}

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

@AxisLabel: @AxisLabel_(@uid,@0)
@AchsenBeschriftung: @AxisLabel_(@uid,@0)

@AxisLabel_
<span id="axis-title-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@CreatePoint: @CreatePoint_(@uid,@0,@1)
@ErzeugePunkt: @CreatePoint_(@uid,@0,@1)

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

@Point: @Point_(@uid,@0)
@Punkt: @Point_(@uid,@0)

@Point_
<span id="point-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@Strecke: @Distance_(@uid,@0,de)
@distance: @Distance_(@uid,@0,en)

@Distance_
<span id="distance-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Area: @Area_(@uid,@0,en)
@Flaeche: @Area_(@uid,@0,de)

@Area_
<span id="area-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@angle: @Angle_(@uid,@0,en)
@Winkel: @Angle_(@uid,@0,de)

@Angle_
<span id="angle-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Circle: @Circle_(@uid,@0,en)
@Kreis: @Circle_(@uid,@0,de)

@Circle_
<span id="circle-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@PlotFunction: @PlotFunction_(@uid,@0)
@PlotFunktion: @PlotFunction_(@uid,@0)

@PlotFunction_
<span id="plot-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@PlotInput: @PlotInput_(@uid,@0)
@PlotEingabeLatex: @PlotInput_(@uid,@0)

@PlotInput_
<div id="lia-plot-input-@0" data-spec="@1"></div>
@end

@Schar: @Schar_(@uid,@0)

@Schar_
<span id="schar-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@Rekonstruktion: @Rekonstruktion_(@uid,@0)
@Reconstruction: @Rekonstruktion_(@uid,@0)

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

@PointOnGraph: @PointOnGraph_(@uid,@0)
@PunktGraph: @PointOnGraph_(@uid,@0)

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

@PointsOnGraph: @PointsOnGraph_(@uid,@0)
@PunkteAufGraph: @PointsOnGraph_(@uid,@0)

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

@Table: @Table_(@uid,@0)
@Tabelle: @Table_(@uid,@0)

@Table_
<div id="lia-table-@0" data-spec="@1"></div>
@end

@DGS: @DGS_(@uid,@0,@language)

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

@Regression: @Regression_(@uid,@0)
@Regession: @Regression_(@uid,@0)
@PlotZeichnen: @Regression_(@uid,@0)

@Regression_
<span id="regression-ui-@0" data-spec="@1" style="display:none;"></span>

<script modify="false">
(function(){
  const spec = '@1';
  if (typeof window.__setupRegressionUI === 'function') {
    window.__setupRegressionUI('@0', spec);
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
  automatically scales down to the available content width
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

Parameters: `<boardId>;<pointName>;<x>;<y>;<color>;<opacity>;fix`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_point`)

@AxisLabel(`id=ex_point;xlabel=$x$;ylabel=$y$`)

@Point(`ex_point;A;2;3`)
@Point(`ex_point;B;-3;-1;#e63946;0.65;fix`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_point`)

@AxisLabel(`id=ex_point;xlabel=$x$;ylabel=$y$`)

@Point(`ex_point;A;2;3`)
@Point(`ex_point;B;-3;-1;#e63946;0.65;fix`)

## `@Strecke` / `@distance`

          --{{0}}--
Connects two existing named points with a segment. The segment remains attached
when either point is moved. Point names are case-sensitive; the color is optional
and defaults to the current theme accent color. Add `length=1` to display the
dynamic length at the segment midpoint. `@Strecke` uses a decimal comma and `LE`;
`@distance` uses a decimal point and `LU`. Without exactly `length=1`, only the
segment is rendered. An optional segment name between the color and `length=1`
replaces the `|AB|` expression in the label.

Parameters: `<boardId>;[<pointName1>;<pointName2>];<color>;<segmentName>;length=1`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_distance`)

@Point(`ex_distance;A;-2;-1`)
@Point(`ex_distance;B;3;2`)

@Strecke(`ex_distance;[A;B];#e63946;a;length=1`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_distance;1;1;0`)

@Point(`ex_distance;A;-2;-1`)
@Point(`ex_distance;B;3;2`)

@Strecke(`ex_distance;[A;B];#e63946;a;length=1`)

## `@Area` / `@Flaeche`

          --{{0}}--
Creates a filled polygon from at least three existing named points. The fill
opacity is clamped to the range `0` to `1`. Add `inhalt=1` and/or `umfang=1`
to show live measurements at the polygon center. German output uses `FE` and
`LE`; English output uses `AU` and `LU`. The English option aliases `area=1`
and `perimeter=1` are also accepted.

Parameters: `<boardId>;[<point1>;<point2>;...];<color>;<opacity>;inhalt=1;umfang=1`

``` markdown
@CoordinateSystem(`xmin=-1;xmax=6;ymin=-1;ymax=5;width=800;id=ex_area`)

@Point(`ex_area;A;0;0`)
@Point(`ex_area;B;4;0`)
@Point(`ex_area;C;4;3`)
@Point(`ex_area;D;0;3`)

@Flaeche(`ex_area;[A;B;C;D];#e63946;0.25;inhalt=1;umfang=1`)
```

---

@CoordinateSystem(`xmin=-1;xmax=6;ymin=-1;ymax=5;width=800;id=ex_area;1;0`)

@Point(`ex_area;A;0;0;#e63946;0`)
@Point(`ex_area;B;4;0;#e63946;0`)
@Point(`ex_area;C;4;3;#e63946;0`)
@Point(`ex_area;D;0;3;#e63946;0`)

@Flaeche(`ex_area;[A;B;C;D];#e63946;0.25;inhalt=1;umfang=1`)

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

Parameters: `<boardId>;<name>;[<point1>;<vertex>;<point3>];<color>;<opacity>;Wert=1`

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

Parameters: `<boardId>;<name>;<centerPoint>;<color>;<opacity>;radius=<number|point>;inhalt=1;umfang=1`

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



## `@PlotFunction`

          --{{0}}--
Plots a function curve on the board using a formula. The formula uses standard math syntax.

Parameters: `<boardId>;<funcName>;<formula>;<color>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_plot`)

@AxisLabel(`id=ex_plot;xlabel=$x$;ylabel=$f{{x}}$`)

@PlotFunction(`ex_plot;f;0.5*x^2-2;#b41f65`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_plot`)

@AxisLabel(`id=ex_plot;xlabel=$x$;ylabel=$f{{x}}$`)

@PlotFunction(`ex_plot;f;0.5*x^2-2;#b41f65`)

## `@PlotInput`

          --{{0}}--
Renders a LaTeX input field where students can type a function and see it plotted live.

Parameters: `<boardId>;<funcName>;<color>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_input`)

@AxisLabel(`id=ex_input;xlabel=$x$;ylabel=$g{{x}}$`)

@PlotInput(`ex_input;g;#0055cc`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_input`)

@AxisLabel(`id=ex_input;xlabel=$x$;ylabel=$g{{x}}$`)

@PlotInput(`ex_input;g;#0055cc`)

## `@PointOnGraph`

          --{{0}}--
Point-on-graph exercise: the student drags a point onto the graph of a given function.
The check validates whether the point lies on the curve within the given tolerance.

Parameters: `<boardId>;<pointName>;<funcName>;<formula>;<tolerance>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_pg`)

@AxisLabel(`id=ex_pg;xlabel=$x$;ylabel=$f{{x}}$`)

Drag point $A$ onto the graph of $f(x) = 2x - 1$.

@PointOnGraph(`ex_pg;A;f;2*x-1;0.05`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_pg`)

@AxisLabel(`id=ex_pg;xlabel=$x$;ylabel=$f{{x}}$`)

Drag point $A$ onto the graph of $f(x) = 2x - 1$.

@PointOnGraph(`ex_pg;A;f;2*x-1;0.05`)

## `@PointsOnGraph`

          --{{0}}--
Multi-point-on-graph exercise: places several draggable points that must all land on the graph.

Parameters: `<boardId>;n=<count>;d=<step>;<pointName>;<funcName>;<formula>;<tolerance>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_points_on_graph`)

@AxisLabel(`id=ex_points_on_graph;xlabel=$x$;ylabel=$f{{x}}$`)

Drag all 3 points onto the graph of $f(x) = x - 1$.

@PointsOnGraph(`ex_points_on_graph;n=3;d=2;A;f;x-1;0.05`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_points_on_graph`)

@AxisLabel(`id=ex_points_on_graph;xlabel=$x$;ylabel=$f{{x}}$`)

Drag all 3 points onto the graph of $f(x) = x - 1$.

@PointsOnGraph(`ex_points_on_graph;n=3;d=2;A;f;x-1;0.05`)

## `@Table`

          --{{0}}--
Renders a value table connected to a coordinate board. Students fill in x/y values and the corresponding points appear on the graph.

Parameters: `n=<startColumns>;x;<funcName>;<pointName>;id=<boardId>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_tab`)

@AxisLabel(`id=ex_tab;xlabel=$x$;ylabel=$f{{x}}$`)

@Table(`n=3;x;f;P;id=ex_tab`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_tab`)

@AxisLabel(`id=ex_tab;xlabel=$x$;ylabel=$f{{x}}$`)

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
The formatting button directly beside the pointer is a two-step one-shot tool. Select the
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
The same line-tools submenu also provides rays, straight lines, and vectors. For a ray, the first selected
point is its endpoint and the second selected point determines its direction. A vector is drawn as
a finite arrow from the first selected point to the second selected point. Named endpoints produce
an automatic vector label such as `\overrightarrow{AB}`; otherwise a lowercase fallback such as
`\overrightarrow{a}` is used. The arrow spans the complete label.
The line-relations submenu sits between the line and shape tools and provides perpendicular,
parallel, midpoint, and angle-bisector constructions. For a perpendicular or parallel, select a
segment, ray, vector, or straight line and a point in either order; it creates the dynamically
linked straight line through that point and then switches itself off. The midpoint tool accepts
exactly two already existing points and creates an alphabetically named dependent point halfway
between them. Its object menu provides a Show coordinates checkbox for the dynamic coordinate
pair. The angle-bisector tool accepts three existing points in arm–vertex–arm order and
creates the dynamically linked internal angle-bisector line through the vertex.
The line, ray, vector, segment, perpendicular, parallel, polygon, circle, circular-sector, and angle tools reuse a nearby existing point or
automatically place a new alphabetically named DGS point when clicking an empty board position.
The polygon tool selects points in sequence. Selecting the first point again after at
least three distinct points closes the sequence and creates a movable polygon (for example,
`A → B → C → A` or `B → C → A → B`).
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
The final toolbar button opens an object list from the right. It contains every user-facing DGS
object with its name, type, color, and current visibility. Right-clicking an entry opens the
ordinary object-properties panel immediately to the left of the list, so both panels remain
usable at the same time. The horizontal axis shortens by the combined visible panel width, and
the open top menu moves both panels downward.
The adjacent analysis button opens a submenu for zeros, extrema, inflection points, the
ordinate-axis intercept, tangents, and intersections. All entries are one-shot construction
modes. The zero and
ordinate-axis-intercept tools accept a function graph, segment, ray, vector, or straight line;
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
lines, tangents, and circles; it creates every isolated visible crossing or contact point.
Viewport changes also
add or remove visible analysis points. All constructions participate in DGS undo/redo and can be
removed from their object menus.
Each zero point also offers Show value; enabling it adds the current x-value to its dynamic
label. Extremum and inflection points offer the same option and display their current coordinate
pair; an ordinate-axis intercept displays its current ordinate value.
Right-clicking a DGS point, segment, ray, vector, line, function, or polygon opens an object menu from the right. It can lock the
object and independently show or hide its name and visual representation; an open top menu
pushes this object menu downward. Point coordinates are applied on blur or Enter, and an
inline color palette with hue and hexadecimal controls recolors DGS objects.
`@DGS` automatically adds the regression drawing tools to the same board;
undo and redo remain permanently stacked below the hamburger button, so no additional
`@Regression` macro is required.
Regression analysis panels are stacked below these permanent controls.

Parameters: `<boardId>`

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=;ymax=;width=;id=ex_dgs`)

@DGS(`ex_dgs`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=;ymax=;width=;id=ex_dgs`)

@DGS(`ex_dgs`)



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

@Schar(`g;x;d{{x+b}}^2+c;A3;term=1;#ff00ff`)

@Schar(`p;x;ax^3+bx^2+cx+d;A3;term=1;#ff0000`)

@Schar(`r;x;ax^4+bx^3+cx^2+dx+f;A3;term=1;#55ff55`)
```

---

@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A3`)

@AxisLabel(`id=A3;xlabel=$x$;ylabel=$y$`)

@Schar(`g;x;d{{x+b}}^2+c;A3;term=1;#ff00ff`)

@Schar(`p;x;ax^3+bx^2+cx+d;A3;term=1;#ff0000`)

@Schar(`r;x;ax^4+bx^3+cx^2+dx+f;A3;term=1;#55ff55`)

## Sliding Function Family 3

          --{{0}}--
Legacy-style multi-family setup with sinus, exponential, and logarithmic parameterized functions.

``` markdown
@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A11`)

@AxisLabel(`id=A11;xlabel=$x$;ylabel=$y$`)

@Schar(`f;x;A sin{{b{{x+c}}}}+d;A11;term=1;#0077ff`)

@Schar(`h;x;A e^{{b{{x+c}}}}+d;A11;term=1;#00ff00`)

@Schar(`l;x;A ln{{b{{x+c}}}}+d;A11;term=1;#22aa66`)
```

---

@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A11`)

@AxisLabel(`id=A11;xlabel=$x$;ylabel=$y$`)

@Schar(`f;x;A sin{{b{{x+c}}}}+d;A11;term=1;#0077ff`)

@Schar(`h;x;A e^{{b{{x+c}}}}+d;A11;term=1;#00ff00`)

@Schar(`l;x;A ln{{b{{x+c}}}}+d;A11;term=1;#22aa66`)

## Sliding Function Family 4

          --{{0}}--
Legacy-style multi-family setup with square-root and reciprocal parameterized functions.

``` markdown
@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A11`)

@AxisLabel(`id=A11;xlabel=$x$;ylabel=$y$`)

@Schar(`k;x;A sqrt{{b{{x+c}}}}+d;A11;term=1;#ff9900`)

@Schar(`q;x;A/{{b{{x+c}}}}+d;A11;term=1;#ffff00`)

@Schar(`g;x;A/{{b{{x+c}}^2}}+d;A11;term=1;#0066ff`)
```

---

@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A11`)

@AxisLabel(`id=A11;xlabel=$x$;ylabel=$y$`)

@Schar(`k;x;A sqrt{{b{{x+c}}}}+d;A11;term=1;#ff9900`)

@Schar(`q;x;A/{{b{{x+c}}}}+d;A11;term=1;#ffff00`)

@Schar(`g;x;A/{{b{{x+c}}^2}}+d;A11;term=1;#0066ff`)



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

```` markdown
import:   https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md

script:   https://cdn.jsdelivr.net/gh/MINT-the-GAP/lia-coordinate@0.0.1/dist/index.js

@CoordinateSystem: @CoordinateSystem_(@0)
@Koordinatensystem: @CoordinateSystem_(@0)

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
    if (presetState) {
      try {
        const maxPresetWidth = C.getConstrainedAncestorWidth(jxgbox);
        const maxPresetHeight = C.clampHeight(presetState.height);
        const presetScale = Math.min(
          1,
          maxPresetWidth / presetState.width,
          maxPresetHeight / presetState.height
        );
        jxgbox.style.width  = Math.round(presetState.width * presetScale)  + 'px';
        jxgbox.style.height = Math.round(presetState.height * presetScale) + 'px';
      } catch (e) {}
    }
    try { jxgbox.style.visibility = 'hidden'; } catch (e) {}

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

@AxisLabel: @AxisLabel_(@uid,@0)
@AchsenBeschriftung: @AxisLabel_(@uid,@0)

@AxisLabel_
<span id="axis-title-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@CreatePoint: @CreatePoint_(@uid,@0,@1)
@ErzeugePunkt: @CreatePoint_(@uid,@0,@1)

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

@Point: @Point_(@uid,@0)
@Punkt: @Point_(@uid,@0)

@Point_
<span id="point-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@Strecke: @Distance_(@uid,@0,de)
@distance: @Distance_(@uid,@0,en)

@Distance_
<span id="distance-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Area: @Area_(@uid,@0,en)
@Flaeche: @Area_(@uid,@0,de)

@Area_
<span id="area-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@angle: @Angle_(@uid,@0,en)
@Winkel: @Angle_(@uid,@0,de)

@Angle_
<span id="angle-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Circle: @Circle_(@uid,@0,en)
@Kreis: @Circle_(@uid,@0,de)

@Circle_
<span id="circle-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@PlotFunction: @PlotFunction_(@uid,@0)
@PlotFunktion: @PlotFunction_(@uid,@0)

@PlotFunction_
<span id="plot-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@PlotInput: @PlotInput_(@uid,@0)
@PlotEingabeLatex: @PlotInput_(@uid,@0)

@PlotInput_
<div id="lia-plot-input-@0" data-spec="@1"></div>
@end

@Schar: @Schar_(@uid,@0)

@Schar_
<span id="schar-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@Rekonstruktion: @Rekonstruktion_(@uid,@0)
@Reconstruction: @Rekonstruktion_(@uid,@0)

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

@PointOnGraph: @PointOnGraph_(@uid,@0)
@PunktGraph: @PointOnGraph_(@uid,@0)

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

@PointsOnGraph: @PointsOnGraph_(@uid,@0)
@PunkteAufGraph: @PointsOnGraph_(@uid,@0)

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

@Table: @Table_(@uid,@0)
@Tabelle: @Table_(@uid,@0)

@Table_
<div id="lia-table-@0" data-spec="@1"></div>
@end
````
