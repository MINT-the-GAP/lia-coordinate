// Shared LaTeX name-formatting helpers used by multiple subsystems.

import { normalizeName } from './format';

/**
 * Convert a name with a trailing `_x` into LaTeX subscript form `_{x}`,
 * after stripping \(...\) / $...$ math delimiters.
 *
 * This is the variant shared by circle.ts and linearObjects.ts.
 */
export function subscriptTexName(name: string): string {
  let value = String(name || '').trim();
  if (value.startsWith('\\(') && value.endsWith('\\)')) value = value.slice(2, -2).trim();
  else if (value.startsWith('$') && value.endsWith('$')) value = value.slice(1, -1).trim();
  const subscript = value.match(/^(.+?)_([^{}]+)$/);
  if (subscript) return subscript[1] + '_{' + subscript[2] + '}';
  return value;
}

/**
 * Convert a name with a trailing `_x` into LaTeX subscript form `_{x}`,
 * after normalizing via normalizeName() (strips \(...\)/$...$ delimiters
 * and unwraps a leading \overrightarrow{...}).
 *
 * This is the variant shared by relationObjects.ts and tangentSector.ts.
 */
export function normalizedTexName(name: string): string {
  let value = normalizeName(name);
  const subscript = value.match(/^(.+?)_([^{}]+)$/);
  if (subscript) value = subscript[1] + '_{' + subscript[2] + '}';
  return value;
}
