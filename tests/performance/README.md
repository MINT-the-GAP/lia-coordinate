Performanceprüfung vom 8. September 2026

Die Optimierung reduziert überflüssige Boardupdates, DOM-Mutationen und die im Chrome-Trace gemessene Laufzeit der RAF-Callbacks. Eine höhere Bildrate oder Behebung des im betroffenen Kurs beobachteten Ruckelns ist mit diesem lokalen Lauf nicht nachgewiesen. Pan/Zoom, bewegliche Punkte und alle öffentlichen Makros bleiben erhalten; `dist/index.js` wurde mit `npm run build` neu erzeugt.

Vor den Quelländerungen wurde ein echtes Chrome-Profil aufgenommen ([initial-before.json](initial-before.json)). Das unveränderte Ausgangsbundle wurde gesichert. Für den abschließenden Vergleich liefen anschließend beide Bundles mit identischer Fixture, JSXGraph und echtem MathJax erneut. Die Quellen, Revisionen und SHA256-Werte stehen in [assets.json](assets.json); die finalen Rohmesswerte in [before.json](before.json) und [after.json](after.json). Die zusätzliche frühere Integrationsmessung [before-integration.json](before-integration.json) gehört nicht zum finalen Zahlenvergleich.

Gemessen wurde mit Chrome 152.0.7977.82 unter Windows, headless, ohne GPU, JSXGraph 1.11.1, MathJax 3.2.2 und einem Browserfenster von 1100 × 1000 Pixeln. Die HTML-Fixture verwendet die tatsächliche Ausgabe der öffentlichen Makros des folgenden Ausschnitts:

```markdown
@Koordinatensystem(`xmin=-10;xmax=10;ymin=-10;ymax=10;width=700;id=A1`)
@AchsenBeschriftung(`id=A1;xlabel=$x$;ylabel=$y$`)
@Punkt(`A1;A;-5;-3;fix`)
@Punkt(`A1;B;4;-2;fix`)
@Punkt(`A1;D;-3;6;fix`)
@Punkt(`A1;C;-3;-8.5`)
@Punkt(`A1;M;-2;-8.5`)
@Punkt(`A1;E;-3;-1;fix`)
@Punkt(`A1;G;-7;-1;fix`)
@Punkt(`A1;F;-4;-8.5`)
@Punkt(`A1;P;1;-6;fix`)
```

Pro Variante: frische Navigation, 700 ms Beruhigungszeit, dann 180 RAF-Schritte. Die ersten 60 Schritte verschieben die Ansicht um drei x- und anderthalb y-Einheiten, die nächsten 60 verkleinern den Ausschnitt auf 65 %, die letzten 60 stellen die ursprüngliche Ansicht wieder her. Jeder Schritt ruft dieselben `setBoundingBox(..., true)`- und `update()`-Methoden des echten Boards auf. Die Variante mit beweglichem Punkt verschiebt C zusätzlich alle drei Schritte. Zustände von Menü und Werkzeug werden ausdrücklich geprüft. Gezählt werden Methodenaufrufe, keine geschätzten Zeichenvorgänge; `update` enthält auch Aufrufe innerhalb von `fullUpdate`, beide Zahlen dürfen daher nicht addiert werden. DOM-Mutationen werden direkt am Boardcontainer im Shadow DOM beobachtet. Die sieben Szenarien werden jeweils einmal gemessen; Zeitwerte sind keine statistisch abgesicherte Benchmarkserie.

| Szenario | fullUpdate vorher → nachher | DOM-Mutationen vorher → nachher | davon Geodreieck vorher → nachher |
|---|---:|---:|---:|
| Neun Punkte, Originalbeispiel | 360 → 180 | 63.962 → 52.596 | 0 → 0 |
| DGS-Menü zu, Geodreieck verborgen | 360 → 180 | 66.523 → 52.596 | 2561 → 0 |
| DGS-Menü offen, Geodreieck verborgen | 541 → 357 | 77.520 → 63.082 | 2561 → 0 |
| DGS-Menü offen, Geodreieck sichtbar | 541 → 357 | 77.520 → 65.315 | 2561 → 2233 |
| Beweglicher Punkt C | 360 → 180 | 67.182 → 53.255 | 2561 → 0 |
| Timer + DynFlex + Freeze, Werkzeug verborgen | 363 → 183 | 70.866 → 56.891 | 2609 → 0 |
| Timer + DynFlex + Freeze, Menü/Werkzeug sichtbar | 544 → 360 | 81.872 → 69.619 | 2609 → 2233 |

