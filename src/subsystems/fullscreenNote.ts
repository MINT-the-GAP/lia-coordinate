// Fullscreen note subsystem (@Vollbildnotiz / @FullscreenNote).
// Mirrors normally rendered LiaScript content into one collapsible bottom bar per board.

import { scheduleBootstrap } from '../shared/bootstrap';

type FullscreenNoteLanguage = 'de' | 'en';

type FullscreenNoteLabels = {
  title: string;
  show: string;
  hide: string;
};

type FullscreenNoteHost = {
  boardId: string;
  board: any;
  container: HTMLElement;
  bar: HTMLDivElement;
  toggle: HTMLButtonElement;
  toggleIcon: HTMLSpanElement;
  title: HTMLSpanElement;
  viewport: HTMLDivElement;
  content: HTMLDivElement;
  entries: Map<string, FullscreenNoteEntry>;
  language: FullscreenNoteLanguage;
  fullscreenActive: boolean;
  open: boolean;
  openFrame?: number;
};

type FullscreenNoteEntry = {
  uid: string;
  boardId: string;
  language: FullscreenNoteLanguage;
  start: HTMLElement;
  end: HTMLElement;
  sourceRoot: Node;
  section: HTMLDivElement;
  host: FullscreenNoteHost;
  observer: MutationObserver | null;
  renderFrame?: number;
  renderVersion: number;
};

type LiaFormulaElement = HTMLElement & {
  formula?: unknown;
  macros?: unknown;
  __liaFullscreenNoteFormulaState?: {
    formula: unknown;
    macros: unknown;
  };
};

const entries = new Map<string, FullscreenNoteEntry>();
const hosts = new Map<string, FullscreenNoteHost>();
let pendingNotes = false;
let bootstrapFrame = 0;
let hostSequence = 0;

export function fullscreenNoteLabels(language: unknown): FullscreenNoteLabels {
  return String(language || '').toLowerCase().startsWith('de')
    ? {
        title: 'Vollbildnotizen',
        show: 'Vollbildnotizen anzeigen',
        hide: 'Vollbildnotizen ausblenden'
      }
    : {
        title: 'Fullscreen notes',
        show: 'Show fullscreen notes',
        hide: 'Hide fullscreen notes'
      };
}

/** Return the rendered top-level nodes enclosed by a macro's two block markers. */
export function fullscreenNoteSourceNodes(start: Node, end: Node): Node[] {
  if (!start || !end || !start.parentNode || start.parentNode !== end.parentNode) return [];
  const nodes: Node[] = [];
  let current = start.nextSibling;
  while (current && current !== end) {
    nodes.push(current);
    current = current.nextSibling;
  }
  return current === end ? nodes : [];
}

function noteLanguage(value: unknown): FullscreenNoteLanguage {
  if (String(value || '').toLowerCase().startsWith('de')) return 'de';
  if (String(value || '').toLowerCase().startsWith('en')) return 'en';
  return String(document.documentElement.lang || '').toLowerCase().startsWith('de') ? 'de' : 'en';
}

function markerUid(marker: HTMLElement): string {
  return String(marker.id || '').replace(/^fullscreen-note-start-/, '');
}

function findEndMarker(start: HTMLElement, uid: string): HTMLElement | null {
  const root = start.getRootNode?.() as Document | ShadowRoot;
  const id = 'fullscreen-note-end-' + uid;
  const fromRoot = root && typeof (root as any).getElementById === 'function'
    ? (root as any).getElementById(id)
    : null;
  return (fromRoot || document.getElementById(id)) as HTMLElement | null;
}

function fullscreenNoteRange(start: HTMLElement, end: HTMLElement): Range | null {
  if (!start.isConnected || !end.isConnected || start.getRootNode() !== end.getRootNode()) return null;
  try {
    const relation = start.compareDocumentPosition(end);
    if (!(relation & Node.DOCUMENT_POSITION_FOLLOWING)) return null;
    const range = start.ownerDocument.createRange();
    range.setStartAfter(start);
    range.setEndBefore(end);
    return range;
  } catch (error) {
    return null;
  }
}

