The Schar browser regression uses the exact parabola and reconstruction target supplied in the fix request. The HTML fixture mounts the real LiaTemplates `<jsx-graph>` component, and the Markdown fixture runs through an actual exported LiaScript application with `language: en`, `mode: Presentation`, and the two-column DynFlex layout. The browser server serves the working tree's `dist/index.js` as `/bundle.js`; `/coordinate.md` uses the current local macro definitions with that local script URL.

Run from the repository root with Node.js 24, a Chromium browser, and `tar` on PATH:

```text
node tests/browser/prepare-schar-assets.mjs
npm run build
node tests/scharInteractions.browser.mjs --before
node tests/scharInteractions.browser.mjs
```

`PROFILE_ASSETS` overrides the dependency cache (default: the system temporary directory's `lia-coordinate-profile-assets`). `LIASCRIPT_RUNTIME` overrides the application directory (default: `lia-coordinate-webexport/course` in the temporary directory). `CHROME_PATH` or `EDGE_PATH` chooses the browser executable. The preparation script downloads pinned files, checks their hashes, and extracts the browser assets from an integrity-checked npm package without installing or executing the exporter. An existing matching cached export can be reused. Preparation never downloads a replacement for the local coordinate bundle.

The application runtime is the web distribution included in `@liascript/exporter@2.6.32--0.16.10`. It is a reproducible integration target, not a claim that every deployed LiaScript version has been tested. Its official [npm tarball](https://registry.npmjs.org/@liascript/exporter/-/exporter-2.6.32--0.16.10.tgz) has integrity `sha512-oZqya+C+SPHl/3V2uoCaoOPBcOwIOY1Bx8317M23n3UpVPeVC0tvN00iEpWRY6XHIWzsvyKaLR+OuDX2Lpqcbg==`. The prepared index sets `window.LIA.defaultCourseURL` to `/course.md`; the test server also supports the previously exported fixture index. The runtime JavaScript and CSS checked by the preparation script byte-match the cached export used during development.

The remaining asset provenance is pinned below. Full SHA-256 hashes for JSXGraph, MathJax, DynFlex, Freeze, Timer, and the Freeze coordinate adapter are recorded in [the existing manifest](../performance/assets.json); the two additional full hashes are in [the preparation script](prepare-schar-assets.mjs).

| Asset | Repository/package revision | SHA-256 prefix |
| --- | --- | --- |
| `jsxgraph-template.js` | [LiaTemplates/JSXGraph `f426725`](https://github.com/LiaTemplates/JSXGraph/tree/f426725ff10580b5ebdcc3230a4ca31c415faadb) | `e753abd735baa6c6` |
| `mathjax.js` | `mathjax@3.2.2`, `es5/tex-chtml.js` | `0a6ded5abbce1333` |
| `dynflex.js` | [lia-DynFlex `c291e9b`](https://github.com/MINT-the-GAP/lia-DynFlex/tree/c291e9b7a6efbaa2aafb6b137b29ea42fcbfdd1f) | `f1e2622cb0b6cd69` |
| `freeze.js` | [lia-freeze-v2 `92c42db`](https://github.com/MINT-the-GAP/lia-freeze-v2/tree/92c42dbf83d4ec0cc5780074a8b17120505faee0) | `0a0ab034e0288d0bc` |
| `board-mode.js` | [lia-board-mode `5c473bd`](https://github.com/MINT-the-GAP/lia-board-mode/tree/5c473bd8c99a1bc052b39c073bb06c747bb932ee) | `e2b5b0a94af7ef31` |
| `annotation.js` | [lia-annotation `d7be96c`](https://github.com/MINT-the-GAP/lia-annotation/tree/d7be96c56ff84e50df4341632b448db3396d226e) | `d2173938ece888e5` |

The baseline is commit `8dcdbb50d410cea6b107388d4ef5f7e4dedf63cb`. [schar-before.json](schar-before.json) records the actual Chromium pointer diagnostics against its original browser bundle: the parabola has no drag graph, no Schar stylesheet exists in the board's ShadowRoot, and the displayed range height is approximately 6.6 pixels. In the final baseline with the corrected CDP gesture protocol, the first native drag produces 12 input events even though the panel capture guard hides its child pointerdown handler. The unrelated DOM mutation interrupts the next gesture after four input events by removing and replacing that input. This directly reproduces the lifecycle break. The panel capture guard also prevents its child pointerdown handler from being reached; that alone does not establish that every browser's native range default action is disabled. The baseline mouse gesture on the visible parabola leaves a=0.5, b=0, c=0 unchanged, pans the bounding box instead, and fails reconstruction. No ShadowRoot-to-body observer feedback loop is inferred from this run. The separate [Light DOM run](schar-light-dom.json) uses a real low-level JSXGraph board in the document and verifies one stylesheet, one panel, stable input identity, and no child-list feedback across repeated bootstrap/update cycles.

The fix preserves signed horizontal and vertical shift metadata, shares the live parameter model between the graph and native controls, initializes unchanged Schar markers idempotently, limits marker observation to relevant changes, and releases interactions when entries are replaced. Styles are installed once in the actual board root; usable range dimensions and bubble-phase event shielding preserve child handlers. Schar and regression panels share a measured stack under menu/undo/redo, with local-coordinate scaling, 10-pixel spacing, responsive width, and lifecycle-aware observation. The additional browser stack probe measured exactly 10 pixels between two real Schar panels, both expanded and after minimizing the first; unit tests cover mixed Schar/regression stacks. Regression's board capture handler uses the same composed event-path UI exclusion as DGS.

At the preceding Schar interaction checkpoint, all 212 unit tests and TypeScript checking passed. `npm run build` generated both browser bundles; `dist/static.js` remained byte-identical and the changed `dist/index.js` is included. The broader existing pointer-pan test also ran as `node tests/dynamicPanZoom.browser.mjs schar-check --interaction-only`; [its report](../performance/schar-check-interaction.json) records successful actual background pan, movable/fixed point checks, and DynFlex resize. Its separately recorded legacy limits remain: CDP wheel input does not exercise the legacy wheel path, Freeze's adapter point hydration is incomplete, restoring full DGS history loses macro points, and set-square pose ratios differ on restore. These are not successes claimed for this Schar fix.

Mouse input and browser-emulated touch/pen paths are distinguishable in the browser report. No physical pen or real touch hardware was available for validation.

The named `Wochenaufgabe/Alt/VortragJXS.md` file could not be fetched independently: the public repository's `main` and `master` raw paths returned 404, its `Alt` directory listing omitted that file, and its file-specific public commit query returned no entries on 2026-09-13. The fixture's mathematical text and macro calls therefore use the user-provided reproduction; the additional imports are the explicitly named lecture components at the recorded revisions. The original lecture file is unchanged.

The complete Chromium 152 interaction suite was rerun after localization, with the corrected gesture protocol, strict actual-viewer viewport equality, and replacement-model equality. It exited successfully and recorded **36 scenarios** in [schar-after.json](schar-after.json) against current bundle SHA-256 `583d1e7716d85ce8d2c21e1d5ccdd3fe05e6502b7658e7793a77beea619f78a6`. A separately started concurrent duplicate run hit a 30-second CDP evaluation timeout after the actual presentation check. A follow-up run completed successfully, including the native Check and slide revisit steps; its 35 recorded scenarios are retained separately in [schar-runtime.json](schar-runtime.json). No production change was made in response to that timeout.

| Acceptance area | Observed result |
| --- | --- |
| Native controls | Real mouse drags of a, b, and c continuously update the curve. The initial drag and the drag containing a foreign DOM change each record 12 native input events; input identity stays intact. Track clicks and keyboard input pass. |
| Exact parabola and signs | Dragging the curve right by 1 and down by 2 yields a=0.5, b=1, c=-2, preserves the viewport, hits S and P, and passes reconstruction. All four inner/outer sign combinations pass; the visible term updates too. Unit tests additionally cover the c/d families. |
| Interaction separation | Empty-background dragging pans without changing parameters. Normal graph interaction returns after drawing, erasing, and regression. The existing border=0 restriction remains. |
| Cancellation and lifecycle | Touch cancellation and release outside the board leave no active capture. Repeated bootstrap, specification changes, marker removal/reattachment, board replacement, minimization/restoration, and genuine LiaScript slide next/previous checks pass. |
| Layout | Measured menu/undo/redo clearance passes after DynFlex width changes, ancestor scaling, CSS zoom, and actual fullscreen enter/exit. Graph-coordinate conversion also passes under scaling and scrolling. |
| Actual viewer | With DynFlex, board-mode, annotation in cursor mode, and Freeze loaded, native range dragging remains continuous through a foreign DOM mutation. Clicking LiaScript's real Check button returns success; slide return preserves values and supports another correct graph drag. |
| Devices | Mouse, browser-emulated native touch range gestures, and an emulated pen graph path pass. Physical pen/touch devices were not tested. |

The runner waits for fonts and stable board geometry before locating pointer targets, performs an unpressed hover before pointer-down, and sends both `button: 'left'` and `buttons: 1` on held mouse moves, matching [Puppeteer's CDP mouse implementation](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/cdp/Input.ts). Earlier exploratory sequences omitted the explicit held button and intermittently lost native capture; those traces showed no input replacement, property changes, or JavaScript capture release and are not evidence of an additional addon defect. With the corrected protocol, [three fresh actual-viewer probes](schar-native-probe.json) each produce 12 input events and preserve input identity and the bounding box.

The foreign quiz-message probe is positioned outside document flow, so it tests lifecycle independently of scrollbar-induced page resizing; actual responsive resizing has separate assertions. CSS zoom and actual element fullscreen are covered. Browser-toolbar zoom and physical pen/touch hardware are outside this run.

Screenshots: [standalone board](schar-after.png), [actual LiaScript presentation with the solved parabola](schar-presentation-after.png).

The subsequent localization change is covered by a focused real-viewer regression:

```text
node tests/browser/prepare-schar-assets.mjs
npm run build
node tests/localization.browser.mjs
```

Both actual courses, parsed with `language: en` and `language: de`, passed in Chrome 152 with LiaScript 0.16.10. [localization.json](localization.json) records the result against bundle SHA-256 `583d1e7716d85ce8d2c21e1d5ccdd3fe05e6502b7658e7793a77beea619f78a6`, which matches the current `dist/index.js`. The final source checks passed all 220 unit tests, TypeScript checking, and both bundle builds.

The course runtime sets `document.documentElement.lang` to `en` or `de`; its user-interface setting `LIA.settings.data.lang` can differ from the course language. The fixture uses the ordinary public macros without language metadata. It asserts English/German labels for CreatePoint, PointOnGraph, PointsOnGraph, Schar, Table, and PlotInput, including Schar titles and accessible labels, table disabled tooltips, and plot placeholders, accessible labels, errors, and success text.

Native mouse clicks create all three point families and a table point at (2,3), plot `x^2`, and clear the graph. Native keyboard input changes the Schar coefficient to 1.1; clicks show its term, minimize, and restore its controls. Simulated in-place changes to the runtime's root `lang` attribute translate existing controls and status messages while preserving parameter values, point coordinates, table input, plotted expression, graph objects, term visibility, and panel state. All nine stored object-identity checks remain true. Explicit `data-language` metadata takes priority over the course language and survives further root-language changes; removing those overrides restores inheritance. This metadata mutation test does not claim to click LiaScript's translation-service menu.

Screenshots from the final focused run: [English controls](localization-en.png), [German controls](localization-de.png).

The final quiz-family regression uses the existing [DynFlex quiz fixture](../fixtures/dynFlexQuizFamilies.md), served with pinned local imports, textbook mode, and an explicit two-column basis. A small [area extension](../fixtures/quiz-area-extension.md) adds the second polygon-metric variant. Run it with:

```text
npm run test:quiz:browser
```

[quiz-families.json](quiz-families.json) records **eight successful incorrect/hint/correct paths and eight successful resolve paths**, covering all seven quiz families on the same current bundle `583d1e7716d85ce8d2c21e1d5ccdd3fe05e6502b7658e7793a77beea619f78a6`. The browser clicks LiaScript's real Check, Hint, and Resolve buttons through CDP. It asserts rejection of an incorrect answer, nonempty native hints, unchanged geometry after hints, native solved/resolved classes, disabled Check controls afterward, and the three point families' fixed point state. Resolve is exercised in a separate fresh course instance, after two wrong checks and the one-second solution timer; native extended solution text appears for every instance.

| Quiz family | Correct geometry | Check / Hint / Resolve |
| --- | --- | --- |
| CreatePoint | A=(1,1) | Pass |
| PointOnGraph | (1,1) on y=2x-1 | Pass |
| PointsOnGraph | (-1,-2), (0,-1), (1,0) on y=x-1 | Pass |
| Reconstruction | m=2, n=-1 | Pass |
| PolygonMetric: perimeter | Equilateral triangle, side 3, perimeter 9 | Pass |
| PolygonMetric: area | 3 by 2 rectangle, area 6 | Pass |
| Construction | Triangle with one 165-degree angle | Pass |
| Combined | 3 by 2 rectangle: four right angles, area 6, perimeter 10 | Pass |

This focused suite prepares deterministic coordinates in real JSXGraph point/polygon objects and prepares the Schar parameter model; polygons receive the same learner-polygon marker used by the validators. Point creation buttons are clicked natively. It does not call quiz validators directly or replace their return values. Consequently it verifies native quiz binding, evaluation, hints, solution text, and finalization, while the separate 36-scenario suite verifies Schar dragging and its real reconstruction Check. It is not a claim that all DGS drawing tools were exercised here. Exploratory native drawing in the original narrow three-column fixture encountered overlapping DGS toolbar targets, and point drags in the long scrolling fixture were not consistently precise; those interactions were excluded from the final quiz-validation method instead of changing production code.
