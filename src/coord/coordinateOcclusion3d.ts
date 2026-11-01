import type { CoordinateView3DEntry } from './view3d';
import type { Vector3 } from '../shared/vector3d';
import { clipPlaneToBounds3D, type Plane3, type LinearDomain3D } from '../shared/plane3d';
import type { Sphere3 } from '../shared/sphere3d';
import type { Circle3 } from '../shared/circle3d';
import type { Polygon3 } from '../shared/polygon3d';
import type { Solid3 } from '../shared/solid3d';
import type { ParametricCurve3D } from '../shared/curve3d';
import { occlusionHit3D, type OcclusionRay3D, type OcclusionSurface3D } from '../shared/occlusion3d';

export interface CoordinateOcclusion3DReaders {
  sphere(object: any): Sphere3 | null;
  plane(object: any): Plane3 | null;
  polygon(object: any): Polygon3 | null;
  solid(object: any): Solid3 | null;
  line(object: any): { anchor: Vector3; direction: Vector3; domain: LinearDomain3D } | null;
  circle(object: any): Circle3 | null;
  curve?(object: any): ParametricCurve3D | null;
}

export interface CoordinateOcclusion3DController {
  readonly hasSurfaces: boolean;
  readonly lastFrameMs: number;
  readonly maskedNodes: number;
  beginFrame(): void;
  /** Remaining brightness (1 = fully visible) at a world point. */
  opacityAt(point: Vector3, excludeOwner?: unknown): number;
  updateMasks(): void;
  clear(): void;
  destroy(): void;
}

type Pixel = [number, number];
type Bounds = [number, number, number, number];
interface SurfaceEntry { owner: any; surface: OcclusionSurface3D; bounds: Bounds; anchor: Vector3; nodes: SVGElement[]; }
interface MaskRecord { mask: SVGMaskElement; nodes: Map<SVGElement, string | null>; signature: string; }
interface OpacityRecord { node: HTMLElement | SVGElement; original: string; }
const SVG_NS = 'http://www.w3.org/2000/svg';
let nextControllerId = 0;
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vector3, b: Vector3): Vector3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const subtract = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vector3, value: number): Vector3 => [a[0] * value, a[1] * value, a[2] * value];
const cross = (a: Vector3, b: Vector3): Vector3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vector3): Vector3 => scale(a, 1 / (Math.hypot(...a) || 1));
const finite = (point: any): point is Vector3 => Array.isArray(point) && point.length >= 3 && point.slice(0, 3).every(Number.isFinite);
function evaluate(value: any): any { try { return typeof value === 'function' ? value() : value; } catch (e) { return undefined; } }
function read<T>(reader: ((object: any) => T | null) | undefined, object: any): T | null { try { return reader?.(object) || null; } catch (e) { return null; } }
function visible(object: any): boolean {
  if (!object || object.__liaDgsShowObject === false) return false;
  if (['Sphere', 'Plane', 'Circle', 'Polygon', 'Solid'].some(kind => object['__lia' + kind + '3DUserVisible'] === false)) return false;
  const proxy = object.element2D || object;
  return evaluate(object.visProp?.visible) !== false && evaluate(proxy.visProp?.visible) !== false && proxy.visPropCalc?.visible !== false;
}
function fillOpacity(object: any): number {
  const authored = object.__liaDgsOpacity ?? object.element2D?.visProp?.fillopacity ?? object.visProp?.fillopacity;
  const value = Number(evaluate(authored));
  return clamp(Number.isFinite(value) ? value : 0.18);
}
function filledCircle(object: any): boolean {
  const color = evaluate(object.element2D?.visProp?.fillcolor ?? object.visProp?.fillcolor);
  const opacity = Number(evaluate(object.element2D?.visProp?.fillopacity ?? object.visProp?.fillopacity));
  return !!color && color !== 'none' && color !== 'transparent' && opacity > 0;
}
function pointOf(object: any): Vector3 | null {
  try { const point: Vector3 = [Number(object.X()), Number(object.Y()), Number(object.Z())]; return finite(point) ? point : null; } catch (e) { return null; }
}
function svgNodes(object: any): SVGElement[] {
  const nodes = new Set<SVGElement>();
  const seen = new Set<any>();
  const visit = (part: any, level: number): void => {
    if (!part || seen.has(part) || level > 3) return;
    seen.add(part);
    for (const node of [part.rendNode, part.rendNodeTriangleStart, part.rendNodeTriangleEnd]) {
      if (node?.namespaceURI === SVG_NS && !['text', 'foreignObject'].includes(node.tagName)) nodes.add(node);
    }
    if (part.element2D && part.element2D !== part) visit(part.element2D, level + 1);
    for (const key of ['faces', 'borders', '__liaSphere3DGuideCurves', '__liaSolid3DGuideCurves']) {
      if (Array.isArray(part[key])) part[key].forEach((child: any) => visit(child, level + 1));
    }
  };
  visit(object, 0);
  return [...nodes];
}
function labelsOf(object: any): Array<HTMLElement | SVGElement> {
  return [...new Set<any>([object.label?.rendNode, object.element2D?.label?.rendNode, object.__liaSolid3DLabelPoint?.label?.rendNode].filter(Boolean))];
}
function intersection(a: Bounds, b: Bounds): Bounds | null {
  const result: Bounds = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return result[2] > result[0] && result[3] > result[1] ? result : null;
}
function includes(bounds: Bounds, point: Pixel, padding = 0): boolean {
  return point[0] >= bounds[0] - padding && point[0] <= bounds[2] + padding && point[1] >= bounds[1] - padding && point[1] <= bounds[3] + padding;
}
function surfaceSignature(surface: OcclusionSurface3D): any {
  if (surface.kind === 'sphere') return [surface.kind, surface.center, surface.radius, surface.opacity];
  if (surface.kind === 'disk') return [surface.kind, surface.center, surface.normal, surface.radius, surface.opacity];
  if (surface.kind === 'polygon') return [surface.kind, surface.vertices, surface.opacity];
  const solid = surface.solid;
  return [surface.kind, solid.kind, 'vertices' in solid ? solid.vertices : [solid.baseCenter, 'apex' in solid ? solid.apex : solid.topCenter, solid.radius], surface.opacity];
}