function fullscreenNoteSourceRoot(start: HTMLElement, end: HTMLElement): Node | null {
  const range = fullscreenNoteRange(start, end);
  if (!range) return null;
  const common = range.commonAncestorContainer;
  return common.nodeType === Node.TEXT_NODE ? common.parentNode : common;
}

function isFullscreenContainer(container: HTMLElement): boolean {
  try { if (container.matches(':fullscreen')) return true; } catch (error) {}
  try { if (container.matches(':-webkit-full-screen')) return true; } catch (error) {}
  try {
    const root = container.getRootNode?.() as Document | ShadowRoot;
    if (root && (root as any).fullscreenElement === container) return true;
  } catch (error) {}
  return document.fullscreenElement === container ||
    (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement === container;
}

function ensureFullscreenNoteCss(container: HTMLElement): void {
  const root = container.getRootNode?.() as Document | ShadowRoot;
  if (!root || typeof root.querySelector !== 'function' ||
      root.querySelector('style[data-lia-fullscreen-note-style]')) return;
  const style = document.createElement('style');
  style.dataset.liaFullscreenNoteStyle = '1';
  style.textContent = `
    .lia-dgs-fullscreen-note-bar {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 47;
      display: none;
      max-height: 35vh;
      max-height: 35dvh;
      box-sizing: border-box;
      flex-direction: column;
      overflow: visible;
      color: var(--lia-dgs-neutral-color, currentColor);
      background: var(--lia-dgs-menu-bg, rgba(255,255,255,.97));
      border-top: 0;
      border-radius: 12px 12px 0 0;
      box-shadow: 0 -2px 10px rgba(0,0,0,.12);
      transform: translateY(calc(100% - 16px));
      transition: transform 260ms cubic-bezier(.2,.8,.2,1);
      pointer-events: auto;
      isolation: isolate;
    }
    .lia-dgs-fullscreen-note-bar[data-fullscreen="1"] {
      display: flex;
    }
    .lia-dgs-fullscreen-note-bar[data-fullscreen="1"][data-open="1"] {
      transform: translateY(0);
    }
    .lia-dgs-fullscreen-note-toggle {
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      top: 0 !important;
      bottom: auto !important;
      width: 100% !important;
      max-width: none;
      min-height: 32px !important;
      height: 32px !important;
      margin: 0 !important;
      padding: 0 14px !important;
      transform: translateY(-50%);
      z-index: 1;
      display: flex !important;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-sizing: border-box;
      border: 0 !important;
      border-radius: 0 !important;
      color: inherit !important;
      background: transparent !important;
      box-shadow: none !important;
      font: inherit;
      font-size: 13px !important;
      font-weight: 650 !important;
      line-height: 1 !important;
      cursor: pointer;
      touch-action: manipulation;
    }
    .lia-dgs-fullscreen-note-toggle::before,
    .lia-dgs-fullscreen-note-toggle::after {
      content: '';
      height: 1px;
      min-width: 10px;
      flex: 1 1 48px;
      background: color-mix(in srgb, var(--lia-dgs-theme-color, currentColor) 68%, transparent);
      transition: background-color 160ms ease;
    }
    .lia-dgs-fullscreen-note-toggle:hover,
    .lia-dgs-fullscreen-note-toggle:focus-visible {
      background: transparent !important;
      outline: none;
    }
    .lia-dgs-fullscreen-note-toggle:hover::before,
    .lia-dgs-fullscreen-note-toggle:hover::after,
    .lia-dgs-fullscreen-note-toggle:focus-visible::before,
    .lia-dgs-fullscreen-note-toggle:focus-visible::after {
      background: var(--lia-dgs-theme-color, currentColor);
    }
    .lia-dgs-fullscreen-note-toggle-label {
      flex: 0 0 auto;
      height: 24px;
      padding: 0 8px 0 4px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      box-sizing: border-box;
      color: inherit;
      background: var(--lia-dgs-menu-bg, rgba(255,255,255,.97));
      border: 1px solid var(--lia-dgs-theme-color, currentColor);
      border-radius: 999px;
      box-shadow: 0 1px 4px rgba(0,0,0,.12);
      transition: background-color 160ms ease, box-shadow 160ms ease;
    }
    .lia-dgs-fullscreen-note-title {
      white-space: nowrap;
    }
    .lia-dgs-fullscreen-note-toggle-icon {
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--lia-dgs-theme-color, currentColor);
      background: color-mix(in srgb, var(--lia-dgs-theme-color, currentColor) 14%, transparent);
      border-radius: 50%;
      transition: background-color 160ms ease;
    }
    .lia-dgs-fullscreen-note-toggle-icon::before {
      content: '';
      width: 6px;
      height: 6px;
      box-sizing: border-box;
      border-right: 2px solid currentColor;
      border-bottom: 2px solid currentColor;
      transform: translateY(2px) rotate(-135deg);
      transition: transform 220ms cubic-bezier(.2,.8,.2,1);
    }
    .lia-dgs-fullscreen-note-bar[data-open="1"] .lia-dgs-fullscreen-note-toggle-icon::before {
      transform: translateY(-2px) rotate(45deg);
    }
    .lia-dgs-fullscreen-note-toggle:hover .lia-dgs-fullscreen-note-toggle-icon,
    .lia-dgs-fullscreen-note-toggle:focus-visible .lia-dgs-fullscreen-note-toggle-icon {
      background: color-mix(in srgb, var(--lia-dgs-theme-color, currentColor) 22%, transparent);
    }
    .lia-dgs-fullscreen-note-toggle:hover .lia-dgs-fullscreen-note-toggle-label {
      background: color-mix(
        in srgb,
        var(--lia-dgs-menu-bg, rgba(255,255,255,.97)) 92%,
        var(--lia-dgs-theme-color, currentColor)
      );
    }
    .lia-dgs-fullscreen-note-toggle:focus-visible .lia-dgs-fullscreen-note-toggle-label {
      box-shadow:
        0 0 0 2px var(--lia-dgs-menu-bg, rgba(255,255,255,.97)),
        0 0 0 4px var(--lia-dgs-theme-color, currentColor);
    }
    .lia-dgs-fullscreen-note-viewport {
      min-height: 0;
      padding: 18px 18px 16px;
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      text-align: left;
      line-height: 1.45;
    }
    .lia-dgs-fullscreen-note-content {
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .lia-dgs-fullscreen-note-bar[data-open="0"] .lia-dgs-fullscreen-note-viewport {
      visibility: hidden;
      pointer-events: none;
    }
    .lia-dgs-fullscreen-note-entry + .lia-dgs-fullscreen-note-entry {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    }
    .lia-dgs-fullscreen-note-entry[data-note-first="1"] {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }
    .lia-dgs-fullscreen-note-entry > :first-child { margin-top: 0 !important; }
    .lia-dgs-fullscreen-note-entry > :last-child { margin-bottom: 0 !important; }
    .lia-dgs-fullscreen-note-entry p { margin: .45em 0; }
    .lia-dgs-fullscreen-note-entry ul,
    .lia-dgs-fullscreen-note-entry ol { margin: .45em 0; padding-inline-start: 1.6em; }
    .lia-dgs-fullscreen-note-entry mjx-container {
      max-width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
    }
    @media (prefers-reduced-motion: reduce) {
      .lia-dgs-fullscreen-note-bar,
      .lia-dgs-fullscreen-note-toggle-icon,
      .lia-dgs-fullscreen-note-toggle-icon::before { transition: none !important; }
    }
  `;
  if (root instanceof Document) (root.head || root.documentElement).appendChild(style);
  else root.appendChild(style);
}

function cloneSourceNodes(entry: FullscreenNoteEntry): DocumentFragment {
  const range = fullscreenNoteRange(entry.start, entry.end);
  const fragment = range?.cloneContents() || document.createDocumentFragment();
  if (range) rehydrateLiaFormulas(range, fragment);
  const idPrefix = 'lia-fullscreen-note-' + entry.uid + '-' + entry.renderVersion + '-';
  Array.from(fragment.querySelectorAll('script,style')).forEach(node => node.remove());
  remapCloneIds(fragment, idPrefix);
  return fragment;
}

/**
 * Chromium clones clonable shadow roots with custom elements. LiaScript's
 * <lia-formula> then runs connectedCallback on that clone and tries to attach
 * a second shadow root. Recreate the host instead and pass its public formula
 * state through so KaTeX renders a fresh, independent copy.
 */
function rehydrateLiaFormulas(range: Range, fragment: DocumentFragment): void {
  const cloned = Array.from(fragment.querySelectorAll<LiaFormulaElement>('lia-formula'));
  if (!cloned.length) return;
  const common = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer as Element
    : range.commonAncestorContainer.parentElement;
  if (!common) return;
  const source = Array.from(common.querySelectorAll<LiaFormulaElement>('lia-formula'))
    .filter(element => {
      try { return range.intersectsNode(element); } catch (error) { return false; }
    });
  cloned.forEach((clone, index) => {
    const original = source[index];
    if (!original) {
      clone.remove();
      return;
    }
    const replacement = document.createElement('lia-formula') as LiaFormulaElement;
    replacement.dataset.liaFullscreenNoteFormula = '1';
    Array.from(original.attributes).forEach(attribute => {
      replacement.setAttribute(attribute.name, attribute.value);
    });
    // LiaScript's setters render immediately and create the shadow root. Keep
    // their values aside until connectedCallback has created its own root.
    replacement.__liaFullscreenNoteFormulaState = {
      formula: original.formula,
      macros: original.macros
    };
    clone.replaceWith(replacement);
  });
}

function hydrateLiaFormulas(root: ParentNode): void {
  root.querySelectorAll<LiaFormulaElement>('lia-formula').forEach(element => {
    const state = element.__liaFullscreenNoteFormulaState;
    if (!state) return;
    delete element.__liaFullscreenNoteFormulaState;
    element.macros = state.macros;
    element.formula = state.formula;
  });
}

function remapCloneIds(root: Node, prefix: string): void {
  const elements: Element[] = [];
  if (root.nodeType === Node.ELEMENT_NODE) elements.push(root as Element);
  if (typeof (root as ParentNode).querySelectorAll === 'function') {
    elements.push(...Array.from((root as ParentNode).querySelectorAll('*')));
  }
  const idMap = new Map<string, string>();
  elements.forEach((element) => {
    const oldId = element.getAttribute('id');
    if (!oldId) return;
    const newId = prefix + oldId.replace(/[^A-Za-z0-9_.:-]/g, '-');
    idMap.set(oldId, newId);
    element.setAttribute('id', newId);
  });
  if (!idMap.size) return;
  elements.forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (attribute.name === 'id') return;
      let value = attribute.value;
      idMap.forEach((newId, oldId) => {
        value = value
          .split('url(#' + oldId + ')').join('url(#' + newId + ')')
          .split('#' + oldId).join('#' + newId);
        if (['aria-labelledby', 'aria-describedby', 'aria-controls', 'for'].includes(attribute.name)) {
          value = value.split(/\s+/).map(token => token === oldId ? newId : token).join(' ');
        }
      });
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    });
  });
}

