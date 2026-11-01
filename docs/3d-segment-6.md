# 3D Segment 6: analytic geometry, curves, surfaces, and loci

Segment 6 extends the existing typed 2D/3D scene. It does not introduce a
second renderer or a second object model. Mathematical definitions live in the
DOM-independent modules `analytic3d.ts`, `curve3d.ts`, `conic3d.ts`,
`surface3d.ts`, and `locus3d.ts`; JSXGraph objects are adapters owned by the
3D view and subsystem registries.

## Analytic geometry in space

The `3D+` flyout appears in a DGS while the board is in 3D mode. It groups
vector operations, scalar measurements and relations, helper constructions,
curves/surfaces/conics, curve and surface analysis, and loci. The flyout is
mounted directly on the DGS menu, including boards hosted in a Shadow DOM.

A right click on a Segment-6 object extends the existing DGS properties panel
with its source references, definitions, parameters, intervals, and current
result. Curve and surface components, parameters, intervals, and sampling
qualities can be changed there without replacing the logical object. Invalid
changes show a local error and restore the last valid definition. The same panel creates a point with exact `t` or
`(u,v)`, and opens the existing analysis, locus, and transformation tools.

Dependent vector operations comprise addition, subtraction, scalar
multiplication, negation, normalization, connecting vectors, projection onto a
vector or plane, cross product, and plane normals. Scalar results comprise
magnitude, dot and scalar triple products, distances, the standard acute or
right spatial angles in `[0, pi/2]` where orientation is irrelevant, and line/
plane/point incidence relations. Helper constructions cover point projections,
perpendiculars, common perpendicular segments, and existing spatial
intersections. Every result keeps stable source references and recomputes after
source motion or slider changes.

## Parametric curves

