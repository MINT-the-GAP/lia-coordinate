// Shared parser utilities used by all subsystems.
// splitTopLevel and unquote deduplicated from 6+ per-subsystem copies.

/**
 * Split a string on `;` or `,` at the top level — ignoring separators inside
 * quotes (`"`, `'`, `` ` ``) or brackets (`(`, `[`, `{`).
 *
 * @param str   The string to split.
 * @param sep   Optional single separator character (default: splits on both `;` and `,`).
 */
export function splitTopLevel(str: string, sep?: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = '';
  let esc = false;
  let depth = 0;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (esc) {
      cur += ch;
      esc = false;
      continue;
    }

    if (ch === '\\') {
      cur += ch;
      esc = true;
      continue;
    }

    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      cur += ch;
      quote = ch;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      cur += ch;
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
      cur += ch;
      continue;
    }

    const isSep = sep ? ch === sep : (ch === ';' || ch === ',');
    if (isSep && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }

    cur += ch;
  }

  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Strip a single layer of matching quotes (`"…"`, `'…'`, `` `…` ``) from a value.
 */
export function unquote(v: string): string {
  const s = String(v || '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('`') && s.endsWith('`'))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

export interface CoordinatePair {
  x: number;
  y: number;
}

/**
 * Parse a nested coordinate list such as [[2;3];[4;4];[6;2]].
 * Returns null for ordinary point-name lists such as [A;B].
 */
export function parseCoordinateList(value: unknown): CoordinatePair[] | null {
  const raw = unquote(String(value == null ? '' : value)).trim();
  if (!raw.startsWith('[') || !raw.endsWith(']')) return null;
  const entries = splitTopLevel(raw.slice(1, -1), ';');
  if (!entries.length) return null;
  const coordinates: CoordinatePair[] = [];
  for (const entryValue of entries) {
    const entry = unquote(String(entryValue || '')).trim();
    if (!entry.startsWith('[') || !entry.endsWith(']')) return null;
    const pair = splitTopLevel(entry.slice(1, -1), ';')
      .map((part) => unquote(part).trim());
    if (pair.length !== 2) return null;
    const x = Number(pair[0].replace(',', '.'));
    const y = Number(pair[1].replace(',', '.'));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    coordinates.push({ x, y });
  }
  return coordinates;
}