function applyHostLanguage(host: FullscreenNoteHost, language: FullscreenNoteLanguage): void {
  host.language = language;
  const labels = fullscreenNoteLabels(language);
  host.title.textContent = labels.title;
  const action = host.open ? labels.hide : labels.show;
  host.toggle.setAttribute('aria-label', action);
  host.toggle.title = action;
  host.viewport.setAttribute('aria-label', labels.title);
}

function setHostOpen(host: FullscreenNoteHost, open: boolean): void {
  host.open = open;
  host.bar.dataset.open = open ? '1' : '0';
  host.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  applyHostLanguage(host, host.language);
}

function syncHostFullscreen(host: FullscreenNoteHost): void {
  if (!host.container.isConnected || window.__boards?.[host.boardId] !== host.board) {
    scheduleFullscreenNotes();
    return;
  }
  const active = isFullscreenContainer(host.container);
  host.bar.dataset.fullscreen = active ? '1' : '0';
  host.bar.setAttribute('aria-hidden', active ? 'false' : 'true');
  if (active && !host.fullscreenActive) {
    host.fullscreenActive = true;
    setHostOpen(host, false);
    if (host.openFrame != null) cancelAnimationFrame(host.openFrame);
    host.openFrame = requestAnimationFrame(() => {
      host.openFrame = undefined;
      if (host.fullscreenActive && isFullscreenContainer(host.container)) setHostOpen(host, true);
    });
  } else if (!active && host.fullscreenActive) {
    host.fullscreenActive = false;
    if (host.openFrame != null) cancelAnimationFrame(host.openFrame);
    host.openFrame = undefined;
    setHostOpen(host, false);
  }
}

