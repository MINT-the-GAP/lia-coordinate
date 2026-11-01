export interface AngleLabelPlacement {
  x: number;
  y: number;
  distancePx: number;
  radiusPx: number;
  widthPx: number;
  heightPx: number;
  inside: boolean;
}

interface AngleLabelOptions {
  label?: any;
  text?: string;
  fontSize?: number;
  radians?: number;
  paddingPx?: number;
}

interface XY {
  x: number;
  y: number;
}

function pointCoordinates(point: any): XY | null {
  try {
    const x = Number(point?.X());
    const y = Number(point?.Y());
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch (e) {
    return null;
  }
}

function directedAngleRadians(first: XY, vertex: XY, third: XY): number {
  const ux = first.x - vertex.x;
  const uy = first.y - vertex.y;
  const vx = third.x - vertex.x;
  const vy = third.y - vertex.y;
  if (Math.hypot(ux, uy) <= 1e-12 || Math.hypot(vx, vy) <= 1e-12) return NaN;
  let radians = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (radians < 0) radians += Math.PI * 2;
  return radians;
}

function estimateLabelSize(text: string, fontSize: number): { width: number; height: number } {
  const visible = String(text || '')
    .replace(/\\(?:left|right)/g, '')
    .replace(/\\angle/g, '∠')
    .replace(/\\(?:approx|sim|cong|equiv|leq|geq)/g, '≈')
    .replace(/\\circ/g, '°')
    .replace(/\\[a-z]+/gi, 'x')
    .replace(/[_^]\{([^{}]*)\}/g, '$1')
    .replace(/[\\{}$()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const characterCount = Math.max(2, Array.from(visible).length);
  return {
    width: Math.min(360, Math.max(fontSize * 1.8, characterCount * fontSize * 0.58 + fontSize * 0.6)),
    height: fontSize * 1.35
  };
}

function labelSize(options: AngleLabelOptions): { width: number; height: number } {
  const fontSize = Math.max(8, Number(options.fontSize) || 18);
  try {
    const rect = options.label?.rendNode?.getBoundingClientRect?.();
    const width = Number(rect?.width);
    const height = Number(rect?.height);
    if (Number.isFinite(width) && width > 1 && Number.isFinite(height) && height > 1) {
      return { width: Math.min(600, width), height: Math.min(200, height) };
    }
  } catch (e) {}
  return estimateLabelSize(String(options.text || ''), fontSize);
}

function labelFitsBesideRay(
  centerX: number,
  centerY: number,
  rayX: number,
  rayY: number,
  width: number,
  height: number,
  padding: number
): boolean {
  const rayLength = Math.hypot(rayX, rayY);
  if (rayLength <= 1e-9) return false;
  const tangentX = rayX / rayLength;
  const tangentY = rayY / rayLength;
  const projection = centerX * tangentX + centerY * tangentY;
  if (projection <= 0) {
    return Math.hypot(centerX, centerY) >= Math.hypot(width / 2, height / 2) + padding;
  }
  const normalX = -tangentY;
  const normalY = tangentX;
  const distance = Math.abs(centerX * normalX + centerY * normalY);
  const labelExtent = Math.abs(normalX) * width / 2 + Math.abs(normalY) * height / 2;
  return distance >= labelExtent + padding;
}

/**
 * Positions an angle label relative to the visible sector in screen pixels.
 * The label moves inside once the sector has enough radial and angular room;
 * otherwise it remains just outside with a stable pixel gap.
 */
export function positionAngleLabel(
  board: any,
  points: any[],
  radius: number,
  options: AngleLabelOptions = {}
): AngleLabelPlacement {
  const first = pointCoordinates(points?.[0]);
  const vertex = pointCoordinates(points?.[1]);
  const third = pointCoordinates(points?.[2]);
  if (!first || !vertex || !third) {
    return { x: 0, y: 0, distancePx: 0, radiusPx: 0, widthPx: 0, heightPx: 0, inside: false };
  }

  const startX = first.x - vertex.x;
  const startY = first.y - vertex.y;
  const radians = Number.isFinite(Number(options.radians))
    ? Number(options.radians)
    : directedAngleRadians(first, vertex, third);
  if (Math.hypot(startX, startY) <= 1e-12 || !Number.isFinite(radians)) {
    return { x: vertex.x, y: vertex.y, distancePx: 0, radiusPx: 0,
      widthPx: 0, heightPx: 0, inside: false };
  }

  const direction = Math.atan2(startY, startX) + radians / 2;
  const directionX = Math.cos(direction);
  const directionY = Math.sin(direction);
  const unitX = Math.max(1e-9, Math.abs(Number(board?.unitX) || 1));
  const unitY = Math.max(1e-9, Math.abs(Number(board?.unitY) || 1));
  const pixelsPerUnit = Math.max(1e-9, Math.hypot(directionX * unitX, directionY * unitY));
  const screenDirectionX = directionX * unitX / pixelsPerUnit;
  const screenDirectionY = -directionY * unitY / pixelsPerUnit;
  const radiusPx = Math.max(0, Number(radius) || 0) * pixelsPerUnit;
  const size = labelSize(options);
  const padding = Math.max(2, Number(options.paddingPx) || 4);
  const radialHalfExtent = Math.abs(screenDirectionX) * size.width / 2 +
    Math.abs(screenDirectionY) * size.height / 2;
  const minimumInsideDistance = radialHalfExtent + padding;
  const maximumInsideDistance = radiusPx - radialHalfExtent - padding;
  const desiredInsideDistance = radiusPx * 0.62;
  const insideDistance = Math.min(
    maximumInsideDistance,
    Math.max(minimumInsideDistance, desiredInsideDistance)
  );
  const centerX = screenDirectionX * insideDistance;
  const centerY = screenDirectionY * insideDistance;
  const startRayX = startX * unitX;
  const startRayY = -startY * unitY;
  const endRayX = (third.x - vertex.x) * unitX;
  const endRayY = -(third.y - vertex.y) * unitY;
  const inside = maximumInsideDistance >= minimumInsideDistance &&
    labelFitsBesideRay(centerX, centerY, startRayX, startRayY, size.width, size.height, padding) &&
    labelFitsBesideRay(centerX, centerY, endRayX, endRayY, size.width, size.height, padding);
  const distancePx = inside ? insideDistance : radiusPx + radialHalfExtent + 8;
  const distance = distancePx / pixelsPerUnit;

  return {
    x: vertex.x + directionX * distance,
    y: vertex.y + directionY * distance,
    distancePx,
    radiusPx,
    widthPx: size.width,
    heightPx: size.height,
    inside
  };
}
