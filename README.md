<!--
author:   MINT-the-GAP
version:  0.0.1
language: en
edit: true
narrator: US English Female
comment:  Interactive coordinate system plugin for LiaScript, powered by JSXGraph. Provides macros for coordinate planes, points, function plots, and value tables.

import:   https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md

script:   ./dist/index.js

@CoordinateSystem: @CoordinateSystem_(@0)

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
        jxgbox.style.width  = Math.round(presetState.width)  + 'px';
        jxgbox.style.height = Math.round(presetState.height) + 'px';
      } catch (e) {}
    }
    try { jxgbox.style.visibility = 'hidden'; } catch (e) {}

    // board.create() calls must be inline — jxgbox is only available in this fence.
    const board = JXG.JSXGraph.initBoard(jxgbox, {
      axis: false, showNavigation: false, showCopyright: false,
      boundingbox: presetState ? presetState.bbox.slice() : INITIAL_BBOX.slice(),
      keepaspectratio: true,
      zoom: { enabled: true, wheel: true, needShift: false, factorX: 1.15, factorY: 1.15 },
      pan:  { enabled: true, needShift: false, needTwoFingers: false }
    });

    C.buildStickyAxes(board, C.getNeutralColor());
    C.createGrid(board, C.getAccentColor());

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

@AxisLabel_
<span id="axis-title-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@CreatePoint: @CreatePoint_(@uid,@0,@1)

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

@Point_
<span id="point-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@PlotFunction: @PlotFunction_(@uid,@0)

@PlotFunction_
<span id="plot-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@PlotInput: @PlotInput_(@uid,@0)

@PlotInput_
<div id="lia-plot-input-@0" data-spec="@1"></div>
@end

@Schar: @Schar_(@uid,@0)

@Schar_
<span id="schar-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@Rekonstruktion: @Rekonstruktion_(@uid,@0)

@Rekonstruktion_
<span id="rek-spec-@0" data-spec="@1" style="display:none;"></span>

<div id="rek-check-@0">
[[!]]
<script modify="false">
  (() => {
    const node = document.getElementById('rek-spec-@0');
    const spec = node ? String(node.dataset.spec || '') : String.raw`@1`;

    if (typeof window.__checkRekonstruktionQuiz === 'function') {
      return window.__checkRekonstruktionQuiz('@0', spec);
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
  if (typeof window.__setupRekonstruktionQuiz === 'function') {
    window.__setupRekonstruktionQuiz('@0', spec);
  }
})();
</script>
@end

@PointOnGraph: @PointOnGraph_(@uid,@0)

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

@Table_
<div id="lia-table-@0" data-spec="@1"></div>
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
- `width` — initial width in pixels
- `id` — board identifier used to connect other macros to this board

``` markdown
@CoordinateSystem(`xmin=-7;xmax=7;ymin=-5;ymax=5;width=800;id=A1`)
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
Places a pre-defined point on the board. Add `fix` as a fifth parameter to make it immovable.
Useful for showing given points in a task without requiring student interaction.

``` markdown
@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_point`)

@AxisLabel(`id=ex_point;xlabel=$x$;ylabel=$y$`)

@Point(`ex_point;A;2;3`)
@Point(`ex_point;B;-3;-1;fix`)
```

---

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=ex_point`)

@AxisLabel(`id=ex_point;xlabel=$x$;ylabel=$y$`)

@Point(`ex_point;A;2;3`)
@Point(`ex_point;B;-3;-1;fix`)

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

## `@Rekonstruktion`

          --{{0}}--
Checks whether the currently adjusted graph matches a target function on a board.

Parameters: `<boardId>;<targetExpr>;<tolerance>`

``` markdown
@Rekonstruktion(`ex_schar;2x-1;0.1`)
```

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
        jxgbox.style.width  = Math.round(presetState.width)  + 'px';
        jxgbox.style.height = Math.round(presetState.height) + 'px';
      } catch (e) {}
    }
    try { jxgbox.style.visibility = 'hidden'; } catch (e) {}

    const board = JXG.JSXGraph.initBoard(jxgbox, {
      axis: false, showNavigation: false, showCopyright: false,
      boundingbox: presetState ? presetState.bbox.slice() : INITIAL_BBOX.slice(),
      keepaspectratio: true,
      zoom: { enabled: true, wheel: true, needShift: false, factorX: 1.15, factorY: 1.15 },
      pan:  { enabled: true, needShift: false, needTwoFingers: false }
    });

    C.buildStickyAxes(board, C.getNeutralColor());
    C.createGrid(board, C.getAccentColor());
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

@AxisLabel_
<span id="axis-title-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@CreatePoint: @CreatePoint_(@uid,@0,@1)

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

@Point_
<span id="point-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@PlotFunction: @PlotFunction_(@uid,@0)

@PlotFunction_
<span id="plot-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@PlotInput: @PlotInput_(@uid,@0)

@PlotInput_
<div id="lia-plot-input-@0" data-spec="@1"></div>
@end

@Schar: @Schar_(@uid,@0)

@Schar_
<span id="schar-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@Rekonstruktion: @Rekonstruktion_(@uid,@0)

@Rekonstruktion_
<span id="rek-spec-@0" data-spec="@1" style="display:none;"></span>

<div id="rek-check-@0">
[[!]]
<script modify="false">
  (() => {
    const node = document.getElementById('rek-spec-@0');
    const spec = node ? String(node.dataset.spec || '') : String.raw`@1`;

    if (typeof window.__checkRekonstruktionQuiz === 'function') {
      return window.__checkRekonstruktionQuiz('@0', spec);
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
  if (typeof window.__setupRekonstruktionQuiz === 'function') {
    window.__setupRekonstruktionQuiz('@0', spec);
  }
})();
</script>
@end

@PointOnGraph: @PointOnGraph_(@uid,@0)

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

@Table_
<div id="lia-table-@0" data-spec="@1"></div>
@end
````