function createHost(boardId: string, board: any, container: HTMLElement, language: FullscreenNoteLanguage): FullscreenNoteHost {
  ensureFullscreenNoteCss(container);
  hostSequence += 1;
  const bar = document.createElement('div');
  bar.className = 'lia-dgs-fullscreen-note-bar';
  bar.dataset.boardId = boardId;
  bar.dataset.fullscreen = '0';
  bar.dataset.open = '0';
  bar.setAttribute('aria-hidden', 'true');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'lia-dgs-fullscreen-note-toggle';
  toggle.setAttribute('aria-expanded', 'false');

  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'lia-dgs-fullscreen-note-toggle-icon';
  toggleIcon.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.className = 'lia-dgs-fullscreen-note-title';
  const toggleLabel = document.createElement('span');
  toggleLabel.className = 'lia-dgs-fullscreen-note-toggle-label';
  toggleLabel.append(toggleIcon, title);
  toggle.appendChild(toggleLabel);

  const viewport = document.createElement('div');
  viewport.id = 'lia-fullscreen-note-content-' + hostSequence;
  viewport.className = 'lia-dgs-fullscreen-note-viewport';
  viewport.setAttribute('role', 'region');
  const content = document.createElement('div');
  content.className = 'lia-dgs-fullscreen-note-content';
  viewport.appendChild(content);
  toggle.setAttribute('aria-controls', viewport.id);
  bar.append(toggle, viewport);

  const host: FullscreenNoteHost = {
    boardId, board, container, bar, toggle, toggleIcon, title, viewport, content,
    entries: new Map(), language, fullscreenActive: false, open: false
  };
  applyHostLanguage(host, language);
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (host.fullscreenActive) setHostOpen(host, !host.open);
  });
  [
    'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
    'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick',
    'touchstart', 'touchmove', 'touchend', 'touchcancel',
    'wheel', 'keydown', 'keyup'
  ].forEach((eventName) => {
    bar.addEventListener(eventName, event => event.stopPropagation());
  });
  container.appendChild(bar);
  hosts.set(boardId, host);
  syncHostFullscreen(host);
  return host;
}

