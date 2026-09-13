// Resolve the course language for controls, including legacy markers without metadata.
export type UiLanguage = 'de' | 'en';

export function resolveUiLanguage(anchor: HTMLElement | null, explicitLanguage?: string): UiLanguage {
  const candidates = [String(explicitLanguage || '')];
  try { candidates.push(anchor?.dataset.language || ''); } catch (e) {}
  try { candidates.push(anchor?.closest('[lang]')?.getAttribute('lang') || ''); } catch (e) {}
  try { candidates.push(document.documentElement.lang || ''); } catch (e) {}
  try { candidates.push(window.parent?.document?.documentElement?.lang || ''); } catch (e) {}

  for (const candidate of candidates) {
    const code = candidate.trim();
    if (/^de(?:-|$)/i.test(code)) return 'de';
    if (/^en(?:-|$)/i.test(code)) return 'en';
  }
  return 'en';
}

// LiaScript publishes the active course/translation language on <html lang>.
// Keep one observer per document; each subsystem registers once during init().
const courseLanguageListeners = new WeakMap<Document, Set<() => void>>();

export function onCourseLanguageChange(listener: () => void): void {
  try {
    if (!document.documentElement) return;
    let listeners = courseLanguageListeners.get(document);
    if (!listeners) {
      const callbacks = new Set<() => void>();
      const observer = new MutationObserver(() => {
        callbacks.forEach(callback => { try { callback(); } catch (e) {} });
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      courseLanguageListeners.set(document, callbacks);
      listeners = callbacks;
    }
    listeners.add(listener);
  } catch (e) {}
}
