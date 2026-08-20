<!--
author:   MINT-the-GAP, Martin Lommatzsch, Jihad Hyadi
version:  0.0.1
language: en
comment:  Lightweight static SVG subset of lia-coordinate without JSXGraph.

script:   ./dist/static.js

@CoordinateSystem: @StaticCoordinateSystem_(@uid,`@0`)
@Koordinatensystem: @StaticCoordinateSystem_(@uid,`@0`)

@StaticCoordinateSystem_
<div id="static-coordinate-@0" data-lia-static-coordinate-host data-spec="@1"></div>
@end

@Strecke: @StaticDistance_(@uid,`@0`,de)
@distance: @StaticDistance_(@uid,`@0`,en)

@StaticDistance_
<span id="distance-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

@Area: @StaticArea_(@uid,`@0`,en)
@Flaeche: @StaticArea_(@uid,`@0`,de)

@StaticArea_
<span id="area-spec-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
@end

-->

# lia-coordinate: lightweight static SVG import

This import is intended for courses whose coordinate systems contain only
fixed polygons and polylines. It loads `dist/static.js` and does not import or
download JSXGraph.

Use this file instead of the normal `README.md` import:

``` markdown
import: https://raw.githubusercontent.com/MINT-the-GAP/lia-coordinate/main/README.static.md
```

The equivalent jsDelivr URL is:

``` markdown
import: https://cdn.jsdelivr.net/gh/MINT-the-GAP/lia-coordinate@main/README.static.md
```

Every board must still opt in explicitly with `static=1` or `statisch=1`.
The lightweight import defines only `@CoordinateSystem` / `@Koordinatensystem`,
`@Area` / `@Flaeche`, and `@distance` / `@Strecke`. Both drawing macros require
direct coordinate lists. It intentionally provides no JSXGraph fallback and
must not be combined with the normal import.

``` markdown
@Koordinatensystem(`xmin=0;xmax=10;ymin=0;ymax=10;width=420;id=static_example;achsen=0;grid=0;border=0;statisch=1`)

@Flaeche(`static_example;[[2;2];[8;2];[5;8]];#e63946;0.35;linienstil=dashed`)

@Strecke(`static_example;[[1;1];[9;1];[9;9];[1;1]];#1d3557;;design=-;3px;linestyle=dashdotted`)
```

See the main [README](./README.md#static-svg-mode) for the complete supported
subset, the distinction from `border=0`, and migration guidance.
