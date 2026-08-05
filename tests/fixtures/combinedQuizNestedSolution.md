<!--
author:   MINT-the-GAP
version:  1.0.0
language: de
comment:  Parser regression for a combined geometry quiz with a detailed solution inside an HTML layout container.

import:   ../../README.md
-->

# Combined quiz inside a flex child

<div class='flex-child'>

@GeometrieQuiz(`nested-combined;4;Konstruktion(offen;W90,W90,W90,W90;winkeltoleranz=1);Flaeche(15;0.05);Umfang(16;0.05)`,`<!-- data-solution-timer='5s' data-solution-timer-start='oncheck' data-solution-timer-badge='off' data-hint-button='2' data-solution-button='3' -->`)

[[?]] Konstruiere ein Rechteck mit den Seitenlängen 5 LE und 3 LE.
****************
Eine mögliche Konstruktion hat die Eckpunkte
$A(1|1)$, $B(6|1)$, $C(6|4)$ und $D(1|4)$.
****************

</div>