function disposeHost(host: FullscreenNoteHost): void {
  if (host.openFrame != null) cancelAnimationFrame(host.openFrame);
  host.entries.forEach(entry => {
    if (entry.host === host) entry.section.remove();
  });
  host.entries.clear();
  try { host.bar.remove(); } catch (error) {}
  if (hosts.get(host.boardId) === host) hosts.delete(host.boardId);
}

function ensureHost(boardId: string, language: FullscreenNoteLanguage): FullscreenNoteHost | null {
  const board = window.__boards?.[boardId];
  const container = board?.containerObj as HTMLElement | undefined;
  if (!board || !container || !container.isConnected) return null;
  const existing = hosts.get(boardId);
  if (existing && existing.board === board && existing.container === container && existing.bar.isConnected) {
    ensureFullscreenNoteCss(container);
    applyHostLanguage(existing, language);
    return existing;
  }
  if (existing) disposeHost(existing);
  return createHost(boardId, board, container, language);
}

function renderEntry(entry: FullscreenNoteEntry): void {
  if (!entry.start.isConnected || !entry.end.isConnected || !entry.section.isConnected) {
    scheduleFullscreenNotes();
    return;
  }
  entry.renderVersion += 1;
  entry.section.replaceChildren(cloneSourceNodes(entry));
  hydrateLiaFormulas(entry.section);
}

