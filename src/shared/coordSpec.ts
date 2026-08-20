// Pure parser for @CoordinateSystem / @Koordinatensystem options.
// Kept separate from the JSXGraph board lifecycle so the lightweight static
// entry point does not have to bundle any interactive board helpers.

import { splitTopLevel, unquote } from './parser';

export interface BoardConfig {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
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

  const width = toNumber(named.width, NaN);
  config.width = Number.isFinite(width) && width > 0 ? width : null;
  return config;
}
