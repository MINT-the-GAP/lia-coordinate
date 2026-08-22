<!--
author:   MINT-the-GAP, Martin Lommatzsch, Jihad Hyadi
version:  0.0.3
language: en
comment:  Lightweight static SVG subset of lia-coordinate without JSXGraph.

script:   ./dist/static.js

@CoordinateSystem: @StaticCoordinateSystem_(@uid,`@0`)
@Koordinatensystem: @StaticCoordinateSystem_(@uid,`@0`)

@StaticCoordinateSystem_
<div id="static-coordinate-@0" data-lia-static-coordinate-host data-spec="@1"></div>
@end

@AxisLabel: @StaticAxisLabel_(@uid,`@0`)
@AchsenBeschriftung: @StaticAxisLabel_(@uid,`@0`)

@StaticAxisLabel_
<span id="axis-title-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@Point: @StaticPoint_(@uid,`@0`)
@Punkt: @StaticPoint_(@uid,`@0`)

@StaticPoint_
<span id="point-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@CoordText: @StaticCoordText_(@uid,`@0`)
@KoordText: @StaticCoordText_(@uid,`@0`)

@StaticCoordText_
<span class="lia-coord-text-spec" id="coord-text-spec-@0" data-spec="@1" style="display:none;"></span>
@end

@Strecke: @StaticDistance_(@uid,`@0`,de)
@distance: @StaticDistance_(@uid,`@0`,en)

@StaticDistance_
<span id="distance-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Line: @StaticLine_(@uid,`@0`,en)
@Gerade: @StaticLine_(@uid,`@0`,de)

@StaticLine_
<span id="linear-spec-@0" data-spec="@1" data-kind="line" data-language="@2" style="display:none;"></span>
@end

@Ray: @StaticRay_(@uid,`@0`,en)
@Strahl: @StaticRay_(@uid,`@0`,de)

@StaticRay_
<span id="linear-spec-@0" data-spec="@1" data-kind="ray" data-language="@2" style="display:none;"></span>
@end

@Vector: @StaticVector_(@uid,`@0`,en)
@Vektor: @StaticVector_(@uid,`@0`,de)

@StaticVector_
<span id="linear-spec-@0" data-spec="@1" data-kind="vector" data-language="@2" style="display:none;"></span>
@end

@Arc: @StaticArc_(@uid,`@0`,en)
@Bogen: @StaticArc_(@uid,`@0`,de)

@StaticArc_
<span id="arc-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Perpendicular: @StaticRelationObject_(@uid,`@0`,orthogonal,en)
@Orthogonale: @StaticRelationObject_(@uid,`@0`,orthogonal,de)
@Parallel: @StaticRelationObject_(@uid,`@0`,parallel,en)
@Parallele: @StaticRelationObject_(@uid,`@0`,parallel,de)
@Midpoint: @StaticRelationObject_(@uid,`@0`,midpoint,en)
@Mittelpunkt: @StaticRelationObject_(@uid,`@0`,midpoint,de)

@StaticRelationObject_
<span id="relation-spec-@0" data-spec="@1" data-kind="@2" data-language="@3" style="display:none;"></span>
@end

@Area: @StaticArea_(@uid,`@0`,en)
@Flaeche: @StaticArea_(@uid,`@0`,de)

@StaticArea_
<span id="area-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@angle: @StaticAngle_(@uid,`@0`,en)
@Winkel: @StaticAngle_(@uid,`@0`,de)

@StaticAngle_
<span id="angle-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Circle: @StaticCircle_(@uid,`@0`,en)
@Kreis: @StaticCircle_(@uid,`@0`,de)

@StaticCircle_
<span id="circle-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@CircularSector: @StaticCircularSector_(@uid,`@0`,en)
@Sector: @StaticCircularSector_(@uid,`@0`,en)
@CircleSegment: @StaticCircularSector_(@uid,`@0`,en)
@CircularSegment: @StaticCircularSector_(@uid,`@0`,en)
@Kreissektor: @StaticCircularSector_(@uid,`@0`,de)
@Kreissegment: @StaticCircularSector_(@uid,`@0`,de)

@StaticCircularSector_
<span id="sector-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@PlotFunction: @StaticPlotFunction_(@uid,`@0`)
@PlotFunktion: @StaticPlotFunction_(@uid,`@0`)

@StaticPlotFunction_
<span id="plot-spec-@0" data-spec="@1" style="display:none;"></span>
@end

-->

# lia-coordinate: lightweight static SVG import

This import renders the supported fixed and statically resolvable
`lia-coordinate` objects as one native responsive SVG. It loads
`dist/static.js` and does not import or download JSXGraph.

Use this file instead of the normal `README.md` import:

``` markdown
import: https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/main/README.static.md
```

For a reproducible course, pin this release:

``` markdown
import: https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/0.0.3/README.static.md
```

The equivalent jsDelivr URL is:

``` markdown
import: https://cdn.jsdelivr.net/gh/MINT-the-GAP/lia-coordinate@main/README.static.md
```

Every board must still opt in explicitly with `static=1` or `statisch=1`.
The lightweight import defines only the static macro aliases listed below. It
has no JSXGraph fallback and must not be combined with the normal import.

## Fixed-point registry

`@Point` / `@Punkt` accepts the normal
`board;name;x;y;color;opacity;fix` form when both coordinates are finite
numeric literals. For each board, these authored coordinates form an immutable
name-to-coordinate registry for the current SVG render. Static mode freezes
such a point even when `fix` is omitted.

`opacity=0` hides the point marker and label but does not remove the point
from the registry. Likewise, a terminal `=0` hides only the displayed name:
`A=0` remains referenceable as `A`. Expressions and runtime bindings such as
`xexpr=...`, `yexpr=...`, `parameter=...`, and `param=...` are rejected.

Named references in the supported macros resolve only against these directly
authored literal points on the same board. Static mode does not register
derived points or objects. In particular, a rendered midpoint is not available
to a later macro, and names assigned to lines, circles, sectors, or other
objects are labels rather than dependency targets.

## Supported objects

- `@AxisLabel` / `@AchsenBeschriftung` renders `xlabel` and `ylabel`.
  When axes are enabled, the SVG also supplies stable axis arrowheads,
  automatically spaced ticks, and numeric tick labels.
- `@Point` / `@Punkt` renders each accepted literal fixed point and creates
  the registry entry described above.
- `@CoordText` / `@KoordText` places text at one direct coordinate.
- `@distance` / `@Strecke` and `@Area` / `@Flaeche` accept either direct
  coordinate lists or names from the fixed-point registry. Segment names and
  `length=1` labels are rendered. Polygon measurements requested with
  `inhalt=1` / `area=1` and `umfang=1` / `perimeter=1` are rendered at
  the polygon center.
- `@Line` / `@Gerade`, `@Ray` / `@Strahl`, and `@Vector` / `@Vektor`
  accept exactly two direct coordinates or two fixed-point names. Lines and
  rays are clipped to the board; vectors retain their endpoint arrow. Visible
  object names are rendered.
- `@Arc` / `@Bogen` accepts direct endpoints or fixed-point names and
  retains caption, design arrows, end caps, width, visibility, and line style.
- `@Midpoint` / `@Mittelpunkt` accepts a direct or named point pair and can
  render its name and `wert=1` / `value=1` coordinate label. The result is
  deliberately not inserted into the fixed-point registry.
- `@Perpendicular` / `@Orthogonale` and `@Parallel` / `@Parallele`
  accept a direct base pair or a pair of fixed-point names plus a direct or
  fixed through-point. A base object name such as an earlier line name is not
  resolved in static mode.
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
  and the third its end direction. The segment names remain compatibility
  aliases for a sector; they do not switch to a chord-bounded circular segment.
  Names, area, and perimeter measurements are retained.
- `@PlotFunction` / `@PlotFunktion` accepts a self-contained expression
  using `x`, the built-in constants, and supported built-in mathematical
  functions. The shared safe expression compiler is used without slider,
  parameter, custom-variable, external-function, or previously defined
  function bindings.
  Deterministic sampling clips the graph to the board and splits paths at
  non-finite values and detected discontinuities instead of bridging poles.

Names ending in `=0`, and `name=0` where the macro supports it, suppress
only the visible label. German measurement macros retain decimal commas and
`FE` / `LE`; English macros retain decimal points and `AU` / `LU`.
Plain and dollar-delimited text use a safe readable SVG fallback without
loading MathJax; complex TeX remains readable source text rather than fully
typeset output.

Color, opacity, `visible=0` / `sichtbar=0`, line width, designs, and
`linestyle=solid|dashed|dotted|dashdotted` (German:
`linienstil=...`) are retained where the corresponding public macro accepts
them. Supported objects keep their course-source drawing order.

## Remaining dynamic-only features

`@CreatePoint` / `@ErzeugePunkt`, tangents, sliders, plot input, function
families, function and object analysis points, DGS, regression,
reconstruction, tables, point-on-graph tasks, and all coordinate/construction
quiz macros remain interactive and are not part of the lightweight import.
Remove `static=1` / `statisch=1` and use the normal `README.md` import when
a board needs any of them.

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

See the main [README](./README.md#static-svg-mode) for the distinction from
`border=0` and for the full interactive import.