``` markdown
@Raumkurve(`space;c;t;cos(t);sin(t);t/4;-4*pi;4*pi;linecolor=#00dfe8;quality=120;objectid=helix`)
@Curve3D(`space;p;t;t;1/(t-1);0;-2;3;linecolor=#ff6688`)
```

The fields are board, name, parameter, `x(t)`, `y(t)`, `z(t)`, minimum,
maximum, followed by options. `params=[a=1;b=2]` supplies family start values;
live board sliders with the same names take precedence. Expressions use the
shared safe expression compiler, mathematical constants/functions, normalized
numbers, and no JavaScript `eval`.

Adaptive sampling has bounded depth and point counts. Invalid samples split a
curve, so poles and definition gaps are not connected. The evaluator rejects
non-finite coordinates before they reach JSXGraph. Camera or projection changes
reuse the mathematical samples and only update their projection.

A bound Point3D stores its intrinsic `t`; dragging uses bounded nearest-parameter
search. Required analysis objects are tangent vector, velocity vector, tangent
line, normal plane, and arc length over a finite subinterval. Derivatives use a
range-scaled central difference with one-sided boundary fallback. Arc length
uses bounded adaptive Simpson integration. The shared frame also computes
acceleration, curvature, principal normal, and binormal, but these three
advanced values are currently an API-level result rather than separate DGS
tools.

## Parametric surfaces

``` markdown
@Flaeche3D(`space;S;u;v;u;v;sin(u)*cos(v);-pi;pi;-pi;pi;fillcolor=#00dfe8;opacity=0.3;quality=24;qualityv=18`)
@Funktionsflaeche3D(`space;F;sin(u)*cos(v);-3;3;-3;3;quality=20`)
```

A general surface stores two parameter names, three component expressions, two
finite ranges, independent bounded mesh qualities, style, and a stable ID. The
function form represents `z=f(x,y)` with `x=u` and `y=v`. Cells touching an
invalid sample are omitted, which leaves a hole instead of sending `NaN` into
the renderer.

A surface-bound point stores `u` and `v`; dragging performs bounded local
back-projection and exact values can be supplied in the Point3D macro. Surface
analysis provides the tangent plane, both independent tangent directions
(`@FlaechentangenteU3D` and `@FlaechentangenteV3D`), and the normal vector at
`(u,v)`. Singular frames disappear until two independent partial derivatives
exist again.

## Dynamic spatial conics

``` markdown
@Kegelschnitt3D(`space;k;E;Zyl;linecolor=#ffffff;objectid=cut`)
@ConicSection3D(`space;q;P;Cone;linecolor=#ffd54f`)
```

The source plane and cylinder or cone remain live references. The typed result
stores the local plane frame and classifies empty, point, line, two lines,
circle, ellipse, parabola, or hyperbola. Hyperbolas own two stable branches.
Type changes replace visibility and geometry within the same registry entry, so
old branches do not remain on the board. Unbounded branches are clipped by a
finite parameter range derived from the 3D view scale.

The ordinary DGS intersection tool recognizes plane-cylinder and plane-cone
pairs and creates this same conic object. It therefore participates in object
properties, dependency deletion, Undo/Redo, and export like a conic entered in
the `3D+` dialog.

## Curve intersections

Finite-interval numeric root search supports Curve3D with planes, spheres, and
Polygon3D faces, and conic branches with spatial linear objects. It subdivides
the interval, refines sign changes and near-tangent minima, respects segment and
ray domains, and deduplicates geometrically identical roots. A curve contained
in a plane is classified as contained; no arbitrary representative point is
created.

## Spatial loci

``` markdown
@Ortskurve3D(`space;L;s;P;quality=96;linecolor=#ff00ff;objectid=locus`)
@Ortsflaeche3D(`space;M;s;t;P;quality=20;fillcolor=#00dfe8;objectid=locus-surface`)
```

A locus driver can be a slider, the intrinsic parameter of a point on a curve
or circle, or one component of a surface binding. A locus surface combines two
independent drivers. Sampling always restores every original driver value in a
`finally` path, batches board updates, skips invalid probes, and creates no
internal history entries or persistent timer. Qualities are capped at 512 curve
samples and 64 by 64 surface samples.

## 2D/3D bridge and transformations

The `2D graph as spatial curve` action converts an existing function, recognized
drawing/regression graph, or function family into `x=t`, `y=f(t)`, `z=0`.
Family start values are written into `params=[...]`; same-named sliders remain
live. Switching the board view preserves object IDs and three-dimensional
definitions.

Translation, point/line/plane reflection, axis rotation, and central dilation
accept Curve3D, conic curves, Surface3D, locus curves/surfaces, and their linear
analysis objects. Curve and surface transformations wrap their mathematical
evaluators; they do not copy the currently visible sample mesh.

## Persistence, export, and lifecycle

DGS snapshots store each Segment-6 registry key, source specification,
operation, parameter expressions/ranges, sampling quality, stable object ID,
visibility, fixation, labels, and style. Only objects created by the DGS recreate
their hidden source marker during Undo/Redo; authored macro markers stay owned
by the course DOM. Dependency deletion walks analytic sources, conic plane and
solid sources, and locus drivers/trace points transitively.

German and English export aliases include `@Raumkurve`/`@Curve3D`,
`@Flaeche3D`/`@Surface3D`, `@Kegelschnitt3D`/`@ConicSection3D`,
`@Ortskurve3D`/`@Locus3D`, `@Ortsflaeche3D`/`@LocusSurface3D`, and the analytic
macro family listed in the README macro block. Import is dependency-tolerant:
missing forward sources leave a marker pending without aborting other objects.
Bounded shared bootstrap retries stop after their dependency window; objects do
not own polling loops.

## Numeric and performance bounds

Coordinates and results must be finite. Geometry comparisons use scaled
central tolerances from the shared vector/plane modules. Curve quality is
clamped to 8–512; ordinary surface quality to 4–128 per axis; locus-curve
quality to 8–256 and locus-surface quality to 4–64 per axis. Root search, adaptive curve
sampling, derivatives, and arc integration all have fixed iteration or recursion
limits. Render objects are reused across source updates and a camera-only update
does not rebuild the mathematical definition.

General surface-surface intersection curves and arbitrary implicit algebraic
surfaces are outside Segment 6. Curvature, principal normal, and osculating
plane are not exposed as separate toolbar actions because the required school
workflow is already covered by point, tangent, normal plane, and arc length;
the typed curve frame retains the values for a later UI extension.

## Segment 7 boundary

Segment 7 owns 3D construction quizzes, automatic 3D grading, final cross-mode
polish, and final user-facing documentation. Segment 6 supplies the typed and
roundtrippable objects those features can evaluate.

## Verification

The focused checks are:

``` powershell
npx tsc --noEmit
node --test tests/segment6Geometry.test.mjs
npm run test:3d:browser
npm run test:dgs:browser
```

The Segment-6 browser scene verifies native Curve3D and Surface3D renderers,
dynamic conic type changes, intrinsic point bindings, curve/surface analysis,
independent surface qualities, context properties,
2D/3D view identity, marker lifecycle, the Shadow-DOM DGS flyout, dialog-created
objects, snapshot Undo/Redo, export, and wide/narrow layouts.