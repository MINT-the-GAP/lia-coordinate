<!--
author:   lia-coordinate browser test
language: de
mode:     Presentation

script:   ./assets/jsxgraph-template.js
          ./dist/index.js

@CoordinateSystem: @CoordinateSystem_(@uid,`@0`)
@Koordinatensystem: @CoordinateSystem_(@uid,`@0`)

@CoordinateSystem_
<lia-coordinate-board data-lia-coordinate-key="@0" data-spec="@1"></lia-coordinate-board>
@end

@DGS: @DGS_(@uid,`@0`,@language)

@DGS_
<span id="dgs-ui-@0" data-spec="@1" data-language="@2" style="display:none;"></span>
<script modify="false">
(function setupDgs(retries){
  if (typeof window.__setupDGS === 'function') {
    window.__setupDGS('@0', '@1', '@2');
    return;
  }
  if (retries < 120) window.setTimeout(function(){ setupDgs(retries + 1); }, 50);
})(0);
</script>
@end

@Geodreieck: @DGSInstrument_(@uid,`@0`,set-square,@language)

@DGSInstrument_
<span id="dgs-instrument-ui-@0" data-spec="@1" data-instrument="@2" data-language="@3" hidden aria-hidden="true"></span>
<script modify="false">
(function setupInstrument(retries){
  if (typeof window.__setupDGSInstrument === 'function') {
    window.__setupDGSInstrument('@0', '@1', '@2', '@3');
    return;
  }
  if (retries < 120) window.setTimeout(function(){ setupInstrument(retries + 1); }, 50);
})(0);
</script>
@end

@Vollbildnotiz: @FullscreenNote_(@uid,`@0`,```@1```,de)
@FullscreenNote: @FullscreenNote_(@uid,`@0`,```@1```,en)

@FullscreenNote_
<div id="fullscreen-note-start-@0" class="lia-fullscreen-note-start" data-board-id="@1" data-language="@3" hidden aria-hidden="true"></div>

@2

<div id="fullscreen-note-end-@0" class="lia-fullscreen-note-end" hidden aria-hidden="true"></div>
@end
-->

# Vollbildnotiz: echte LiaScript-Integration

@CoordinateSystem(`xmin=-5;xmax=5;ymin=-4;ymax=4;width=800;id=A1`)
@DGS(`A1`)
@Geodreieck(`A1`)
@Vollbildnotiz(`A1`,```**Aufgabe:** Zeichne die Funktion \(f(x)=2x+1\).

- Markiere den y-Achsenabschnitt.
- Nutze anschließend die Steigung.```)

@Vollbildnotiz(`A1`,`**Zusatz:** Begründe dein Vorgehen.`)

@Vollbildnotiz(`A1`,```**Mathematischer Hinweis:** Untersuche auch $g(x)=x^2$.

1. Bestimme den Scheitelpunkt.
2. Vergleiche die Ordinatenabschnitte.
3. Beschreibe die Symmetrie.
4. Prüfe einen positiven Funktionswert.
5. Prüfe einen negativen Funktionswert.
6. Vergleiche beide Steigungen.
7. Markiere einen weiteren Punkt.
8. Kontrolliere die Skalierung.
9. Begründe die Lage des Graphen.
10. Formuliere das Ergebnis.```)

@CoordinateSystem(`xmin=-4;xmax=4;ymin=-3;ymax=3;width=600;id=B2`)
@DGS(`B2`)
@FullscreenNote(`B2`,`**Task:** Check the independent second board.`)

---

# Zweite Folie

Diese Folie prüft das saubere Entfernen und erneute Rendern der Vollbildnotizen.