function scheduleEntryRender(entry: FullscreenNoteEntry): void {
  if (entry.renderFrame != null) return;
  entry.renderFrame = requestAnimationFrame(() => {
    entry.renderFrame = undefined;
    if (entries.get(entry.uid) === entry) renderEntry(entry);
  });
}

function observeEntrySource(entry: FullscreenNoteEntry): void {
  entry.observer?.disconnect();
  entry.observer = null;
  try {
    const observer = new MutationObserver((records) => {
      const relevant = records.filter(record => {
        const target = record.target.nodeType === Node.ELEMENT_NODE
          ? record.target as Element
          : record.target.parentElement;
        return !target?.closest?.('.lia-dgs-fullscreen-note-bar');
      });
      if (!relevant.length) return;
      if (relevant.some(record => record.type === 'childList')) scheduleFullscreenNotes();
      scheduleEntryRender(entry);
    });
    observer.observe(entry.sourceRoot, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });
    entry.observer = observer;
  } catch (error) {}
}

function removeEntry(uid: string): void {
  const entry = entries.get(uid);
  if (!entry) return;
  entry.observer?.disconnect();
  if (entry.renderFrame != null) cancelAnimationFrame(entry.renderFrame);
  entry.host.entries.delete(uid);
  try { entry.section.remove(); } catch (error) {}
  entries.delete(uid);
  if (!entry.host.entries.size) disposeHost(entry.host);
}

function setupEntry(start: HTMLElement): boolean {
  const uid = markerUid(start);
  const boardId = String(start.dataset.boardId || '').trim();
  const language = noteLanguage(start.dataset.language);
  const end = uid ? findEndMarker(start, uid) : null;
  const sourceRoot = end ? fullscreenNoteSourceRoot(start, end) : null;
  const host = boardId ? ensureHost(boardId, language) : null;
  if (!uid || !boardId || !end || !sourceRoot || !host) {
    if (uid) removeEntry(uid);
    return false;
  }

  let entry = entries.get(uid);
  if (entry && (
    entry.start !== start || entry.end !== end || entry.boardId !== boardId || entry.host !== host
  )) {
    removeEntry(uid);
    entry = undefined;
  }

  if (!entry) {
    const section = document.createElement('div');
    section.className = 'lia-dgs-fullscreen-note-entry';
    section.dataset.noteUid = uid;
    entry = {
      uid, boardId, language, start, end, sourceRoot, section, host,
      observer: null, renderVersion: 0
    };
    entries.set(uid, entry);
    host.entries.set(uid, entry);
    host.content.appendChild(section);
    observeEntrySource(entry);
    renderEntry(entry);
  } else {
    entry.language = language;
    if (entry.sourceRoot !== sourceRoot) {
      entry.sourceRoot = sourceRoot;
      observeEntrySource(entry);
      renderEntry(entry);
    }
  }
  return true;
}

