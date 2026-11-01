// Pure parser for @CoordinateSystem / @Koordinatensystem options.
// Kept separate from the JSXGraph board lifecycle so the lightweight static
// entry point does not have to bundle any interactive board helpers.

import { splitTopLevel, unquote } from './parser';
import { DEFAULT_CAMERA_3D, normalizeProjection3D, normalizeSceneMode, normalizeSpatialRanges3D } from './scene3d';
import type { Camera3D, Projection3D, SceneMode, SpatialRanges3D } from './scene3d';

export interface BoardConfig {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  zmin: number;
  zmax: number;
  mode: SceneMode;
  viewMode: SceneMode;
  projection: Projection3D;
  camera: Camera3D;
  viewport3d?: SpatialRanges3D;
  width: number | null;
  id: string;
  axes: boolean;
  grid: boolean;
  border: boolean;
  staticMode: boolean;
}
function toNumber(value: unknown, fallback: number): number {
  const parsed = parseFloat(String(value == null ? '' : value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCamera(value: unknown, named: Record<string, string>): Camera3D {
  const values = String(value == null ? '' : value).split(/[/:|]/).map(part => toNumber(part.trim(), NaN));
  return {
    azimuth: toNumber(named.azimuth, Number.isFinite(values[0]) ? values[0] : DEFAULT_CAMERA_3D.azimuth),
    elevation: toNumber(named.elevation, Number.isFinite(values[1]) ? values[1] : DEFAULT_CAMERA_3D.elevation),
    bank: toNumber(named.bank, Number.isFinite(values[2]) ? values[2] : DEFAULT_CAMERA_3D.bank)
  };
}

function parseViewport3D(value: unknown): SpatialRanges3D | null {
  const raw = String(value == null ? '' : value).trim();
  if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
  const parts = splitTopLevel(raw.slice(1, -1), ';');
  if (parts.length !== 6 || parts.some(part => !part.trim())) return null;
  const values = parts.map(part => Number(part.trim().replace(',', '.')));
  return normalizeSpatialRanges3D([
    [values[0], values[1]], [values[2], values[3]], [values[4], values[5]]
  ]);
}

function flag(value: unknown, fallback: boolean): boolean {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (/^(?:0|false|nein|no|off)$/.test(normalized)) return false;
  if (/^(?:1|true|ja|yes|on)$/.test(normalized)) return true;
  return fallback;
}

/** Parse a board spec without touching DOM, JSXGraph, or global registries. */
export function parseCoordSpec(spec: string): BoardConfig {
  const raw = unquote(String(spec || '').trim());
  const named: Record<string, string> = {};
  const positional: string[] = [];

  splitTopLevel(raw).forEach(function(part) {
    const equalsIndex = part.indexOf('=');
    if (equalsIndex < 0) {
      const value = unquote(part).trim();
      if (value) positional.push(value);
      return;
    }
    const key = part.slice(0, equalsIndex).trim().toLowerCase();
    named[key] = unquote(part.slice(equalsIndex + 1).trim());
  });

  const config: BoardConfig = {
    xmin: toNumber(named.xmin, -4),
    xmax: toNumber(named.xmax, 4),
    ymin: toNumber(named.ymin, -3),
    ymax: toNumber(named.ymax, 3),
    zmin: toNumber(named.zmin, -4),
    zmax: toNumber(named.zmax, 4),
    mode: normalizeSceneMode(named.mode != null ? named.mode : named.modus),
    viewMode: normalizeSceneMode(named.view != null ? named.view : named.ansicht, normalizeSceneMode(named.mode != null ? named.mode : named.modus)),
    projection: normalizeProjection3D(named.projection != null ? named.projection : named.projektion),
    camera: parseCamera(named.camera != null ? named.camera : named.kamera, named),
    width: null,
    id: named.id != null ? named.id : 'A1',
    axes: true,
    grid: true,
    border: true,
    staticMode: false
  };

  config.axes = flag(
    named.achsen != null ? named.achsen : (named.axes != null ? named.axes : positional[0]),
    true
  );
  config.grid = flag(named.grid != null ? named.grid : positional[1], true);
  config.border = flag(
    named.border != null ? named.border : (named.rahmen != null ? named.rahmen : positional[2]),
    true
  );

  // Static rendering is deliberately named-only. In particular, the legacy
  // third positional flag and border=0 continue to control only the border.
  config.staticMode = flag(
    named.static != null ? named.static : named.statisch,
    false
  );

  if (!(config.xmax > config.xmin)) config.xmax = config.xmin + 1;
  if (!(config.ymax > config.ymin)) config.ymax = config.ymin + 1;
  if (!(config.zmax > config.zmin)) config.zmax = config.zmin + 1;

  // Keep the 3D camera viewport independent from the planar board bounds so
  // switching back to 2D preserves its own coordinate scale and position.
  const viewport3d = parseViewport3D(named.viewport3d);
  if (viewport3d) config.viewport3d = viewport3d;

  const width = toNumber(named.width, NaN);
  config.width = Number.isFinite(width) && width > 0 ? width : null;
  return config;
}
