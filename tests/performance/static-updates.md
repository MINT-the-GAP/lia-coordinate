# Static SVG update regression

Run the existing browser suite with `npm run test:browser`, or the focused test after building with `node --test tests/staticUpdates.browser.mjs`. Chrome/Edge and internet access for the genuine MathJax 3.2.2 components are required. `CHROME_PATH` / `EDGE_PATH` select the browser.

The fixture uses the three original Superposition diagrams from [profil10Lehrer.md](https://github.com/MINT-the-GAP/Wochenaufgabe/blob/main/ABs/Spezi/profil10Lehrer.md#superposition), captured in `tests/fixtures/static-superposition.json`: 16 vectors and 20 TeX labels including four axis titles. The test runs both shipped bundles, delays the real MathJax SVG component, and checks SVG, geometry and label identities.

For a manual check, serve the repository root, for example with `python -m http.server 8080 --bind 127.0.0.1`, then open:

- `http://127.0.0.1:8080/tests/fixtures/static-selective-updates.html`
- `http://127.0.0.1:8080/tests/fixtures/static-selective-updates.html?bundle=index`

Scroll, pinch to zoom on a touch device, and use the theme button. The document is a standalone test slide; it does not embed the entire LiaScript course.

## Recorded comparison (Chrome, 2026-09-14)

Both bundles produced the same key results. Counts refer to renderer work on these three diagrams.

| Scenario | Before | After |
| --- | --- | --- |
| 700 ms idle | 0 SVG replacements, 0 label measurements | 0 replacements, 0 measurements |
| 12 frame-paced unrelated root variable/class changes | 18 replacements, 120 getBBox + 120 getClientRects | 0 replacements, 0 measurements |
| One vector, text or board argument changed | All 3 SVGs replaced; 20 getBBox + 20 getClientRects | Only affected SVG replaced; 8 getBBox + 1 getClientRects |
| One vector/text change: document-wide marker searches | 5 | 1 |
| Actual light/dark theme change | All 3 SVGs replaced | Only the 2 diagrams with theme-dependent axes replaced |
| Repeated identical CSS value writes | 0 style MutationRecords in this browser | 0 style MutationRecords in this browser |
| Native emulated touch scroll and two-finger pinch | 0 replacements or label measurements | 0 replacements or label measurements |

The assertions also cover delayed real TeX availability, connected hidden slides, reveal/remount, preservation of the unaffected SVGs and labels, and the edited vector endpoint, TeX content and viewBox actually reaching the output. No JSXGraph boards are created. A full-bundle hybrid-host configuration change can additionally perform synchronous marker-claim initialization before the one shared bootstrap scan (up to three document-wide searches); vector/text edits require one shared search, regardless of the three boards.

The touch test dispatches actual CDP touch events and verifies both a nonzero document scroll offset and a visual viewport scale above 1. It does not infer successful gestures merely from dispatched synthetic DOM events.

There was no measured idle loop in the baseline. The repeated work followed unrelated real root mutations. Identical CSS writes are measured separately; their mutation behavior must not be generalized to all browsers.

These are headless desktop Chrome checks with touch emulation, not physical-device or frame-rate guarantees. Full-course interactions, Safari/Firefox and actual mobile hardware remain manual checks.

To compare another saved build without changing the repository, set `STATIC_UPDATE_BUNDLES` to a directory containing `static.js` and `index.js`. Set `STATIC_UPDATE_BASELINE=1` to record a pre-fix build without the new identity/work-count assertions; functional SVG/TeX and actual gesture checks remain active.
