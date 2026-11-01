# 3D Segment 4: spatial circles, spheres, and intersections

Segment 4 extends the typed scene introduced in Segments 1-3. The mathematical
modules `src/shared/circle3d.ts` and `src/shared/sphere3d.ts` contain no DOM or
JSXGraph state. `src/coord/view3d.ts` maps those definitions to the native
JSXGraph 1.11.1 `circle3d` and `sphere3d` elements and owns proxy hit testing,
registries, projection, visibility, and cleanup.

## Definitions

Spatial circles support:

- three source points;
- center, normal Vector3D, and a positive numeric radius;
- center, normal Vector3D, and a radius point whose spatial distance determines
  the radius;
- dependent plane-sphere, sphere-sphere, and coincident plane-circle section
  circles.

The local frame contains a center, normal, and two orthonormal in-plane
directions. The first direction remains deterministic, and a three-point circle
uses the first source radial direction. Bound points store a dimensionless angle.

Spheres support center-surface point, center-numeric radius, and four
non-coplanar points. Bound surface points store a normalized three-component
direction. Four-point spheres use pivoted elimination and scaled degeneracy
checks.

Collinear circle sources, zero normals, non-positive radii, coincident
center/surface points, and coplanar four-point inputs evaluate to `null`. The
renderer keeps its last finite shape only for continuity and hides it until the
definition becomes valid again.

## DGS

The existing shape flyout contains:

- Circle through three points
- Circle through center, normal, and radius point
- Sphere through center and surface point
- Sphere through four points
- Sphere through center and numeric radius

Point3D and Vector3D selection takes precedence over camera rotation while a
construction tool is active. Escape, a tool switch, and invalid completion roll
back pending auto-created points. The construction and any helpers enter history
as one operation.

The context panel shows definition sources and derived center/radius data.
Only numeric-radius definitions make radius editable. Circle measurements select
radius, circumference, or area; sphere measurements select radius, surface area,
or volume. Line/fill/text colors, opacity, line style, width, layer, visibility,
fixation, renaming, deletion, undo, and redo use the existing property system.

The normal point tool and the Point on object checkbox also support circles and
spheres. Circle bindings serialize `angle`; sphere bindings serialize
`direction=[x;y;z]`.

## Intersections

The targeted intersection tool supports:

| Sources | Possible result |
| --- | --- |
| line/ray/segment/vector - circle | none, tangent point, or two points |
| line/ray/segment/vector - sphere | none, tangent point, or two points |
| plane - circle | none, tangent point, two points, or the circle |
| plane - sphere | none, tangent point, or section circle |
| circle - circle | none, tangent point, two points, or coincident |
| circle - sphere | none, tangent point, two points, or coincident |
| sphere - sphere | none, tangent point, section circle, or coincident |

Linear parameter domains are applied before returning branches. Two-point
results retain branch index and persistent ID. At tangency the second branch is
hidden, which prevents a visible duplicate. Dependent results reappear after a
temporary disjoint or degenerate state.

## Macros and persistence

English and German aliases share the same parsers:

``` markdown
@Circle3D(`space;k;A;B;C;#00dfe8;value=1`)
@KreisMittelpunktNormal3D(`space;c;A;n;#ffaa00;radius=2`)
@CircleCenterNormalPoint3D(`space;d;A;n;B;#42d66b`)
@Sphere3D(`space;S;A;B;#8d7cff;opacity=0.2`)
@KugelRadius3D(`space;T;A;#42d66b;radius=3`)
@SphereFourPoints3D(`space;U;A;B;C;D;#ff6688`)
@Intersection3D(`space;i;T;E;#ff00ff;0.9`)
```

The aliases are `@Circle3D` / `@Kreis3D`,
`@CircleCenterNormal3D` / `@KreisMittelpunktNormal3D`,
`@CircleCenterNormalPoint3D` / `@KreisMittelpunktNormalPunkt3D`,
`@Sphere3D` / `@Kugel3D`, `@SphereRadius3D` / `@KugelRadius3D`, and
`@SphereFourPoints3D` / `@KugelVierPunkte3D`.

Options include stable `objectid`, visibility, fixation, layer, opacity, line,
fill and text colors, contour width/style, and measurement display/mode.
For circle macros, an explicit `fillcolor=#...` enables a disk; `opacity` controls
its transparency. Omitting `fillcolor` preserves the outline-only appearance of
existing macros. For center-normal-point circles, `radiuspointinplane=1` keeps a
free radius handle in the circle plane. Drawn disks export this option so the
handle stays on their rim after re-import. It is off by default, so existing
shared free points keep their original freedom of movement.

Forward references retry through the shared bootstrap scheduler. Removed markers
clean their registry and renderer objects. Repeated bootstrap reuses unchanged
objects.

Snapshots store construction kind, ordered source IDs, numeric radius sources,
binding parameters, intersection group/branch IDs, styles, and scene state. DGS
export orders points before vectors, planes, primary circles/spheres, bound
points, and spatial intersections. Imported definitions remain source-driven.

A free 2D center-radius circle is promoted once into the xy plane with its shared
points and a hidden z-normal Vector3D. Spatial objects shown in a 2D view remain
3D records; only their camera projection changes.

## Verification

Focused commands:

``` powershell
npx tsc --noEmit
node --test tests/circleSphere3d.test.mjs
npm run build:full
node tests/dgs3dRound.browser.mjs
npm run test:3d:browser
npm run test:dgs:browser
```

The implementation installs no per-object timers. Shared mutation observers and
bootstrap scheduling handle forward references, marker removal, and remounts.
