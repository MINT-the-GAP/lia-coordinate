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