Beim Originalbeispiel entfallen 50 % der Vollupdates und 17,8 % der DOM-Mutationen. Das verborgene Geodreieck verursacht nachher keine Zeichenmutationen mehr. Die verbleibenden Vollupdates stammen hier aus dem regulären JSXGraph-Ansichtswechsel. Die Rohdateien enthalten zusätzlich `update`, Suspend/Unsuspend, Mutationsarten, Punktkoordinaten, Boundingbox und Browserfehler.

| Szenario | Frame-p95 in ms, vorher → nachher | mittlere synchrone Aktionszeit in ms, vorher → nachher | gesamte RAF-Callbackzeit im Trace in ms, vorher → nachher |
|---|---:|---:|---:|
| Neun Punkte, Originalbeispiel | 16,70 → 16,70 | 1,68 → 1,95 | 628,70 → 423,35 |
| DGS-Menü zu, Geodreieck verborgen | 16,70 → 16,70 | 2,08 → 2,53 | 813,21 → 572,61 |
| DGS-Menü offen, Geodreieck verborgen | 16,70 → 16,80 | 1,81 → 2,34 | 963,32 → 883,33 |
| DGS-Menü offen, Geodreieck sichtbar | 16,70 → 16,80 | 2,27 → 2,29 | 1108,32 → 877,24 |
| Beweglicher Punkt C | 16,70 → 16,70 | 2,08 → 2,56 | 820,13 → 603,89 |
| Timer + DynFlex + Freeze, Werkzeug verborgen | 16,80 → 16,70 | 2,10 → 2,55 | 915,36 → 638,24 |
| Timer + DynFlex + Freeze, Menü/Werkzeug sichtbar | 16,80 → 16,80 | 2,40 → 2,84 | 1298,53 → 1099,07 |

In allen finalen Varianten wurden vorher und nachher **0 Long Tasks über 50 ms** erfasst. Die Bildintervalle bleiben überwiegend am 60-Hz-Limit. In der sichtbaren Integrationsvariante gab es vorher ein einzelnes Frameintervall von 33,3 ms, nachher maximal 16,8 ms; daraus wird keine allgemeine Verbesserung der Framezeiten abgeleitet. Die synchronen Aktionszeiten sind teilweise höher: Sie messen nur den direkten Methodenaufruf, nicht die späteren Callback-Arbeiten. Auch diese Werte werden unverändert berichtet.

Die ergänzende [Trace-Auswertung](trace-summary.json) summiert abgeschlossene `FireAnimationFrame`-Ereignisse des Renderer-Hauptthreads. Beim Originalbeispiel sinkt diese Laufzeit von 628,704 auf 423,349 ms (32,7 %), mit den drei Templates und verborgenem Werkzeug von 915,364 auf 638,243 ms (30,3 %). Das sind Callback-Laufzeiten über das **gesamte Trace-Fenster einschließlich Vorbereitung, Menüöffnung und 700 ms Beruhigungszeit**, keine Bildintervalle. Die ebenfalls enthaltenen Ereignisfamilien `FunctionCall`, `TimerFire`, `Layout` und `UpdateLayoutTree` überlappen sich; ihre Laufzeiten dürfen nicht zusammengerechnet werden. Die großen Chrome-Rohtraces liegen außerhalb des Repositorys im Assetverzeichnis und lassen sich in DevTools öffnen.

Die in beiden Messdateien identische Fixture-SHA bezeichnet den Stand der Zeitmessung. Danach wurden nur Restoreprüfungen, ein optionaler Standalone-Instrumentaufbau (in den Timing-Szenarien inaktiv) und Dateiformatierung ergänzt; die Funktion runProfile blieb unverändert. Eine separate Kopie der damaligen kompletten HTML-Fixture wurde nicht archiviert. Diese Einschränkung der Artefakt-Reproduktion bleibt sichtbar; die aufgezeichneten Hashes und Messwerte wurden nicht nachträglich angepasst.

Die bestätigten Ursachen und Änderungen:

