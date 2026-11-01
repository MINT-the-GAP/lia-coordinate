# 3D Segment 5: polygons, solids, intersections, and transformations

Segment 5 extends the typed 3D scene with planar spatial polygons, seven solid
constructors, intersections with their bounded geometry, surface-bound points,
and six source-driven similarities. The mathematical modules
`src/shared/polygon3d.ts`, `src/shared/solid3d.ts`, and
`src/shared/transform3d.ts` do not depend on the DOM or JSXGraph. Rendering,
hit testing, registries, and cleanup remain in `src/coord/view3d.ts` and
`src/coord/transform3dObjects.ts`.

## Spatial polygons

A Polygon3D references at least three Point3D objects. Its vertices must be
finite, coplanar, non-repeated, and form a simple non-zero-area boundary.
Concave polygons are valid; self-intersecting polygons and non-coplanar source
sets are temporarily undefined. Source motion recalculates the carrier plane,
orientation, centroid, area, perimeter, edges, and renderer geometry.

``` markdown
@Vieleck3D(`space;F=1;A;B;C;D;linecolor=#00a6a6;fillcolor=#00dfe8;opacity=0.25;measure=area;objectid=base`)
@Polygon3D(`space;G;E;F;G;value=1;measure=perimeter`)
```

`measure=area|perimeter` selects the displayed value. A Point3D can be bound to
the polygon with `auf=F;u=...;v=...`. The local plane coordinates remain fixed
when the polygon moves. Dragging projects onto the finite polygon and clamps to
its boundary when necessary.

## Solids

All solid definitions keep live references to their sources:

| Solid | Sources after board ID and name |
| --- | --- |
| Tetrahedron / Tetraeder | four Point3D names |
| Pyramid / Pyramide | Polygon3D base, Point3D apex |
| Prism / Prisma | Polygon3D base, Vector3D translation |
| Parallelepiped / Spat | Point3D origin, three Vector3D edge vectors |
| Cuboid / Quader | Point3D origin, three pairwise orthogonal Vector3D edges |
| Cylinder / Zylinder | Point3D base center, Point3D top center, `radius=...` |
| Cone / Kegel | Point3D base center, Point3D apex, `radius=...` |

``` markdown
@Tetraeder3D(`space;T=1;A;B;C;D;measure=volume;fillcolor=#ff6688`)
@Pyramide3D(`space;P;F;S;measure=height;fillcolor=#ffaa00`)
@Prisma3D(`space;R;F;v;measure=surface;fillcolor=#42d66b`)
@Spat3D(`space;Sp;O;u;v;w;fillcolor=#8d7cff`)
@Quader3D(`space;Q=1;O;ex;ey;ez;measure=surface;fillcolor=#00dfe8`)
@Zylinder3D(`space;Z;O;H;radius=1.5;measure=volume;fillcolor=#42d66b`)
@Kegel3D(`space;K;O;S;radius=2;measure=base;fillcolor=#ffaa00`)
```

The exact mathematical model provides volume and surface area. Pyramid, prism,
cylinder, and cone also expose base area and height where applicable. Round
solids use exact formulas and intersections; only their visible surface mesh is
a 16-facet approximation.

Degenerate tetrahedra, coplanar pyramid apexes, base-parallel prism vectors,
linearly dependent Spat vectors, non-orthogonal Quader vectors, coincident axis
points, and non-positive radii evaluate to `null`. Their renderers hide until
the sources become valid again.

A point bound to a polyhedron stores `surface=face;face=<index>;u=...;v=...`.
Cylinder and cone bindings use a named surface with normalized parameters such
as `surface=side;angle=...;height=...` or `surface=base;angle=...;radial=...`.
The parameters, rather than a sampled screen location, survive source motion.

## Intersections

The targeted Intersection3D tool additionally supports:

| Sources | Result |
| --- | --- |
| line/ray/segment/vector - Polygon3D | no point or one finite-face point |
| line/ray/segment/vector - polyhedron | zero, one, or two stable point branches |
| line/ray/segment/vector - cylinder/cone | zero, one, or two stable point branches |
| plane - polyhedron | empty, point, segment, or section Polygon3D |

Linear domains are honored, repeated tangent hits are merged, and branch IDs
remain stable. A plane section of a cylinder or cone would be a general conic;
that intersection is deliberately deferred until spatial conics are part of the
scene model.

## Transformations

Every transformation creates a dependent object of the same supported source
type. Point3D, linear objects, planes, circles, spheres, Polygon3D, and all
Segment-5 solids are supported.

| Macro | Reference | Parameter |
| --- | --- | --- |
| `@Verschiebung3D` | Vector3D | none |
| `@Punktspiegelung3D` | Point3D center | none |
| `@Geradenspiegelung3D` | spatial linear axis | none |
| `@Ebenenspiegelung3D` | Plane3D | none |
| `@Achsendrehung3D` | spatial linear axis | angle in degrees or slider name |
| `@ZentrischeStreckung3D` | Point3D center | factor or slider name |

``` markdown
@Verschiebung3D(`space;Q_1;Q;v;linecolor=#00897b;objectid=move-q`)
@Punktspiegelung3D(`space;T_1;T;O;linecolor=#c2185b`)
@Geradenspiegelung3D(`space;P_1;P;g;linecolor=#6a1b9a`)
@Ebenenspiegelung3D(`space;R_1;R;E;linecolor=#ef6c00`)
@Achsendrehung3D(`space;Z_1;Z;g;angle=90;linecolor=#1565c0`)
@ZentrischeStreckung3D(`space;K_1;K;O;factor=k;linecolor=#2e7d32`)
```

Angles are interpreted in degrees. A numeric parameter is stored directly; a
non-numeric token resolves through the board's slider bindings and updates the
transformed object during animation. Reflections and rotations preserve metric
values. A dilation scales lengths by `abs(factor)`, areas by `factor^2`, and
volumes by `abs(factor)^3` through the transformed geometry.

## DGS workflow and properties

The spatial shape flyout contains Polygon3D and all seven solid tools. For
Tetrahedron, Pyramid, Prism, Parallelepiped (Spat), and Cuboid, hold the left mouse
button at the first point and drag to size a live preview. The resulting bodies
have equal edge lengths: a regular tetrahedron, square pyramid, right triangular
prism with an equilateral base, rhombohedron with 60-degree edge angles, or cube
through the Cuboid tool. The first base vertex stays at the starting position;
the base is parallel to the world XY plane and the body extends in positive Z.
The distance from the first click to the current cursor determines edge length
at the current zoom. Release to create an ordinary construction with editable
source points, saved as one undo/redo step. Escape discards the preview.

For filled circle surfaces, either circle tool uses the same hold-and-drag gesture
to draw a disk centered at the first click. The disk lies parallel to world XY,
with its normal in positive world Z. Cursor distance determines its radius at
the current zoom. Release creates an editable surface in one undo/redo step,
while Escape discards the preview.

Spatial polygon, in the Solids menu, uses successive clicks: place a new vertex
or select an existing point, then click the first vertex again to close the
polygon. It needs at least three vertices in the same plane. The number of
vertices is determined by the selected points, without a separate count input.
Its source points remain editable. Both circles and polygons have a translucent
fill that follows the line color.

A short click in a circle or solid tool preserves its original manual construction.
Pyramid and prism first select an existing Polygon3D. Spat and Quader select an
origin and three vectors. Cylinder and cone select their two axis points and a
radius point.
The free radius point is projected into the base plane through the first axis
point, perpendicular to the body axis. It stays on the base circle when the axis
moves or rotates; dragging it in that plane changes the radius. An existing bound
or dependent radius point must already satisfy the base-plane constraint.

The transformation flyout contains translation, point/line/plane reflection,
axis rotation, and central dilation. It first selects the source, then the
required reference. Rotation and dilation request their numeric value. Invalid
source combinations do not create a partial object. Escape or a tool change
clears pending selection.

Context panels expose source names, type, area/perimeter or volume/surface/base/
height measurements, colors, opacity, contour style, width, layer, name,
visibility, fixation, and deletion. Polygon3D and solid surfaces participate in
normal hit testing, multiple selection, undo/redo, dependency deletion, and the
existing Point on object option.

## Persistence and export

Snapshots store definition kind, ordered stable source IDs, radius, measurement
mode, style, visibility, fixation, and transformation references/parameters.
Import restores objects in dependency passes: points and vectors before
polygons, polygons before solids, and primary objects before transformations,
bindings, and intersections.

DGS export provides German and English aliases for every definition. It writes
stable `objectid` values, source names, point-surface parameters, intersection
branches, styles, and numeric or slider-backed transformation parameters.
Forward macro references retry through the shared bootstrap scheduler. Removing
a marker cleans its renderer and registry entry; removing a source also removes
its dependent transformations until the source returns.

## Scope boundary

Segment 5 does not add general spatial curves, arbitrary conic-section objects,
locus surfaces, 3D construction quizzes, or the final cross-mode UX polish.
Those remain separate later segments. Existing 2D implementations are not
replaced; 2D/3D switching continues to project the shared spatial scene without
changing stored coordinates.

## Verification

Focused commands:

``` powershell
npx tsc --noEmit
node --test tests/solid3d.test.mjs tests/transform3d.test.mjs
npm run build:full
node tests/dgs3dSolid.browser.mjs
node tests/dgs3dSolidExport.browser.mjs
node tests/dgs3dSolidLifecycle.browser.mjs
npm run test:3d:browser
npm run test:dgs:browser
```

No object owns a polling timer. Shared mutation observers and requestAnimationFrame
bootstrap scheduling handle forward references, marker removal, remounts, and
dependent rebuilds.