/** Depth-aware attenuation layered on the existing SVG renderer, without changing construction geometry. */
export function mountCoordinateOcclusion3D(entry: CoordinateView3DEntry, readers: CoordinateOcclusion3DReaders): CoordinateOcclusion3DController {
  const masks = new Map<any, MaskRecord>();
  const opacities = new Map<HTMLElement | SVGElement, OpacityRecord>();
  const promoted = new Map<SVGElement, { parent: Node; next: ChildNode | null }>();
  const primitiveOrder = new WeakMap<SVGElement, number>();
  let primitiveGroup: SVGGElement | null = null;
  let nextPrimitiveOrder = 0;
  const objectIds = new WeakMap<object, number>();
  const prefix = 'lia-depth-' + (++nextControllerId) + '-';
  let nextObjectId = 0;
  let surfaces: SurfaceEntry[] = [];
  let targets: SurfaceEntry[] = [];
  let width = 1, height = 1, farDistance = 100;
  let viewport: Bounds = [0, 0, 1, 1];
  let frameSignature = '', lastMaskSignature = '';
  let destroyed = false, lastFrameMs = 0;
  let eye: Vector3 | null = null;
  let viewerDirection: Vector3 = [0, 0, 1];
  let pixelOrigin: Pixel = [0, 0];
  let rowX: Vector3 = [1, 0, 0], rowY: Vector3 = [0, 1, 0];
  let invXX = 1, invXY = 0, invYY = 1;
  const id = (object: object): number => { let value = objectIds.get(object); if (!value) { value = ++nextObjectId; objectIds.set(object, value); } return value; };
  const project = (point: Vector3): Pixel => {
    try {
      const projected = entry.view.project3DTo2D(point);
      const w = Number(projected[0]) || 1;
      return [entry.board.origin.scrCoords[1] + entry.board.unitX * projected[1] / w,
        entry.board.origin.scrCoords[2] - entry.board.unitY * projected[2] / w];
    } catch (e) { return [NaN, NaN]; }
  };
  const boundsFromNodes = (nodes: SVGElement[], fallback: Vector3[]): Bounds => {
    const boardRect = entry.board.containerObj?.getBoundingClientRect?.();
    let bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
    if (boardRect) nodes.forEach(node => {
      const rect = node.getBoundingClientRect();
      if (!(rect.width > 0 || rect.height > 0)) return;
      const sx = width / (boardRect.width || width), sy = height / (boardRect.height || height);
      bounds = [Math.min(bounds[0], (rect.left - boardRect.left) * sx), Math.min(bounds[1], (rect.top - boardRect.top) * sy),
        Math.max(bounds[2], (rect.right - boardRect.left) * sx), Math.max(bounds[3], (rect.bottom - boardRect.top) * sy)];
    });
    if (!Number.isFinite(bounds[0])) fallback.forEach(point => { const p = project(point); if (p.every(Number.isFinite)) bounds = [Math.min(bounds[0], p[0]), Math.min(bounds[1], p[1]), Math.max(bounds[2], p[0]), Math.max(bounds[3], p[1])]; });
    return bounds;
  };
  const rayToViewer = (point: Vector3): OcclusionRay3D => eye
    ? { origin: point, direction: subtract(eye, point), maxDistance: Math.hypot(...subtract(eye, point)) }
    : { origin: point, direction: viewerDirection };
  const rayFromPixel = (pixel: Pixel): OcclusionRay3D => {
    if (eye) {
      const view = entry.view;
      const userX = (pixel[0] - entry.board.origin.scrCoords[1]) / entry.board.unitX;
      const userY = (entry.board.origin.scrCoords[2] - pixel[1]) / entry.board.unitY;
      const u = (userX - view.viewPortTransform[1][0]) / view.viewPortTransform[1][1] / view.focalDist;
      const v = (userY - view.viewPortTransform[2][0]) / view.viewPortTransform[2][2] / view.focalDist;
      const rotation = view.boxToCam;
      return { origin: eye, direction: [rotation[1][1] * u + rotation[2][1] * v - rotation[3][1], rotation[1][2] * u + rotation[2][2] * v - rotation[3][2], rotation[1][3] * u + rotation[2][3] * v - rotation[3][3]] };
    }
    const dx = pixel[0] - pixelOrigin[0], dy = pixel[1] - pixelOrigin[1];
    const a = invXX * dx + invXY * dy, b = invXY * dx + invYY * dy;
    const point = add(scale(rowX, a), scale(rowY, b));
    return { origin: add(point, scale(viewerDirection, farDistance)), direction: scale(viewerDirection, -1) };
  };
  const opacityAtPixel = (point: Vector3, pixel: Pixel, excludeOwner?: unknown): number => {
    if (!surfaces.length || !finite(point)) return 1;
    let brightness = 1;
    let ray: OcclusionRay3D | null = null;
    for (const candidate of surfaces) {
      if (candidate.owner === excludeOwner || !includes(candidate.bounds, pixel, 2)) continue;
      if (!ray) ray = rayToViewer(point);
      if (occlusionHit3D(ray, candidate.surface)) brightness *= 1 - candidate.surface.opacity!;
      if (brightness < 0.001) return 0;
    }
    return brightness;
  };
  const opacityAt = (point: Vector3, excludeOwner?: unknown): number => opacityAtPixel(point, project(point), excludeOwner);
  // Surface masks determine which fragments are behind a face. Draw primitives
  // after those faces so a user-selected surface layer cannot tint front strokes.
  // Keep native nodes (and their event handlers), restoring their original layer
  // positions when leaving 3D or when the scene no longer has filled surfaces.
  const restorePrimitives = (selection = new Set(promoted.keys())): void => {
    const restoring = new Set<SVGElement>();
    const restore = (node: SVGElement): void => {
      const record = promoted.get(node);
      if (!record || restoring.has(node)) return;
      restoring.add(node);
      let next = record.next;
      if (next && selection.has(next as SVGElement)) restore(next as SVGElement);
      const seen = new Set<Node>();
      while (next && next.parentNode !== record.parent && !seen.has(next)) {
        seen.add(next);
        const sibling = promoted.get(next as SVGElement);
        next = sibling?.parent === record.parent ? sibling.next : null;
      }
      if (node.isConnected && node.parentNode === primitiveGroup && record.parent.isConnected) {
        record.parent.insertBefore(node, next?.parentNode === record.parent ? next : null);
      }
      promoted.delete(node);
    };
    selection.forEach(restore);
  };
  const promotePrimitives = (owners: any[]): void => {
    const svg = entry.board.renderer?.svgRoot as SVGSVGElement | undefined;
    if (!svg) return;
    const candidates = new Map<SVGElement, number>();
    owners.forEach(owner => {
      const layer = Number(evaluate(owner.element2D?.visProp?.layer ?? owner.visProp?.layer)) || 0;
      [...svgNodes(owner), ...labelsOf(owner)].forEach(node => {
        if (node.namespaceURI !== SVG_NS || !node.isConnected ||
            (node as SVGElement).ownerSVGElement !== svg || node.closest('defs')) return;
        candidates.set(node as SVGElement, layer);
      });
    });
    const desired = [...candidates.keys()];
    // Capture all sibling links before moving any nodes out of their native layer.
    desired.forEach(node => {
      if (node.parentNode && node.parentNode !== primitiveGroup) {
        promoted.set(node, { parent: node.parentNode, next: node.nextSibling });
      }
    });
    restorePrimitives(new Set([...promoted.keys()].filter(node => !candidates.has(node))));
    if (!desired.length) { primitiveGroup?.remove(); primitiveGroup = null; return; }
    if (!primitiveGroup?.isConnected) {
      primitiveGroup = document.createElementNS(SVG_NS, 'g');
      primitiveGroup.setAttribute('data-lia-coordinate-3d-primitives', '');
    }
    desired.sort((a, b) => {
      if (!primitiveOrder.has(a) && !primitiveOrder.has(b)) {
        return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      }
      return (primitiveOrder.get(a) ?? Infinity) - (primitiveOrder.get(b) ?? Infinity);
    });
    desired.forEach(node => { if (!primitiveOrder.has(node)) primitiveOrder.set(node, ++nextPrimitiveOrder); });
    desired.sort((a, b) => candidates.get(a)! - candidates.get(b)! || primitiveOrder.get(a)! - primitiveOrder.get(b)!);
    // Native setAttribute({layer}) may have moved a node back to a native group.
    // Reconcile even on a mask-cache hit, but do not reorder an unchanged frame.
    if (svg.lastElementChild !== primitiveGroup) svg.appendChild(primitiveGroup);
    if (primitiveGroup.children.length !== desired.length ||
        desired.some((node, index) => primitiveGroup!.children[index] !== node)) {
      desired.forEach(node => primitiveGroup!.appendChild(node));
    }
  };
  const restoreMask = (record: MaskRecord): void => {
    record.nodes.forEach((previous, node) => {
      if (previous === null) node.removeAttribute('mask'); else node.setAttribute('mask', previous);
    });
    record.mask.remove();
  };
  const restoreOpacities = (): void => {
    opacities.forEach(record => { record.node.style.opacity = record.original; });
    opacities.clear();
  };
  const clear = (): void => {
    masks.forEach(restoreMask); masks.clear(); restoreOpacities(); lastMaskSignature = '';
    restorePrimitives(); primitiveGroup?.remove(); primitiveGroup = null;
  };
  const setOpacity = (node: HTMLElement | SVGElement, brightness: number): void => {
    let record = opacities.get(node);
    if (brightness > 0.999) {
      if (record) { node.style.opacity = record.original; opacities.delete(node); }
      return;
    }
    if (!record) { record = { node, original: node.style.opacity }; opacities.set(node, record); }
    const base = record.original === '' ? 1 : Number(record.original);
    node.style.opacity = String(brightness * (Number.isFinite(base) ? base : 1));
  };
  const setLabelOpacity = (object: any, anchor: Vector3): void => labelsOf(object).forEach(node => setOpacity(node, opacityAt(anchor, object)));
  const maskFor = (owner: any, nodes: SVGElement[], paths: Map<number, string>, stroke = false, strokeWidth = 16): void => {
    if (!paths.size || !nodes.length) {
      const old = masks.get(owner); if (old) { restoreMask(old); masks.delete(owner); } return;
    }
    const signature = JSON.stringify([...paths]) + ':' + stroke + ':' + strokeWidth;
    let record = masks.get(owner);
    const svg = nodes[0].ownerSVGElement;
    const defs = svg?.querySelector('defs');
    if (!defs) return;
    if (!record) {
      const mask = document.createElementNS(SVG_NS, 'mask');
      mask.id = prefix + id(owner);
      mask.setAttribute('maskUnits', 'userSpaceOnUse'); mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
      mask.setAttribute('style', 'mask-type:luminance');
      defs.appendChild(mask);
      record = { mask, nodes: new Map(), signature: '' }; masks.set(owner, record);
    }
    for (const node of nodes) {
      if (!record.nodes.has(node)) record.nodes.set(node, node.getAttribute('mask'));
      node.setAttribute('mask', 'url(#' + record.mask.id + ')');
    }
    record.nodes.forEach((previous, node) => { if (!nodes.includes(node)) { if (previous === null) node.removeAttribute('mask'); else node.setAttribute('mask', previous); record!.nodes.delete(node); } });
    if (record.signature === signature && record.mask.getAttribute('width') === String(width) && record.mask.getAttribute('height') === String(height)) return;
    record.signature = signature;
    record.mask.setAttribute('x', '0'); record.mask.setAttribute('y', '0'); record.mask.setAttribute('width', String(width)); record.mask.setAttribute('height', String(height));
    record.mask.replaceChildren();
    const base = document.createElementNS(SVG_NS, 'rect');
    base.setAttribute('width', String(width)); base.setAttribute('height', String(height)); base.setAttribute('fill', 'white'); record.mask.appendChild(base);
    paths.forEach((d, shade) => {
      const path = document.createElementNS(SVG_NS, 'path'); path.setAttribute('d', d);
      const color = 'rgb(' + shade + ',' + shade + ',' + shade + ')';
      if (stroke) { path.setAttribute('fill', 'none'); path.setAttribute('stroke', color); path.setAttribute('stroke-width', String(strokeWidth)); path.setAttribute('stroke-linecap', 'butt'); path.setAttribute('stroke-linejoin', 'round'); }
      else path.setAttribute('fill', color);
      record!.mask.appendChild(path);
    });
  };
  const beginFrame = (): void => {
    if (destroyed) return;
    width = Number(entry.board.canvasWidth) || entry.board.containerObj?.clientWidth || 1;
    height = Number(entry.board.canvasHeight) || entry.board.containerObj?.clientHeight || 1;
    viewport = [0, 0, width, height];
    surfaces = []; targets = [];
    if (entry.viewMode !== '3d') { clear(); frameSignature = ''; return; }
    const view = entry.view;
    eye = null;
    const rotation = view.matrix3DRot;
    viewerDirection = normalize([rotation?.[3]?.[1] || 0, rotation?.[3]?.[2] || 0, rotation?.[3]?.[3] || 0]);
    if (view.projectionType === 'central' && view.boxToCam?.[3]) {
      const center: Vector3 = [-(view.shift?.[1]?.[0] || 0), -(view.shift?.[2]?.[0] || 0), -(view.shift?.[3]?.[0] || 0)];
      eye = add(center, scale(view.boxToCam[3].slice(1, 4) as Vector3, -view.boxToCam[3][0]));
    } else {
      pixelOrigin = project([0, 0, 0]);
      const axes: Vector3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const projected = axes.map(project);
      rowX = projected.map(p => p[0] - pixelOrigin[0]) as Vector3;
      rowY = projected.map(p => p[1] - pixelOrigin[1]) as Vector3;
      let direction = normalize(cross(rowX, rowY));
      if (dot(direction, viewerDirection) < 0) direction = scale(direction, -1);
      viewerDirection = direction;
      const xx = dot(rowX, rowX), xy = dot(rowX, rowY), yy = dot(rowY, rowY);
      const determinant = xx * yy - xy * xy;
      invXX = yy / determinant; invXY = -xy / determinant; invYY = xx / determinant;
    }
    farDistance = Math.max(100, ...entry.spatialRanges.flat().map(Math.abs)) * 10;
    const register = (owner: any, surface: OcclusionSurface3D, anchor: Vector3, fallback: Vector3[]): void => {
      if (!visible(owner)) return;
      const opacity = fillOpacity(owner);
      surface.owner = owner; surface.opacity = 1 - Math.pow(1 - opacity, 3);
      const nodes = svgNodes(owner);
      const bounds = boundsFromNodes(nodes, fallback);
      if (!bounds.every(Number.isFinite)) return;
      fallback.forEach(point => { farDistance = Math.max(farDistance, Math.hypot(...point) * 3 + 100); });
      const target = { owner, surface, bounds, anchor, nodes };
      targets.push(target);
      if (opacity > 0) surfaces.push(target);
    };
    entry.sphereObjects.forEach(owner => {
      const data = read(readers.sphere, owner); if (!data) return;
      const points: Vector3[] = [data.center, ...[0, 1, 2].flatMap(axis => [-1, 1].map(sign => data.center.map((value, index) => value + (axis === index ? sign * data.radius : 0)) as Vector3))];
      register(owner, { kind: 'sphere', center: data.center, radius: data.radius }, data.center, points);
    });
    entry.planeObjects.forEach(owner => {
      const data = read(readers.plane, owner); if (!data) return;
      const vertices = clipPlaneToBounds3D(data, { x: entry.spatialRanges[0], y: entry.spatialRanges[1], z: entry.spatialRanges[2] });
      if (vertices.length >= 3) register(owner, { kind: 'polygon', vertices }, data.point, vertices);
    });
    entry.circleObjects.forEach(owner => {
      if (!filledCircle(owner)) return;
      const data = read(readers.circle, owner); if (!data) return;
      const points: Vector3[] = Array.from({ length: 16 }, (_, index) => {
        const angle = index * Math.PI / 8;
        return add(data.center, add(scale(data.direction1, data.radius * Math.cos(angle)),
          scale(data.direction2, data.radius * Math.sin(angle))));
      });
      register(owner, { kind: 'disk', center: data.center, normal: data.normal, radius: data.radius }, data.center, points);
    });
    entry.polygonObjects.forEach(owner => { const data = read(readers.polygon, owner); if (data) register(owner, { kind: 'polygon', vertices: data.vertices }, data.centroid, data.vertices); });
    entry.solidObjects.forEach(owner => {
      const data = read(readers.solid, owner); if (!data) return;
      const points: Vector3[] = 'vertices' in data ? data.vertices : [data.baseCenter, 'apex' in data ? data.apex : data.topCenter];
      register(owner, { kind: 'solid', solid: data }, data.centroid, points);
    });
    frameSignature = JSON.stringify([width, height, entry.board.origin.scrCoords, entry.board.unitX, entry.board.unitY, view.matrix3D, view.matrix3DRot, view.boxToCam, view.viewPortTransform,
      targets.map(surface => [id(surface.owner), surfaceSignature(surface.surface), surface.bounds, surface.nodes.map(node => node.id)])]);
  };
  const addPath = (paths: Map<number, string>, shade: number, path: string): void => { paths.set(shade, (paths.get(shade) || '') + path); };
  const surfaceMask = (target: SurfaceEntry): void => {
    const overlaps = surfaces.filter(other => other.owner !== target.owner).map(other => intersection(other.bounds, target.bounds)).filter((value): value is Bounds => !!value).map(bounds => intersection(bounds, viewport)).filter((value): value is Bounds => !!value);
    const paths = new Map<number, string>();
    if (!overlaps.length) { maskFor(target.owner, target.nodes, paths); return; }
    const bounds: Bounds = [Math.min(...overlaps.map(b => b[0])), Math.min(...overlaps.map(b => b[1])), Math.max(...overlaps.map(b => b[2])), Math.max(...overlaps.map(b => b[3]))];
    const step = Math.max(5, Math.ceil(Math.sqrt((bounds[2] - bounds[0]) * (bounds[3] - bounds[1]) / 12000)));
    for (let y = Math.floor(bounds[1]); y < bounds[3]; y += step) {
      const cellHeight = Math.min(step, bounds[3] - y);
      let runStart = 0, runShade = 255, runEnd = 0;
      const flush = (): void => { if (runShade < 254 && runEnd > runStart) addPath(paths, runShade, 'M' + runStart + ' ' + y + 'h' + (runEnd - runStart) + 'v' + cellHeight + 'h-' + (runEnd - runStart) + 'Z'); };
      for (let x = Math.floor(bounds[0]); x < bounds[2]; x += step) {
        const cellWidth = Math.min(step, bounds[2] - x);
        const pixel: Pixel = [x + cellWidth / 2, y + cellHeight / 2];
        let shade = 255;
        if (overlaps.some(bounds => includes(bounds, pixel))) {
          const hit = occlusionHit3D(rayFromPixel(pixel), target.surface);
          if (hit) shade = Math.round(opacityAtPixel(hit.point, pixel, target.owner) * 255);
        }
        if (shade !== runShade) { flush(); runStart = x; runShade = shade; }
        runEnd = x + cellWidth;
      }
      flush();
    }
    maskFor(target.owner, target.nodes, paths);
  };
  const curveMask = (owner: any, points: Vector3[]): void => {
    const paths = new Map<number, string>();
    const nodes = svgNodes(owner);
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index];
      if (!finite(a) || !finite(b)) continue;
      const pa = project(a), pb = project(b);
      const length = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      if (!Number.isFinite(length)) continue;
      const steps = Math.max(1, Math.min(600, Math.ceil(length / 5)));
      let previous = pa;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, middle = (i - 0.5) / steps;
        const point = add(a, scale(subtract(b, a), t));
        const pixel = project(point);
        const middlePoint = add(a, scale(subtract(b, a), middle));
        if (includes(viewport, [(previous[0] + pixel[0]) / 2, (previous[1] + pixel[1]) / 2], 16)) {
          const shade = Math.round(opacityAt(middlePoint, owner) * 255);
          if (shade < 254) addPath(paths, shade, 'M' + previous[0].toFixed(2) + ' ' + previous[1].toFixed(2) + 'L' + pixel[0].toFixed(2) + ' ' + pixel[1].toFixed(2));
        }
        previous = pixel;
      }
    }
    const lineWidth = Number(evaluate(owner.element2D?.visProp?.strokewidth ?? owner.visProp?.strokewidth)) || 2;
    maskFor(owner, nodes, paths, true, Math.max(16, lineWidth * 8));
  };
  const linePoints = (data: NonNullable<ReturnType<CoordinateOcclusion3DReaders['line']>>): Vector3[] => {
    if (data.domain === 'segment' || data.domain === 'vector') return [data.anchor, add(data.anchor, data.direction)];
    let min = data.domain === 'ray' ? 0 : -Infinity;
    let max = Infinity;
    for (let axis = 0; axis < 3; axis++) {
      const d = data.direction[axis];
      if (Math.abs(d) < 1e-12) {
        if (data.anchor[axis] < entry.spatialRanges[axis][0] || data.anchor[axis] > entry.spatialRanges[axis][1]) return [];
        continue;
      }
      const lo = (entry.spatialRanges[axis][0] - data.anchor[axis]) / d;
      const hi = (entry.spatialRanges[axis][1] - data.anchor[axis]) / d;
      min = Math.max(min, Math.min(lo, hi)); max = Math.min(max, Math.max(lo, hi));
    }
    return min <= max && Number.isFinite(min) && Number.isFinite(max) ? [add(data.anchor, scale(data.direction, min)), add(data.anchor, scale(data.direction, max))] : [];
  };
  const updateMasks = (): void => {
    if (destroyed) return;
    const start = performance.now();
    if (entry.viewMode !== '3d' || !surfaces.length) { clear(); lastFrameMs = performance.now() - start; return; }
    const geometry: any[] = [];
    const lines = [...entry.linearObjects].filter(visible).map(owner => ({ owner, data: read(readers.line, owner) })).filter(item => !!item.data);
    const circles = [...entry.circleObjects].filter(owner => visible(owner) && !filledCircle(owner)).map(owner => ({ owner, data: read(readers.circle, owner) })).filter(item => !!item.data);
    const points = [...entry.points].filter(visible).map(owner => ({ owner, point: pointOf(owner) })).filter(item => !!item.point);
    const curves = [...entry.curveObjects].filter(visible).map(owner => ({ owner, data: read(readers.curve, owner) })).filter(item => !!item.data);
    promotePrimitives([...lines, ...circles, ...curves, ...points].map(item => item.owner));
    lines.forEach(item => geometry.push([id(item.owner), item.data]));
    circles.forEach(item => geometry.push([id(item.owner), item.data]));
    points.forEach(item => geometry.push([id(item.owner), item.point]));
    const sampledCurves = curves.map(item => {
      const data = item.data!;
      const samples = Array.from({ length: 129 }, (_, index) => data.evaluate(data.range[0] + (data.range[1] - data.range[0]) * index / 128)).filter(finite);
      geometry.push([id(item.owner), samples]); return { owner: item.owner, samples };
    });
    const signature = frameSignature + JSON.stringify(geometry);
    if (signature === lastMaskSignature) { lastFrameMs = performance.now() - start; return; }
    lastMaskSignature = signature;
    const owners = new Set<any>([...targets.map(item => item.owner), ...lines.map(item => item.owner), ...circles.map(item => item.owner), ...sampledCurves.map(item => item.owner)]);
    masks.forEach((record, owner) => { if (!owners.has(owner)) { restoreMask(record); masks.delete(owner); } });
    restoreOpacities();
    targets.forEach(surface => { surfaceMask(surface); setLabelOpacity(surface.owner, surface.anchor); });
    lines.forEach(({ owner, data }) => { const points = linePoints(data!); curveMask(owner, points); if (points.length) setLabelOpacity(owner, scale(add(points[0], points[points.length - 1]), 0.5)); });
    circles.forEach(({ owner, data }) => {
      const circle = data!;
      const points = Array.from({ length: 129 }, (_, index): Vector3 => {
        const angle = index * Math.PI * 2 / 128;
        return add(circle.center, add(scale(circle.direction1, circle.radius * Math.cos(angle)), scale(circle.direction2, circle.radius * Math.sin(angle))));
      });
      curveMask(owner, points); setLabelOpacity(owner, circle.center);
    });
    sampledCurves.forEach(({ owner, samples }) => { curveMask(owner, samples); if (samples.length) setLabelOpacity(owner, samples[Math.floor(samples.length / 2)]); });
    points.forEach(({ owner, point }) => {
      const opacity = opacityAt(point!, owner);
      svgNodes(owner).forEach(node => setOpacity(node, opacity)); labelsOf(owner).forEach(node => setOpacity(node, opacity));
    });
    lastFrameMs = performance.now() - start;
  };
  return {
    get hasSurfaces() { return surfaces.length > 0; },
    get lastFrameMs() { return lastFrameMs; },
    get maskedNodes() { return [...masks.values()].reduce((count, record) => count + record.nodes.size, 0); },
    beginFrame, opacityAt, updateMasks, clear,
    destroy() { clear(); surfaces = []; targets = []; destroyed = true; }
  };
}