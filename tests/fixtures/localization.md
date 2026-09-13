<!--
version: 1.0.0
language: en
mode: Presentation
script: /assets/mathjax.js
        /assets/jsxgraph-template.js
        /assets/dynflex.js
import: /coordinate.md
-->

# Coordinate controls: language regression

<section class="dynFlex" data-basis="49%">
<div class="flex-child">

@CoordinateSystem(`xmin=-4;xmax=7;ymin=-3;ymax=6;width=;id=languageBoard;achsen=1;grid=1;border=1`)
@Schar(`g;x;a*(x-b)^2+c;languageBoard;term=1;#b41f65`)

</div>
<div class="flex-child">

@CreatePoint(`languageBoard;A;2;3`,`<!-- -->`)

@PointOnGraph(`languageBoard;Q;f;2*x-1;0.05`)

@PointsOnGraph(`languageBoard;n=2;d=1;R;h;x-1;0.05`)

@Table(`n=2;x;f;T;id=languageBoard`)

@PlotInput(`languageBoard;u;#0055cc`)

</div>
</section>
