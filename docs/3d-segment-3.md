# 3D Segment 3: planes and spatial constraints

Segment 3 keeps mathematical definitions separate from JSXGraph rendering.

- `src/shared/plane3d.ts` contains scale-aware plane construction, projection,
  domain checks, line-line, line-plane, and plane-plane intersections, and box
  clipping. It has no DOM dependency.
- `src/coord/view3d.ts` owns native `plane3d`, dependent `point3d`, and
  dependent `line3d` objects. Evaluators retain the last finite geometry for
  renderer stability while visibility follows the current mathematical result.
- `src/subsystems/plane3d.ts` and `src/subsystems/intersection3d.ts` implement
  macro parsing, stable registries, retry ordering, in-place updates, and cleanup.
- `src/subsystems/dgs.ts` supplies the three plane tools, the shared spatial
  intersection tool, context-menu constraints, snapshots, undo/redo, properties,
  object lists, and macro export.

Plane records store their definition plus stable point and vector IDs.
Spatial-intersection records store both source IDs and whether their result is a
point or line. Bound Point3D records store the source ID plus either the
dimensionless line parameter `t` or plane-local parameters `u` and `v`; those
parameters, stable point IDs, and source references survive snapshot restore and
macro roundtrips. Coordinates derived from a construction are never serialized as
the source of truth.

Undefined geometry is represented by `null`. Rendering hides it and becomes
visible again after its sources recover. Tolerances scale with input magnitude;
no screen-space tolerance is used for mathematical incidence.

Run the focused checks with:

```powershell
npx tsc --noEmit
node --test tests/plane3d.test.mjs
npm run build:full
node tests/dgs3dLinear.browser.mjs
```
