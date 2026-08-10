<!--
author:   MINT-the-GAP
version:  1.0.0
language: de
comment:  Parser regression for a timed construction quiz with an adjacent hint and detailed solution inside an HTML layout container.

import:   ../../README.md
-->

# Konstruktionsquiz mit Hinweis und Lösung

<div class='flex-child'>

**$f)\;\;$** **Zeichne** ein Dreieck mit einem Innenwinkel von $165^\circ$.

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=520;id=L602W1f;0;0;1`)
@SetSquare(`L602W1f`)
@DGS(`L602W1f;tools=[200;510;920]`)

**Prüfe**, ob deine Konstruktion den geforderten Winkel enthält.

@KonstruktionQuiz(`L602W1f;3;offen;W165;winkeltoleranz=1`,`<!-- data-solution-timer="180s" data-solution-timer-start="oncheck" data-solution-timer-badge="off" data-hint-button="2" data-solution-button="3" -->`)
[[?]] Es gilt $165^\circ=180^\circ-15^\circ$. Der Winkel liegt deshalb nahe an einem gestreckten Winkel.
*****************
Markiere am Scheitelpunkt $165^\circ$, setze den dritten Eckpunkt auf den markierten Strahl und schließe das Dreieck. Die beiden übrigen Innenwinkel haben zusammen nur $15^\circ$.
*****************

</div>
