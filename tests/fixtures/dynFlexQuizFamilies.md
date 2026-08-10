<!--
author: lia-coordinate test suite
language: de
narrator: Deutsch Male
import: ../../README.md
import: https://cdn.jsdelivr.net/gh/LiaTemplates/JSXGraph@main/README.md
import: https://raw.githubusercontent.com/MINT-the-GAP/lia-timer/924ec0108780ea43e39519cabcaf4f3de8b7dee6/README.md
import: https://raw.githubusercontent.com/MINT-the-GAP/lia-DynFlex/9ef8f05c0eae8b51e183efbfe34c5b38e41488c8/README.md
-->

# Alle Quizfamilien in DynFlex

<section class="dynFlex">
<div class="flex-child">

## Punkt erzeugen

@CoordinateSystem(`xmin=-3;xmax=3;ymin=-3;ymax=3;width=360;id=q_create`)

@CreatePoint(`q_create;A;1;1`,`<!-- data-solution-timer="1s" data-solution-timer-start="oncheck" data-solution-timer-badge="off" data-hint-button="1" data-solution-button="2" -->`)
[[?]] Ziehe den Punkt nach $(1|1)$.
*****************
Der Zielpunkt ist $A(1|1)$.
*****************

</div>
<div class="flex-child">

## Polygonmetrik

@CoordinateSystem(`xmin=-1;xmax=5;ymin=-1;ymax=4;width=360;id=q_metric`)
@DGS(`q_metric;tools=[200;510]`)

@UmfangQuiz(`q_metric;3;9;0.1`,`<!-- data-solution-timer="1s" data-solution-timer-start="oncheck" data-solution-timer-badge="off" data-hint-button="1" data-solution-button="2" -->`)
[[?]] Addiere die drei Seitenlängen.
*****************
Eine mögliche Lösung ist ein gleichseitiges Dreieck mit Seitenlänge $3$.
*****************

</div>
<div class="flex-child">

## Konstruktion

@CoordinateSystem(`xmin=-4;xmax=4;ymin=-3;ymax=3;width=360;id=q_construction`)
@DGS(`q_construction;tools=[200;510;920]`)

@KonstruktionQuiz(`q_construction;3;offen;W165;winkeltoleranz=1`,`<!-- data-solution-timer="1s" data-solution-timer-start="oncheck" data-solution-timer-badge="off" data-hint-button="1" data-solution-button="2" -->`)
[[?]] $165^\circ$ liegt nahe an einem gestreckten Winkel.
*****************
Markiere am Scheitelpunkt $165^\circ$ und schließe das Dreieck.
*****************

</div>
<div class="flex-child">

## Kombiniertes Geometriequiz

@CoordinateSystem(`xmin=-1;xmax=5;ymin=-1;ymax=4;width=360;id=q_combined`)
@DGS(`q_combined;tools=[200;510]`)

@GeometrieQuiz(`q_combined;4;Konstruktion(offen;W90,W90,W90,W90);Flaeche(6;0.1);Umfang(10;0.1)`,`<!-- data-solution-timer="1s" data-solution-timer-start="oncheck" data-solution-timer-badge="off" data-hint-button="1" data-solution-button="2" -->`)
[[?]] Suche ein Rechteck mit Seitenlängen $2$ und $3$.
*****************
Ein Rechteck der Seitenlängen $2$ und $3$ erfüllt alle Bedingungen.
*****************

</div>
<div class="flex-child">

## Punkt auf Graph

@CoordinateSystem(`xmin=-3;xmax=3;ymin=-3;ymax=3;width=360;id=q_graph`)

@PunktGraphMitOptionen(`q_graph;A;f;2*x-1;0.05`,`<!-- data-solution-timer="1s" data-solution-timer-start="oncheck" data-solution-timer-badge="off" data-hint-button="1" data-solution-button="2" -->`)
[[?]] Für jeden Punkt gilt $y=2x-1$.
*****************
Zum Beispiel liegt $(1|1)$ auf dem Graphen.
*****************

</div>
<div class="flex-child">

## Mehrere Punkte auf Graph

@CoordinateSystem(`xmin=-3;xmax=3;ymin=-3;ymax=3;width=360;id=q_multi_graph`)

@PunkteAufGraphMitOptionen(`q_multi_graph;n=3;d=1;A;f;x-1;0.05`,`<!-- data-solution-timer="1s" data-solution-timer-start="oncheck" data-solution-timer-badge="off" data-hint-button="1" data-solution-button="2" -->`)
[[?]] Alle Punkte müssen $y=x-1$ erfüllen.
*****************
Mögliche Punkte sind $(0|-1)$, $(1|0)$ und $(2|1)$.
*****************

</div>
<div class="flex-child">

## Rekonstruktion

@CoordinateSystem(`xmin=-4;xmax=4;ymin=-4;ymax=4;width=360;id=q_reconstruction`)
@Schar(`f;x;m*x+n;q_reconstruction;term=1;#00ffff`)

@RekonstruktionMitOptionen(`q_reconstruction;2*x-1;0.1`,`<!-- data-solution-timer="1s" data-solution-timer-start="oncheck" data-solution-timer-badge="off" data-hint-button="1" data-solution-button="2" -->`)
[[?]] Bestimme Steigung und Achsenabschnitt.
*****************
Setze $m=2$ und $n=-1$.
*****************

</div>
</section>
