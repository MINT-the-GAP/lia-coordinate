# Final 2D/3D object and function matrix

Status on 2026-10-13. `A` means an automated unit or browser roundtrip covers the path. `I` means the capability is provided by the shared DGS implementation and is covered through its object family. `—` means that the operation is not mathematically applicable. The linked test is the evidence source; this table does not replace those tests.

| Object family | Macro | DGS create | select/list/properties | dependencies, transform, intersection | export → import → re-export | quiz | lifecycle |
|---|---:|---:|---:|---:|---:|---:|---:|
| Point / Point3D | A | A | A | A: bound/intersection/projected points | A | A | A |
| Segment, line, ray, vector 2D | A | A | A | A | A | A, promoted with `z=0` | A |
| Segment3D, Line3D, Ray3D, Vector3D | A | A | A | A | A | A | A |
| Plane3D | A | A | A | A | A | A | A |
| Circle 2D / compass arc | A | A | A | A, including selected arc intersections | A | I through canonical circle/conditions | A |
| Circle3D | A | A | A | A | A | A | A |
| Sphere3D | A | A | A | A | A | A | A |
| Polygon 2D | A | A | A | A | A | A as `z=0` | A |
| Polygon3D | A | A | A | A | A | A | A |
| Three independent triangle sides | — | A | A | source segments | A as segments | A as a synthetic triangle | A |
| Tetrahedron | A | A | A | A | A | A | A |
| Pyramid | A | A | A | A | A | A | A |
| Prism | A | A | A | A | A | A | A |
| Parallelepiped / cuboid | A | A | A | A | A | A | A |
| Cylinder / cone | A | A | A | A, plane conics | A | A | A |
| Ellipse 2D | A | A | A | I | A | geometric polygon/conic conditions where used | A |
| Dynamic conic section 3D | A | A | A | plane + source solid | A | A: kind, plane, source, centre, radii, branches | A |
| Function graph 2D | A | A | A | analysis points, tangent/normal | A | I as 2D graph or promoted curve | A |
| Regression / recognized drawing | A | A | A | graph analysis | A with family start values | I as promoted curve | A |
| Function family (`Schar`) | A | A | A | sliders/animation | A with start values | I as promoted curve and parameters | A |
| Parametric Curve3D | A | A | A | A | A | A: definition or bounded locus comparison | A |
| Parametric / function Surface3D | A | A | A | A | A | A: definition or bounded surface comparison | A |
| Locus curve / locus surface | A | A | A | A: driver(s), trace point, restored values | A | A in construction mode through dependencies | A |
| 2D/3D intersections | — | A | A | A | A | A through points, lines, polygons and conics | A |
| Scalar analysis result | A | A | A | live source references | A | A with absolute/relative tolerance and unit | A |
| Tangent, normal, normal plane | A | A | A | live curve/surface source | A | A as vector/line/plane plus dependencies | A |
| Translation | A | A | A | A | A | A: result or construction route | A |
| point/line/plane reflection | A | A | A | A | A | A: result or construction route | A |
| axis rotation / central dilation | A | A | A | A | A | A: result or construction route and parameter | A |
| Slider / animated slider | A | A | A | dependent objects | A: speed, visible play control, wrap | condition/dependency parameter | A |
| labels and measurements | A | A | A | — | A for supported appearance fields | optional visibility/fix/style and scalar result | A |

## Automated evidence

- `tests/segment7Quiz3d.test.mjs`: canonical comparison, conditions, matching, author errors, dependencies, appearance and the three-side triangle adapter.
- `tests/segment7Quiz3d.browser.mjs`: live 3D board, result/construction modes, mixed 2D/3D, localized feedback, reset, view policy, remount and responsive UI.
- `tests/quizFamilies.browser.mjs`: real LiaScript runtime, Check/Hint/Solution and the eighth 3D quiz family.
- `tests/segment6Geometry.browser.mjs`: curves, surfaces, conics, loci, analysis, editing, export, fresh import and canonical re-export.
- `tests/dgs3d*.browser.mjs`: point, linear, plane, round object and solid creation, persistence and lifecycle.
- `tests/dgsAnalysisSources.browser.mjs`, `tests/dgsCompassIntersections.browser.mjs`, `tests/dgsTransformations.browser.mjs`, `tests/dgsSliderAnimation.browser.mjs`, `tests/dgsLocus.browser.mjs`, `tests/dgsEllipse.browser.mjs`: final 2D regression and export coverage.

## Deliberate numeric limits

The quiz does not attempt a general symbolic proof for arbitrary curves or surfaces. Curves use bounded adaptive samples and a bidirectional nearest-point distance. Surfaces use a bounded 7×7 comparison grid and bounded nearest-parameter search. Authors can require the exact normalized definition instead. Synthetic polygon recognition is intentionally limited to closed triangles from three user segments and examines at most 32 segment candidates per check. JSXGraph renderer helpers never enter the matching pool.