- [boardHelpers.ts](../../src/coord/boardHelpers.ts): Der Boundingbox-RAF rief auch bei Cachetreffern `suspendUpdate()`/`unsuspendUpdate()` auf. JSXGraph löst beim Unsuspend ein vollständiges Update aus. Jetzt werden Änderungen vorab je Achse und Tickobjekt ermittelt; adaptive Ticks und Stickylabels teilen einen Batch. Unveränderte Einstellungen sind ein No-op. Ein bereits suspendiertes Board wird nicht freigegeben; bei JSXGraphs wirkungslosem Suspend während `inUpdate` erfolgt kein unpaariges Unsuspend. Ersatz von Achsen/Ticks und fehlgeschlagene Setter werden berücksichtigt.
- [dgs.ts](../../src/subsystems/dgs.ts): Das verborgene Geodreieck berechnete und schrieb Linealpfad, Beschriftungen und Datenattribute weiter. Jetzt bleibt nur die numerische Pose aktuell; Rendering wird bis zum Einblenden aufgeschoben. Ausstehende Projektion wird vor Persistenz und Einblenden abgearbeitet, Größenänderungen behalten Verhältnis-Priorität. Sichtbare SVG-Textknoten werden wiederverwendet, `labels.innerHTML` entfällt.
- Die x/y-Menüachsen wurden unabhängig und ohne Vergleich in separaten RAFs angepasst. Jetzt werden beide Menümaße vor Schreibzugriffen gelesen und nur tatsächlich geänderte Endpunkte gemeinsam aktualisiert; öffnen, Schließen, Animationen und Wiederherstellung bleiben erhalten.
- Zirkel, Spuren, Slider und Koordinatenformeln verursachten wiederholte vollständige Board-Scans. [dgsUpdateTargets.ts](../../src/shared/dgsUpdateTargets.ts) führt aktive Objekte pro Board; Erzeugungs-, Änderungs- und Restorepfade einschließlich der Punkt-/Slider-Makros registrieren Änderungen. Indirekt gelöschte oder unter gleicher ID ersetzte Objekte werden entfernt. Inaktive Koordinatenformeln planen keinen RAF. Logarithmische Tickgeneratoren behalten ihre Identität und werden nur bei tatsächlichen Änderungen invalidiert. Root-Konstruktionen und geschlossene Objektlisten hatten bereits passende Guards.
- [axisTitle.ts](../../src/subsystems/axisTitle.ts) und [domUpdates.ts](../../src/shared/domUpdates.ts): Layoutmaße werden vor Änderungen gelesen; unveränderte Attribute und normalisierte CSS-Werte werden nicht erneut geschrieben. Externe Styleänderungen werden weiterhin erkannt und korrigiert.
- [quizDom.ts](../../src/shared/quizDom.ts): Der eigene globale Beobachter löste bei jeder Childlist-Mutation eine globale Quiz-Suche aus. Der neue Relevanzfilter berücksichtigt Quiz-/Quellenmarker, Einfügen/Entfernen und statische Claims; SVG-, Timer- und Feedbackänderungen lösen diese Suche nicht aus. Andere bereits passende Beobachterfilter bleiben erhalten. Keine fremden Template-Repositories wurden geändert.

Die Validierung umfasst `npm test` (**184/184**), `npx tsc --noEmit`, den vorgesehenen `npm run build` und `node --test tests/staticPerformance.browser.mjs tests/staticTex.browser.mjs` (**10/10**, kein Skip). Neue Verhaltenstests prüfen Suspend-Paarung, Tickersatz, gebündelte Menüachsen, SVG-Knotenidentität, No-op-Schreibzugriffe, aktive/inaktive Features, Objekt-/Boardersatz, Quiz-Neubindung und Geodreieckzustand. Dazu gehören verborgenes Pannen vor dem nächsten RAF, Resize-Priorität, Restore sowie ein gedrehtes/skaliertes Werkzeug außerhalb des Bilds mit anschließendem Einblenden. Der statische Build wurde mit ausgeführt und blieb inhaltlich unverändert.

