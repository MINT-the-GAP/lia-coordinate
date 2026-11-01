export type Dgs3DAdvancedGroup = 'vector' | 'measure' | 'analytic' | 'surface' | 'analysis' | 'locus';

export interface Dgs3DAdvancedRuntimeLocation {
  readonly protocol?: string;
  readonly hostname?: string;
}

/**
 * Advanced 3D authoring is still under local development. Keep its UI out of
 * published courses while retaining the renderers for existing constructions.
 */
export function showDgs3DAdvancedToolsLocally(
  runtimeLocation: Dgs3DAdvancedRuntimeLocation | null | undefined =
    typeof window !== 'undefined' ? window.location : undefined
): boolean {
  if (!runtimeLocation) return false;
  if (String(runtimeLocation.protocol || '').toLowerCase() === 'file:') return true;
  const hostname = String(runtimeLocation.hostname || '').trim().toLowerCase()
    .replace(/^\[|\]$/g, '');
  return hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' || hostname === '::1';
}

export interface Dgs3DAdvancedTool {
  readonly id: number;
  readonly key: string;
  readonly group: Dgs3DAdvancedGroup;
  readonly labelDe: string;
  readonly labelEn: string;
}

export const DGS_3D_ADVANCED_GROUPS: ReadonlyArray<{
  key: Dgs3DAdvancedGroup; labelDe: string; labelEn: string;
}> = [
  { key: 'vector', labelDe: 'Vektorrechnung', labelEn: 'Vector operations' },
  { key: 'measure', labelDe: 'Abstände, Winkel und Lage', labelEn: 'Distances, angles and relations' },
  { key: 'analytic', labelDe: 'Analytische Hilfskonstruktionen', labelEn: 'Analytic constructions' },
  { key: 'surface', labelDe: 'Raumkurven und Flächen', labelEn: 'Curves and surfaces' },
  { key: 'analysis', labelDe: 'Kurven- und Flächenanalyse', labelEn: 'Curve and surface analysis' },
  { key: 'locus', labelDe: 'Ortskurven und Ortsflächen', labelEn: 'Locus curves and surfaces' }
];

// Export capability identifiers are persistent. Never renumber or reuse an id.
export const DGS_3D_ADVANCED_TOOLS: readonly Dgs3DAdvancedTool[] = [
  { id: 1200, key: 'vector-add', group: 'vector', labelDe: 'Vektorsumme', labelEn: 'Vector sum' },
  { id: 1201, key: 'vector-subtract', group: 'vector', labelDe: 'Vektordifferenz', labelEn: 'Vector difference' },
  { id: 1202, key: 'vector-scale', group: 'vector', labelDe: 'Skalarmultiplikation', labelEn: 'Scalar multiplication' },
  { id: 1203, key: 'vector-negate', group: 'vector', labelDe: 'Gegenvektor', labelEn: 'Negated vector' },
  { id: 1204, key: 'vector-unit', group: 'vector', labelDe: 'Einheitsvektor', labelEn: 'Unit vector' },
  { id: 1205, key: 'vector-connect', group: 'vector', labelDe: 'Verbindungsvektor', labelEn: 'Connecting vector' },
  { id: 1206, key: 'vector-project', group: 'vector', labelDe: 'Vektorprojektion', labelEn: 'Vector projection' },
  { id: 1207, key: 'vector-project-plane', group: 'vector', labelDe: 'Projektion in Ebene', labelEn: 'Projection into plane' },
  { id: 1208, key: 'vector-cross', group: 'vector', labelDe: 'Kreuzprodukt', labelEn: 'Cross product' },
  { id: 1209, key: 'plane-normal', group: 'vector', labelDe: 'Normalenvektor', labelEn: 'Plane normal' },
  { id: 1210, key: 'magnitude', group: 'measure', labelDe: 'Vektorbetrag', labelEn: 'Vector magnitude' },
  { id: 1211, key: 'dot', group: 'measure', labelDe: 'Skalarprodukt', labelEn: 'Dot product' },
  { id: 1212, key: 'triple', group: 'measure', labelDe: 'Spatprodukt', labelEn: 'Triple product' },
  { id: 1213, key: 'distance-points', group: 'measure', labelDe: 'Abstand Punkt–Punkt', labelEn: 'Point–point distance' },
  { id: 1214, key: 'distance-point-line', group: 'measure', labelDe: 'Abstand Punkt–Gerade', labelEn: 'Point–line distance' },
  { id: 1215, key: 'distance-point-plane', group: 'measure', labelDe: 'Abstand Punkt–Ebene', labelEn: 'Point–plane distance' },
  { id: 1216, key: 'distance-lines', group: 'measure', labelDe: 'Abstand zweier Geraden', labelEn: 'Line distance' },
  { id: 1217, key: 'distance-planes', group: 'measure', labelDe: 'Abstand paralleler Ebenen', labelEn: 'Plane distance' },
  { id: 1218, key: 'angle-vectors', group: 'measure', labelDe: 'Vektorwinkel', labelEn: 'Vector angle' },
  { id: 1219, key: 'angle-lines', group: 'measure', labelDe: 'Geradenwinkel', labelEn: 'Line angle' },
  { id: 1220, key: 'angle-line-plane', group: 'measure', labelDe: 'Winkel Gerade–Ebene', labelEn: 'Line–plane angle' },
  { id: 1221, key: 'angle-planes', group: 'measure', labelDe: 'Ebenenwinkel', labelEn: 'Plane angle' },
  { id: 1222, key: 'relation-lines', group: 'measure', labelDe: 'Lage zweier Geraden', labelEn: 'Line relation' },
  { id: 1223, key: 'relation-line-plane', group: 'measure', labelDe: 'Lage Gerade–Ebene', labelEn: 'Line–plane relation' },
  { id: 1224, key: 'relation-planes', group: 'measure', labelDe: 'Lage zweier Ebenen', labelEn: 'Plane relation' },
  { id: 1225, key: 'relation-point-object', group: 'measure', labelDe: 'Punkt liegt auf Objekt', labelEn: 'Point on object' },
  { id: 1226, key: 'project-point-line', group: 'analytic', labelDe: 'Lotfußpunkt auf Gerade', labelEn: 'Project point to line' },
  { id: 1227, key: 'project-point-plane', group: 'analytic', labelDe: 'Lotfußpunkt auf Ebene', labelEn: 'Project point to plane' },
  { id: 1228, key: 'perpendicular-line-plane', group: 'analytic', labelDe: 'Lotgerade zu Ebene', labelEn: 'Perpendicular line to plane' },
  { id: 1229, key: 'common-perpendicular', group: 'analytic', labelDe: 'Gemeinsame Lotstrecke', labelEn: 'Common perpendicular' },
  { id: 1230, key: 'curve', group: 'surface', labelDe: 'Raumkurve', labelEn: 'Spatial curve' },
  { id: 1231, key: 'surface', group: 'surface', labelDe: 'Parametrische Fläche', labelEn: 'Parametric surface' },
  { id: 1232, key: 'function-surface', group: 'surface', labelDe: 'Funktionsfläche', labelEn: 'Function surface' },
  { id: 1233, key: 'conic', group: 'surface', labelDe: 'Kegelschnitt', labelEn: 'Conic section' },
  { id: 1234, key: 'curve-tangent-vector', group: 'analysis', labelDe: 'Tangentenvektor', labelEn: 'Tangent vector' },
  { id: 1235, key: 'curve-velocity', group: 'analysis', labelDe: 'Geschwindigkeitsvektor', labelEn: 'Velocity vector' },
  { id: 1236, key: 'curve-tangent', group: 'analysis', labelDe: 'Tangentengerade', labelEn: 'Tangent line' },
  { id: 1237, key: 'curve-normal-plane', group: 'analysis', labelDe: 'Normalebene', labelEn: 'Normal plane' },
  { id: 1238, key: 'curve-arc-length', group: 'analysis', labelDe: 'Bogenlänge', labelEn: 'Arc length' },
  { id: 1239, key: 'surface-tangent-plane', group: 'analysis', labelDe: 'Tangentialebene', labelEn: 'Tangent plane' },
  { id: 1240, key: 'surface-tangent-u', group: 'analysis', labelDe: 'Tangentenrichtung u', labelEn: 'Tangent direction u' },
  { id: 1241, key: 'surface-tangent-v', group: 'analysis', labelDe: 'Tangentenrichtung v', labelEn: 'Tangent direction v' },
  { id: 1242, key: 'surface-normal', group: 'analysis', labelDe: 'Flächennormale', labelEn: 'Surface normal' },
  { id: 1243, key: 'locus-curve', group: 'locus', labelDe: 'Ortskurve', labelEn: 'Locus curve' },
  { id: 1244, key: 'locus-surface', group: 'locus', labelDe: 'Ortsfläche', labelEn: 'Locus surface' }
];

