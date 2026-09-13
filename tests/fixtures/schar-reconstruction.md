<!--
author: MINT-the-GAP
version: 1.0.0
language: en
mode: Presentation
script: /assets/mathjax.js
        /assets/jsxgraph-template.js
        /assets/dynflex.js
        /assets/board-mode.js
        /assets/annotation.js
        /assets/freeze.js
import: /coordinate.md
-->

# Reconstruction: adjust the graph

<section class="dynFlex" data-basis="49%">
<div class="flex-child">

@CoordinateSystem(`xmin=-4;xmax=7;ymin=-3;ymax=6;width=;id=koordRekonstruktion;achsen=1;grid=1;border=1`)
@Schar(`g;x;a*(x-b)^2+c;koordRekonstruktion;term=1;#b41f65`)
@Point(`koordRekonstruktion;S;1;-2;#ff00ff;1;fix`)
@Point(`koordRekonstruktion;P;3;0;#ff00ff;1;fix`)

</div>
<div class="flex-child">

**Adjust** the parabola to have vertex $S(1,-2)$ and pass through $P(3,0)$.

@ReconstructionWithOptions(`koordRekonstruktion;0.5*(x-1)^2-2;0.1`,`<!-- data-hint-button="1" data-solution-button="3" -->`)

</div>
</section>

# Another slide

Return to the previous slide to verify board and parameter restoration.
