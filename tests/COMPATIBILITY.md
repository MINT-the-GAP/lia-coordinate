# Browser compatibility stress test

Run the complete build, historical target audit and runtime matrix with:

```sh
npm run test:compat:install
npm run test:compat
```

The installation command is needed once per Playwright version (and on a fresh
machine) to download its matching Chromium, Firefox and WebKit binaries.

Use `COMPAT_PROFILE` to run one or more matching profiles while diagnosing a
failure, for example `COMPAT_PROFILE=ios-safari npm run test:compat` on shells
that support inline environment variables. On PowerShell use:

```powershell
$env:COMPAT_PROFILE='ios-safari'
node tests/compatibilityStress.browser.mjs
```

## Five-year boundary

The production bundle targets browser releases from the five-year window that
starts in November 2021:

- Chrome, Chromium and Edge 96+
- Firefox 94+
- Safari and iOS Safari 15.2+
- the Browserslist representations of Android Chrome and Android Firefox

`compatibilityTargets.test.mjs` resolves the complete version list, parses the
production bundle with Babel and transpiles a modern-syntax probe for that
boundary. Parcel still performs the production bundling; Babel is an
independent compatibility audit and is not inserted into the runtime.

## Runtime matrix

`compatibilityStress.browser.mjs` executes 27 supported OS/browser profiles.
It covers Windows 10, Windows 11, macOS, iOS and Android with Edge, Chrome,
Brave, Chromium, Firefox and Safari wherever that browser product exists.

Each profile checks:

- 3D initialization and rendering;
- finite axis metrics and SVG geometry;
- pan, camera rotation and zoom;
- repeated 2D/3D switching;
- exclusive opening of the geometry submenus;
- stable object coordinates during camera operations;
- bounded DOM growth and failed local resources;
- browser/page errors and requestAnimationFrame stalls.

The evidence labels in the report are intentional:

- `installed-browser`: the installed Chrome or Edge binary on the host;
- `engine-os-profile`: a real current browser engine with an emulated OS
  viewport and user agent;
- `webkit-os-profile` / `webkit-device-profile`: WebKit compatibility coverage,
  not an Apple-signed Safari binary;
- `chromium-family-profile`: Chromium behavior for Brave; Brave Shields and
  other Brave-specific features are not emulated.

The installed Firefox additionally gets a headless rendering smoke test.
Interactive Firefox coverage uses Playwright's instrumented Firefox build.

## Honest limits

Browser-visible OS and device parameters do not virtualize a Windows 11,
macOS, iOS or Android kernel. Historical browser binaries are not executed;
their syntax boundary is covered by Browserslist/Babel. A release-grade claim
for exact physical devices and signed Safari/Brave builds still requires an
external device lab such as BrowserStack, Sauce Labs or equivalent hardware.

Unsupported combinations are reported rather than silently simulated:
current Safari on Windows, Safari on Android and a standalone iOS Chromium
binary that is not available to this local Windows harness.