function orderHostEntries(host: FullscreenNoteHost): void {
  const ordered = Array.from(host.entries.values()).sort((left, right) => {
    if (left.start === right.start) return 0;
    const relation = left.start.compareDocumentPosition(right.start);
    return relation & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
  // Moving an already connected LiaScript custom element disconnects and
  // reconnects it. <lia-formula> does not support a second connectedCallback
  // because it would attach its shadow root twice, so order visually via CSS.
  ordered.forEach((entry, index) => {
    entry.section.style.order = String(index);
    entry.section.dataset.noteFirst = index === 0 ? '1' : '0';
  });
  if (ordered[0]) applyHostLanguage(host, ordered[0].language);
}

function bootstrapFullscreenNotes(): void {
  const markers = Array.from(document.querySelectorAll<HTMLElement>(
    '.lia-fullscreen-note-start[data-board-id]'
  ));
  const active = new Set<string>();
  let pending = false;
  markers.forEach(start => {
    const uid = markerUid(start);
    if (!uid) return;
    active.add(uid);
    if (!setupEntry(start)) pending = true;
  });
  Array.from(entries.keys()).forEach(uid => {
    if (!active.has(uid)) removeEntry(uid);
  });
  Array.from(hosts.values()).forEach(host => {
    if (!host.entries.size) disposeHost(host);
    else {
      orderHostEntries(host);
      syncHostFullscreen(host);
    }
  });
  pendingNotes = pending;
}

function scheduleFullscreenNotes(): void {
  if (bootstrapFrame) return;
  bootstrapFrame = requestAnimationFrame(() => {
    bootstrapFrame = 0;
    bootstrapFullscreenNotes();
  });
}

function containsFullscreenNoteMarker(node: Node): boolean {
  const element = node as HTMLElement;
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
  if (element.matches?.('.lia-fullscreen-note-start,.lia-fullscreen-note-end')) return true;
  return !!element.querySelector?.('.lia-fullscreen-note-start,.lia-fullscreen-note-end');
}

function refreshFullscreenHosts(boardId?: string): void {
  hosts.forEach(host => {
    if (!boardId || host.boardId === boardId) syncHostFullscreen(host);
  });
}

export function init(): void {
  const runtimeWindow = window as any;
  if (runtimeWindow.__fullscreenNoteReady) {
    scheduleFullscreenNotes();
    return;
  }
  runtimeWindow.__fullscreenNoteReady = true;
  runtimeWindow.__bootstrapFullscreenNotes = bootstrapFullscreenNotes;
  runtimeWindow.__scheduleBootstrapFullscreenNotes = scheduleFullscreenNotes;
  runtimeWindow.__refreshFullscreenNotes = (boardId?: string) => {
    refreshFullscreenHosts(boardId);
    requestAnimationFrame(() => refreshFullscreenHosts(boardId));
  };

  try {
    const observer = new MutationObserver(records => {
      let relevant = false;
      for (const record of records) {
        if (record.type === 'attributes') {
          relevant = containsFullscreenNoteMarker(record.target);
        } else if (record.type === 'childList') {
          relevant = Array.from(record.addedNodes).some(containsFullscreenNoteMarker) ||
            Array.from(record.removedNodes).some(containsFullscreenNoteMarker) ||
            Array.from(hosts.values()).some(host => !host.container.isConnected);
        }
        if (relevant) break;
      }
      if (relevant) scheduleFullscreenNotes();
    });
    const root = document.body || document.documentElement;
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-board-id', 'data-language', 'id']
      });
    }
  } catch (error) {}

  const onFullscreenChange = () => {
    refreshFullscreenHosts();
    requestAnimationFrame(() => refreshFullscreenHosts());
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);

  runtimeWindow.__fullscreenNoteRetryInterval = window.setInterval(() => {
    const staleHost = Array.from(hosts.values()).some(host =>
      !host.container.isConnected || window.__boards?.[host.boardId] !== host.board
    );
    if (pendingNotes || staleHost) scheduleFullscreenNotes();
  }, 300);
  scheduleBootstrap(scheduleFullscreenNotes);
}