export function dgs3DAdvancedToolLabel(tool: Pick<Dgs3DAdvancedTool, 'labelDe' | 'labelEn'>, language: string): string {
  return language === 'de' ? tool.labelDe : tool.labelEn;
}

export function isDgs3DAdvancedToolAvailable(
  available: ReadonlySet<number> | null | undefined,
  key: string
): boolean {
  const tool = DGS_3D_ADVANCED_TOOLS.find(candidate => candidate.key === key);
  return !!tool && (available == null || available.has(tool.id));
}

const groupPaths: Record<Dgs3DAdvancedGroup, string> = {
  vector: '<path d="M3 18L10 11M10 11L6 11M10 11L10 15M10 11L19 4M19 4L15 4M19 4L19 8M3 18L19 4"/>',
  measure: '<path d="M4 17L19 6M4 17L7 17M4 17L4 14M19 6L16 6M19 6L19 9M5 7A7 7 0 0 1 12 14"/><circle cx="4" cy="17" r="1.2"/><circle cx="19" cy="6" r="1.2"/>',
  analytic: '<path d="M5 18L18 18M5 18V5M5 18L15 8M15 8L11 9M15 8L14 12M11 12V18"/><circle cx="11" cy="12" r="1.4"/>',
  surface: '<path d="M3 16C7 10 11 19 21 8M4 19C8 13 12 22 22 11M6 10L4 19M11 8L9 18M16 6L14 17M21 5L19 15"/>',
  analysis: '<path d="M3 18C7 8 12 19 21 6M6 14L19 10M12 12L15 5M15 5L12 7M15 5L16 9"/><circle cx="12" cy="12" r="1.4"/>',
  locus: '<path d="M3 18C6 7 12 20 21 5" stroke-dasharray="2 3"/><circle cx="4" cy="15" r="1.2"/><circle cx="11" cy="13" r="1.2"/><circle cx="19" cy="7" r="1.2"/>'
};

export function dgs3DAdvancedToolIcon(tool: Dgs3DAdvancedTool | Dgs3DAdvancedGroup): string {
  const group = typeof tool === 'string' ? tool : tool.group;
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + groupPaths[group] + '</svg>';
}
