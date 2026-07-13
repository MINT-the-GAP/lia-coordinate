// Shared formatting/name-comparison helpers used by multiple subsystems.

/** Round to 3 decimals and localize the decimal separator for display. */
export function formatNumber(value: number, language: 'de' | 'en'): string {
  if (!Number.isFinite(value)) return '?';
  const rounded = Math.abs(value) < 5e-10 ? 0 : Math.round((value + Number.EPSILON) * 1000) / 1000;
  let text = String(rounded);
  if (language === 'de') text = text.replace('.', '{,}');
  return text;
}

/**
 * Normalize a point/object name for comparison: strips \(...\) or $...$
 * math delimiters and unwraps a leading \overrightarrow{...}.
 *
 * This is the variant shared by relationObjects.ts and tangentSector.ts.
 */
export function normalizeName(value: unknown): string {
  let name = String(value == null ? '' : value).trim();
  if (name.startsWith('\\(') && name.endsWith('\\)')) name = name.slice(2, -2).trim();
  else if (name.startsWith('$') && name.endsWith('$')) name = name.slice(1, -1).trim();
  name = name.replace(/^\\overrightarrow\{(.+)\}$/, '$1');
  return name;
}

/** Compare two names for equality after normalizeName(). */
export function namesEqual(a: unknown, b: unknown): boolean {
  return !!normalizeName(a) && normalizeName(a) === normalizeName(b);
}