Die funktionalen Chrome-Prüfungen sind von den deterministischen Profilen getrennt. Echte CDP-Zeigerbewegungen pannen das Board und ziehen C; ein fixierter Punkt bleibt unverändert. `Input.dispatchMouseEvent` mit `mouseWheel` erzeugt in dieser JSXGraph-Version im Fixture keinen Zoom, bereits im Ausgangsbundle. Der zusätzlich gesendete Legacy-`mousewheel`-Event erreicht JSXGraphs Wheelhandler und zoomt. Das ist kein erfolgreicher moderner CDP-Wheel-Nachweis. DynFlex-Größenänderungen sowie sichtbares/verborgenes Geodreieck wurden mit den echten drei Bundles geprüft.

Die Freeze-Prüfung verwendet den echten `captureCoordinateStates`/`restoreCoordinateStates`-Adapter mit Entfernen und Neuaufbau des öffentlichen Boardhosts. Sie umfasst **keinen vollständigen LiaScript-/Elm-Kursviewer und keinen echten Folienwechsel**. [known-integration-issues.json](known-integration-issues.json) und [before-interaction.json](before-interaction.json)/[after-interaction.json](after-interaction.json) dokumentieren identische bereits vorhandene Einschränkungen:

- Mit vollständiger DGS-Historie enthält der Snapshot neun Makropunkte; nach Adapter-Restore ist die Live-Punktregistry leer (9 → 0), vorher wie nachher. Im geprüften lokalen Pfad entfernt `__applyDgsHistory` über `clearDgsConstructionFromBoard` die Makropunkte; der Restore wartet anschließend auf diese fehlenden Makroobjekte.
- Ohne vollständige DGS-Historie schreibt der Adapter die gespeicherten Punktwerte zurück, verschiebt den bereits aus Markern erzeugten Live-Punkt C jedoch nicht. Der anschließend separat geprüfte öffentliche `restorePointFromSpec("A1;C")`-Hook stellt C korrekt wieder her. Der Hook-Test ist **kein** bestandener Adapter-Restoretest.
- Nach dem DynFlex-Resize und Remount verändert sich die Geodreieckposition im Adaptertest um ungefähr −1,74 px / −0,45 px. Die Drift und die gespeicherten Verhältniswerte sind vorher/nachher identisch. Sichtbarkeit, Winkel und Skalierung bleiben in dieser Browserprobe bei `true`, `0`, `1`; andere Winkel/Skalen decken die lokalen Verhaltenstests ab.
- Boundingbox und Timer-Endzeit bleiben erhalten; Timer wird nicht neu gestartet. Im lokalen Standalone-Hidden-Interaktionsschritt sinken Werkzeugmutationen von 17 auf 0.

Diese Befunde wurden weder als neue Regressionen noch als erfolgreiche vollständige Freeze-Kompatibilität ausgegeben. Änderungen an der Historienlogik oder den fremden Templates sind nicht Teil dieser Optimierung.

Reproduktion mit Node 24 und lokalem Chrome/Edge:

```powershell
npm run profile:dynamic -- prepare
npm run profile:dynamic -- before --skip-interaction
npm run build
npm run profile:dynamic -- after --skip-interaction
node tests/performance/summarize-traces.mjs
npm run profile:dynamic -- before --interaction-only
npm run profile:dynamic -- after --interaction-only
```

`prepare` lädt die gepinnten Assets aus [assets.json](assets.json), prüft deren SHA256 und gewinnt das Ausgangsbundle per `git show` aus der dort angegebenen Revision. `PROFILE_ASSETS` überschreibt das Arbeitsverzeichnis (Standard: Betriebssystem-Temp/`lia-coordinate-profile-assets`), `PROFILE_BUNDLE` ein abweichendes Bundle, `CHROME_PATH` bzw. `EDGE_PATH` den Browserpfad. Der Freeze-Adapter wird ausschließlich im Assetverzeichnis über das vorhandene TypeScript transpiliert. Keine zusätzliche Playwright-Abhängigkeit ist nötig. Der Profilrunner speichert große `before-<szenario>.trace.json`/`after-<szenario>.trace.json` ebenfalls dort. Die kompakten Ergebnisse in diesem Verzeichnis werden bei erneuten Aufrufen überschrieben; die Aufnahme `initial-before.json` bleibt separat erhalten. Bekannte Integrationsabweichungen werden strukturiert ausgegeben, nicht als fehlerfreie Wiederherstellung behauptet.
